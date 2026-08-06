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
import { AuthModal } from './components/AuthModal';
import { OnlineLobby } from './components/OnlineLobby';
import { GameRoom as GameRoomComponent } from './components/GameRoom';
import { LeaderboardModal } from './components/LeaderboardModal';
import { ProfileModal } from './components/ProfileModal';
import { AndroidInstallModal } from './components/AndroidInstallModal';
import { AvatarBadge } from './components/AvatarBadge';
import { sounds } from './lib/sound';
import { saveUserProfileToFirestore } from './lib/firebase';
import {
  createInitialBoard,
  executeMove,
  checkGameOver,
  getBestBotMove,
} from './lib/checkersEngine';
import { Swords, X, Check, Bell } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [gameRooms, setGameRooms] = useState<GameRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);
  const [lobbyChatMessages, setLobbyChatMessages] = useState<ChatMessage[]>([]);
  const [gameChatMessages, setGameChatMessages] = useState<ChatMessage[]>([]);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);
  const [isAndroidInstallModalOpen, setIsAndroidInstallModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type?: 'info' | 'error' } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

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
              setIsAuthModalOpen(true);
            }
          } else {
            setIsAuthModalOpen(true);
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
                setOnlineUsers(payload);
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

              case 'game:invalid_move': {
                showNotification(payload.message, 'error');
                break;
              }

              case 'chat:history': {
                setLobbyChatMessages(payload);
                break;
              }

              case 'chat:lobby_message': {
                setLobbyChatMessages((prev) => [...prev.slice(-80), payload]);
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

  const sendWs = (type: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn(`WebSocket message deferred/skipped (${type}) as server is offline or connecting.`);
    }
  };

  const showNotification = (message: string, type: 'info' | 'error' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.setEnabled(next);
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
      (window.screen as any).orientation.lock('landscape').catch(() => {});
    }
    showNotification(`Welcome to Checkers Arena, ${userProfile.username}!`);
  };

  const handleSendChallenge = (targetUserId: string) => {
    sendWs('challenge:send', { targetUserId });
    showNotification('Challenge sent! Waiting for player to respond...');
  };

  const handleRespondChallenge = (accept: boolean) => {
    if (!incomingChallenge) return;
    sendWs('challenge:respond', {
      challengeId: incomingChallenge.id,
      accept,
    });
    setIncomingChallenge(null);
  };

  const triggerBotMove = (room: GameRoom) => {
    setTimeout(() => {
      setActiveRoom((latestRoom) => {
        if (!latestRoom || latestRoom.id !== room.id || latestRoom.status !== 'playing') {
          return latestRoom;
        }

        const botColor = 'black';
        const bestMove = getBestBotMove(latestRoom.board, botColor);
        if (!bestMove) {
          const over = checkGameOver(latestRoom.board, botColor);
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
    }, 600);
  };

  const handleCreateCustomGame = (vsBot: boolean) => {
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
      const botRoom: GameRoom = {
        id: `room_bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `${player.username} vs Checkers Bot`,
        status: 'playing',
        redPlayer: {
          id: player.id,
          username: player.username,
          avatarId: player.avatarId,
          rating: player.rating || 1200,
          color: 'red',
        },
        blackPlayer: {
          id: 'bot_ai',
          username: 'Checkers Bot (AI)',
          avatarId: 'avatar-cyber',
          rating: 1350,
          color: 'black',
          isBot: true,
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
      showNotification('Practice vs Checkers AI Bot started!', 'info');

      // Send to server if connected
      sendWs('game:create_custom', { vsBot: true });
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
      showNotification('Game Table created! Waiting for a player to join...', 'info');

      // Send to server if connected
      sendWs('game:create_custom', { vsBot: false });
    }
  };

  const handleJoinGameRoom = (roomId: string) => {
    sendWs('game:join', { roomId });
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

      if (isBotGame && updatedRoom.status === 'playing' && nextTurn === 'black') {
        triggerBotMove(updatedRoom);
      }
    }
  };

  const handleResign = () => {
    if (!activeRoom) return;
    sendWs('game:resign', { roomId: activeRoom.id });

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

  const handleSendLobbyChat = (text: string) => {
    sendWs('chat:send', { text });
  };

  const handleSendGameChat = (text: string) => {
    if (!activeRoom) return;
    sendWs('chat:send', { text, roomId: activeRoom.id });
  };

  const handleOpenLeaderboard = () => {
    sendWs('leaderboard:get', {});
    setIsLeaderboardModalOpen(true);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold border animate-slide-down ${
            notification.type === 'error'
              ? 'bg-rose-950 border-rose-800 text-rose-200'
              : 'bg-amber-950 border-amber-800 text-amber-200'
          }`}
        >
          <Bell className="w-4 h-4 text-amber-400" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <Header
        currentUser={currentUser}
        onlineCount={onlineUsers.length}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenLeaderboard={handleOpenLeaderboard}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenAndroidInstall={() => setIsAndroidInstallModalOpen(true)}
      />

      {/* Main Container View */}
      <main className="flex-1 pb-12">
        {activeRoom ? (
          <GameRoomComponent
            room={activeRoom}
            currentUser={currentUser || { id: '', username: 'Guest', avatarId: 'avatar-crown', wins: 0, losses: 0, draws: 0, rating: 1200, status: 'online', createdAt: Date.now() }}
            onSendMove={handleSendMove}
            onResign={handleResign}
            onLeaveRoom={handleLeaveRoom}
            onSendGameChat={handleSendGameChat}
            gameChatMessages={gameChatMessages}
          />
        ) : currentUser ? (
          <OnlineLobby
            currentUser={currentUser}
            onlineUsers={onlineUsers}
            gameRooms={gameRooms}
            chatMessages={lobbyChatMessages}
            onSendChallenge={handleSendChallenge}
            onCreateCustomGame={handleCreateCustomGame}
            onJoinGameRoom={handleJoinGameRoom}
            onSendChatMessage={handleSendLobbyChat}
            onOpenLeaderboard={handleOpenLeaderboard}
          />
        ) : (
          <div className="flex items-center justify-center min-h-[70vh] px-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
              <div className="w-16 h-16 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              
              <div className="space-y-2">
                <h2 className="text-xl font-black text-white">Connecting to Checkers Arena</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Initializing real-time game server and account syncing. Please log in or create an account to start playing!
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/30 transition transform active:scale-95"
                >
                  Create Account / Log In
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const guestUser: UserProfile = {
                      id: 'guest_' + Math.random().toString(36).substr(2, 9),
                      username: 'GuestPlayer',
                      avatarId: 'avatar-crown',
                      wins: 0,
                      losses: 0,
                      draws: 0,
                      rating: 1200,
                      status: 'online',
                      createdAt: Date.now(),
                    };
                    setCurrentUser(guestUser);
                  }}
                  className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  Continue as Guest
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
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

      <AndroidInstallModal
        isOpen={isAndroidInstallModalOpen}
        onClose={() => setIsAndroidInstallModalOpen(false)}
      />

      {/* Incoming Match Challenge Dialog Overlay */}
      {incomingChallenge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-amber-500 rounded-3xl p-6 text-center space-y-5 shadow-2xl">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
              <Swords className="w-7 h-7 animate-bounce" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">Incoming Match Challenge!</h3>
              <p className="text-xs text-slate-400">
                <strong className="text-amber-400">{incomingChallenge.fromUser.username}</strong> ({incomingChallenge.fromUser.rating} ELO) has challenged you to a checkers match!
              </p>
            </div>

            <div className="flex justify-center">
              <AvatarBadge avatarId={incomingChallenge.fromUser.avatarId} size="lg" />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleRespondChallenge(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Decline
              </button>
              <button
                onClick={() => handleRespondChallenge(true)}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs shadow-lg transition"
              >
                Accept Challenge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
