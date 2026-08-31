import express, { Request, Response, NextFunction } from 'express';
import { pesapalService, PesapalOrderResult } from '../server/pesapalService.js';
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
      `Deposit via Pesapal (${parsedAmount} ${currency || 'UGX'})`,
      {
        reference: orderResult.merchant_reference,
        pesapalTrackingId: orderResult.order_tracking_id,
        status: 'pending',
      }
    );

    return res.json({
      success: true,
      orderTrackingId: orderResult.order_tracking_id,
      merchantReference: orderResult.merchant_reference,
      redirectUrl: orderResult.redirect_url,
      amount: parsedAmount,
      currency: currency || 'UGX',
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

    // A payment is only completed if Pesapal confirmed status_code === 1 or status is Completed
    const isCompleted =
      statusResult?.status_code === 1 ||
      statusResult?.payment_status_description?.toLowerCase() === 'completed';

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

// Wallet Reset Balances API (Purge Sandbox & Mock balances)
app.post(['/api/wallet/reset-balance', '/api/wallet/reset'], (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'Missing userId' });

  const user = usersMap.get(userId);
  if (user) {
    user.walletBalance = 0;
    user.totalWon = 0;
    user.totalStaked = 0;
    usersMap.set(userId, user);
  }

  // Clear sandbox transactions for this user
  for (let i = transactionsList.length - 1; i >= 0; i--) {
    if (transactionsList[i].userId === userId) {
      transactionsList.splice(i, 1);
    }
  }

  res.json({
    success: true,
    walletBalance: 0,
    totalWon: 0,
    totalStaked: 0,
    message: 'Sandbox balance successfully cleared and reset to 0 UGX.',
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

// Export Express app for Vercel Serverless
export default app;
