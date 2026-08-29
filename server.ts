import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  createInitialBoard,
  getValidMovesForPlayer,
  executeMove,
  checkGameOver,
  getBestBotMove,
} from './src/lib/checkersEngine.js';
import {
  UserProfile,
  GameRoom,
  GamePlayer,
  PieceColor,
  MoveOption,
  Challenge,
  ChatMessage,
  LeaderboardEntry,
} from './src/types.js';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const PORT = 3000;

app.use(express.json());

// File persistence paths
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Data Store
let usersMap = new Map<string, UserProfile>(); // userId -> UserProfile
let userSockets = new Map<string, WebSocket>(); // userId -> WebSocket
let activeRooms = new Map<string, GameRoom>(); // roomId -> GameRoom
let activeChallenges = new Map<string, Challenge>(); // challengeId -> Challenge
let globalChatMessages: ChatMessage[] = [];

// Load persisted users on startup (real registered users only)
try {
  if (fs.existsSync(USERS_FILE)) {
    const rawUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    if (Array.isArray(rawUsers)) {
      rawUsers.forEach((u: UserProfile) => {
        // Filter out any previous fake arena users
        if (!u.id.startsWith('usr_arena_')) {
          usersMap.set(u.id, { ...u, status: 'offline', isOnline: false });
        }
      });
      console.log(`Loaded ${usersMap.size} persisted user accounts.`);
    }
  }
} catch (err) {
  console.error('Failed to load users file:', err);
}

function persistUsers() {
  try {
    const usersArray = Array.from(usersMap.values())
      .filter((u) => !u.id.startsWith('usr_arena_'))
      .map((u) => ({
        ...u,
        status: userSockets.has(u.id) ? 'online' : 'offline',
      }));
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save users:', err);
  }
}

// Username Validation Function: Allows letters, numbers, spaces, hyphens, underscores
function validateUsername(username: string): { valid: boolean; message?: string } {
  if (!username || typeof username !== 'string') {
    return { valid: false, message: 'Username is required.' };
  }
  const trimmed = username.trim();
  if (trimmed.length < 2 || trimmed.length > 25) {
    return { valid: false, message: 'Username must be between 2 and 25 characters.' };
  }

  // Allowed characters: Letters, numbers, spaces, hyphens, underscores
  const validCharsRegex = /^[a-zA-Z0-9\s_-]+$/;
  if (!validCharsRegex.test(trimmed)) {
    return {
      valid: false,
      message: 'Usernames can only contain letters, numbers, spaces, hyphens, and underscores.',
    };
  }

  return { valid: true };
}

// Helper: Broadcast to all connected clients
function broadcast(type: string, payload: any) {
  const msg = JSON.stringify({ type, payload });
  userSockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

// Helper: Send message to specific user
function sendToUser(userId: string, type: string, payload: any) {
  let ws = userSockets.get(userId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const targetUser = usersMap.get(userId);
    for (const [uid, sock] of userSockets.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        if (uid === userId) {
          ws = sock;
          break;
        }
        const u = usersMap.get(uid);
        if (targetUser && u && u.username.toLowerCase() === targetUser.username.toLowerCase()) {
          ws = sock;
          break;
        }
      }
    }
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

// Helper: Broadcast presence list (Real-time connected users only)
function broadcastPresence() {
  const onlineUsers: any[] = [];
  userSockets.forEach((ws, userId) => {
    if (ws.readyState === WebSocket.OPEN) {
      const u = usersMap.get(userId);
      if (u) {
        onlineUsers.push({
          id: u.id,
          username: u.username,
          avatarId: u.avatarId,
          rating: u.rating || u.elo || 1200,
          elo: u.elo || u.rating || 1200,
          status: u.status || 'online',
          isOnline: true,
          wins: u.wins || 0,
          losses: u.losses || 0,
          draws: u.draws || 0,
        });
      }
    }
  });
  broadcast('presence:list', onlineUsers);
}

// Helper: Calculate Elo Rating Update
function calculateElo(
  winnerRating: number,
  loserRating: number,
  isDraw: boolean = false
): { newWinnerRating: number; newLoserRating: number } {
  const K = 32;
  const expectedWinner =
    1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  if (isDraw) {
    const newWinnerRating = Math.round(winnerRating + K * (0.5 - expectedWinner));
    const newLoserRating = Math.round(loserRating + K * (0.5 - expectedLoser));
    return { newWinnerRating, newLoserRating };
  }

  const newWinnerRating = Math.round(winnerRating + K * (1 - expectedWinner));
  const newLoserRating = Math.max(
    100,
    Math.round(loserRating + K * (0 - expectedLoser))
  );

  return { newWinnerRating, newLoserRating };
}

// HTTP API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Username Validation API
app.post('/api/auth/validate-username', (req, res) => {
  const { username } = req.body;
  const validation = validateUsername(username);
  if (!validation.valid) {
    return res.status(400).json({ valid: false, error: validation.message });
  }

  // Check uniqueness
  const existing = Array.from(usersMap.values()).find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase()
  );

  return res.json({
    valid: true,
    available: !existing,
    message: existing ? 'Username is taken by another account, but you can log into it!' : 'Username is available!',
  });
});

// WebSocket Connection Management
wss.on('connection', (ws: WebSocket) => {
  let currentUserId: string | null = null;

  ws.on('message', (messageRaw: string) => {
    try {
      const data = JSON.parse(messageRaw.toString());
      const { type, payload } = data;

      switch (type) {
        // --- AUTHENTICATION / ACCOUNT SETUP ---
        case 'auth:login': {
          const { username, avatarId, existingUserId } = payload;
          const validation = validateUsername(username);
          if (!validation.valid) {
            ws.send(
              JSON.stringify({
                type: 'auth:error',
                payload: { message: validation.message },
              })
            );
            return;
          }

          const cleanUsername = username.trim();
          let userProfile: UserProfile;
          const targetId = existingUserId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          // Check if existing user by ID or lowercased username
          const existingUser =
            (existingUserId && usersMap.get(existingUserId)) ||
            Array.from(usersMap.values()).find(
              (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
            );

          if (existingUser) {
            userProfile = {
              ...existingUser,
              id: targetId,
              username: cleanUsername,
              avatarId: avatarId || existingUser.avatarId,
              status: 'online',
            };
          } else {
            userProfile = {
              id: targetId,
              username: cleanUsername,
              avatarId: avatarId || 'avatar-crown',
              wins: 0,
              losses: 0,
              draws: 0,
              rating: 1200,
              status: 'online',
              createdAt: Date.now(),
            };
          }

          usersMap.set(userProfile.id, userProfile);
          userSockets.set(userProfile.id, ws);
          currentUserId = userProfile.id;
          persistUsers();

          ws.send(
            JSON.stringify({
              type: 'auth:success',
              payload: { user: userProfile },
            })
          );

          broadcastPresence();
          ws.send(
            JSON.stringify({
              type: 'lobby:rooms',
              payload: Array.from(activeRooms.values()),
            })
          );
          ws.send(
            JSON.stringify({
              type: 'chat:history',
              payload: globalChatMessages.slice(-50),
            })
          );
          break;
        }

        case 'user:update_profile': {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          if (!user) return;

          const { avatarId, username } = payload;
          if (username) {
            const val = validateUsername(username);
            if (!val.valid) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { message: val.message },
                })
              );
              return;
            }
            user.username = username.trim();
          }

          if (avatarId) {
            user.avatarId = avatarId;
          }

          usersMap.set(user.id, user);
          persistUsers();

          ws.send(
            JSON.stringify({
              type: 'user:profile_updated',
              payload: { user },
            })
          );
          broadcastPresence();
          break;
        }

        // --- CHALLENGES / MATCHMAKING ---
        case 'challenge:send': {
          if (!currentUserId) return;
          const fromUser = usersMap.get(currentUserId);
          const { targetUserId, targetUser, challengeId: customChallengeId } = payload;
          let toUser = usersMap.get(targetUserId);

          if (!toUser && targetUser) {
            toUser = targetUser;
            usersMap.set(targetUser.id, targetUser);
          }

          if (!toUser) {
            toUser = Array.from(usersMap.values()).find(
              (u) => u.username.toLowerCase() === targetUser?.username?.toLowerCase()
            );
          }

          if (!fromUser || !toUser) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: 'Target player not available.' },
              })
            );
            return;
          }
          if (targetUserId === currentUserId || toUser.id === fromUser.id) return;

          const challengeId = customChallengeId || `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const challenge: Challenge = {
            id: challengeId,
            fromUser,
            toUser,
            createdAt: Date.now(),
            status: 'pending',
          };

          activeChallenges.set(challengeId, challenge);

          // Find socket for toUser (by targetUserId, by toUser.id, or matching socket user)
          let targetSocket = userSockets.get(targetUserId) || userSockets.get(toUser.id);
          if (!targetSocket) {
            for (const [uid, sock] of userSockets.entries()) {
              const u = usersMap.get(uid);
              if (u && (u.id === targetUserId || u.username.toLowerCase() === toUser.username.toLowerCase())) {
                targetSocket = sock;
                break;
              }
            }
          }

          if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
            // Real online player with active socket -> send to recipient's screen
            targetSocket.send(
              JSON.stringify({
                type: 'challenge:received',
                payload: challenge,
              })
            );
            ws.send(
              JSON.stringify({
                type: 'challenge:sent_ack',
                payload: challenge,
              })
            );
          } else {
            // Simulated/idle online user or practice account - auto-accept and start match!
            ws.send(
              JSON.stringify({
                type: 'challenge:sent_ack',
                payload: challenge,
              })
            );
            setTimeout(() => {
              if (activeChallenges.has(challengeId)) {
                const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                const initialBoard = createInitialBoard();
                const redPlayer: GamePlayer = {
                  id: fromUser.id,
                  username: fromUser.username,
                  avatarId: fromUser.avatarId,
                  rating: fromUser.rating || 1200,
                  color: 'red',
                };
                const blackPlayer: GamePlayer = {
                  id: toUser.id,
                  username: toUser.username,
                  avatarId: toUser.avatarId,
                  rating: toUser.rating || 1200,
                  color: 'black',
                  isBot: true,
                };
                const room: GameRoom = {
                  id: roomId,
                  name: `${redPlayer.username} vs ${blackPlayer.username}`,
                  status: 'playing',
                  redPlayer,
                  blackPlayer,
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
                activeRooms.set(roomId, room);
                activeChallenges.delete(challengeId);
                broadcast('lobby:rooms', Array.from(activeRooms.values()));
                sendToUser(fromUser.id, 'game:started', room);
              }
            }, 600);
          }
          break;
        }

        case 'challenge:respond': {
          if (!currentUserId) return;
          const { challengeId, accept, roomId: customRoomId, fromUser: fallbackFromUser, toUser: fallbackToUser } = payload;
          let challenge = activeChallenges.get(challengeId);

          if (!challenge && fallbackFromUser && fallbackToUser) {
            challenge = {
              id: challengeId,
              fromUser: fallbackFromUser,
              toUser: fallbackToUser,
              createdAt: Date.now(),
              status: 'pending',
            };
          }

          if (!challenge) {
            console.warn(`Challenge ${challengeId} not found in activeChallenges`);
            return;
          }

          if (!accept) {
            challenge.status = 'declined';
            sendToUser(challenge.fromUser.id, 'challenge:declined', {
              challengeId,
              message: `${challenge.toUser.username} declined your challenge.`,
            });
            activeChallenges.delete(challengeId);
            return;
          }

          challenge.status = 'accepted';

          // Create Game Room for both players
          const roomId = customRoomId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const initialBoard = createInitialBoard();

          // Challenger (fromUser) is Red (moves first), Opponent who accepts (toUser) is Black
          const redPlayer: GamePlayer = {
            id: challenge.fromUser.id,
            username: challenge.fromUser.username,
            avatarId: challenge.fromUser.avatarId,
            rating: challenge.fromUser.rating || challenge.fromUser.elo || 1200,
            color: 'red',
          };

          const blackPlayer: GamePlayer = {
            id: challenge.toUser.id,
            username: challenge.toUser.username,
            avatarId: challenge.toUser.avatarId,
            rating: challenge.toUser.rating || challenge.toUser.elo || 1200,
            color: 'black',
          };

          const room: GameRoom = {
            id: roomId,
            name: `${redPlayer.username} vs ${blackPlayer.username}`,
            status: 'playing',
            redPlayer,
            blackPlayer,
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

          activeRooms.set(roomId, room);

          // Update users status to in-game
          const p1 = usersMap.get(redPlayer.id);
          const p2 = usersMap.get(blackPlayer.id);
          if (p1) p1.status = 'in-game';
          if (p2) p2.status = 'in-game';

          activeChallenges.delete(challengeId);

          broadcastPresence();
          broadcast('lobby:rooms', Array.from(activeRooms.values()));

          // Notify both players to jump into room
          sendToUser(redPlayer.id, 'game:started', room);
          sendToUser(blackPlayer.id, 'game:started', room);
          break;
        }

        // --- PUBLIC QUICK ROOM / PRACTICE VS BOT ---
        case 'game:create_custom': {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          if (!user) return;

          const { name, vsBot, timeLimit, roomId: customRoomId } = payload;
          const roomId = customRoomId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const initialBoard = createInitialBoard();

          const humanPlayer: GamePlayer = {
            id: user.id,
            username: user.username,
            avatarId: user.avatarId,
            rating: user.rating,
            color: 'red',
          };

          let botPlayer: GamePlayer | null = null;
          if (vsBot) {
            botPlayer = {
              id: 'bot_ai',
              username: 'Checkers Bot (AI)',
              avatarId: 'avatar-cyber',
              rating: 1350,
              color: 'black',
              isBot: true,
            };
          }

          const room: GameRoom = {
            id: roomId,
            name: name || `${user.username}'s Game Table`,
            status: vsBot ? 'playing' : 'waiting',
            redPlayer: humanPlayer,
            blackPlayer: botPlayer,
            currentTurn: 'red',
            board: initialBoard,
            history: [],
            capturedRed: 0,
            capturedBlack: 0,
            winner: null,
            createdAt: Date.now(),
            lastMoveTimestamp: Date.now(),
            turnTimeLimitSeconds: timeLimit || 45,
            turnDeadline: Date.now() + (timeLimit || 45) * 1000,
            spectatorsCount: 0,
          };

          activeRooms.set(roomId, room);
          user.status = 'in-game';

          broadcastPresence();
          broadcast('lobby:rooms', Array.from(activeRooms.values()));

          ws.send(JSON.stringify({ type: 'game:joined', payload: room }));
          break;
        }

        case 'game:join': {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          const { roomId } = payload;
          const room = activeRooms.get(roomId);

          if (!user || !room) return;

          if (room.status === 'waiting' && !room.blackPlayer) {
            // Join as Black Player
            room.blackPlayer = {
              id: user.id,
              username: user.username,
              avatarId: user.avatarId,
              rating: user.rating,
              color: 'black',
            };
            room.status = 'playing';
            room.turnDeadline = Date.now() + room.turnTimeLimitSeconds * 1000;
            user.status = 'in-game';

            broadcastPresence();
            broadcast('lobby:rooms', Array.from(activeRooms.values()));

            broadcastToRoom(room, 'game:updated', room);
          } else {
            // Join as Spectator
            room.spectatorsCount++;
            ws.send(JSON.stringify({ type: 'game:joined', payload: room }));
          }
          break;
        }

        // --- GAME MOVES & ACTIONS ---
        case 'game:move': {
          if (!currentUserId) return;
          const { roomId, move } = payload as { roomId: string; move: MoveOption };
          const room = activeRooms.get(roomId);

          if (!room || room.status !== 'playing') return;

          // Check whose turn it is
          const isRedTurn = room.currentTurn === 'red';
          const currentPlayerId = isRedTurn
            ? room.redPlayer?.id
            : room.blackPlayer?.id;

          if (currentPlayerId !== currentUserId) {
            ws.send(
              JSON.stringify({
                type: 'game:invalid_move',
                payload: { message: 'Not your turn!' },
              })
            );
            return;
          }

          // Validate move on server
          const validMoves = getValidMovesForPlayer(room.board, room.currentTurn);
          const isValid = validMoves.some(
            (vm) =>
              vm.from.row === move.from.row &&
              vm.from.col === move.from.col &&
              vm.to.row === move.to.row &&
              vm.to.col === move.to.col
          );

          if (!isValid) {
            ws.send(
              JSON.stringify({
                type: 'game:invalid_move',
                payload: { message: 'Illegal move attempted.' },
              })
            );
            return;
          }

          // Execute move
          const { newBoard, capturedPiece, becameKing } = executeMove(
            room.board,
            move
          );

          room.board = newBoard;

          if (capturedPiece) {
            if (capturedPiece.color === 'red') room.capturedRed++;
            if (capturedPiece.color === 'black') room.capturedBlack++;
          }

          // Add to move history
          room.history.push({
            id: `m_${Date.now()}`,
            playerColor: room.currentTurn,
            from: move.from,
            to: move.to,
            capturedCount: move.captures.length,
            becameKing,
            timestamp: Date.now(),
          });

          // Switch turn
          const nextTurn: PieceColor = isRedTurn ? 'black' : 'red';
          room.currentTurn = nextTurn;
          room.lastMoveTimestamp = Date.now();
          room.turnDeadline = Date.now() + room.turnTimeLimitSeconds * 1000;

          // Check win condition
          const gameOver = checkGameOver(room.board, nextTurn);
          if (gameOver.isOver) {
            room.status = 'ended';
            room.winner = gameOver.winner;
            room.winReason = gameOver.reason;
            handleGameEnd(room);
          }

          broadcastToRoom(room, 'game:updated', room);
          broadcast('lobby:rooms', Array.from(activeRooms.values()));

          // If next turn is Bot AI and game is still playing
          if (
            room.status === 'playing' &&
            ((nextTurn === 'black' && room.blackPlayer?.isBot) ||
              (nextTurn === 'red' && room.redPlayer?.isBot))
          ) {
            setTimeout(() => {
              executeBotTurn(room);
            }, 600);
          }
          break;
        }

        case 'game:delete_table': {
          if (!currentUserId) return;
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!room) return;

          // Only creator or admin or player in room can delete
          const isCreator = room.redPlayer?.id === currentUserId || room.blackPlayer?.id === currentUserId;
          if (isCreator || room.status === 'waiting') {
            activeRooms.delete(roomId);
            
            // Reset player statuses
            if (room.redPlayer) {
              const u1 = usersMap.get(room.redPlayer.id);
              if (u1 && u1.status === 'in-game') u1.status = 'online';
            }
            if (room.blackPlayer) {
              const u2 = usersMap.get(room.blackPlayer.id);
              if (u2 && u2.status === 'in-game') u2.status = 'online';
            }

            broadcastToRoom(room, 'game:table_deleted', { roomId, message: 'Game table has been closed and deleted.' });
            broadcastPresence();
            broadcast('lobby:rooms', Array.from(activeRooms.values()));
          }
          break;
        }

        case 'game:resign': {
          if (!currentUserId) return;
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== 'playing') return;

          const isRed = room.redPlayer?.id === currentUserId;
          const isBlack = room.blackPlayer?.id === currentUserId;

          if (!isRed && !isBlack) return;

          room.status = 'ended';
          room.winner = isRed ? 'black' : 'red';
          room.winReason = `${
            isRed ? room.redPlayer?.username : room.blackPlayer?.username
          } resigned the match.`;

          handleGameEnd(room);
          broadcastToRoom(room, 'game:updated', room);
          broadcast('lobby:rooms', Array.from(activeRooms.values()));
          break;
        }

        // --- GLOBAL & GAME CHAT ---
        case 'chat:send': {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          if (!user) return;

          const { text, roomId } = payload;
          if (!text || typeof text !== 'string' || !text.trim()) return;

          const chatMsg: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            senderId: user.id,
            senderName: user.username,
            avatarId: user.avatarId,
            text: text.trim().substring(0, 300),
            timestamp: Date.now(),
          };

          if (roomId) {
            const room = activeRooms.get(roomId);
            if (room) {
              broadcastToRoom(room, 'chat:game_message', chatMsg);
            }
          } else {
            globalChatMessages.push(chatMsg);
            if (globalChatMessages.length > 100) {
              globalChatMessages.shift();
            }
            broadcast('chat:lobby_message', chatMsg);
          }
          break;
        }

        // --- LEADERBOARD ---
        case 'leaderboard:get': {
          const sortedUsers = Array.from(usersMap.values())
            .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
            .map((u, idx) => {
              const totalGames = u.wins + u.losses + u.draws;
              const winRate =
                totalGames > 0 ? Math.round((u.wins / totalGames) * 100) : 0;
              return {
                rank: idx + 1,
                username: u.username,
                avatarId: u.avatarId,
                rating: u.rating,
                wins: u.wins,
                losses: u.losses,
                draws: u.draws,
                winRate,
              };
            });

          ws.send(
            JSON.stringify({
              type: 'leaderboard:data',
              payload: sortedUsers,
            })
          );
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    if (currentUserId) {
      userSockets.delete(currentUserId);
      const user = usersMap.get(currentUserId);
      if (user) {
        user.status = 'away';
      }
      broadcastPresence();
    }
  });
});

// Helper: Execute AI Bot move
function executeBotTurn(room: GameRoom) {
  if (room.status !== 'playing') return;

  const botColor = room.currentTurn;
  const isBlackBot = botColor === 'black' && room.blackPlayer?.isBot;
  const isRedBot = botColor === 'red' && room.redPlayer?.isBot;

  if (!isBlackBot && !isRedBot) return;

  const bestMove = getBestBotMove(room.board, botColor);
  if (!bestMove) return;

  const { newBoard, capturedPiece, becameKing } = executeMove(
    room.board,
    bestMove
  );

  room.board = newBoard;
  if (capturedPiece) {
    if (capturedPiece.color === 'red') room.capturedRed++;
    if (capturedPiece.color === 'black') room.capturedBlack++;
  }

  room.history.push({
    id: `m_${Date.now()}`,
    playerColor: botColor,
    from: bestMove.from,
    to: bestMove.to,
    capturedCount: bestMove.captures.length,
    becameKing,
    timestamp: Date.now(),
  });

  const nextTurn: PieceColor = botColor === 'red' ? 'black' : 'red';
  room.currentTurn = nextTurn;
  room.lastMoveTimestamp = Date.now();
  room.turnDeadline = Date.now() + room.turnTimeLimitSeconds * 1000;

  const gameOver = checkGameOver(room.board, nextTurn);
  if (gameOver.isOver) {
    room.status = 'ended';
    room.winner = gameOver.winner;
    room.winReason = gameOver.reason;
    handleGameEnd(room);
  }

  broadcastToRoom(room, 'game:updated', room);
  broadcast('lobby:rooms', Array.from(activeRooms.values()));

  // Chain bot move if next turn is also a bot
  if (
    room.status === 'playing' &&
    ((nextTurn === 'black' && room.blackPlayer?.isBot) ||
      (nextTurn === 'red' && room.redPlayer?.isBot))
  ) {
    setTimeout(() => {
      executeBotTurn(room);
    }, 600);
  }
}

// Helper: Handle game end statistics & Elo update
function handleGameEnd(room: GameRoom) {
  if (room.redPlayer && !room.redPlayer.isBot) {
    const redUser = usersMap.get(room.redPlayer.id);
    if (redUser) {
      redUser.status = 'online';
      if (room.winner === 'red') redUser.wins++;
      else if (room.winner === 'black') redUser.losses++;
      else redUser.draws++;
    }
  }

  if (room.blackPlayer && !room.blackPlayer.isBot) {
    const blackUser = usersMap.get(room.blackPlayer.id);
    if (blackUser) {
      blackUser.status = 'online';
      if (room.winner === 'black') blackUser.wins++;
      else if (room.winner === 'red') blackUser.losses++;
      else blackUser.draws++;
    }
  }

  // Elo rating adjustments
  if (
    room.winner &&
    room.redPlayer &&
    room.blackPlayer &&
    !room.redPlayer.isBot &&
    !room.blackPlayer.isBot
  ) {
    const redUser = usersMap.get(room.redPlayer.id);
    const blackUser = usersMap.get(room.blackPlayer.id);

    if (redUser && blackUser) {
      if (room.winner === 'red') {
        const { newWinnerRating, newLoserRating } = calculateElo(
          redUser.rating,
          blackUser.rating
        );
        redUser.rating = newWinnerRating;
        blackUser.rating = newLoserRating;
      } else if (room.winner === 'black') {
        const { newWinnerRating, newLoserRating } = calculateElo(
          blackUser.rating,
          redUser.rating
        );
        blackUser.rating = newWinnerRating;
        redUser.rating = newLoserRating;
      }
    }
  }

  persistUsers();
  broadcastPresence();
}

// Broadcast message to room players and spectators
function broadcastToRoom(room: GameRoom, type: string, payload: any) {
  if (room.redPlayer) {
    sendToUser(room.redPlayer.id, type, payload);
  }
  if (room.blackPlayer) {
    sendToUser(room.blackPlayer.id, type, payload);
  }
}

// Vite Middleware for dev or static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
