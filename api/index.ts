import express, { Request, Response, NextFunction } from 'express';
import { pesapalService } from '../server/pesapalService.js';
import { UserProfile, WalletTransaction } from '../src/types.js';

const app = express();
app.use(express.json());

// CORS & Preflight middleware for Vercel Serverless
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// In-Memory store fallback for Serverless environment
const transactionsList: WalletTransaction[] = [];
const usersMap = new Map<string, UserProfile>();

function recordTransaction(
  userId: string,
  type: 'deposit' | 'withdrawal' | 'stake_entry' | 'stake_win' | 'stake_refund',
  amount: number,
  description: string,
  meta?: any
): WalletTransaction {
  const tx: WalletTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    type,
    amount,
    currency: process.env.PESAPAL_CURRENCY || 'UGX',
    status: meta?.status || 'completed',
    description,
    reference: meta?.reference,
    pesapalTrackingId: meta?.pesapalTrackingId,
    timestamp: Date.now(),
  };
  transactionsList.unshift(tx);
  return tx;
}

function adjustUserWallet(
  userId: string,
  delta: number,
  type: 'deposit' | 'withdrawal' | 'stake_entry' | 'stake_win' | 'stake_refund',
  description: string,
  meta?: any
): UserProfile {
  let user = usersMap.get(userId);
  if (!user) {
    user = {
      id: userId,
      username: meta?.username || 'Player',
      avatarId: '1',
      rating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      walletBalance: 0,
      totalWon: 0,
      totalStaked: 0,
      status: 'online',
      createdAt: Date.now(),
    };
  }

  user.walletBalance = Math.max(0, (user.walletBalance || 0) + delta);
  if (type === 'stake_win') {
    user.totalWon = (user.totalWon || 0) + delta;
  }
  if (type === 'stake_entry') {
    user.totalStaked = (user.totalStaked || 0) + Math.abs(delta);
  }

  usersMap.set(user.id, user);
  recordTransaction(userId, type, Math.abs(delta), description, meta);
  return user;
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV || 'production', time: new Date().toISOString() });
});

// ==========================================================
// Pesapal Configuration & Status Check API
app.get('/api/pesapal/config-status', (req: Request, res: Response) => {
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

// Pesapal Deposit Initiation API (Accepts both /api/pesapal/initiate-deposit and /api/pesapal/initiate-order)
app.post(['/api/pesapal/initiate-deposit', '/api/pesapal/initiate-order'], async (req: Request, res: Response) => {
  try {
    const { userId, amount, currency, email, phoneNumber, description, username } = req.body;
    const parsedAmount = Number(amount);

    if (!userId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid deposit parameters or amount.' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const callbackUrl = `${origin}?payment_ref=pending`;

    const orderResult = await pesapalService.submitOrder(
      {
        userId,
        username: username || 'Player',
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

// Pesapal Status Verification API
app.get('/api/pesapal/verify-status', async (req: Request, res: Response) => {
  try {
    const { orderTrackingId, merchantReference, userId } = req.query as {
      orderTrackingId?: string;
      merchantReference?: string;
      userId?: string;
    };

    if (!orderTrackingId && !merchantReference) {
      return res.status(400).json({ success: false, message: 'Missing orderTrackingId or merchantReference' });
    }

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
app.post('/api/pesapal/ipn', async (req: Request, res: Response) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body || req.query;
    res.json({
      orderNotificationType: OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: '200',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Wallet Transactions History API
app.get('/api/wallet/transactions', (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    return res.status(400).json({ success: false, message: 'Missing userId parameter' });
  }
  const userTxs = transactionsList.filter((t) => t.userId === userId).slice(0, 50);
  res.json({ success: true, transactions: userTxs });
});

// Wallet Instant Test Credit API (Safe top up for practice/testing)
app.post('/api/wallet/test-credit', (req: Request, res: Response) => {
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

// Wallet Withdrawal Request API
app.post('/api/wallet/withdraw', (req: Request, res: Response) => {
  const { userId, amount, phoneNumber, provider } = req.body;
  const parsed = Number(amount);
  if (!userId || isNaN(parsed) || parsed < 500) {
    return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is 500 UGX.' });
  }

  const user = usersMap.get(userId);
  if (!user || (user.walletBalance || 0) < parsed) {
    return res.status(400).json({ success: false, message: 'Insufficient wallet balance for this withdrawal.' });
  }

  adjustUserWallet(
    userId,
    -parsed,
    'withdrawal',
    `Withdrawal to ${provider || 'Mobile Money'} (${phoneNumber || 'Phone'}) - ${parsed.toLocaleString()} UGX`,
    { reference: `WTH_${Date.now()}` }
  );

  res.json({
    success: true,
    walletBalance: user.walletBalance,
    message: `Withdrawal request for ${parsed.toLocaleString()} UGX submitted. Funds will be sent to ${phoneNumber}.`,
  });
});

// Simulated Pesapal Interactive Checkout page (For demo/sandbox testing)
app.get('/api/pesapal/mock-checkout', (req: Request, res: Response) => {
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
        Demo Sandbox
      </span>
    </div>

    <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-2">
      <div class="flex justify-between text-xs text-slate-400">
        <span>Account:</span>
        <span class="text-white font-bold">${username}</span>
      </div>
      <div class="flex justify-between text-xs text-slate-400">
        <span>Reference:</span>
        <span class="font-mono text-slate-300">${ref || 'CHK_DEMO_ORDER'}</span>
      </div>
      <div class="flex justify-between text-sm pt-2 border-t border-slate-800">
        <span class="font-bold text-slate-200">Amount Due:</span>
        <span class="font-black text-amber-400 text-base">${Number(amt).toLocaleString()} ${curr}</span>
      </div>
    </div>

    <div class="space-y-3 pt-2">
      <button onclick="approvePayment()" class="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm shadow-lg transition active:scale-95 cursor-pointer">
        Simulate Instant Payment (Approve)
      </button>
      <button onclick="window.close()" class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs transition cursor-pointer">
        Cancel & Return
      </button>
    </div>
  </div>

  <script>
    function approvePayment() {
      document.body.innerHTML = '<div class="text-center space-y-3 p-8"><div class="text-emerald-400 text-4xl">✓</div><h2 class="text-xl font-black text-white">Payment Approved!</h2><p class="text-xs text-slate-400">Closing window and crediting your wallet...</p></div>';
      setTimeout(() => {
        window.close();
      }, 1500);
    }
  </script>
</body>
</html>`);
});

// Export Express app for Vercel Serverless
export default app;
