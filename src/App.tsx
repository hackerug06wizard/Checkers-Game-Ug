import React, { useState, useEffect, useRef } from 'react';
import {
  UserProfile,
  GameRoom,
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
import { AvatarBadge } from './components/AvatarBadge';
import { sounds } from './lib/sound';
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
} from './lib/firebase';
import {
  createInitialBoard,
  executeMove,
  checkGameOver,
  getBestBotMove,
} from './lib/checkersEngine';
import { getBotMoveForDifficulty, BotDifficulty, BOT_DIFFICULTIES } from './lib/botEngine';
import { Swords, X, Check, Bell } from 'lucide-react';

const DEFAULT_ARENA_PLAYERS: UserProfile[] = [
  {
    id: 'usr_arena_1',
    username: 'KampalaKing',
    avatarId: 'avatar-crown',
    rating: 1580,
    elo: 1580,
    wins: 48,
    losses: 12,
    draws: 4,
    gamesPlayed: 64,
    status: 'online',
    isOnline: true,
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: 'usr_arena_2',
    username: 'QueenGambit',
    avatarId: 'avatar-ruby',
    rating: 1640,
    elo: 1640,
    wins: 72,
    losses: 18,
    draws: 6,
    gamesPlayed: 96,
    status: 'online',
    isOnline: true,
    createdAt: Date.now() - 86400000 * 45,
  },
  {
    id: 'usr_arena_3',
    username: 'GrandmasterAlex',
    avatarId: 'avatar-sapphire',
    rating: 1720,
    elo: 1720,
    wins: 95,
    losses: 21,
    draws: 8,
    gamesPlayed: 124,
    status: 'online',
    isOnline: true,
    createdAt: Date.now() - 86400000 * 60,
  },
  {
    id: 'usr_arena_4',
    username: 'CheckersAce',
    avatarId: 'avatar-knight',
    rating: 1410,
    elo: 1410,
    wins: 34,
    losses: 19,
    draws: 3,
    gamesPlayed: 56,
    status: 'online',
    isOnline: true,
    createdAt: Date.now() - 86400000 * 20,
  },
  {
    id: 'usr_arena_5',
    username: 'BlitzTactician',
    avatarId: 'avatar-cyber',
    rating: 1490,
    elo: 1490,
    wins: 41,
    losses: 15,
    draws: 5,
    gamesPlayed: 61,
    status: 'online',
    isOnline: true,
    createdAt: Date.now() - 86400000 * 15,
  },
  {
    id: 'usr_arena_6',
    username: 'SwiftFalcon',
    avatarId: 'avatar-knight',
    rating: 1330,
    elo: 1330,
    wins: 22,
    losses: 14,
    draws: 2,
    gamesPlayed: 38,
    status: 'online',
    isOnline: true,
    createdAt: Date.now() - 86400000 * 10,
  },
];

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
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>(DEFAULT_ARENA_PLAYERS);
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

  // Guest Lifecycle Cleanup: only clean up on explicit unload or logout
  useEffect(() => {
    // 1. One-time purge of all guest player records in Firestore database
    cleanUpAllGuestPlayersFromFirestore().catch(() => {});

    const handleExit = () => {
      try {
        const saved = localStorage.getItem('checkers_user_profile');
        if (saved) {
          const user = JSON.parse(saved);
          if (
            user?.isGuest ||
            user?.id?.startsWith('guest_') ||
            (user?.username && user?.username.toLowerCase().startsWith('guest'))
          ) {
            deleteGuestPlayerFromFirestore(user.id).catch(() => {});
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

              case 'presence:list': {
                setOnlineUsers((prev) => {
                  const map = new Map<string, UserProfile>();
                  DEFAULT_ARENA_PLAYERS.forEach((u) => map.set(u.id, u));
                  prev.forEach((u) => map.set(u.id, u));
                  if (Array.isArray(payload)) {
                    payload.forEach((u: UserProfile) => map.set(u.id, u));
                  }
                  return Array.from(map.values());
                });
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
                setActiveRoom(payload);
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
                setGameChatMessages((prev) => [...prev.slice(-80), payload]);
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
        DEFAULT_ARENA_PLAYERS.forEach((u) => map.set(u.id, u));
        prev.forEach((u) => map.set(u.id, u));
        firestoreUsers.forEach((u) => map.set(u.id, u));
        return Array.from(map.values());
      });
    });

    const unsubscribeLeaderboard = subscribeToLeaderboard((boardUsers) => {
      setLeaderboardEntries(boardUsers);
    });

    const unsubscribeGameRooms = subscribeToAllGameRooms((rooms) => {
      setGameRooms(rooms.filter((r) => r.status === 'waiting' || r.status === 'playing'));
    });

    // Refresh saved user profile from Firestore if available
    try {
      const savedUserRaw = localStorage.getItem('checkers_user_profile');
      if (savedUserRaw) {
        const localUser = JSON.parse(savedUserRaw);
        if (localUser?.id) {
          getUserProfileFromFirestore(localUser.id).then((cloudProfile) => {
            if (cloudProfile) {
              setCurrentUser(cloudProfile);
              localStorage.setItem('checkers_user_profile', JSON.stringify(cloudProfile));
            }
          }).catch(() => {});
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

  // Keep active multiplayer room synchronized in real time
  useEffect(() => {
    if (!activeRoom?.id || activeRoom.blackPlayer?.isBot || activeRoom.id.includes('bot')) return;
    const unsub = subscribeToGameRoom(activeRoom.id, (roomData) => {
      if (roomData && roomData.lastMoveTimestamp && roomData.lastMoveTimestamp !== activeRoom.lastMoveTimestamp) {
        setActiveRoom(roomData);
        if (roomData.status === 'ended' && roomData.winner) {
          const myColor = activeRoom.redPlayer?.id === currentUser?.id ? 'red' : 'black';
          recordGameOutcome(myColor, roomData.winner);
        }
      }
    });
    return () => unsub();
  }, [activeRoom?.id, activeRoom?.lastMoveTimestamp]);

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

  const handleSendChallenge = async (targetUserId: string) => {
    const targetUser = onlineUsers.find((u) => u.id === targetUserId);
    const challengeId = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    sounds.playChallenge();
    sendWs('challenge:send', { targetUserId, targetUser, challengeId });
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
        console.warn('Firestore backup challenge sync error:', err);
      }
    }
    showNotification(
      `Challenge sent to ${targetUser?.username || 'player'}! Waiting for response...`,
      'info',
      6000
    );
  };

  const handleRespondChallenge = async (accept: boolean) => {
    if (!incomingChallenge) return;
    const challenge = incomingChallenge;
    handledChallengeIdsRef.current.add(challenge.id);
    setIncomingChallenge(null);

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    sendWs('challenge:respond', {
      challengeId: challenge.id,
      accept,
      roomId,
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

  const handleCreateCustomGame = (vsBot: boolean, botDifficulty: BotDifficulty = 'medium') => {
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
        name: `${player.username} vs Bot (${diffConfig.name})`,
        status: 'playing',
        botDifficulty,
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
        turnTimeLimitSeconds: 45,
        turnDeadline: Date.now() + 45000,
        spectatorsCount: 0,
      };

      setActiveRoom(botRoom);
      sounds.playMove();
      showNotification(`Practice vs ${diffConfig.name} started!`, 'info');

      // Send to server if connected
      sendWs('game:create_custom', { vsBot: true, botDifficulty });
    } else {
      const initialBoard = createInitialBoard();
      const customRoom: GameRoom = {
        id: `room_table_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `${player.username}'s Game Table`,
        status: 'waiting',
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
        turnTimeLimitSeconds: 45,
        turnDeadline: Date.now() + 45000,
        spectatorsCount: 0,
      };

      setActiveRoom(customRoom);
      setGameRooms((prev) => [customRoom, ...prev.filter((r) => r.id !== customRoom.id)]);
      showNotification('Game Table created! Waiting for an opponent to join...', 'info');

      // Save to Firestore so it appears in active game tables immediately for everyone
      saveGameRoomToFirestore(customRoom).catch((e) => console.warn('saveGameRoomToFirestore error:', e));

      // Subscribe to Firestore room updates so when someone joins, table transitions to playing
      subscribeToGameRoom(customRoom.id, (roomData) => {
        if (roomData) {
          setActiveRoom(roomData);
        }
      });

      // Send to server if connected
      sendWs('game:create_custom', { vsBot: false, roomId: customRoom.id, name: customRoom.name });
    }
  };

  const handleJoinGameRoom = async (roomId: string) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    sendWs('game:join', { roomId });

    // Subscribe to this room
    subscribeToGameRoom(roomId, (roomData) => {
      if (roomData) {
        setActiveRoom(roomData);
      }
    });

    const roomToJoin = gameRooms.find((r) => r.id === roomId);
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
        turnDeadline: Date.now() + (roomToJoin.turnTimeLimitSeconds || 45) * 1000,
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
      };

      setActiveRoom(updatedRoom);
      saveGameRoomToFirestore(updatedRoom).catch((e) => console.warn(e));

      if (isBotGame && updatedRoom.status === 'playing' && nextTurn === 'black') {
        triggerBotMove(updatedRoom);
      }
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

  const handleSendGameChat = (text: string) => {
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
      setGameChatMessages((prev) => [...prev.slice(-80), newMsg]);
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
        onlineCount={Math.max(1, onlineUsers.length + (currentUser && !onlineUsers.some((u) => u.id === currentUser.id) ? 1 : 0))}
        onOpenLeaderboard={handleOpenLeaderboard}
        onOpenProfile={() => {
          if (currentUser) {
            setIsProfileModalOpen(true);
          } else {
            setIsAuthModalOpen(true);
          }
        }}
        onOpenAuth={() => setIsAuthModalOpen(true)}
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
            onSendGameChat={handleSendGameChat}
            gameChatMessages={gameChatMessages}
          />
        ) : (
          <OnlineLobby
            currentUser={currentUser || { id: '', username: 'Player', avatarId: 'avatar-crown', wins: 0, losses: 0, draws: 0, rating: 1200, status: 'online', createdAt: Date.now() }}
            onlineUsers={onlineUsers}
            gameRooms={gameRooms}
            onSendChallenge={handleSendChallenge}
            onCreateCustomGame={handleCreateCustomGame}
            onJoinGameRoom={handleJoinGameRoom}
            onDeleteGameRoom={handleDeleteGameRoom}
            onOpenLeaderboard={handleOpenLeaderboard}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
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
              <div className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-400">
                Expires in {challengeTimer}s
              </div>
              <h3 className="text-lg font-black text-white">Incoming Match Challenge!</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-amber-400">{incomingChallenge.fromUser.username}</strong> ({incomingChallenge.fromUser.rating || incomingChallenge.fromUser.elo || 1200} ELO) has challenged you to an online Checkers duel!
              </p>
            </div>

            <div className="flex justify-center">
              <AvatarBadge avatarId={incomingChallenge.fromUser.avatarId} size="lg" />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => handleRespondChallenge(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition active:scale-95"
              >
                Decline
              </button>
              <button
                onClick={() => handleRespondChallenge(true)}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs shadow-lg transition active:scale-95"
              >
                Accept ({challengeTimer}s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
