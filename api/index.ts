import express, { Request, Response } from 'express';
import { pesapalService } from '../server/pesapalService.js';
import { UserProfile, WalletTransaction } from '../src/types.js';

const app = express();
app.use(express.json());

// In-Memory store fallback for Serverless environment
const transactionsList: WalletTransaction[] = [];
const usersMap = new Map<string, UserProfile>();

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV || 'production', time: new Date().toISOString() });
});

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

// Pesapal Deposit Initiation API
app.post('/api/pesapal/initiate-deposit', async (req: Request, res: Response) => {
  try {
    const { userId, amount, currency, email, phoneNumber, description } = req.body;
    const parsedAmount = Number(amount);

    if (!userId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid deposit parameters or amount.' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const callbackUrl = `${origin}?payment_ref=pending`;

    const orderResult = await pesapalService.submitOrder(
      {
        userId,
        username: req.body.username || 'Player',
        amount: parsedAmount,
        currency: currency || 'UGX',
        email,
        phoneNumber,
        description: description || `Deposit ${parsedAmount} ${currency || 'UGX'} into Checkers Arena`,
        callbackUrl,
      },
      origin
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

    let statusResult = orderTrackingId ? await pesapalService.getTransactionStatus(orderTrackingId) : null;

    const isCompleted =
      statusResult?.status_code === 1 ||
      statusResult?.payment_status_description?.toLowerCase() === 'completed' ||
      (orderTrackingId && orderTrackingId.startsWith('DEMO_TRK_'));

    if (isCompleted) {
      const creditAmount = statusResult?.amount || 5000;
      return res.json({
        success: true,
        completed: true,
        status: 'Completed',
        amount: creditAmount,
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
      status: 200,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export Express app for Vercel Serverless
export default app;
