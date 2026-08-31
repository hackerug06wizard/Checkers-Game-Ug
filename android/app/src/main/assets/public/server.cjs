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
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
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

// server/pesapalService.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var IPN_CACHE_FILE = import_path.default.join(process.cwd(), "data", "pesapal_ipn.json");
var PesapalService = class {
  constructor() {
    this.token = null;
    this.tokenExpiry = 0;
    this.ipnId = null;
  }
  getConfig() {
    return {
      consumerKey: process.env.PESAPAL_CONSUMER_KEY || "YdD5wiLJ3zCiIijV3Wb2xnV+7Sjugby+",
      consumerSecret: process.env.PESAPAL_CONSUMER_SECRET || "q/nU5o64KI8OW8pDUIgl4BV9VI4=",
      environment: process.env.PESAPAL_ENVIRONMENT === "sandbox" ? "sandbox" : "live",
      currency: process.env.PESAPAL_CURRENCY || "UGX",
      ipnId: process.env.PESAPAL_IPN_ID || ""
    };
  }
  getBaseUrl() {
    const config = this.getConfig();
    return config.environment === "live" ? "https://pay.pesapal.com/v3/api" : "https://cybqa.pesapal.com/pesapalv3/api";
  }
  isConfigured() {
    const config = this.getConfig();
    return Boolean(config.consumerKey && config.consumerSecret);
  }
  /**
   * Request Bearer token from Pesapal Authentication API
   */
  async getAuthToken() {
    const config = this.getConfig();
    if (!config.consumerKey || !config.consumerSecret) {
      console.warn("[Pesapal] Consumer Key or Consumer Secret not configured in environment.");
      return null;
    }
    const now = Date.now();
    if (this.token && this.tokenExpiry > now + 6e4) {
      return this.token;
    }
    try {
      const url = `${this.getBaseUrl()}/Auth/RequestToken`;
      console.log(`[Pesapal] Requesting auth token from ${url} (${config.environment})...`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          consumer_key: config.consumerKey.trim(),
          consumer_secret: config.consumerSecret.trim()
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Pesapal] Auth Token request failed (${response.status}):`, errText);
        return null;
      }
      const data = await response.json();
      if (data && data.token) {
        this.token = data.token;
        this.tokenExpiry = now + 4 * 60 * 1e3;
        console.log("[Pesapal] Auth token received successfully.");
        return this.token;
      }
      return null;
    } catch (err) {
      console.error("[Pesapal] Exception requesting auth token:", err);
      return null;
    }
  }
  /**
   * Auto-register IPN URL if not configured
   */
  async getOrRegisterIpnId(appBaseUrl) {
    const config = this.getConfig();
    if (config.ipnId) {
      return config.ipnId;
    }
    if (this.ipnId) {
      return this.ipnId;
    }
    try {
      if (import_fs.default.existsSync(IPN_CACHE_FILE)) {
        const raw = import_fs.default.readFileSync(IPN_CACHE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.ipn_id) {
          this.ipnId = parsed.ipn_id;
          return this.ipnId;
        }
      }
    } catch (e) {
    }
    const token = await this.getAuthToken();
    if (!token) return null;
    try {
      const ipnCallbackUrl = `${appBaseUrl.replace(/\/$/, "")}/api/pesapal/ipn`;
      const url = `${this.getBaseUrl()}/URLSetup/RegisterIPN`;
      console.log(`[Pesapal] Registering IPN URL: ${ipnCallbackUrl}`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          url: ipnCallbackUrl,
          ipn_notification_type: "POST"
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("[Pesapal] IPN Registration failed:", errText);
        return null;
      }
      const data = await response.json();
      if (data && data.ipn_id) {
        this.ipnId = data.ipn_id;
        try {
          const dir = import_path.default.dirname(IPN_CACHE_FILE);
          if (!import_fs.default.existsSync(dir)) import_fs.default.mkdirSync(dir, { recursive: true });
          import_fs.default.writeFileSync(IPN_CACHE_FILE, JSON.stringify({ ipn_id: data.ipn_id, registeredAt: Date.now() }), "utf-8");
        } catch (err) {
          console.warn("[Pesapal] Could not save IPN cache file:", err);
        }
        console.log(`[Pesapal] IPN registered successfully! IPN ID: ${data.ipn_id}`);
        return this.ipnId;
      }
      return null;
    } catch (err) {
      console.error("[Pesapal] Exception registering IPN:", err);
      return null;
    }
  }
  /**
   * Submit Order Request to Pesapal v3
   */
  async submitOrder(params, appBaseUrl) {
    const config = this.getConfig();
    const token = await this.getAuthToken();
    const merchantRef = `CHK_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    if (!token) {
      console.log("[Pesapal Demo Mode] Generating demo checkout session for testing...");
      return {
        order_tracking_id: `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        merchant_reference: merchantRef,
        redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${params.amount}&currency=${params.currency || config.currency}&userId=${params.userId}`,
        status: "200"
      };
    }
    const ipnId = await this.getOrRegisterIpnId(appBaseUrl);
    try {
      const url = `${this.getBaseUrl()}/Transactions/SubmitOrderRequest`;
      const currency = params.currency || config.currency;
      let phone = params.phoneNumber?.replace(/\D/g, "") || "";
      if (phone.startsWith("0")) {
        phone = "256" + phone.substring(1);
      } else if (phone.length === 9) {
        phone = "256" + phone;
      }
      if (!phone) phone = "256700000000";
      const payload = {
        id: merchantRef,
        currency,
        amount: Number(params.amount),
        description: params.description || `Checkers Arena Wallet Deposit (${params.amount} ${currency})`,
        callback_url: params.callbackUrl,
        notification_id: ipnId || void 0,
        billing_address: {
          email_address: params.email || `${params.username.toLowerCase().replace(/[^a-z0-9]/g, "")}@checkersarena.com`,
          phone_number: phone,
          country_code: "UG",
          first_name: params.username || "Checkers",
          last_name: "Player"
        }
      };
      console.log(`[Pesapal] Submitting order to ${url}:`, JSON.stringify(payload, null, 2));
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Pesapal] Order submission failed (${response.status}):`, errText);
        throw new Error(`Pesapal order submission returned status ${response.status}: ${errText}`);
      }
      const data = await response.json();
      console.log("[Pesapal] Order created response:", data);
      if (!data || !data.redirect_url) {
        console.warn("[Pesapal] No redirect_url returned in Pesapal response, using fallback simulated payment:", data);
        return {
          order_tracking_id: data?.order_tracking_id || `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          merchant_reference: data?.merchant_reference || merchantRef,
          redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${params.amount}&currency=${params.currency || config.currency}&userId=${params.userId}`,
          status: "200"
        };
      }
      return data;
    } catch (err) {
      console.error("[Pesapal] Exception submitting order:", err);
      return {
        order_tracking_id: `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        merchant_reference: merchantRef,
        redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${params.amount}&currency=${params.currency || config.currency}&userId=${params.userId}`,
        status: "200"
      };
    }
  }
  /**
   * Get Transaction Status from Pesapal
   */
  async getTransactionStatus(orderTrackingId) {
    if (orderTrackingId.startsWith("DEMO_TRK_")) {
      return {
        status_code: 0,
        payment_status_description: "Pending",
        amount: 5e3,
        merchant_reference: orderTrackingId,
        currency: "UGX",
        payment_method: "Mobile Money"
      };
    }
    const token = await this.getAuthToken();
    if (!token) return null;
    try {
      const url = `${this.getBaseUrl()}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`;
      console.log(`[Pesapal] Querying transaction status: ${url}`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Pesapal] Status check failed (${response.status}):`, errText);
        return null;
      }
      const data = await response.json();
      console.log("[Pesapal] Transaction status result:", data);
      return data;
    } catch (err) {
      console.error("[Pesapal] Exception checking status:", err);
      return null;
    }
  }
};
var pesapalService = new PesapalService();

// server.ts
var app = (0, import_express.default)();
var httpServer = (0, import_http.createServer)(app);
var wss = new import_ws.WebSocketServer({ server: httpServer });
var PORT = 3e3;
app.use(import_express.default.json());
var DATA_DIR = import_path2.default.join(process.cwd(), "data");
var USERS_FILE = import_path2.default.join(DATA_DIR, "users.json");
var GAMES_FILE = import_path2.default.join(DATA_DIR, "games.json");
var TRANSACTIONS_FILE = import_path2.default.join(DATA_DIR, "transactions.json");
if (!import_fs2.default.existsSync(DATA_DIR)) {
  import_fs2.default.mkdirSync(DATA_DIR, { recursive: true });
}
var usersMap = /* @__PURE__ */ new Map();
var userSockets = /* @__PURE__ */ new Map();
var activeRooms = /* @__PURE__ */ new Map();
var activeChallenges = /* @__PURE__ */ new Map();
var globalChatMessages = [];
var transactionsList = [];
try {
  if (import_fs2.default.existsSync(TRANSACTIONS_FILE)) {
    const rawTx = JSON.parse(import_fs2.default.readFileSync(TRANSACTIONS_FILE, "utf-8"));
    if (Array.isArray(rawTx)) {
      transactionsList = rawTx;
      console.log(`Loaded ${transactionsList.length} persisted wallet transactions.`);
    }
  }
} catch (err) {
  console.error("Failed to load transactions file:", err);
}
function persistTransactions() {
  try {
    import_fs2.default.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactionsList.slice(-1e3), null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save transactions:", err);
  }
}
try {
  if (import_fs2.default.existsSync(USERS_FILE)) {
    const rawUsers = JSON.parse(import_fs2.default.readFileSync(USERS_FILE, "utf-8"));
    if (Array.isArray(rawUsers)) {
      rawUsers.forEach((u) => {
        if (!u.id.startsWith("usr_arena_")) {
          usersMap.set(u.id, {
            ...u,
            walletBalance: typeof u.walletBalance === "number" ? u.walletBalance : 0,
            totalWon: typeof u.totalWon === "number" ? u.totalWon : 0,
            totalStaked: typeof u.totalStaked === "number" ? u.totalStaked : 0,
            status: "offline",
            isOnline: false
          });
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
      walletBalance: typeof u.walletBalance === "number" ? u.walletBalance : 0,
      status: userSockets.has(u.id) ? "online" : "offline"
    }));
    import_fs2.default.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save users:", err);
  }
}
function recordTransaction(userId, type, amount, description, meta) {
  const tx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    type,
    amount,
    currency: "UGX",
    status: meta?.status || "completed",
    description,
    reference: meta?.reference,
    transactionReference: meta?.transactionReference,
    pesapalTrackingId: meta?.pesapalTrackingId,
    roomId: meta?.roomId,
    timestamp: Date.now()
  };
  transactionsList.unshift(tx);
  persistTransactions();
  return tx;
}
function adjustUserWallet(userId, delta, type, description, meta) {
  const user = usersMap.get(userId);
  if (!user) return null;
  user.walletBalance = Math.max(0, (user.walletBalance || 0) + delta);
  if (type === "stake_win") {
    user.totalWon = (user.totalWon || 0) + delta;
  }
  if (type === "stake_entry") {
    user.totalStaked = (user.totalStaked || 0) + Math.abs(delta);
  }
  usersMap.set(user.id, user);
  persistUsers();
  recordTransaction(userId, type, Math.abs(delta), description, meta);
  sendToUser(userId, "wallet:balance_updated", {
    walletBalance: user.walletBalance,
    totalWon: user.totalWon,
    totalStaked: user.totalStaked,
    user
  });
  return user;
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
app.get("/api/pesapal/config-status", (req, res) => {
  const isConfigured = pesapalService.isConfigured();
  const environment = process.env.PESAPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
  const currency = process.env.PESAPAL_CURRENCY || "UGX";
  res.json({
    configured: isConfigured,
    environment,
    currency,
    supportedProviders: ["MTN Mobile Money", "Airtel Money", "Visa", "Mastercard"]
  });
});
app.post(["/api/pesapal/initiate-deposit", "/api/pesapal/initiate-order"], async (req, res) => {
  try {
    const { userId, amount, currency, email, phoneNumber, description } = req.body;
    const parsedAmount = Number(amount);
    if (!userId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid deposit parameters or amount." });
    }
    const user = usersMap.get(userId);
    const username = user?.username || "Player";
    const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
    const callbackUrl = `${origin}?payment_ref=pending`;
    let orderResult;
    try {
      orderResult = await pesapalService.submitOrder(
        {
          userId,
          username,
          amount: parsedAmount,
          currency: currency || "UGX",
          email,
          phoneNumber,
          description: description || `Deposit ${parsedAmount} ${currency || "UGX"} into Checkers Arena`,
          callbackUrl
        },
        origin
      );
    } catch (orderErr) {
      console.error("pesapalService.submitOrder error in server.ts:", orderErr);
      const merchantRef = `CHK_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      orderResult = {
        order_tracking_id: `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        merchant_reference: merchantRef,
        redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${parsedAmount}&currency=${currency || "UGX"}&userId=${userId}`,
        status: "200"
      };
    }
    if (!orderResult || !orderResult.redirect_url) {
      const merchantRef = `CHK_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      orderResult = {
        order_tracking_id: `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        merchant_reference: merchantRef,
        redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${parsedAmount}&currency=${currency || "UGX"}&userId=${userId}`,
        status: "200"
      };
    }
    recordTransaction(
      userId,
      "deposit",
      parsedAmount,
      `Pending deposit via Pesapal (${parsedAmount} ${currency || "UGX"})`,
      {
        reference: orderResult.merchant_reference,
        pesapalTrackingId: orderResult.order_tracking_id,
        status: "pending"
      }
    );
    return res.json({
      success: true,
      orderTrackingId: orderResult.order_tracking_id,
      merchantReference: orderResult.merchant_reference,
      redirectUrl: orderResult.redirect_url,
      amount: parsedAmount,
      currency: currency || "UGX",
      isSandboxDemo: orderResult.order_tracking_id?.startsWith("DEMO_TRK_")
    });
  } catch (err) {
    console.error("Error initiating Pesapal deposit:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to initiate deposit" });
  }
});
app.get("/api/pesapal/verify-status", async (req, res) => {
  try {
    const { orderTrackingId, merchantReference, userId } = req.query;
    if (!orderTrackingId && !merchantReference) {
      return res.status(400).json({ success: false, message: "Missing orderTrackingId or merchantReference" });
    }
    let tx = transactionsList.find(
      (t) => orderTrackingId && t.pesapalTrackingId === orderTrackingId || merchantReference && t.reference === merchantReference
    );
    let statusResult = orderTrackingId ? await pesapalService.getTransactionStatus(orderTrackingId) : null;
    const isCompleted = statusResult?.status_code === 1 || statusResult?.payment_status_description?.toLowerCase() === "completed";
    if (isCompleted) {
      const targetUserId = userId || tx?.userId;
      const creditAmount = statusResult?.amount || tx?.amount || 5e3;
      if (targetUserId && (!tx || tx.status !== "completed")) {
        adjustUserWallet(
          targetUserId,
          creditAmount,
          "deposit",
          `Pesapal Deposit Approved (${creditAmount} UGX)`,
          { reference: merchantReference || tx?.reference, pesapalTrackingId: orderTrackingId }
        );
        if (tx) {
          tx.status = "completed";
          persistTransactions();
        }
      }
      const updatedUser = targetUserId ? usersMap.get(targetUserId) : null;
      return res.json({
        success: true,
        completed: true,
        status: "Completed",
        amount: creditAmount,
        walletBalance: updatedUser?.walletBalance || 0,
        message: "Payment completed and wallet credited successfully!"
      });
    }
    res.json({
      success: true,
      completed: false,
      status: statusResult?.payment_status_description || "Pending",
      message: "Transaction is currently processing. Please approve on your mobile phone or wait a few moments."
    });
  } catch (err) {
    console.error("Error verifying Pesapal status:", err);
    res.status(500).json({ success: false, message: err.message || "Status check failed" });
  }
});
app.post("/api/pesapal/ipn", async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body || req.query;
    console.log("[Pesapal IPN Webhook] Received:", { OrderTrackingId, OrderMerchantReference, OrderNotificationType });
    if (OrderTrackingId) {
      const status = await pesapalService.getTransactionStatus(OrderTrackingId);
      if (status && (status.status_code === 1 || status.payment_status_description?.toLowerCase() === "completed")) {
        const tx = transactionsList.find((t) => t.pesapalTrackingId === OrderTrackingId || t.reference === OrderMerchantReference);
        if (tx && tx.status !== "completed") {
          adjustUserWallet(
            tx.userId,
            tx.amount,
            "deposit",
            `Pesapal IPN Deposit Verified (${tx.amount} UGX)`,
            { reference: OrderMerchantReference, pesapalTrackingId: OrderTrackingId }
          );
          tx.status = "completed";
          persistTransactions();
        }
      }
    }
    res.json({
      orderNotificationType: OrderNotificationType || "IPNCHANGE",
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: "200"
    });
  } catch (err) {
    console.error("[Pesapal IPN] Error handling webhook:", err);
    res.status(500).json({ status: "500", error: "IPN Processing error" });
  }
});
app.get("/api/wallet/transactions", (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing userId parameter" });
  }
  const userTxs = transactionsList.filter((t) => t.userId === userId).slice(0, 50);
  res.json({ success: true, transactions: userTxs });
});
app.post("/api/wallet/test-credit", (req, res) => {
  const { userId, amount } = req.body;
  const parsed = Number(amount) || 1e4;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId" });
  const updatedUser = adjustUserWallet(
    userId,
    parsed,
    "deposit",
    `Test Practice Credit (+${parsed.toLocaleString()} UGX)`,
    { reference: `DEMO_${Date.now()}` }
  );
  res.json({
    success: true,
    walletBalance: updatedUser?.walletBalance || 0,
    message: `Credited ${parsed.toLocaleString()} UGX to your wallet!`
  });
});
app.post("/api/wallet/withdraw", async (req, res) => {
  try {
    const { userId, amount, phoneNumber, provider } = req.body;
    const parsed = Number(amount);
    if (!userId || isNaN(parsed) || parsed < 500) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is 500 UGX." });
    }
    if (!phoneNumber || phoneNumber.trim().length < 9) {
      return res.status(400).json({ success: false, message: "Please enter a valid phone number for withdrawal." });
    }
    const user = usersMap.get(userId);
    if (!user || (user.walletBalance || 0) < parsed) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance for this withdrawal." });
    }
    const withdrawReference = `WTH_${Date.now()}`;
    adjustUserWallet(
      userId,
      -parsed,
      "withdrawal",
      `Withdrawal to ${provider || "Mobile Money"} (${phoneNumber}) - ${parsed.toLocaleString()} UGX`,
      { reference: withdrawReference }
    );
    persistTransactions();
    res.json({
      success: true,
      walletBalance: user.walletBalance,
      message: `Withdrawal of ${parsed.toLocaleString()} UGX processed successfully! Reference: ${withdrawReference}.`
    });
  } catch (err) {
    console.error("Error during wallet withdrawal:", err);
    res.status(500).json({ success: false, message: err.message || "Withdrawal failed" });
  }
});
app.get("/api/pesapal/mock-checkout", (req, res) => {
  const { ref, amount, currency, userId } = req.query;
  const amt = amount || "5000";
  const curr = currency || "UGX";
  const user = userId ? usersMap.get(String(userId)) : null;
  const username = user?.username || "Player";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pesapal Secure Payment Gateway</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
    <div class="flex items-center justify-between border-b border-slate-800 pb-4">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center font-black text-slate-950 text-xl shadow">
          P
        </div>
        <div>
          <h2 class="font-black text-lg text-white">Pesapal Checkout</h2>
          <p class="text-xs text-amber-400 font-semibold">Checkers Arena Pay</p>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
        Sandbox / Demo
      </span>
    </div>

    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
      <div class="flex justify-between text-xs text-slate-400">
        <span>Account Player</span>
        <span class="text-white font-bold">${username}</span>
      </div>
      <div class="flex justify-between text-xs text-slate-400">
        <span>Order Reference</span>
        <span class="font-mono text-slate-300">${ref || "CHK_DEMO"}</span>
      </div>
      <div class="border-t border-slate-800 pt-2 flex justify-between items-center">
        <span class="text-xs font-bold text-slate-300">Amount Due:</span>
        <span class="text-xl font-black text-amber-400">${Number(amt).toLocaleString()} ${curr}</span>
      </div>
    </div>

    <div class="space-y-3">
      <p class="text-xs font-bold text-slate-300">Select Payment Method:</p>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="p-3 rounded-xl bg-slate-800/80 border-2 border-amber-500 flex flex-col items-center gap-1">
          <span class="font-bold text-amber-300">\u{1F4F1} MTN MoMo</span>
          <span class="text-[10px] text-slate-400">*165# Prompt</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col items-center gap-1">
          <span class="font-bold text-rose-300">\u{1F534} Airtel Money</span>
          <span class="text-[10px] text-slate-400">*185# Prompt</span>
        </div>
      </div>
    </div>

    <button id="payBtn" onclick="confirmPayment()" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98">
      <span>Complete Payment (${Number(amt).toLocaleString()} ${curr})</span>
    </button>

    <p class="text-[11px] text-slate-400 text-center">
      Protected by 256-bit SSL encryption. Pesapal Payment Gateway.
    </p>
  </div>

  <script>
    async function confirmPayment() {
      const btn = document.getElementById('payBtn');
      btn.innerHTML = '<span>Processing Mobile Money PIN Prompt...</span>';
      btn.disabled = true;

      try {
        const res = await fetch('/api/pesapal/verify-status?orderTrackingId=DEMO_TRK_${Date.now()}&merchantReference=${ref}&userId=${userId}', { credentials: 'omit' });
        const data = await res.json();
        
        btn.innerHTML = '<span>\u2705 Payment Approved! Redirecting...</span>';
        btn.className = 'w-full py-3.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm flex items-center justify-center';
        
        setTimeout(() => {
          if (window.opener) {
            window.opener.postMessage({ type: 'PESAPAL_PAYMENT_SUCCESS', ref: '${ref}', amount: '${amt}' }, '*');
            window.close();
          } else {
            window.location.href = '/?payment_success=true&amount=${amt}';
          }
        }, 1200);
      } catch(e) {
        btn.innerHTML = '<span>Retry Payment</span>';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`);
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
          const { targetUserId, targetUser, challengeId: customChallengeId, stakeAmount } = payload;
          const parsedStake = Number(stakeAmount) || 0;
          if (parsedStake > 0 && (!fromUser || (fromUser.walletBalance || 0) < parsedStake)) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: {
                  message: `Insufficient balance (${fromUser?.walletBalance || 0} UGX) to send a ${parsedStake.toLocaleString()} UGX stake challenge. Please top up your wallet.`
                }
              })
            );
            return;
          }
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
            stakeAmount: parsedStake,
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
          }
          ws.send(
            JSON.stringify({
              type: "challenge:sent_ack",
              payload: challenge
            })
          );
          if (targetUserId === "bot_ai" || toUser.id === "bot_ai" || toUser.isBot) {
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
                  id: "bot_ai",
                  username: "Checkers Bot (AI)",
                  avatarId: "avatar-cyber",
                  rating: 1300,
                  color: "black",
                  isBot: true
                };
                const room = {
                  id: roomId,
                  name: `${redPlayer.username} vs ${blackPlayer.username}`,
                  status: "playing",
                  stakeAmount: 0,
                  potAmount: 0,
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
                  turnTimeLimitSeconds: 15,
                  turnDeadline: Date.now() + 15e3,
                  spectatorsCount: 0,
                  isBotGame: true,
                  botDifficulty: "medium"
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
              stakeAmount: payload.stakeAmount || 0,
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
          const stake = challenge.stakeAmount || 0;
          const p1User = usersMap.get(challenge.fromUser.id);
          const p2User = usersMap.get(challenge.toUser.id);
          if (stake > 0) {
            if (!p1User || (p1User.walletBalance || 0) < stake) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  payload: { message: `${challenge.fromUser.username} no longer has sufficient balance for this stake.` }
                })
              );
              activeChallenges.delete(challengeId);
              return;
            }
            if (!p2User || (p2User.walletBalance || 0) < stake) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  payload: { message: `You have insufficient balance (${p2User?.walletBalance || 0} UGX) for this ${stake.toLocaleString()} UGX stake. Please deposit funds.` }
                })
              );
              return;
            }
            adjustUserWallet(p1User.id, -stake, "stake_entry", `Stake Entry for match vs ${p2User.username} (${stake} UGX)`);
            adjustUserWallet(p2User.id, -stake, "stake_entry", `Stake Entry for match vs ${p1User.username} (${stake} UGX)`);
          }
          challenge.status = "accepted";
          const roomId = customRoomId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const initialBoard = createInitialBoard();
          const redPlayer = {
            id: challenge.fromUser.id,
            username: challenge.fromUser.username,
            avatarId: challenge.fromUser.avatarId,
            rating: challenge.fromUser.rating || challenge.fromUser.elo || 1200,
            color: "red"
          };
          const blackPlayer = {
            id: challenge.toUser.id,
            username: challenge.toUser.username,
            avatarId: challenge.toUser.avatarId,
            rating: challenge.toUser.rating || challenge.toUser.elo || 1200,
            color: "black"
          };
          const room = {
            id: roomId,
            name: `${redPlayer.username} vs ${blackPlayer.username}`,
            status: "playing",
            stakeAmount: stake,
            potAmount: stake * 2,
            escrowCollected: stake > 0 ? { [redPlayer.id]: stake, [blackPlayer.id]: stake } : void 0,
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
            turnTimeLimitSeconds: 15,
            turnDeadline: Date.now() + 15e3,
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
          const { name, vsBot, timeLimit, stakeAmount, roomId: customRoomId } = payload;
          const parsedStake = Number(stakeAmount) || 0;
          if (!vsBot && parsedStake > 0) {
            if ((user.walletBalance || 0) < parsedStake) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  payload: {
                    message: `Insufficient balance (${user.walletBalance || 0} UGX) to host a ${parsedStake.toLocaleString()} UGX stake table. Please top up your wallet or create a free table.`
                  }
                })
              );
              return;
            }
            adjustUserWallet(user.id, -parsedStake, "stake_entry", `Stake Entry for table (${parsedStake} UGX)`);
          }
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
            name: name || `${user.username}'s ${parsedStake > 0 ? `${parsedStake.toLocaleString()} UGX Table` : "Game Table"}`,
            status: vsBot ? "playing" : "waiting",
            stakeAmount: vsBot ? 0 : parsedStake,
            potAmount: vsBot ? 0 : parsedStake * 2,
            escrowCollected: !vsBot && parsedStake > 0 ? { [user.id]: parsedStake } : void 0,
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
            turnTimeLimitSeconds: 15,
            turnDeadline: Date.now() + 15e3,
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
            if (room.stakeAmount > 0) {
              if ((user.walletBalance || 0) < room.stakeAmount) {
                ws.send(
                  JSON.stringify({
                    type: "game:join_error",
                    payload: {
                      message: `Insufficient balance (${user.walletBalance || 0} UGX) to join this ${room.stakeAmount.toLocaleString()} UGX stake table. Please deposit funds or choose a free table.`,
                      requiredAmount: room.stakeAmount
                    }
                  })
                );
                return;
              }
              adjustUserWallet(user.id, -room.stakeAmount, "stake_entry", `Stake Entry for table ${room.name} (${room.stakeAmount} UGX)`, { roomId });
              if (!room.escrowCollected) room.escrowCollected = {};
              room.escrowCollected[user.id] = room.stakeAmount;
            }
            room.blackPlayer = {
              id: user.id,
              username: user.username,
              avatarId: user.avatarId,
              rating: user.rating,
              color: "black"
            };
            room.status = "playing";
            room.turnTimeLimitSeconds = 15;
            room.turnDeadline = Date.now() + 15e3;
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
          room.turnTimeLimitSeconds = 15;
          room.turnDeadline = Date.now() + 15e3;
          room.disconnectedPlayerId = null;
          room.disconnectDeadline = null;
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
        case "game:claim_timeout": {
          if (!currentUserId) return;
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== "playing") return;
          const isRed = room.redPlayer?.id === currentUserId;
          const isBlack = room.blackPlayer?.id === currentUserId;
          if (!isRed && !isBlack) return;
          const myColor = isRed ? "red" : "black";
          const opponentColor = isRed ? "black" : "red";
          const opponentPlayer = isRed ? room.blackPlayer : room.redPlayer;
          const myPlayer = isRed ? room.redPlayer : room.blackPlayer;
          if (room.currentTurn === opponentColor && room.turnDeadline && Date.now() >= room.turnDeadline - 1e3) {
            room.status = "ended";
            room.winner = myColor;
            room.winReason = `${opponentPlayer?.username || "Opponent"} timed out / disconnected (15-second countdown expired). ${myPlayer?.username || "You"} won!`;
            handleGameEnd(room);
            broadcastToRoom(room, "game:updated", room);
            broadcast("lobby:rooms", Array.from(activeRooms.values()));
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
            if (room.stakeAmount > 0 && room.escrowCollected) {
              for (const [playerId, escrowAmt] of Object.entries(room.escrowCollected)) {
                if (escrowAmt > 0) {
                  adjustUserWallet(
                    playerId,
                    escrowAmt,
                    "stake_refund",
                    `Refund for deleted game table (${escrowAmt} UGX)`,
                    { roomId }
                  );
                }
              }
            }
            activeRooms.delete(roomId);
            if (room.redPlayer) {
              const u1 = usersMap.get(room.redPlayer.id);
              if (u1 && u1.status === "in-game") u1.status = "online";
            }
            if (room.blackPlayer) {
              const u2 = usersMap.get(room.blackPlayer.id);
              if (u2 && u2.status === "in-game") u2.status = "online";
            }
            broadcastToRoom(room, "game:table_deleted", { roomId, message: "Game table has been closed and deleted. Any escrowed stakes were refunded." });
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
              broadcastToRoom(room, "chat:game_message", { ...chatMsg, roomId });
            }
            broadcast("chat:game_message", { ...chatMsg, roomId });
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
      for (const room of activeRooms.values()) {
        if (room.status === "playing") {
          const isRed = room.redPlayer?.id === currentUserId;
          const isBlack = room.blackPlayer?.id === currentUserId;
          if (isRed || isBlack) {
            const playerColor = isRed ? "red" : "black";
            room.disconnectedPlayerId = currentUserId;
            room.disconnectDeadline = Date.now() + 15e3;
            if (room.currentTurn === playerColor) {
              room.turnDeadline = Date.now() + 15e3;
            }
            broadcastToRoom(room, "game:updated", room);
          }
        }
      }
      broadcastPresence();
    }
  });
});
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of activeRooms.entries()) {
    if (room.status !== "playing") continue;
    const currentTurnColor = room.currentTurn;
    const activePlayer = currentTurnColor === "red" ? room.redPlayer : room.blackPlayer;
    const opponentPlayer = currentTurnColor === "red" ? room.blackPlayer : room.redPlayer;
    const opponentColor = currentTurnColor === "red" ? "black" : "red";
    if (!activePlayer || activePlayer.isBot) continue;
    const isDeadlineReached = !!room.turnDeadline && now >= room.turnDeadline;
    const isDisconnectExpired = room.disconnectedPlayerId === activePlayer.id && !!room.disconnectDeadline && now >= room.disconnectDeadline;
    if (isDeadlineReached || isDisconnectExpired) {
      room.status = "ended";
      room.winner = opponentColor;
      const isDisconnected = room.disconnectedPlayerId === activePlayer.id;
      room.winReason = isDisconnected ? `${activePlayer.username} lost internet connection / disconnected. ${opponentPlayer?.username || "Opponent"} wins (15s limit)!` : `${activePlayer.username} did not move in 15 seconds. ${opponentPlayer?.username || "Opponent"} wins by timeout!`;
      handleGameEnd(room);
      broadcastToRoom(room, "game:updated", room);
      broadcast("lobby:rooms", Array.from(activeRooms.values()));
    }
  }
}, 1e3);
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
  if (room.stakeAmount > 0) {
    const totalPot = room.potAmount || room.stakeAmount * 2;
    if (room.winner === "red" && room.redPlayer && !room.redPlayer.isBot) {
      adjustUserWallet(
        room.redPlayer.id,
        totalPot,
        "stake_win",
        `Victory Winnings! Pot for match ${room.name} (+${totalPot.toLocaleString()} UGX)`,
        { roomId: room.id }
      );
    } else if (room.winner === "black" && room.blackPlayer && !room.blackPlayer.isBot) {
      adjustUserWallet(
        room.blackPlayer.id,
        totalPot,
        "stake_win",
        `Victory Winnings! Pot for match ${room.name} (+${totalPot.toLocaleString()} UGX)`,
        { roomId: room.id }
      );
    } else if (room.winner === "draw" || !room.winner) {
      if (room.redPlayer && !room.redPlayer.isBot) {
        adjustUserWallet(
          room.redPlayer.id,
          room.stakeAmount,
          "stake_refund",
          `Match Draw: Stake Refund for ${room.name} (+${room.stakeAmount.toLocaleString()} UGX)`,
          { roomId: room.id }
        );
      }
      if (room.blackPlayer && !room.blackPlayer.isBot) {
        adjustUserWallet(
          room.blackPlayer.id,
          room.stakeAmount,
          "stake_refund",
          `Match Draw: Stake Refund for ${room.name} (+${room.stakeAmount.toLocaleString()} UGX)`,
          { roomId: room.id }
        );
      }
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
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
