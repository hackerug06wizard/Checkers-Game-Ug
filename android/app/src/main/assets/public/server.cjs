var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = require("http");
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_ws = require("ws");
var import_vite = require("vite");

// src/lib/checkersEngine.ts
function createInitialBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  let pieceCounter = 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) {
          board[r][c] = {
            id: `p-${pieceCounter++}`,
            color: "red",
            type: "pawn",
            row: r,
            col: c
          };
        } else if (r > 4) {
          board[r][c] = {
            id: `p-${pieceCounter++}`,
            color: "black",
            type: "pawn",
            row: r,
            col: c
          };
        }
      }
    }
  }
  return board;
}
function isValidPosition(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}
function getDirectionsForPiece(piece) {
  if (piece.type === "king") {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ];
  }
  if (piece.color === "red") {
    return [
      [1, -1],
      [1, 1]
    ];
  } else {
    return [
      [-1, -1],
      [-1, 1]
    ];
  }
}
function findJumpChains(board, piece, currentPos, currentCaptures, currentPath) {
  const results = [];
  const directions = getDirectionsForPiece(piece);
  let foundJump = false;
  for (const [dr, dc] of directions) {
    const midR = currentPos.row + dr;
    const midC = currentPos.col + dc;
    const landR = currentPos.row + dr * 2;
    const landC = currentPos.col + dc * 2;
    if (isValidPosition(landR, landC)) {
      const midPiece = board[midR][midC];
      const landPiece = board[landR][landC];
      if (midPiece && midPiece.color !== piece.color && !currentCaptures.some((p) => p.row === midR && p.col === midC)) {
        const isLandingEmpty = !landPiece || landR === currentPath[0].row && landC === currentPath[0].col;
        if (isLandingEmpty) {
          foundJump = true;
          const nextCaptures = [...currentCaptures, { row: midR, col: midC }];
          const nextPath = [...currentPath, { row: landR, col: landC }];
          const becomesKing = piece.type === "pawn" && (piece.color === "red" && landR === 7 || piece.color === "black" && landR === 0);
          if (becomesKing) {
            results.push({
              from: currentPath[0],
              to: { row: landR, col: landC },
              captures: nextCaptures,
              path: nextPath,
              becomesKing: true
            });
          } else {
            const tempPiece = { ...piece, row: landR, col: landC };
            const subJumps = findJumpChains(
              board,
              tempPiece,
              { row: landR, col: landC },
              nextCaptures,
              nextPath
            );
            if (subJumps.length > 0) {
              results.push(...subJumps);
            } else {
              results.push({
                from: currentPath[0],
                to: { row: landR, col: landC },
                captures: nextCaptures,
                path: nextPath,
                becomesKing: piece.type === "king"
              });
            }
          }
        }
      }
    }
  }
  return results;
}
function getValidMovesForPiece(board, piece) {
  const startPos = { row: piece.row, col: piece.col };
  const jumps = findJumpChains(board, piece, startPos, [], [startPos]);
  const simpleMoves = [];
  const directions = getDirectionsForPiece(piece);
  for (const [dr, dc] of directions) {
    const nr = piece.row + dr;
    const nc = piece.col + dc;
    if (isValidPosition(nr, nc) && !board[nr][nc]) {
      const becomesKing = piece.type === "pawn" && (piece.color === "red" && nr === 7 || piece.color === "black" && nr === 0);
      simpleMoves.push({
        from: startPos,
        to: { row: nr, col: nc },
        captures: [],
        path: [startPos, { row: nr, col: nc }],
        becomesKing
      });
    }
  }
  return [...jumps, ...simpleMoves];
}
function getValidMovesForPlayer(board, color, forcedJumps = true) {
  const movesPerPiece = [];
  const playerPieces = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        playerPieces.push(p);
      }
    }
  }
  for (const piece of playerPieces) {
    const pieceMoves = getValidMovesForPiece(board, piece);
    movesPerPiece.push(...pieceMoves);
  }
  const jumpMoves = movesPerPiece.filter((m) => m.captures && m.captures.length > 0);
  if (forcedJumps && jumpMoves.length > 0) {
    return jumpMoves;
  }
  return movesPerPiece;
}
function executeMove(board, move) {
  const newBoard = board.map(
    (row) => row.map((cell) => cell ? { ...cell } : null)
  );
  const piece = newBoard[move.from.row][move.from.col];
  if (!piece) {
    return { newBoard, capturedPiece: null, becameKing: false };
  }
  newBoard[move.from.row][move.from.col] = null;
  let capturedPiece = null;
  for (const cap of move.captures) {
    if (newBoard[cap.row][cap.col]) {
      capturedPiece = newBoard[cap.row][cap.col];
      newBoard[cap.row][cap.col] = null;
    }
  }
  let becameKing = false;
  let newType = piece.type;
  if (piece.type === "pawn" && (piece.color === "red" && move.to.row === 7 || piece.color === "black" && move.to.row === 0)) {
    becameKing = true;
    newType = "king";
  }
  newBoard[move.to.row][move.to.col] = {
    ...piece,
    row: move.to.row,
    col: move.to.col,
    type: newType
  };
  return { newBoard, capturedPiece, becameKing };
}
function checkGameOver(board, currentTurn) {
  let redCount = 0;
  let blackCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        if (p.color === "red") redCount++;
        if (p.color === "black") blackCount++;
      }
    }
  }
  if (redCount === 0) {
    return { isOver: true, winner: "black", reason: "All Red pieces captured" };
  }
  if (blackCount === 0) {
    return { isOver: true, winner: "red", reason: "All Black pieces captured" };
  }
  const moves = getValidMovesForPlayer(board, currentTurn);
  if (moves.length === 0) {
    const winner = currentTurn === "red" ? "black" : "red";
    return {
      isOver: true,
      winner,
      reason: `${currentTurn.toUpperCase()} has no available moves`
    };
  }
  return { isOver: false, winner: null };
}
function getBestBotMove(board, botColor) {
  const validMoves = getValidMovesForPlayer(board, botColor);
  if (validMoves.length === 0) return null;
  const captureMoves = validMoves.filter((m) => m.captures.length > 0);
  if (captureMoves.length > 0) {
    captureMoves.sort((a, b) => b.captures.length - a.captures.length);
    return captureMoves[0];
  }
  let bestMove = validMoves[0];
  let bestScore = -Infinity;
  for (const move of validMoves) {
    let score = 0;
    if (move.becomesKing) score += 50;
    const centerDist = Math.abs(3.5 - move.to.row) + Math.abs(3.5 - move.to.col);
    score -= centerDist * 2;
    if (botColor === "red") {
      score += move.to.row * 3;
    } else {
      score += (7 - move.to.row) * 3;
    }
    if (botColor === "red" && move.from.row === 0 || botColor === "black" && move.from.row === 7) {
      score -= 5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

// server.ts
var app = (0, import_express.default)();
var httpServer = (0, import_http.createServer)(app);
var wss = new import_ws.WebSocketServer({ server: httpServer });
var PORT = 3e3;
app.use(import_express.default.json());
var DATA_DIR = import_path.default.join(process.cwd(), "data");
var USERS_FILE = import_path.default.join(DATA_DIR, "users.json");
var GAMES_FILE = import_path.default.join(DATA_DIR, "games.json");
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
var usersMap = /* @__PURE__ */ new Map();
var userSockets = /* @__PURE__ */ new Map();
var activeRooms = /* @__PURE__ */ new Map();
var activeChallenges = /* @__PURE__ */ new Map();
var globalChatMessages = [];
try {
  if (import_fs.default.existsSync(USERS_FILE)) {
    const rawUsers = JSON.parse(import_fs.default.readFileSync(USERS_FILE, "utf-8"));
    if (Array.isArray(rawUsers)) {
      rawUsers.forEach((u) => {
        if (!u.id.startsWith("usr_arena_")) {
          usersMap.set(u.id, { ...u, status: "offline", isOnline: false });
        }
      });
      console.log(`Loaded ${usersMap.size} persisted user accounts.`);
    }
  }
} catch (err) {
  console.error("Failed to load users file:", err);
}
function persistUsers() {
  try {
    const usersArray = Array.from(usersMap.values()).filter((u) => !u.id.startsWith("usr_arena_")).map((u) => ({
      ...u,
      status: userSockets.has(u.id) ? "online" : "offline"
    }));
    import_fs.default.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save users:", err);
  }
}
function validateUsername(username) {
  if (!username || typeof username !== "string") {
    return { valid: false, message: "Username is required." };
  }
  const trimmed = username.trim();
  if (trimmed.length < 2 || trimmed.length > 25) {
    return { valid: false, message: "Username must be between 2 and 25 characters." };
  }
  const validCharsRegex = /^[a-zA-Z0-9\s_-]+$/;
  if (!validCharsRegex.test(trimmed)) {
    return {
      valid: false,
      message: "Usernames can only contain letters, numbers, spaces, hyphens, and underscores."
    };
  }
  return { valid: true };
}
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  userSockets.forEach((ws) => {
    if (ws.readyState === import_ws.WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}
function sendToUser(userId, type, payload) {
  let ws = userSockets.get(userId);
  if (!ws || ws.readyState !== import_ws.WebSocket.OPEN) {
    const targetUser = usersMap.get(userId);
    for (const [uid, sock] of userSockets.entries()) {
      if (sock.readyState === import_ws.WebSocket.OPEN) {
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
  if (ws && ws.readyState === import_ws.WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}
function broadcastPresence() {
  const onlineUsers = [];
  userSockets.forEach((ws, userId) => {
    if (ws.readyState === import_ws.WebSocket.OPEN) {
      const u = usersMap.get(userId);
      if (u) {
        onlineUsers.push({
          id: u.id,
          username: u.username,
          avatarId: u.avatarId,
          rating: u.rating || u.elo || 1200,
          elo: u.elo || u.rating || 1200,
          status: u.status || "online",
          isOnline: true,
          wins: u.wins || 0,
          losses: u.losses || 0,
          draws: u.draws || 0
        });
      }
    }
  });
  broadcast("presence:list", onlineUsers);
}
function calculateElo(winnerRating, loserRating, isDraw = false) {
  const K = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;
  if (isDraw) {
    const newWinnerRating2 = Math.round(winnerRating + K * (0.5 - expectedWinner));
    const newLoserRating2 = Math.round(loserRating + K * (0.5 - expectedLoser));
    return { newWinnerRating: newWinnerRating2, newLoserRating: newLoserRating2 };
  }
  const newWinnerRating = Math.round(winnerRating + K * (1 - expectedWinner));
  const newLoserRating = Math.max(
    100,
    Math.round(loserRating + K * (0 - expectedLoser))
  );
  return { newWinnerRating, newLoserRating };
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/auth/validate-username", (req, res) => {
  const { username } = req.body;
  const validation = validateUsername(username);
  if (!validation.valid) {
    return res.status(400).json({ valid: false, error: validation.message });
  }
  const existing = Array.from(usersMap.values()).find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase()
  );
  return res.json({
    valid: true,
    available: !existing,
    message: existing ? "Username is taken by another account, but you can log into it!" : "Username is available!"
  });
});
wss.on("connection", (ws) => {
  let currentUserId = null;
  ws.on("message", (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw.toString());
      const { type, payload } = data;
      switch (type) {
        // --- AUTHENTICATION / ACCOUNT SETUP ---
        case "auth:login": {
          const { username, avatarId, existingUserId } = payload;
          const validation = validateUsername(username);
          if (!validation.valid) {
            ws.send(
              JSON.stringify({
                type: "auth:error",
                payload: { message: validation.message }
              })
            );
            return;
          }
          const cleanUsername = username.trim();
          let userProfile;
          const targetId = existingUserId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const existingUser = existingUserId && usersMap.get(existingUserId) || Array.from(usersMap.values()).find(
            (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
          );
          if (existingUser) {
            userProfile = {
              ...existingUser,
              id: targetId,
              username: cleanUsername,
              avatarId: avatarId || existingUser.avatarId,
              status: "online"
            };
          } else {
            userProfile = {
              id: targetId,
              username: cleanUsername,
              avatarId: avatarId || "avatar-crown",
              wins: 0,
              losses: 0,
              draws: 0,
              rating: 1200,
              status: "online",
              createdAt: Date.now()
            };
          }
          usersMap.set(userProfile.id, userProfile);
          userSockets.set(userProfile.id, ws);
          currentUserId = userProfile.id;
          persistUsers();
          ws.send(
            JSON.stringify({
              type: "auth:success",
              payload: { user: userProfile }
            })
          );
          broadcastPresence();
          ws.send(
            JSON.stringify({
              type: "lobby:rooms",
              payload: Array.from(activeRooms.values())
            })
          );
          ws.send(
            JSON.stringify({
              type: "chat:history",
              payload: globalChatMessages.slice(-50)
            })
          );
          break;
        }
        case "user:update_profile": {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          if (!user) return;
          const { avatarId, username } = payload;
          if (username) {
            const val = validateUsername(username);
            if (!val.valid) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  payload: { message: val.message }
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
              type: "user:profile_updated",
              payload: { user }
            })
          );
          broadcastPresence();
          break;
        }
        // --- CHALLENGES / MATCHMAKING ---
        case "challenge:send": {
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
                type: "error",
                payload: { message: "Target player not available." }
              })
            );
            return;
          }
          if (targetUserId === currentUserId || toUser.id === fromUser.id) return;
          const challengeId = customChallengeId || `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const challenge = {
            id: challengeId,
            fromUser,
            toUser,
            createdAt: Date.now(),
            status: "pending"
          };
          activeChallenges.set(challengeId, challenge);
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
          if (targetSocket && targetSocket.readyState === import_ws.WebSocket.OPEN) {
            targetSocket.send(
              JSON.stringify({
                type: "challenge:received",
                payload: challenge
              })
            );
            ws.send(
              JSON.stringify({
                type: "challenge:sent_ack",
                payload: challenge
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "challenge:sent_ack",
                payload: challenge
              })
            );
            setTimeout(() => {
              if (activeChallenges.has(challengeId)) {
                const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                const initialBoard = createInitialBoard();
                const redPlayer = {
                  id: fromUser.id,
                  username: fromUser.username,
                  avatarId: fromUser.avatarId,
                  rating: fromUser.rating || 1200,
                  color: "red"
                };
                const blackPlayer = {
                  id: toUser.id,
                  username: toUser.username,
                  avatarId: toUser.avatarId,
                  rating: toUser.rating || 1200,
                  color: "black",
                  isBot: true
                };
                const room = {
                  id: roomId,
                  name: `${redPlayer.username} vs ${blackPlayer.username}`,
                  status: "playing",
                  redPlayer,
                  blackPlayer,
                  currentTurn: "red",
                  board: initialBoard,
                  history: [],
                  capturedRed: 0,
                  capturedBlack: 0,
                  winner: null,
                  createdAt: Date.now(),
                  lastMoveTimestamp: Date.now(),
                  turnTimeLimitSeconds: 45,
                  turnDeadline: Date.now() + 45e3,
                  spectatorsCount: 0
                };
                activeRooms.set(roomId, room);
                activeChallenges.delete(challengeId);
                broadcast("lobby:rooms", Array.from(activeRooms.values()));
                sendToUser(fromUser.id, "game:started", room);
              }
            }, 600);
          }
          break;
        }
        case "challenge:respond": {
          if (!currentUserId) return;
          const { challengeId, accept, roomId: customRoomId, fromUser: fallbackFromUser, toUser: fallbackToUser } = payload;
          let challenge = activeChallenges.get(challengeId);
          if (!challenge && fallbackFromUser && fallbackToUser) {
            challenge = {
              id: challengeId,
              fromUser: fallbackFromUser,
              toUser: fallbackToUser,
              createdAt: Date.now(),
              status: "pending"
            };
          }
          if (!challenge) {
            console.warn(`Challenge ${challengeId} not found in activeChallenges`);
            return;
          }
          if (!accept) {
            challenge.status = "declined";
            sendToUser(challenge.fromUser.id, "challenge:declined", {
              challengeId,
              message: `${challenge.toUser.username} declined your challenge.`
            });
            activeChallenges.delete(challengeId);
            return;
          }
          challenge.status = "accepted";
          const roomId = customRoomId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const initialBoard = createInitialBoard();
          const isFromRed = Math.random() < 0.5;
          const redPlayer = {
            id: isFromRed ? challenge.fromUser.id : challenge.toUser.id,
            username: isFromRed ? challenge.fromUser.username : challenge.toUser.username,
            avatarId: isFromRed ? challenge.fromUser.avatarId : challenge.toUser.avatarId,
            rating: isFromRed ? challenge.fromUser.rating || 1200 : challenge.toUser.rating || 1200,
            color: "red"
          };
          const blackPlayer = {
            id: isFromRed ? challenge.toUser.id : challenge.fromUser.id,
            username: isFromRed ? challenge.toUser.username : challenge.fromUser.username,
            avatarId: isFromRed ? challenge.toUser.avatarId : challenge.fromUser.avatarId,
            rating: isFromRed ? challenge.toUser.rating || 1200 : challenge.fromUser.rating || 1200,
            color: "black"
          };
          const room = {
            id: roomId,
            name: `${redPlayer.username} vs ${blackPlayer.username}`,
            status: "playing",
            redPlayer,
            blackPlayer,
            currentTurn: "red",
            board: initialBoard,
            history: [],
            capturedRed: 0,
            capturedBlack: 0,
            winner: null,
            createdAt: Date.now(),
            lastMoveTimestamp: Date.now(),
            turnTimeLimitSeconds: 45,
            turnDeadline: Date.now() + 45e3,
            spectatorsCount: 0
          };
          activeRooms.set(roomId, room);
          const p1 = usersMap.get(redPlayer.id);
          const p2 = usersMap.get(blackPlayer.id);
          if (p1) p1.status = "in-game";
          if (p2) p2.status = "in-game";
          activeChallenges.delete(challengeId);
          broadcastPresence();
          broadcast("lobby:rooms", Array.from(activeRooms.values()));
          sendToUser(redPlayer.id, "game:started", room);
          sendToUser(blackPlayer.id, "game:started", room);
          break;
        }
        // --- PUBLIC QUICK ROOM / PRACTICE VS BOT ---
        case "game:create_custom": {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          if (!user) return;
          const { name, vsBot, timeLimit, roomId: customRoomId } = payload;
          const roomId = customRoomId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const initialBoard = createInitialBoard();
          const humanPlayer = {
            id: user.id,
            username: user.username,
            avatarId: user.avatarId,
            rating: user.rating,
            color: "red"
          };
          let botPlayer = null;
          if (vsBot) {
            botPlayer = {
              id: "bot_ai",
              username: "Checkers Bot (AI)",
              avatarId: "avatar-cyber",
              rating: 1350,
              color: "black",
              isBot: true
            };
          }
          const room = {
            id: roomId,
            name: name || `${user.username}'s Game Table`,
            status: vsBot ? "playing" : "waiting",
            redPlayer: humanPlayer,
            blackPlayer: botPlayer,
            currentTurn: "red",
            board: initialBoard,
            history: [],
            capturedRed: 0,
            capturedBlack: 0,
            winner: null,
            createdAt: Date.now(),
            lastMoveTimestamp: Date.now(),
            turnTimeLimitSeconds: timeLimit || 45,
            turnDeadline: Date.now() + (timeLimit || 45) * 1e3,
            spectatorsCount: 0
          };
          activeRooms.set(roomId, room);
          user.status = "in-game";
          broadcastPresence();
          broadcast("lobby:rooms", Array.from(activeRooms.values()));
          ws.send(JSON.stringify({ type: "game:joined", payload: room }));
          break;
        }
        case "game:join": {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!user || !room) return;
          if (room.status === "waiting" && !room.blackPlayer) {
            room.blackPlayer = {
              id: user.id,
              username: user.username,
              avatarId: user.avatarId,
              rating: user.rating,
              color: "black"
            };
            room.status = "playing";
            room.turnDeadline = Date.now() + room.turnTimeLimitSeconds * 1e3;
            user.status = "in-game";
            broadcastPresence();
            broadcast("lobby:rooms", Array.from(activeRooms.values()));
            broadcastToRoom(room, "game:updated", room);
          } else {
            room.spectatorsCount++;
            ws.send(JSON.stringify({ type: "game:joined", payload: room }));
          }
          break;
        }
        // --- GAME MOVES & ACTIONS ---
        case "game:move": {
          if (!currentUserId) return;
          const { roomId, move } = payload;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== "playing") return;
          const isRedTurn = room.currentTurn === "red";
          const currentPlayerId = isRedTurn ? room.redPlayer?.id : room.blackPlayer?.id;
          if (currentPlayerId !== currentUserId) {
            ws.send(
              JSON.stringify({
                type: "game:invalid_move",
                payload: { message: "Not your turn!" }
              })
            );
            return;
          }
          const validMoves = getValidMovesForPlayer(room.board, room.currentTurn);
          const isValid = validMoves.some(
            (vm) => vm.from.row === move.from.row && vm.from.col === move.from.col && vm.to.row === move.to.row && vm.to.col === move.to.col
          );
          if (!isValid) {
            ws.send(
              JSON.stringify({
                type: "game:invalid_move",
                payload: { message: "Illegal move attempted." }
              })
            );
            return;
          }
          const { newBoard, capturedPiece, becameKing } = executeMove(
            room.board,
            move
          );
          room.board = newBoard;
          if (capturedPiece) {
            if (capturedPiece.color === "red") room.capturedRed++;
            if (capturedPiece.color === "black") room.capturedBlack++;
          }
          room.history.push({
            id: `m_${Date.now()}`,
            playerColor: room.currentTurn,
            from: move.from,
            to: move.to,
            capturedCount: move.captures.length,
            becameKing,
            timestamp: Date.now()
          });
          const nextTurn = isRedTurn ? "black" : "red";
          room.currentTurn = nextTurn;
          room.lastMoveTimestamp = Date.now();
          room.turnDeadline = Date.now() + room.turnTimeLimitSeconds * 1e3;
          const gameOver = checkGameOver(room.board, nextTurn);
          if (gameOver.isOver) {
            room.status = "ended";
            room.winner = gameOver.winner;
            room.winReason = gameOver.reason;
            handleGameEnd(room);
          }
          broadcastToRoom(room, "game:updated", room);
          broadcast("lobby:rooms", Array.from(activeRooms.values()));
          if (room.status === "playing" && (nextTurn === "black" && room.blackPlayer?.isBot || nextTurn === "red" && room.redPlayer?.isBot)) {
            setTimeout(() => {
              executeBotTurn(room);
            }, 600);
          }
          break;
        }
        case "game:delete_table": {
          if (!currentUserId) return;
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!room) return;
          const isCreator = room.redPlayer?.id === currentUserId || room.blackPlayer?.id === currentUserId;
          if (isCreator || room.status === "waiting") {
            activeRooms.delete(roomId);
            if (room.redPlayer) {
              const u1 = usersMap.get(room.redPlayer.id);
              if (u1 && u1.status === "in-game") u1.status = "online";
            }
            if (room.blackPlayer) {
              const u2 = usersMap.get(room.blackPlayer.id);
              if (u2 && u2.status === "in-game") u2.status = "online";
            }
            broadcastToRoom(room, "game:table_deleted", { roomId, message: "Game table has been closed and deleted." });
            broadcastPresence();
            broadcast("lobby:rooms", Array.from(activeRooms.values()));
          }
          break;
        }
        case "game:resign": {
          if (!currentUserId) return;
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== "playing") return;
          const isRed = room.redPlayer?.id === currentUserId;
          const isBlack = room.blackPlayer?.id === currentUserId;
          if (!isRed && !isBlack) return;
          room.status = "ended";
          room.winner = isRed ? "black" : "red";
          room.winReason = `${isRed ? room.redPlayer?.username : room.blackPlayer?.username} resigned the match.`;
          handleGameEnd(room);
          broadcastToRoom(room, "game:updated", room);
          broadcast("lobby:rooms", Array.from(activeRooms.values()));
          break;
        }
        // --- GLOBAL & GAME CHAT ---
        case "chat:send": {
          if (!currentUserId) return;
          const user = usersMap.get(currentUserId);
          if (!user) return;
          const { text, roomId } = payload;
          if (!text || typeof text !== "string" || !text.trim()) return;
          const chatMsg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            senderId: user.id,
            senderName: user.username,
            avatarId: user.avatarId,
            text: text.trim().substring(0, 300),
            timestamp: Date.now()
          };
          if (roomId) {
            const room = activeRooms.get(roomId);
            if (room) {
              broadcastToRoom(room, "chat:game_message", chatMsg);
            }
          } else {
            globalChatMessages.push(chatMsg);
            if (globalChatMessages.length > 100) {
              globalChatMessages.shift();
            }
            broadcast("chat:lobby_message", chatMsg);
          }
          break;
        }
        // --- LEADERBOARD ---
        case "leaderboard:get": {
          const sortedUsers = Array.from(usersMap.values()).sort((a, b) => b.rating - a.rating || b.wins - a.wins).map((u, idx) => {
            const totalGames = u.wins + u.losses + u.draws;
            const winRate = totalGames > 0 ? Math.round(u.wins / totalGames * 100) : 0;
            return {
              rank: idx + 1,
              username: u.username,
              avatarId: u.avatarId,
              rating: u.rating,
              wins: u.wins,
              losses: u.losses,
              draws: u.draws,
              winRate
            };
          });
          ws.send(
            JSON.stringify({
              type: "leaderboard:data",
              payload: sortedUsers
            })
          );
          break;
        }
      }
    } catch (err) {
      console.error("Error handling WS message:", err);
    }
  });
  ws.on("close", () => {
    if (currentUserId) {
      userSockets.delete(currentUserId);
      const user = usersMap.get(currentUserId);
      if (user) {
        user.status = "away";
      }
      broadcastPresence();
    }
  });
});
function executeBotTurn(room) {
  if (room.status !== "playing") return;
  const botColor = room.currentTurn;
  const isBlackBot = botColor === "black" && room.blackPlayer?.isBot;
  const isRedBot = botColor === "red" && room.redPlayer?.isBot;
  if (!isBlackBot && !isRedBot) return;
  const bestMove = getBestBotMove(room.board, botColor);
  if (!bestMove) return;
  const { newBoard, capturedPiece, becameKing } = executeMove(
    room.board,
    bestMove
  );
  room.board = newBoard;
  if (capturedPiece) {
    if (capturedPiece.color === "red") room.capturedRed++;
    if (capturedPiece.color === "black") room.capturedBlack++;
  }
  room.history.push({
    id: `m_${Date.now()}`,
    playerColor: botColor,
    from: bestMove.from,
    to: bestMove.to,
    capturedCount: bestMove.captures.length,
    becameKing,
    timestamp: Date.now()
  });
  const nextTurn = botColor === "red" ? "black" : "red";
  room.currentTurn = nextTurn;
  room.lastMoveTimestamp = Date.now();
  room.turnDeadline = Date.now() + room.turnTimeLimitSeconds * 1e3;
  const gameOver = checkGameOver(room.board, nextTurn);
  if (gameOver.isOver) {
    room.status = "ended";
    room.winner = gameOver.winner;
    room.winReason = gameOver.reason;
    handleGameEnd(room);
  }
  broadcastToRoom(room, "game:updated", room);
  broadcast("lobby:rooms", Array.from(activeRooms.values()));
  if (room.status === "playing" && (nextTurn === "black" && room.blackPlayer?.isBot || nextTurn === "red" && room.redPlayer?.isBot)) {
    setTimeout(() => {
      executeBotTurn(room);
    }, 600);
  }
}
function handleGameEnd(room) {
  if (room.redPlayer && !room.redPlayer.isBot) {
    const redUser = usersMap.get(room.redPlayer.id);
    if (redUser) {
      redUser.status = "online";
      if (room.winner === "red") redUser.wins++;
      else if (room.winner === "black") redUser.losses++;
      else redUser.draws++;
    }
  }
  if (room.blackPlayer && !room.blackPlayer.isBot) {
    const blackUser = usersMap.get(room.blackPlayer.id);
    if (blackUser) {
      blackUser.status = "online";
      if (room.winner === "black") blackUser.wins++;
      else if (room.winner === "red") blackUser.losses++;
      else blackUser.draws++;
    }
  }
  if (room.winner && room.redPlayer && room.blackPlayer && !room.redPlayer.isBot && !room.blackPlayer.isBot) {
    const redUser = usersMap.get(room.redPlayer.id);
    const blackUser = usersMap.get(room.blackPlayer.id);
    if (redUser && blackUser) {
      if (room.winner === "red") {
        const { newWinnerRating, newLoserRating } = calculateElo(
          redUser.rating,
          blackUser.rating
        );
        redUser.rating = newWinnerRating;
        blackUser.rating = newLoserRating;
      } else if (room.winner === "black") {
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
function broadcastToRoom(room, type, payload) {
  if (room.redPlayer) {
    sendToUser(room.redPlayer.id, type, payload);
  }
  if (room.blackPlayer) {
    sendToUser(room.blackPlayer.id, type, payload);
  }
}
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
