import React, { useState, useEffect, useRef } from 'react';
import {
  UserProfile,
  GameRoom,
  GamePlayer,
  Challenge,
  ChatMessage,
  LeaderboardEntry,
  MoveOption,
} from './types';
import { Header } from './components/Header';
import { BottomAuthSheet } from './components/BottomAuthSheet';
import { SettingsModal } from './components/SettingsModal';
import { BoardTheme } from './components/CheckersBoard';
import { OnlineLobby } from './components/OnlineLobby';
import { GameRoom as GameRoomComponent } from './components/GameRoom';
import { LeaderboardModal } from './components/LeaderboardModal';
import { ProfileModal } from './components/ProfileModal';
import { WalletModal } from './components/WalletModal';
import { CreateTableModal } from './components/CreateTableModal';
import { ChallengeModal } from './components/ChallengeModal';
import { AvatarBadge } from './components/AvatarBadge';
import { sounds } from './lib/sound';
import { apiFetchJson } from './lib/api';
import {
  saveUserProfileToFirestore,
  getLeaderboardFromFirestore,
  subscribeToLeaderboard,
  subscribeToOnlineUsers,
  updatePresenceHeartbeat,
  getUserProfileFromFirestore,
  deleteUserAccount,
  logOutUser,
  sendChallengeToFirestore,
  subscribeToIncomingChallenges,
  respondToChallengeInFirestore,
  subscribeToChallengeDoc,
  subscribeToGameRoom,
  subscribeToAllGameRooms,
  saveGameRoomToFirestore,
  deleteGameRoomFromFirestore,
  deleteGuestPlayerFromFirestore,
  cleanUpAllGuestPlayersFromFirestore,
  setUserOfflineInFirestore,
  sendGameChatToFirestore,
  subscribeToGameChat,
} from './lib/firebase';
import {
  createInitialBoard,
  executeMove,
  checkGameOver,
  getBestBotMove,
} from './lib/checkersEngine';
import { getBotMoveForDifficulty, BotDifficulty, BOT_DIFFICULTIES } from './lib/botEngine';
import { Swords, X, Check, Bell } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('checkers_user_profile');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return null;
  });
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [gameRooms, setGameRooms] = useState<GameRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);
  const [gameChatMessages, setGameChatMessages] = useState<ChatMessage[]>([]);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);

  // Modals & Preferences - show auth modal on first launch if user is not yet logged in
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('checkers_user_profile');
      return !saved;
    } catch (e) {
      return true;
    }
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
  const [isChallengeModalOpen, setIsChallengeModalOpen] = useState(false);
  const [challengeTargetPlayer, setChallengeTargetPlayer] = useState<UserProfile | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('checkers_sound_enabled') !== 'false';
  });
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(() => {
    return (localStorage.getItem('checkers_board_theme') as BoardTheme) || 'wood';
  });
  const [notification, setNotification] = useState<{
    id: number;
    message: string;
    type?: 'info' | 'error';
    duration: number;
  } | null>(null);
  const [challengeTimer, setChallengeTimer] = useState<number>(30);

  const wsRef = useRef<WebSocket | null>(null);
  const notificationTimerRef = useRef<any>(null);
  const handledChallengeIdsRef = useRef<Set<string>>(new Set());
  const activeRoomRef = useRef<GameRoom | null>(null);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  // Guest Lifecycle Cleanup: only clean up on explicit unload or logout
  useEffect(() => {
    // 1. One-time purge of all guest player records in Firestore database
    cleanUpAllGuestPlayersFromFirestore().catch(() => {});

    const handleExit = () => {
      try {
        const saved = localStorage.getItem('checkers_user_profile');
        if (saved) {
          const user = JSON.parse(saved);
          if (user?.id) {
            setUserOfflineInFirestore(user.id).catch(() => {});
            if (
              user?.isGuest ||
              user?.id?.startsWith('guest_') ||
              (user?.username && user?.username.toLowerCase().startsWith('guest'))
            ) {
              deleteGuestPlayerFromFirestore(user.id).catch(() => {});
            }
          }
        }
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('beforeunload', handleExit);
    return () => {
      window.removeEventListener('beforeunload', handleExit);
    };
  }, []);

  // Incoming challenge 30-second countdown
  useEffect(() => {
    if (!incomingChallenge) {
      setChallengeTimer(30);
      return;
    }
    setChallengeTimer(30);
    const interval = setInterval(() => {
      setChallengeTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleRespondChallenge(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [incomingChallenge?.id]);

  const showNotification = (
    message: string,
    type: 'info' | 'error' = 'info',
    durationMs: number = 6000
  ) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    const finalDuration = Math.max(5000, durationMs);
    const notifId = Date.now();
    setNotification({
      id: notifId,
      message,
      type,
      duration: finalDuration,
    });
    notificationTimerRef.current = setTimeout(() => {
      setNotification((curr) => (curr?.id === notifId ? null : curr));
    }, finalDuration);
  };

  // Initialize WebSocket connection with automatic reconnect
  useEffect(() => {
    let reconnectTimer: any;
    let socket: WebSocket | null = null;
    let isDisposed = false;

    function connect() {
      if (isDisposed) return;

      let wsUrl: string;
      if (import.meta.env.VITE_WS_URL) {
        wsUrl = import.meta.env.VITE_WS_URL;
      } else if (
        typeof window !== 'undefined' &&
        (window.location.hostname.includes('netlify') ||
          window.location.hostname.includes('vercel') ||
          window.location.hostname.includes('github.io'))
      ) {
        wsUrl = 'wss://ais-dev-6jl5ztzyfigu5rh4loi7rf-490075589647.europe-west2.run.app';
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}`;
      }

      try {
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          console.log('Connected to Checkers Arena live server.');

          const savedUserRaw = localStorage.getItem('checkers_user_profile');
          if (savedUserRaw) {
            try {
              const savedUser = JSON.parse(savedUserRaw);
              setCurrentUser(savedUser);
              socket?.send(
                JSON.stringify({
                  type: 'auth:login',
                  payload: {
                    username: savedUser.username,
                    avatarId: savedUser.avatarId,
                    existingUserId: savedUser.id,
                  },
                })
              );
            } catch (e) {
              // ignore
            }
          } else if (currentUser) {
            socket?.send(
              JSON.stringify({
                type: 'auth:login',
                payload: {
                  username: currentUser.username,
                  avatarId: currentUser.avatarId,
                  existingUserId: currentUser.id,
                },
              })
            );
          }
        };

        socket.onerror = (err) => {
          console.warn('WebSocket error:', err);
          const savedUserRaw = localStorage.getItem('checkers_user_profile');
          if (savedUserRaw && !currentUser) {
            try {
              setCurrentUser(JSON.parse(savedUserRaw));
            } catch (e) {
              setIsAuthModalOpen(true);
            }
          }
        };

        socket.onclose = () => {
          console.log('WebSocket connection closed. Retrying in 2.5 seconds...');
          if (!isDisposed) {
            reconnectTimer = setTimeout(connect, 2500);
          }
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const { type, payload } = data;

            switch (type) {
              case 'auth:success': {
                setCurrentUser(payload.user);
                localStorage.setItem(
                  'checkers_user_profile',
                  JSON.stringify(payload.user)
                );
                setIsAuthModalOpen(false);
                break;
              }

              case 'auth:error': {
                showNotification(payload.message, 'error');
                setIsAuthModalOpen(true);
                break;
              }

              case 'user:profile_updated': {
                setCurrentUser(payload.user);
                localStorage.setItem(
                  'checkers_user_profile',
                  JSON.stringify(payload.user)
                );
                showNotification('Profile updated successfully!');
                break;
              }

              case 'wallet:balance_updated': {
                setCurrentUser((prev) => {
                  if (!prev) return prev;
                  const updated = {
                    ...prev,
                    walletBalance: payload.walletBalance,
                    totalWon: typeof payload.totalWon === 'number' ? payload.totalWon : prev.totalWon,
                    totalStaked: typeof payload.totalStaked === 'number' ? payload.totalStaked : prev.totalStaked,
                  };
                  localStorage.setItem('checkers_user_profile', JSON.stringify(updated));
                  return updated;
                });
                break;
              }

              case 'presence:list': {
                if (Array.isArray(payload)) {
                  setOnlineUsers(payload.filter((u: UserProfile) => !u.id.startsWith('usr_arena_')));
                }
                break;
              }

              case 'lobby:rooms': {
                setGameRooms(payload);
                break;
              }

              case 'challenge:received': {
                setIncomingChallenge(payload);
                sounds.playChallenge();
                break;
              }

              case 'challenge:declined': {
                showNotification(payload.message, 'info');
                break;
              }

              case 'game:started':
              case 'game:joined':
              case 'game:updated': {
                const prev = activeRoomRef.current;
                setActiveRoom(payload);
                if (!prev || prev.id !== payload.id) {
                  // Match entry announcement
                  const redName = payload.redPlayer?.username || 'Red Player';
                  const blackName = payload.blackPlayer?.username || 'Black Player';
                  showNotification(`⚔️ Match Started! ${redName} plays FIRST with Red pieces.`, 'info', 6000);
                } else if (payload.lastMoveTimestamp !== prev.lastMoveTimestamp) {
                  const lastMove = payload.history && payload.history.length > 0 ? payload.history[payload.history.length - 1] : null;
                  if (lastMove) {
                    const moverId = lastMove.playerColor === 'red' ? payload.redPlayer?.id : payload.blackPlayer?.id;
                    if (moverId !== currentUser?.id) {
                      if (lastMove.capturedCount > 0) sounds.playCapture();
                      else sounds.playMove();
                      if (lastMove.becameKing) setTimeout(() => sounds.playKing(), 200);
                      const oppName = lastMove.playerColor === 'red' ? (payload.redPlayer?.username || 'Red') : (payload.blackPlayer?.username || 'Black');
                      showNotification(`🔔 ${oppName} made a move! It's your turn!`, 'info', 3500);
                    }
                  }
                }
                break;
              }

              case 'game:table_deleted': {
                setGameRooms((prev) => prev.filter((r) => r.id !== payload.roomId));
                setActiveRoom((prev) => (prev?.id === payload.roomId ? null : prev));
                showNotification(payload.message || 'Game table was closed.', 'info', 4000);
                break;
              }

              case 'game:invalid_move': {
                showNotification(payload.message, 'error');
                break;
              }

              case 'chat:history': {
                break;
              }

              case 'chat:lobby_message': {
                break;
              }

              case 'chat:game_message': {
                if (payload.roomId && activeRoomRef.current && payload.roomId !== activeRoomRef.current.id) {
                  break;
                }
                setGameChatMessages((prev) => {
                  if (prev.some((m) => m.id === payload.id)) return prev;
                  return [...prev.slice(-80), payload];
                });
                break;
              }

              case 'leaderboard:data': {
                setLeaderboardEntries(payload);
                break;
              }

              case 'error': {
                showNotification(payload.message, 'error');
                break;
              }
            }
          } catch (err) {
            console.error('Error parsing WS message:', err);
          }
        };
      } catch (e) {
        console.error('Failed to construct WebSocket:', e);
        if (!isDisposed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);

  // Subscribe to real-time Firestore presence so lobby online players updates instantly
  useEffect(() => {
    const unsubscribePresence = subscribeToOnlineUsers((firestoreUsers) => {
      setOnlineUsers((prev) => {
        const map = new Map<string, UserProfile>();
        // Add firestore online users
        firestoreUsers.forEach((u) => {
          if (!u.id.startsWith('usr_arena_')) {
            map.set(u.id, u);
          }
        });
        // Also keep currently connected WS users
        prev.forEach((u) => {
          if (!u.id.startsWith('usr_arena_') && !map.has(u.id)) {
            map.set(u.id, u);
          }
        });
        return Array.from(map.values());
      });
    });

    const unsubscribeLeaderboard = subscribeToLeaderboard((boardUsers) => {
      setLeaderboardEntries(boardUsers);
    });

    const unsubscribeGameRooms = subscribeToAllGameRooms((rooms) => {
      setGameRooms(rooms.filter((r) => r.status === 'waiting' || r.status === 'playing'));
    });

    // Refresh saved user profile from Firestore if available & auto-clean sandbox demo funds
    try {
      const savedUserRaw = localStorage.getItem('checkers_user_profile');
      if (savedUserRaw) {
        const localUser = JSON.parse(savedUserRaw);
        if (localUser?.id) {
          // Check if sandbox funds need one-time reset
          const isCleaned = localStorage.getItem('checkers_sandbox_cleaned_v2') === 'true';
          if (!isCleaned) {
            const resetUser = {
              ...localUser,
              walletBalance: 0,
              totalWon: 0,
              totalStaked: 0,
            };
            setCurrentUser(resetUser);
            localStorage.setItem('checkers_user_profile', JSON.stringify(resetUser));
            localStorage.setItem('checkers_sandbox_cleaned_v2', 'true');
            saveUserProfileToFirestore(resetUser).catch(() => {});
            apiFetchJson('/api/wallet/reset-balance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: localUser.id }),
            }).catch(() => {});
          } else {
            getUserProfileFromFirestore(localUser.id).then((cloudProfile) => {
              if (cloudProfile) {
                setCurrentUser(cloudProfile);
                localStorage.setItem('checkers_user_profile', JSON.stringify(cloudProfile));
              }
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return () => {
      unsubscribePresence();
      unsubscribeLeaderboard();
      unsubscribeGameRooms();
    };
  }, []);

  // Update presence heartbeat in Firestore and subscribe to real-time incoming challenges
  useEffect(() => {
    if (!currentUser) return;
    updatePresenceHeartbeat(currentUser.id);
    const interval = setInterval(() => {
      updatePresenceHeartbeat(currentUser.id);
    }, 15000);

    const unsubscribeChallenges = subscribeToIncomingChallenges(
      currentUser.id,
      (challenge) => {
        if (!challenge) {
          setIncomingChallenge(null);
          return;
        }
        if (challenge && !handledChallengeIdsRef.current.has(challenge.id)) {
          setIncomingChallenge(challenge);
          sounds.playChallenge();
          showNotification(
            `⚔️ ${challenge.fromUser.username} challenged you to a Checkers match!`,
            'info',
            8000
          );
        }
      }
    );

    return () => {
      clearInterval(interval);
      unsubscribeChallenges();
    };
  }, [currentUser]);

  // Keep active multiplayer room synchronized in real time with move sound notifications
  useEffect(() => {
    if (!activeRoom?.id || activeRoom.blackPlayer?.isBot || activeRoom.id.includes('bot')) return;
    const unsub = subscribeToGameRoom(activeRoom.id, (roomData) => {
      if (roomData && roomData.lastMoveTimestamp && roomData.lastMoveTimestamp !== activeRoom.lastMoveTimestamp) {
        const lastMove =
          roomData.history && roomData.history.length > 0
            ? roomData.history[roomData.history.length - 1]
            : null;
        if (lastMove) {
          const moverId =
            lastMove.playerColor === 'red'
              ? roomData.redPlayer?.id
              : roomData.blackPlayer?.id;
          if (moverId !== currentUser?.id) {
            if (lastMove.capturedCount > 0) {
              sounds.playCapture();
            } else {
              sounds.playMove();
            }
            if (lastMove.becameKing) {
              setTimeout(() => sounds.playKing(), 200);
            }
            const oppName =
              lastMove.playerColor === 'red'
                ? roomData.redPlayer?.username || 'Red'
                : roomData.blackPlayer?.username || 'Black';
            showNotification(`🔔 ${oppName} made a move! It's your turn!`, 'info', 3500);
          }
        }
        setActiveRoom(roomData);
        if (roomData.status === 'ended' && roomData.winner) {
          const myColor = activeRoom.redPlayer?.id === currentUser?.id ? 'red' : 'black';
          recordGameOutcome(myColor, roomData.winner);
        }
      }
    });
    return () => unsub();
  }, [activeRoom?.id, activeRoom?.lastMoveTimestamp, currentUser?.id]);

  // Subscribe to real-time chat/emoji messages for the active room
  useEffect(() => {
    if (!activeRoom?.id) return;
    const unsub = subscribeToGameChat(activeRoom.id, (messages) => {
      if (messages && messages.length > 0) {
        setGameChatMessages(messages);
      }
    });
    return () => unsub();
  }, [activeRoom?.id]);

  const sendWs = (type: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn(`WebSocket message deferred/skipped (${type}) as server is offline or connecting.`);
    }
  };

  const handleAuthSuccess = (userProfile: UserProfile) => {
    setCurrentUser(userProfile);
    localStorage.setItem('checkers_user_profile', JSON.stringify(userProfile));
    sendWs('auth:login', {
      username: userProfile.username,
      avatarId: userProfile.avatarId,
      existingUserId: userProfile.id,
    });
    setIsAuthModalOpen(false);
    if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation?.lock) {
      try {
        (window.screen as any).orientation.lock('landscape').catch(() => {});
      } catch (e) {
        // ignore
      }
    }
    showNotification(`Welcome to Checkers Arena, ${userProfile.username}!`, 'info', 6000);
  };

  const handleAuthModalClose = () => {
    setIsAuthModalOpen(false);
    if (!currentUser) {
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const guestProfile: UserProfile = {
        id: guestId,
        username: `Guest-${Math.floor(100 + Math.random() * 900)}`,
        avatarId: 'avatar-crown',
        rating: 1200,
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        status: 'online',
        isOnline: true,
        isGuest: true,
        createdAt: Date.now(),
      };
      setCurrentUser(guestProfile);
      localStorage.setItem('checkers_user_profile', JSON.stringify(guestProfile));
      sendWs('auth:login', {
        username: guestProfile.username,
        avatarId: guestProfile.avatarId,
        existingUserId: guestProfile.id,
      });
    }
  };

  const handleSendChallenge = async (targetUserId: string, stakeAmount: number = 0) => {
    const targetUser = onlineUsers.find((u) => u.id === targetUserId);
    const currentBalance = currentUser?.walletBalance || 0;

    if (stakeAmount > 0 && currentBalance < stakeAmount) {
      showNotification(`Insufficient balance for ${stakeAmount.toLocaleString()} UGX stake. Please deposit funds.`, 'error');
      setIsWalletModalOpen(true);
      return;
    }

    const challengeId = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    sounds.playChallenge();
    sendWs('challenge:send', { targetUserId, targetUser, challengeId, stakeAmount });
    if (currentUser && targetUser) {
      try {
        const cId = await sendChallengeToFirestore(currentUser, targetUser, challengeId);
        if (cId) {
          const unsub = subscribeToChallengeDoc(cId, (snapData) => {
            if (snapData?.status === 'accepted') {
              unsub();
              if (snapData.room) {
                setActiveRoom(snapData.room);
              }
              if (snapData.roomId) {
                subscribeToGameRoom(snapData.roomId, (roomData) => {
                  if (roomData) setActiveRoom(roomData);
                });
              }
              sounds.playMove();
              showNotification(
                `⚔️ Match accepted! Starting game vs ${targetUser.username}...`,
                'info',
                6000
              );
            } else if (snapData?.status === 'declined') {
              unsub();
              showNotification(
                `${targetUser.username} declined your challenge.`,
                'info',
                6000
              );
            }
          });
        }
      } catch (err) {
        console.warn('Firestore challenge sync error:', err);
      }
    }
    showNotification(
      `Challenge sent to ${targetUser?.username || 'player'}${stakeAmount > 0 ? ` with ${stakeAmount.toLocaleString()} UGX stake` : ''}! Waiting for response...`,
      'info',
      6000
    );
  };

  const handleRespondChallenge = async (accept: boolean) => {
    if (!incomingChallenge) return;
    const challenge = incomingChallenge;
    handledChallengeIdsRef.current.add(challenge.id);
    setIncomingChallenge(null);

    const stakeAmount = challenge.stakeAmount || 0;
    const currentBalance = currentUser?.walletBalance || 0;

    if (accept && stakeAmount > 0 && currentBalance < stakeAmount) {
      showNotification(`You need ${stakeAmount.toLocaleString()} UGX to accept this challenge.`, 'error');
      setIsWalletModalOpen(true);
      sendWs('challenge:respond', {
        challengeId: challenge.id,
        accept: false,
        reason: 'Insufficient wallet balance',
      });
      return;
    }

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (accept) {
      sounds.playMove();
      showNotification(
        `⚔️ Challenge allowed! Creating game table for you and ${challenge.fromUser.username}...`,
        'info',
        5000
      );

      // Challenger (fromUser) is Red (moves first), Opponent who accepts (toUser) is Black
      const redPlayer: GamePlayer = {
        id: challenge.fromUser.id,
        username: challenge.fromUser.username,
        avatarId: challenge.fromUser.avatarId,
        rating: challenge.fromUser.rating || challenge.fromUser.elo || 1200,
        color: 'red',
      };

      const myProfile = currentUser || challenge.toUser;
      const blackPlayer: GamePlayer = {
        id: myProfile.id,
        username: myProfile.username,
        avatarId: myProfile.avatarId,
        rating: myProfile.rating || myProfile.elo || 1200,
        color: 'black',
      };

      const initialRoom: GameRoom = {
        id: roomId,
        name: `${redPlayer.username} vs ${blackPlayer.username}`,
        status: 'playing',
        stakeAmount,
        potAmount: stakeAmount * 2,
        redPlayer,
        blackPlayer,
        currentTurn: 'red',
        board: createInitialBoard(),
        history: [],
        capturedRed: 0,
        capturedBlack: 0,
        winner: null,
        createdAt: Date.now(),
        lastMoveTimestamp: Date.now(),
        turnTimeLimitSeconds: 900,
        turnDeadline: Date.now() + 900000,
        spectatorsCount: 0,
      };

      // Set active room immediately for instant UI response
      setActiveRoom(initialRoom);

      // Subscribe to Firestore room updates for turn-by-turn syncing
      subscribeToGameRoom(roomId, (roomData) => {
        if (roomData) setActiveRoom(roomData);
      });
    }

    sendWs('challenge:respond', {
      challengeId: challenge.id,
      accept,
      roomId,
      stakeAmount,
      fromUser: challenge.fromUser,
      toUser: currentUser || challenge.toUser,
    });

    if (currentUser && challenge.fromUser) {
      try {
        const res = await respondToChallengeInFirestore(
          challenge.id,
          accept,
          challenge.fromUser,
          currentUser,
          roomId
        );
        if (accept && res && res.room) {
          setActiveRoom(res.room);
          subscribeToGameRoom(res.roomId, (roomData) => {
            if (roomData) setActiveRoom(roomData);
          });
        }
      } catch (err) {
        console.warn('respondToChallengeInFirestore error:', err);
      }
    }

    if (!accept) {
      showNotification('Challenge declined.', 'info', 5000);
    }
  };

  const handleDeleteGameRoom = async (roomId: string) => {
    sendWs('game:delete_table', { roomId });
    await deleteGameRoomFromFirestore(roomId);
    setGameRooms((prev) => prev.filter((r) => r.id !== roomId));
    if (activeRoom?.id === roomId) {
      setActiveRoom(null);
      setGameChatMessages([]);
    }
    showNotification('Game table deleted and closed.', 'info', 4000);
  };

  const recordGameOutcome = (userColor: 'red' | 'black', winnerColor: string | null) => {
    if (!currentUser) return;

    let newWins = currentUser.wins || 0;
    let newLosses = currentUser.losses || 0;
    let newDraws = currentUser.draws || 0;
    let newRating = currentUser.rating || currentUser.elo || 1200;

    if (winnerColor === userColor) {
      newWins += 1;
      newRating += 18;
      sounds.playVictory();
      showNotification(`Match won! Rating updated to ${newRating} (+18 ELO)`, 'info');
    } else if (winnerColor === 'draw') {
      newDraws += 1;
      newRating += 2;
      showNotification(`Match drawn! Rating: ${newRating}`, 'info');
    } else {
      newLosses += 1;
      newRating = Math.max(800, newRating - 12);
      sounds.playDefeat();
      showNotification(`Match concluded. Rating updated to ${newRating} (-12 ELO)`, 'info');
    }

    const updatedUser: UserProfile = {
      ...currentUser,
      wins: newWins,
      losses: newLosses,
      draws: newDraws,
      rating: newRating,
      elo: newRating,
    };

    setCurrentUser(updatedUser);
    localStorage.setItem('checkers_user_profile', JSON.stringify(updatedUser));
    saveUserProfileToFirestore(updatedUser).catch((e) => console.warn('Save stats error:', e));

    // Update local leaderboard state instantly
    setLeaderboardEntries((prev) => {
      const filtered = prev.filter((u) => u.id !== updatedUser.id);
      return [...filtered, updatedUser].sort((a, b) => (b.rating || b.elo || 1200) - (a.rating || a.elo || 1200));
    });
  };

  const triggerBotMove = (room: GameRoom) => {
    setTimeout(() => {
      setActiveRoom((latestRoom) => {
        if (!latestRoom || latestRoom.id !== room.id || latestRoom.status !== 'playing') {
          return latestRoom;
        }

        const botColor = 'black';
        const botDiff = latestRoom.botDifficulty || 'medium';
        const bestMove = getBotMoveForDifficulty(latestRoom.board, botColor, botDiff);
        if (!bestMove) {
          const over = checkGameOver(latestRoom.board, botColor);
          recordGameOutcome('red', 'red');
          return {
            ...latestRoom,
            status: 'ended',
            winner: 'red',
            winReason: over.reason || 'Bot has no available moves',
          };
        }

        const { newBoard, capturedPiece, becameKing } = executeMove(latestRoom.board, bestMove);
        let capRed = latestRoom.capturedRed;
        let capBlack = latestRoom.capturedBlack;
        if (capturedPiece) {
          if (capturedPiece.color === 'red') capRed++;
          if (capturedPiece.color === 'black') capBlack++;
          sounds.playCapture();
        } else {
          sounds.playMove();
        }

        const nextTurn = 'red';
        const over = checkGameOver(newBoard, nextTurn);

        if (over.isOver) {
          recordGameOutcome('red', over.winner || 'draw');
        }

        return {
          ...latestRoom,
          board: newBoard,
          currentTurn: nextTurn,
          capturedRed: capRed,
          capturedBlack: capBlack,
          history: [
            ...latestRoom.history,
            {
              id: `m_${Date.now()}`,
              playerColor: botColor,
              from: bestMove.from,
              to: bestMove.to,
              capturedCount: bestMove.captures.length,
              becameKing,
              timestamp: Date.now(),
            },
          ],
          status: over.isOver ? 'ended' : 'playing',
          winner: over.winner || null,
          winReason: over.reason,
          lastMoveTimestamp: Date.now(),
        };
      });
    }, 550);
  };

  const handleCreateCustomGame = (
    vsBot: boolean,
    botDifficulty: BotDifficulty = 'medium',
    tableName?: string,
    stakeAmount: number = 0,
    timeLimitSeconds: number = 900
  ) => {
    const player = currentUser || {
      id: 'guest_' + Math.random().toString(36).substring(2, 9),
      username: 'GuestPlayer',
      avatarId: 'avatar-crown',
      wins: 0,
      losses: 0,
      draws: 0,
      rating: 1200,
      status: 'online',
      createdAt: Date.now(),
    };

    if (!currentUser) {
      setCurrentUser(player);
    }

    if (vsBot) {
      const initialBoard = createInitialBoard();
      const diffConfig = BOT_DIFFICULTIES[botDifficulty] || BOT_DIFFICULTIES.medium;
      const botRoom: GameRoom = {
        id: `room_bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: tableName || `${player.username} vs Bot (${diffConfig.name})`,
        status: 'playing',
        botDifficulty,
        stakeAmount: 0,
        potAmount: 0,
        redPlayer: {
          id: player.id,
          username: player.username,
          avatarId: player.avatarId,
          rating: player.rating || 1200,
          color: 'red',
        },
        blackPlayer: {
          id: 'bot_ai',
          username: `Bot: ${diffConfig.name}`,
          avatarId: 'avatar-cyber',
          rating: diffConfig.rating,
          color: 'black',
          isBot: true,
          botDifficulty,
        },
        currentTurn: 'red',
        board: initialBoard,
        history: [],
        capturedRed: 0,
        capturedBlack: 0,
        winner: null,
        createdAt: Date.now(),
        lastMoveTimestamp: Date.now(),
        turnTimeLimitSeconds: timeLimitSeconds,
        turnDeadline: Date.now() + timeLimitSeconds * 1000,
        spectatorsCount: 0,
      };

      setActiveRoom(botRoom);
      sounds.playMove();
      showNotification(`Practice vs ${diffConfig.name} started!`, 'info');

      // Send to server if connected
      sendWs('game:create_custom', { vsBot: true, botDifficulty });
    } else {
      const currentBalance = currentUser?.walletBalance || 0;
      if (stakeAmount > 0 && currentBalance < stakeAmount) {
        showNotification(`Insufficient balance for ${stakeAmount.toLocaleString()} UGX stake. Please deposit funds.`, 'error');
        setIsWalletModalOpen(true);
        return;
      }

      const initialBoard = createInitialBoard();
      const customRoom: GameRoom = {
        id: `room_table_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: tableName || `${player.username}'s Game Table`,
        status: 'waiting',
        stakeAmount,
        potAmount: stakeAmount * 2,
        redPlayer: {
          id: player.id,
          username: player.username,
          avatarId: player.avatarId,
          rating: player.rating || 1200,
          color: 'red',
        },
        blackPlayer: null,
        currentTurn: 'red',
        board: initialBoard,
        history: [],
        capturedRed: 0,
        capturedBlack: 0,
        winner: null,
        createdAt: Date.now(),
        lastMoveTimestamp: Date.now(),
        turnTimeLimitSeconds: timeLimitSeconds,
        turnDeadline: Date.now() + timeLimitSeconds * 1000,
        spectatorsCount: 0,
      };

      setActiveRoom(customRoom);
      setGameRooms((prev) => [customRoom, ...prev.filter((r) => r.id !== customRoom.id)]);
      showNotification(
        stakeAmount > 0
          ? `Game Table created with ${stakeAmount.toLocaleString()} UGX Stake! Waiting for challenger...`
          : 'Game Table created! Waiting for an opponent to join...',
        'info'
      );

      // Save to Firestore so it appears in active game tables immediately for everyone
      saveGameRoomToFirestore(customRoom).catch((e) => console.warn('saveGameRoomToFirestore error:', e));

      // Subscribe to Firestore room updates so when someone joins, table transitions to playing
      subscribeToGameRoom(customRoom.id, (roomData) => {
        if (roomData) {
          setActiveRoom(roomData);
        }
      });

      // Send to server if connected
      sendWs('game:create_custom', {
        vsBot: false,
        roomId: customRoom.id,
        name: customRoom.name,
        stakeAmount,
        timeLimitSeconds,
      });
    }
  };

  const handleJoinGameRoom = async (roomId: string) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    const roomToJoin = gameRooms.find((r) => r.id === roomId);
    if (roomToJoin && (roomToJoin.stakeAmount || 0) > 0) {
      const requiredStake = roomToJoin.stakeAmount || 0;
      const currentBalance = currentUser.walletBalance || 0;
      if (currentBalance < requiredStake) {
        showNotification(`You need at least ${requiredStake.toLocaleString()} UGX to join this staked table.`, 'error');
        setIsWalletModalOpen(true);
        return;
      }
    }

    sendWs('game:join', { roomId });

    // Subscribe to this room
    subscribeToGameRoom(roomId, (roomData) => {
      if (roomData) {
        setActiveRoom(roomData);
      }
    });

    if (roomToJoin && roomToJoin.status === 'waiting' && !roomToJoin.blackPlayer) {
      const updatedRoom: GameRoom = {
        ...roomToJoin,
        blackPlayer: {
          id: currentUser.id,
          username: currentUser.username,
          avatarId: currentUser.avatarId,
          rating: currentUser.rating || 1200,
          color: 'black',
        },
        status: 'playing',
        turnTimeLimitSeconds: roomToJoin.turnTimeLimitSeconds || 900,
        turnDeadline: Date.now() + (roomToJoin.turnTimeLimitSeconds || 900) * 1000,
        lastMoveTimestamp: Date.now(),
      };
      setActiveRoom(updatedRoom);
      await saveGameRoomToFirestore(updatedRoom);
      showNotification(`Joined table: ${roomToJoin.name}! Match starting...`, 'info');
    }
  };

  const handleSendMove = (move: MoveOption) => {
    if (!activeRoom) return;

    // Send to WebSocket server if connected
    sendWs('game:move', { roomId: activeRoom.id, move });

    const isBotGame = activeRoom.blackPlayer?.isBot || activeRoom.id.includes('bot');
    const isLocalRoom = activeRoom.id.includes('table') || activeRoom.id.includes('room_');

    if (isBotGame || isLocalRoom) {
      const { newBoard, capturedPiece, becameKing } = executeMove(activeRoom.board, move);
      let capRed = activeRoom.capturedRed;
      let capBlack = activeRoom.capturedBlack;
      if (capturedPiece) {
        if (capturedPiece.color === 'red') capRed++;
        if (capturedPiece.color === 'black') capBlack++;
        sounds.playCapture();
      } else {
        sounds.playMove();
      }

      const nextTurn = activeRoom.currentTurn === 'red' ? 'black' : 'red';
      const over = checkGameOver(newBoard, nextTurn);

      if (over.isOver) {
        const myColor = activeRoom.redPlayer?.id === currentUser?.id ? 'red' : 'black';
        recordGameOutcome(myColor, over.winner || 'draw');
      }

      const timeLimitSec = activeRoom.turnTimeLimitSeconds || 900;
      const updatedRoom: GameRoom = {
        ...activeRoom,
        board: newBoard,
        currentTurn: nextTurn,
        capturedRed: capRed,
        capturedBlack: capBlack,
        history: [
          ...activeRoom.history,
          {
            id: `m_${Date.now()}`,
            playerColor: activeRoom.currentTurn,
            from: move.from,
            to: move.to,
            capturedCount: move.captures.length,
            becameKing,
            timestamp: Date.now(),
          },
        ],
        status: over.isOver ? 'ended' : 'playing',
        winner: over.winner || null,
        winReason: over.reason,
        lastMoveTimestamp: Date.now(),
        turnDeadline: Date.now() + timeLimitSec * 1000,
      };

      setActiveRoom(updatedRoom);
      saveGameRoomToFirestore(updatedRoom).catch((e) => console.warn(e));

      if (isBotGame && updatedRoom.status === 'playing' && nextTurn === 'black') {
        triggerBotMove(updatedRoom);
      }
    }
  };

  const handleClaimTimeout = () => {
    if (!activeRoom) return;
    sendWs('game:claim_timeout', { roomId: activeRoom.id });

    // Also update locally for instant responsiveness
    if (activeRoom.status === 'playing') {
      const myColor = activeRoom.redPlayer?.id === currentUser?.id ? 'red' : 'black';
      const winner = activeRoom.currentTurn === 'red' ? 'black' : 'red';
      recordGameOutcome(myColor, winner);

      setActiveRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'ended',
          winner,
          winReason: 'Opponent did not make a move in 15 seconds (Forfeit)',
        };
      });
      showNotification('Opponent turn timer expired (15s)! Match won.', 'info');
    }
  };

  const handleResign = () => {
    if (!activeRoom) return;
    sendWs('game:resign', { roomId: activeRoom.id });

    recordGameOutcome('red', 'black');

    setActiveRoom((prev) => {
      if (!prev) return null;
      const winner = prev.currentTurn === 'red' ? 'black' : 'red';
      return {
        ...prev,
        status: 'ended',
        winner,
        winReason: 'Player resigned',
      };
    });
  };

  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setGameChatMessages([]);
  };

  const handleSendGameChat = async (text: string) => {
    if (!activeRoom) return;
    sounds.playBlast();
    sendWs('chat:send', { text, roomId: activeRoom.id });

    if (currentUser) {
      const newMsg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        senderId: currentUser.id,
        senderName: currentUser.username,
        avatarId: currentUser.avatarId,
        text,
        timestamp: Date.now(),
      };
      setGameChatMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev.slice(-80), newMsg];
      });
      try {
        await sendGameChatToFirestore(activeRoom.id, newMsg);
      } catch (e) {
        console.warn('sendGameChatToFirestore failed:', e);
      }
    }
  };

  const handleOpenLeaderboard = async () => {
    sendWs('leaderboard:get', {});
    setIsLeaderboardModalOpen(true);

    try {
      const firestoreEntries = await getLeaderboardFromFirestore();
      if (firestoreEntries.length > 0) {
        setLeaderboardEntries(firestoreEntries);
      }
    } catch (e) {
      console.warn('Leaderboard fetch error:', e);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.setEnabled(next);
    localStorage.setItem('checkers_sound_enabled', String(next));
  };

  const handleChangeTheme = (theme: BoardTheme) => {
    setBoardTheme(theme);
    localStorage.setItem('checkers_board_theme', theme);
  };

  const handleLogout = async () => {
    setIsSettingsModalOpen(false);
    if (currentUser?.id) {
      setUserOfflineInFirestore(currentUser.id).catch(() => {});
    }
    await logOutUser();
    setCurrentUser(null);
    setIsAuthModalOpen(true);
    showNotification('Logged out successfully', 'info');
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    try {
      setIsSettingsModalOpen(false);
      await deleteUserAccount(currentUser.id);
      setCurrentUser(null);
      setIsAuthModalOpen(true);
      showNotification('Account permanently deleted', 'info');
    } catch (e: any) {
      console.error('Delete account error:', e);
      showNotification('Failed to delete account. Please try again.', 'error');
    }
  };

  const handleUpdateProfile = (avatarId: string, username?: string) => {
    if (!currentUser) return;
    const newUsername = username?.trim() || currentUser.username;
    const updatedUser: UserProfile = {
      ...currentUser,
      avatarId,
      username: newUsername,
    };

    setCurrentUser(updatedUser);
    localStorage.setItem('checkers_user_profile', JSON.stringify(updatedUser));
    saveUserProfileToFirestore(updatedUser).catch((e) => console.warn('Firestore profile save warning:', e));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendWs('user:update_profile', { avatarId, username: newUsername });
    }

    showNotification('Profile updated successfully!', 'info');
  };

  return (
    <div className="h-screen max-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-amber-500 selection:text-slate-950 overflow-hidden">
      {/* Toast Notification (Displays for at least 5-6 seconds) */}
      {notification && (
        <div
          key={notification.id}
          className={`fixed top-4 right-4 z-50 flex flex-col overflow-hidden max-w-sm sm:max-w-md rounded-2xl shadow-2xl text-xs sm:text-sm font-bold border backdrop-blur-md animate-slide-down ${
            notification.type === 'error'
              ? 'bg-rose-950/95 border-rose-700 text-rose-200 shadow-rose-950/50'
              : 'bg-slate-900/95 border-amber-500/80 text-amber-200 shadow-amber-950/40'
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Bell className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
              <span className="leading-snug">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition shrink-0 ml-2"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Animated 5-6 second duration progress line */}
          <div className="w-full bg-slate-800/60 h-1">
            <div
              className={`h-full ${
                notification.type === 'error' ? 'bg-rose-500' : 'bg-amber-400'
              }`}
              style={{
                animation: `shrinkWidth ${notification.duration}ms linear forwards`,
              }}
            />
          </div>
        </div>
      )}

      {/* Header Bar */}
      <Header
        currentUser={currentUser}
        onlineCount={Math.max(1, onlineUsers.filter((u) => u.id !== currentUser?.id).length + (currentUser ? 1 : 0))}
        onOpenLeaderboard={handleOpenLeaderboard}
        onOpenProfile={() => {
          if (currentUser) {
            setIsProfileModalOpen(true);
          } else {
            setIsAuthModalOpen(true);
          }
        }}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenWallet={() => setIsWalletModalOpen(true)}
      />

      {/* Main Container View (Static, no scrolling) */}
      <main className="flex-1 overflow-hidden min-h-0">
        {activeRoom ? (
          <GameRoomComponent
            room={activeRoom}
            currentUser={currentUser || { id: '', username: 'Guest', avatarId: 'avatar-crown', wins: 0, losses: 0, draws: 0, rating: 1200, status: 'online', createdAt: Date.now() }}
            activeTheme={boardTheme}
            onSendMove={handleSendMove}
            onResign={handleResign}
            onLeaveRoom={handleLeaveRoom}
            onDeleteTable={() => handleDeleteGameRoom(activeRoom.id)}
            onClaimTimeout={handleClaimTimeout}
            onSendGameChat={handleSendGameChat}
            gameChatMessages={gameChatMessages}
          />
        ) : (
          <OnlineLobby
            currentUser={currentUser || { id: '', username: 'Player', avatarId: 'avatar-crown', wins: 0, losses: 0, draws: 0, rating: 1200, status: 'online', createdAt: Date.now() }}
            onlineUsers={onlineUsers}
            gameRooms={gameRooms}
            onInitiateChallenge={(targetUser) => {
              setChallengeTargetPlayer(targetUser);
              setIsChallengeModalOpen(true);
            }}
            onCreateCustomGame={handleCreateCustomGame}
            onOpenCreateTableModal={() => setIsCreateTableModalOpen(true)}
            onJoinGameRoom={handleJoinGameRoom}
            onDeleteGameRoom={handleDeleteGameRoom}
            onOpenLeaderboard={handleOpenLeaderboard}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenWallet={() => setIsWalletModalOpen(true)}
          />
        )}
      </main>

      {/* Bottom Sheet Auth Panel */}
      <BottomAuthSheet
        isOpen={isAuthModalOpen}
        onClose={handleAuthModalClose}
        onLoginSuccess={handleAuthSuccess}
        defaultEmail="hackerug06@gmail.com"
        allowDismiss={true}
      />

      {/* Settings Modal (Theme, Audio, Logout, Account Deletion Confirmation) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentTheme={boardTheme}
        onChangeTheme={handleChangeTheme}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />

      {currentUser && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

      <LeaderboardModal
        isOpen={isLeaderboardModalOpen}
        onClose={() => setIsLeaderboardModalOpen(false)}
        entries={leaderboardEntries}
      />

      {/* Pesapal Real Payments & Wallet Modal */}
      {currentUser && (
        <WalletModal
          currentUser={currentUser}
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          onBalanceUpdated={(newBalance) => {
            setCurrentUser((prev) => {
              if (!prev) return prev;
              const updated = { ...prev, walletBalance: newBalance };
              localStorage.setItem('checkers_user_profile', JSON.stringify(updated));
              return updated;
            });
          }}
        />
      )}

      {/* Custom Staked Game Table Creation Modal */}
      {currentUser && (
        <CreateTableModal
          currentUser={currentUser}
          isOpen={isCreateTableModalOpen}
          onClose={() => setIsCreateTableModalOpen(false)}
          onCreateTable={(tableName, stakeAmount, timeLimitSeconds) => {
            handleCreateCustomGame(false, 'medium', tableName, stakeAmount, timeLimitSeconds);
          }}
          onOpenWallet={() => {
            setIsCreateTableModalOpen(false);
            setIsWalletModalOpen(true);
          }}
        />
      )}

      {/* Player Direct Challenge with Stakes Modal */}
      {currentUser && (
        <ChallengeModal
          currentUser={currentUser}
          targetPlayer={challengeTargetPlayer}
          isOpen={isChallengeModalOpen}
          onClose={() => {
            setIsChallengeModalOpen(false);
            setChallengeTargetPlayer(null);
          }}
          onSendChallenge={(targetUserId, stakeAmount) => {
            handleSendChallenge(targetUserId, stakeAmount);
          }}
          onOpenWallet={() => {
            setIsChallengeModalOpen(false);
            setIsWalletModalOpen(true);
          }}
        />
      )}

      {/* Incoming Match Challenge Dialog Overlay */}
      {incomingChallenge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-amber-500/90 rounded-3xl p-6 text-center space-y-5 shadow-2xl relative overflow-hidden">
            {/* Top countdown progress line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-1000"
                style={{ width: `${(challengeTimer / 30) * 100}%` }}
              />
            </div>

            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
              <Swords className="w-7 h-7 animate-bounce" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-400">
                <span>⏱️ 15 Min Turn Timer</span>
                <span>•</span>
                <span>Expires in {challengeTimer}s</span>
              </div>
              <h3 className="text-lg font-black text-white">Incoming Match Challenge!</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-amber-400">{incomingChallenge.fromUser.username}</strong> ({incomingChallenge.fromUser.rating || incomingChallenge.fromUser.elo || 1200} ELO) challenged you to a Checkers match.
              </p>

              {/* Stake and Pot Details */}
              {(incomingChallenge.stakeAmount || 0) > 0 ? (
                <div className="p-3 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-left space-y-1 shadow-inner">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-300 font-bold">🎯 Match Stake:</span>
                    <span className="text-white font-black">{(incomingChallenge.stakeAmount || 0).toLocaleString()} UGX</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-bold">🏆 Winner Prize Pot:</span>
                    <span className="text-emerald-300 font-black">{((incomingChallenge.stakeAmount || 0) * 2).toLocaleString()} UGX</span>
                  </div>
                  {(currentUser?.walletBalance || 0) < (incomingChallenge.stakeAmount || 0) && (
                    <p className="text-[10px] text-rose-400 font-bold pt-1">
                      ⚠️ Insufficient balance ({(currentUser?.walletBalance || 0).toLocaleString()} UGX). Accepting will prompt deposit.
                    </p>
                  )}
                </div>
              ) : (
                <div className="inline-block px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-bold">
                  🟢 Free Play (No Stake)
                </div>
              )}

              <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-medium text-left space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-rose-400 font-black">👑 1st Move (Red):</span>
                  <span className="text-white font-bold">{incomingChallenge.fromUser.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-black">⚫ 2nd Move (Black):</span>
                  <span className="text-white font-bold">{currentUser?.username || 'You'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <AvatarBadge avatarId={incomingChallenge.fromUser.avatarId} size="lg" />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => handleRespondChallenge(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
                Decline
              </button>
              <button
                onClick={() => handleRespondChallenge(true)}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                Allow & Play ({challengeTimer}s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
