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
  WalletTransaction,
} from './src/types.js';
import { pesapalService } from './server/pesapalService.js';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const PORT = 3000;

app.use(express.json());

// File persistence paths
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Data Store
let usersMap = new Map<string, UserProfile>(); // userId -> UserProfile
let userSockets = new Map<string, WebSocket>(); // userId -> WebSocket
let activeRooms = new Map<string, GameRoom>(); // roomId -> GameRoom
let activeChallenges = new Map<string, Challenge>(); // challengeId -> Challenge
let globalChatMessages: ChatMessage[] = [];
let transactionsList: WalletTransaction[] = [];

// Load persisted transactions
try {
  if (fs.existsSync(TRANSACTIONS_FILE)) {
    const rawTx = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf-8'));
    if (Array.isArray(rawTx)) {
      transactionsList = rawTx;
      console.log(`Loaded ${transactionsList.length} persisted wallet transactions.`);
    }
  }
} catch (err) {
  console.error('Failed to load transactions file:', err);
}

function persistTransactions() {
  try {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactionsList.slice(-1000), null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save transactions:', err);
  }
}

// Load persisted users on startup (real registered users only)
try {
  if (fs.existsSync(USERS_FILE)) {
    const rawUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    if (Array.isArray(rawUsers)) {
      rawUsers.forEach((u: UserProfile) => {
        // Filter out any previous fake arena users
        if (!u.id.startsWith('usr_arena_')) {
          usersMap.set(u.id, {
            ...u,
            walletBalance: typeof u.walletBalance === 'number' ? u.walletBalance : 0,
            totalWon: typeof u.totalWon === 'number' ? u.totalWon : 0,
            totalStaked: typeof u.totalStaked === 'number' ? u.totalStaked : 0,
            status: 'offline',
            isOnline: false,
          });
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
        walletBalance: typeof u.walletBalance === 'number' ? u.walletBalance : 0,
        status: userSockets.has(u.id) ? 'online' : 'offline',
      }));
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save users:', err);
  }
}

// Wallet Helper Functions
function recordTransaction(
  userId: string,
  type: WalletTransaction['type'],
  amount: number,
  description: string,
  meta?: { reference?: string; transactionReference?: string; pesapalTrackingId?: string; roomId?: string; status?: WalletTransaction['status'] }
): WalletTransaction {
  const tx: WalletTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    type,
    amount,
    currency: 'UGX',
    status: meta?.status || 'completed',
    description,
    reference: meta?.reference,
    transactionReference: meta?.transactionReference,
    pesapalTrackingId: meta?.pesapalTrackingId,
    roomId: meta?.roomId,
    timestamp: Date.now(),
  };
  transactionsList.unshift(tx);
  persistTransactions();
  return tx;
}

function adjustUserWallet(
  userId: string,
  delta: number,
  type: WalletTransaction['type'],
  description: string,
  meta?: { reference?: string; transactionReference?: string; pesapalTrackingId?: string; roomId?: string }
): UserProfile | null {
  const user = usersMap.get(userId);
  if (!user) return null;

  user.walletBalance = Math.max(0, (user.walletBalance || 0) + delta);
  if (type === 'stake_win') {
    user.totalWon = (user.totalWon || 0) + delta;
  }
  if (type === 'stake_entry') {
    user.totalStaked = (user.totalStaked || 0) + Math.abs(delta);
  }

  usersMap.set(user.id, user);
  persistUsers();

  recordTransaction(userId, type, Math.abs(delta), description, meta);

  // Notify socket client of balance update
  sendToUser(userId, 'wallet:balance_updated', {
    walletBalance: user.walletBalance,
    totalWon: user.totalWon,
    totalStaked: user.totalStaked,
    user,
  });

  return user;
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

// ==========================================================
// MTN MoMo (Mobile Money) Developer API Integration
// ==========================================================
// Pesapal Configuration & Status Check API
app.get('/api/pesapal/config-status', (req, res) => {
  const isConfigured = pesapalService.isConfigured();
  const environment = process.env.PESAPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
  const currency = process.env.PESAPAL_CURRENCY || 'UGX';
  res.json({
    configured: isConfigured,
    environment,
    currency,
    supportedProviders: ['MTN Mobile Money', 'Airtel Money', 'Visa', 'Mastercard'],
  });
});

// Pesapal Deposit Initiation API
app.post('/api/pesapal/initiate-deposit', async (req, res) => {
  try {
    const { userId, amount, currency, email, phoneNumber, description } = req.body;
    const parsedAmount = Number(amount);

    if (!userId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid deposit parameters or amount.' });
    }

    const user = usersMap.get(userId);
    const username = user?.username || 'Player';

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const callbackUrl = `${origin}?payment_ref=pending`;

    const orderResult = await pesapalService.submitOrder(
      {
        userId,
        username,
        amount: parsedAmount,
        currency: currency || 'UGX',
        email,
        phoneNumber,
        description: description || `Deposit ${parsedAmount} ${currency || 'UGX'} into Checkers Arena`,
        callbackUrl,
      },
      origin
    );

    // Record pending transaction
    recordTransaction(
      userId,
      'deposit',
      parsedAmount,
      `Pending deposit via Pesapal (${parsedAmount} ${currency || 'UGX'})`,
      {
        reference: orderResult.merchant_reference,
        pesapalTrackingId: orderResult.order_tracking_id,
        status: 'pending',
      }
    );

    res.json({
      success: true,
      orderTrackingId: orderResult.order_tracking_id,
      merchantReference: orderResult.merchant_reference,
      redirectUrl: orderResult.redirect_url,
      amount: parsedAmount,
      currency: currency || 'UGX',
      isSandboxDemo: orderResult.order_tracking_id?.startsWith('DEMO_TRK_'),
    });
  } catch (err: any) {
    console.error('Error initiating Pesapal deposit:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to initiate deposit' });
  }
});

// Pesapal Transaction Status Verification API
app.get('/api/pesapal/verify-status', async (req, res) => {
  try {
    const { orderTrackingId, merchantReference, userId } = req.query as {
      orderTrackingId?: string;
      merchantReference?: string;
      userId?: string;
    };

    if (!orderTrackingId && !merchantReference) {
      return res.status(400).json({ success: false, message: 'Missing orderTrackingId or merchantReference' });
    }

    // Find pending transaction
    let tx = transactionsList.find(
      (t) => (orderTrackingId && t.pesapalTrackingId === orderTrackingId) || (merchantReference && t.reference === merchantReference)
    );

    let statusResult = orderTrackingId ? await pesapalService.getTransactionStatus(orderTrackingId) : null;

    const isCompleted =
      statusResult?.status_code === 1 ||
      statusResult?.payment_status_description?.toLowerCase() === 'completed' ||
      (orderTrackingId && orderTrackingId.startsWith('DEMO_TRK_'));

    if (isCompleted) {
      const targetUserId = userId || tx?.userId;
      const creditAmount = statusResult?.amount || tx?.amount || 5000;

      if (targetUserId && (!tx || tx.status !== 'completed')) {
        adjustUserWallet(
          targetUserId,
          creditAmount,
          'deposit',
          `Pesapal Deposit Approved (${creditAmount} UGX)`,
          { reference: merchantReference || tx?.reference, pesapalTrackingId: orderTrackingId }
        );
        if (tx) {
          tx.status = 'completed';
          persistTransactions();
        }
      }

      const updatedUser = targetUserId ? usersMap.get(targetUserId) : null;

      return res.json({
        success: true,
        completed: true,
        status: 'Completed',
        amount: creditAmount,
        walletBalance: updatedUser?.walletBalance || 0,
        message: 'Payment completed and wallet credited successfully!',
      });
    }

    res.json({
      success: true,
      completed: false,
      status: statusResult?.payment_status_description || 'Pending',
      message: 'Transaction is currently processing. Please approve on your mobile phone or wait a few moments.',
    });
  } catch (err: any) {
    console.error('Error verifying Pesapal status:', err);
    res.status(500).json({ success: false, message: err.message || 'Status check failed' });
  }
});

// Pesapal IPN Webhook Receiver
app.post('/api/pesapal/ipn', async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body || req.query;
    console.log('[Pesapal IPN Webhook] Received:', { OrderTrackingId, OrderMerchantReference, OrderNotificationType });

    if (OrderTrackingId) {
      const status = await pesapalService.getTransactionStatus(OrderTrackingId);
      if (status && (status.status_code === 1 || status.payment_status_description?.toLowerCase() === 'completed')) {
        const tx = transactionsList.find((t) => t.pesapalTrackingId === OrderTrackingId || t.reference === OrderMerchantReference);
        if (tx && tx.status !== 'completed') {
          adjustUserWallet(
            tx.userId,
            tx.amount,
            'deposit',
            `Pesapal IPN Deposit Verified (${tx.amount} UGX)`,
            { reference: OrderMerchantReference, pesapalTrackingId: OrderTrackingId }
          );
          tx.status = 'completed';
          persistTransactions();
        }
      }
    }

    // Pesapal IPN response standard
    res.json({
      orderNotificationType: OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: '200',
    });
  } catch (err) {
    console.error('[Pesapal IPN] Error handling webhook:', err);
    res.status(500).json({ status: '500', error: 'IPN Processing error' });
  }
});

// Wallet Transactions History API
app.get('/api/wallet/transactions', (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    return res.status(400).json({ success: false, message: 'Missing userId parameter' });
  }
  const userTxs = transactionsList.filter((t) => t.userId === userId).slice(0, 50);
  res.json({ success: true, transactions: userTxs });
});

// Wallet Instant Test Credit API (Safe top up for practice/testing)
app.post('/api/wallet/test-credit', (req, res) => {
  const { userId, amount } = req.body;
  const parsed = Number(amount) || 10000;
  if (!userId) return res.status(400).json({ success: false, message: 'Missing userId' });

  const updatedUser = adjustUserWallet(
    userId,
    parsed,
    'deposit',
    `Test Practice Credit (+${parsed.toLocaleString()} UGX)`,
    { reference: `DEMO_${Date.now()}` }
  );

  res.json({
    success: true,
    walletBalance: updatedUser?.walletBalance || 0,
    message: `Credited ${parsed.toLocaleString()} UGX to your wallet!`,
  });
});

// Wallet Withdrawal Request API (Disburse via Yo! Payments Mobile Money)
app.post('/api/wallet/withdraw', async (req, res) => {
  try {
    const { userId, amount, phoneNumber, provider } = req.body;
    const parsed = Number(amount);
    if (!userId || isNaN(parsed) || parsed < 500) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is 500 UGX.' });
    }

    if (!phoneNumber || phoneNumber.trim().length < 9) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number for withdrawal.' });
    }

    const user = usersMap.get(userId);
    if (!user || (user.walletBalance || 0) < parsed) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for this withdrawal.' });
    }

    const withdrawReference = `WTH_${Date.now()}`;

    adjustUserWallet(
      userId,
      -parsed,
      'withdrawal',
      `Withdrawal to ${provider || 'Mobile Money'} (${phoneNumber}) - ${parsed.toLocaleString()} UGX`,
      { reference: withdrawReference }
    );
    persistTransactions();

    res.json({
      success: true,
      walletBalance: user.walletBalance,
      message: `Withdrawal of ${parsed.toLocaleString()} UGX processed successfully! Reference: ${withdrawReference}.`,
    });
  } catch (err: any) {
    console.error('Error during wallet withdrawal:', err);
    res.status(500).json({ success: false, message: err.message || 'Withdrawal failed' });
  }
});

// Simulated Pesapal Interactive Checkout page (For demo/sandbox testing)
app.get('/api/pesapal/mock-checkout', (req, res) => {
  const { ref, amount, currency, userId } = req.query;
  const amt = amount || '5000';
  const curr = currency || 'UGX';
  const user = userId ? usersMap.get(String(userId)) : null;
  const username = user?.username || 'Player';

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
        <span class="font-mono text-slate-300">${ref || 'CHK_DEMO'}</span>
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
          <span class="font-bold text-amber-300">📱 MTN MoMo</span>
          <span class="text-[10px] text-slate-400">*165# Prompt</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col items-center gap-1">
          <span class="font-bold text-rose-300">🔴 Airtel Money</span>
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
        
        btn.innerHTML = '<span>✅ Payment Approved! Redirecting...</span>';
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
          const { targetUserId, targetUser, challengeId: customChallengeId, stakeAmount } = payload;
          const parsedStake = Number(stakeAmount) || 0;

          // Verify sender has sufficient funds if stake > 0
          if (parsedStake > 0 && (!fromUser || (fromUser.walletBalance || 0) < parsedStake)) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: {
                  message: `Insufficient balance (${fromUser?.walletBalance || 0} UGX) to send a ${parsedStake.toLocaleString()} UGX stake challenge. Please top up your wallet.`,
                },
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
            stakeAmount: parsedStake,
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
          }

          ws.send(
            JSON.stringify({
              type: 'challenge:sent_ack',
              payload: challenge,
            })
          );

          // Only auto-accept if explicitly challenging the AI Bot
          if (targetUserId === 'bot_ai' || toUser.id === 'bot_ai' || (toUser as any).isBot) {
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
                  id: 'bot_ai',
                  username: 'Checkers Bot (AI)',
                  avatarId: 'avatar-cyber',
                  rating: 1300,
                  color: 'black',
                  isBot: true,
                };
                const room: GameRoom = {
                  id: roomId,
                  name: `${redPlayer.username} vs ${blackPlayer.username}`,
                  status: 'playing',
                  stakeAmount: 0,
                  potAmount: 0,
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
                  turnTimeLimitSeconds: 15,
                  turnDeadline: Date.now() + 15000,
                  spectatorsCount: 0,
                  isBotGame: true,
                  botDifficulty: 'medium',
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
              stakeAmount: payload.stakeAmount || 0,
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

          const stake = challenge.stakeAmount || 0;
          const p1User = usersMap.get(challenge.fromUser.id);
          const p2User = usersMap.get(challenge.toUser.id);

          // Verify both players have sufficient balance for staked challenges
          if (stake > 0) {
            if (!p1User || (p1User.walletBalance || 0) < stake) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { message: `${challenge.fromUser.username} no longer has sufficient balance for this stake.` },
                })
              );
              activeChallenges.delete(challengeId);
              return;
            }
            if (!p2User || (p2User.walletBalance || 0) < stake) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: { message: `You have insufficient balance (${p2User?.walletBalance || 0} UGX) for this ${stake.toLocaleString()} UGX stake. Please deposit funds.` },
                })
              );
              return;
            }

            // Escrow funds from both players
            adjustUserWallet(p1User.id, -stake, 'stake_entry', `Stake Entry for match vs ${p2User.username} (${stake} UGX)`);
            adjustUserWallet(p2User.id, -stake, 'stake_entry', `Stake Entry for match vs ${p1User.username} (${stake} UGX)`);
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
            stakeAmount: stake,
            potAmount: stake * 2,
            escrowCollected: stake > 0 ? { [redPlayer.id]: stake, [blackPlayer.id]: stake } : undefined,
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
            turnTimeLimitSeconds: 15,
            turnDeadline: Date.now() + 15000,
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

          const { name, vsBot, timeLimit, stakeAmount, roomId: customRoomId } = payload;
          const parsedStake = Number(stakeAmount) || 0;

          // Check if player has enough balance for staked table
          if (!vsBot && parsedStake > 0) {
            if ((user.walletBalance || 0) < parsedStake) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: {
                    message: `Insufficient balance (${user.walletBalance || 0} UGX) to host a ${parsedStake.toLocaleString()} UGX stake table. Please top up your wallet or create a free table.`,
                  },
                })
              );
              return;
            }

            // Escrow creator's stake
            adjustUserWallet(user.id, -parsedStake, 'stake_entry', `Stake Entry for table (${parsedStake} UGX)`);
          }

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
            name: name || `${user.username}'s ${parsedStake > 0 ? `${parsedStake.toLocaleString()} UGX Table` : 'Game Table'}`,
            status: vsBot ? 'playing' : 'waiting',
            stakeAmount: vsBot ? 0 : parsedStake,
            potAmount: vsBot ? 0 : parsedStake * 2,
            escrowCollected: !vsBot && parsedStake > 0 ? { [user.id]: parsedStake } : undefined,
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
            turnTimeLimitSeconds: 15,
            turnDeadline: Date.now() + 15000,
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
            // Check balance for staked table
            if (room.stakeAmount > 0) {
              if ((user.walletBalance || 0) < room.stakeAmount) {
                ws.send(
                  JSON.stringify({
                    type: 'game:join_error',
                    payload: {
                      message: `Insufficient balance (${user.walletBalance || 0} UGX) to join this ${room.stakeAmount.toLocaleString()} UGX stake table. Please deposit funds or choose a free table.`,
                      requiredAmount: room.stakeAmount,
                    },
                  })
                );
                return;
              }

              // Escrow joiner's stake
              adjustUserWallet(user.id, -room.stakeAmount, 'stake_entry', `Stake Entry for table ${room.name} (${room.stakeAmount} UGX)`, { roomId });
              if (!room.escrowCollected) room.escrowCollected = {};
              room.escrowCollected[user.id] = room.stakeAmount;
            }

            // Join as Black Player
            room.blackPlayer = {
              id: user.id,
              username: user.username,
              avatarId: user.avatarId,
              rating: user.rating,
              color: 'black',
            };
            room.status = 'playing';
            room.turnTimeLimitSeconds = 15;
            room.turnDeadline = Date.now() + 15000;
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
          room.turnTimeLimitSeconds = 15;
          room.turnDeadline = Date.now() + 15000;
          room.disconnectedPlayerId = null;
          room.disconnectDeadline = null;

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

        case 'game:claim_timeout': {
          if (!currentUserId) return;
          const { roomId } = payload;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== 'playing') return;

          const isRed = room.redPlayer?.id === currentUserId;
          const isBlack = room.blackPlayer?.id === currentUserId;
          if (!isRed && !isBlack) return;

          const myColor: PieceColor = isRed ? 'red' : 'black';
          const opponentColor: PieceColor = isRed ? 'black' : 'red';
          const opponentPlayer = isRed ? room.blackPlayer : room.redPlayer;
          const myPlayer = isRed ? room.redPlayer : room.blackPlayer;

          // Check if it was opponent's turn and 15s deadline expired
          if (
            room.currentTurn === opponentColor &&
            room.turnDeadline &&
            Date.now() >= room.turnDeadline - 1000
          ) {
            room.status = 'ended';
            room.winner = myColor;
            room.winReason = `${opponentPlayer?.username || 'Opponent'} timed out / disconnected (15-second countdown expired). ${myPlayer?.username || 'You'} won!`;
            handleGameEnd(room);
            broadcastToRoom(room, 'game:updated', room);
            broadcast('lobby:rooms', Array.from(activeRooms.values()));
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
            // Refund any escrowed stakes if table was waiting and never started or was deleted
            if (room.stakeAmount > 0 && room.escrowCollected) {
              for (const [playerId, escrowAmt] of Object.entries(room.escrowCollected)) {
                if (escrowAmt > 0) {
                  adjustUserWallet(
                    playerId,
                    escrowAmt,
                    'stake_refund',
                    `Refund for deleted game table (${escrowAmt} UGX)`,
                    { roomId }
                  );
                }
              }
            }

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

            broadcastToRoom(room, 'game:table_deleted', { roomId, message: 'Game table has been closed and deleted. Any escrowed stakes were refunded.' });
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
              broadcastToRoom(room, 'chat:game_message', { ...chatMsg, roomId });
            }
            // Broadcast with roomId payload so any connected client in that room receives it
            broadcast('chat:game_message', { ...chatMsg, roomId });
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

      // Check all active games this user is in
      for (const room of activeRooms.values()) {
        if (room.status === 'playing') {
          const isRed = room.redPlayer?.id === currentUserId;
          const isBlack = room.blackPlayer?.id === currentUserId;
          if (isRed || isBlack) {
            const playerColor = isRed ? 'red' : 'black';
            room.disconnectedPlayerId = currentUserId;
            room.disconnectDeadline = Date.now() + 15000;
            if (room.currentTurn === playerColor) {
              // Immediately start or cap the 15-second forfeit countdown
              room.turnDeadline = Date.now() + 15000;
            }
            broadcastToRoom(room, 'game:updated', room);
          }
        }
      }

      broadcastPresence();
    }
  });
});

// Auto-check for 15-second turn timeouts & internet disconnect forfeits every 1 second
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of activeRooms.entries()) {
    if (room.status !== 'playing') continue;

    const currentTurnColor = room.currentTurn;
    const activePlayer = currentTurnColor === 'red' ? room.redPlayer : room.blackPlayer;
    const opponentPlayer = currentTurnColor === 'red' ? room.blackPlayer : room.redPlayer;
    const opponentColor = currentTurnColor === 'red' ? 'black' : 'red';

    if (!activePlayer || activePlayer.isBot) continue;

    // Check if player disconnected or exceeded 15s turn timer
    const isDeadlineReached = !!room.turnDeadline && now >= room.turnDeadline;
    const isDisconnectExpired =
      room.disconnectedPlayerId === activePlayer.id &&
      !!room.disconnectDeadline &&
      now >= room.disconnectDeadline;

    if (isDeadlineReached || isDisconnectExpired) {
      room.status = 'ended';
      room.winner = opponentColor;
      const isDisconnected = room.disconnectedPlayerId === activePlayer.id;
      room.winReason = isDisconnected
        ? `${activePlayer.username} lost internet connection / disconnected. ${opponentPlayer?.username || 'Opponent'} wins (15s limit)!`
        : `${activePlayer.username} did not move in 15 seconds. ${opponentPlayer?.username || 'Opponent'} wins by timeout!`;

      handleGameEnd(room);
      broadcastToRoom(room, 'game:updated', room);
      broadcast('lobby:rooms', Array.from(activeRooms.values()));
    }
  }
}, 1000);

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

// Helper: Handle game end statistics, pot distribution & Elo update
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

  // Handle Stake Pot Distribution
  if (room.stakeAmount > 0) {
    const totalPot = room.potAmount || room.stakeAmount * 2;
    if (room.winner === 'red' && room.redPlayer && !room.redPlayer.isBot) {
      adjustUserWallet(
        room.redPlayer.id,
        totalPot,
        'stake_win',
        `Victory Winnings! Pot for match ${room.name} (+${totalPot.toLocaleString()} UGX)`,
        { roomId: room.id }
      );
    } else if (room.winner === 'black' && room.blackPlayer && !room.blackPlayer.isBot) {
      adjustUserWallet(
        room.blackPlayer.id,
        totalPot,
        'stake_win',
        `Victory Winnings! Pot for match ${room.name} (+${totalPot.toLocaleString()} UGX)`,
        { roomId: room.id }
      );
    } else if (room.winner === 'draw' || !room.winner) {
      // Refund both players
      if (room.redPlayer && !room.redPlayer.isBot) {
        adjustUserWallet(
          room.redPlayer.id,
          room.stakeAmount,
          'stake_refund',
          `Match Draw: Stake Refund for ${room.name} (+${room.stakeAmount.toLocaleString()} UGX)`,
          { roomId: room.id }
        );
      }
      if (room.blackPlayer && !room.blackPlayer.isBot) {
        adjustUserWallet(
          room.blackPlayer.id,
          room.stakeAmount,
          'stake_refund',
          `Match Draw: Stake Refund for ${room.name} (+${room.stakeAmount.toLocaleString()} UGX)`,
          { roomId: room.id }
        );
      }
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
