import fs from 'fs';
import path from 'path';

export interface PesapalConfig {
  consumerKey: string;
  consumerSecret: string;
  environment: 'sandbox' | 'live';
  currency: string;
  ipnId?: string;
}

export interface PesapalOrderParams {
  userId: string;
  username: string;
  email?: string;
  phoneNumber?: string;
  amount: number;
  currency?: string;
  description?: string;
  callbackUrl: string;
}

export interface PesapalOrderResult {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
  status: string;
  error?: any;
}

export interface PesapalTransactionStatus {
  payment_method?: string;
  amount: number;
  created_date?: string;
  confirmation_code?: string;
  payment_status_description: 'Completed' | 'Failed' | 'Reversed' | 'Pending' | 'Invalid' | string;
  description?: string;
  message?: string;
  payment_account?: string;
  call_back_url?: string;
  status_code: number; // 1 = Completed, 2 = Failed, 0 = Invalid/Pending
  merchant_reference: string;
  currency: string;
  status?: string;
}

const IPN_CACHE_FILE = path.join(process.cwd(), 'data', 'pesapal_ipn.json');

class PesapalService {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private ipnId: string | null = null;

  private getConfig(): PesapalConfig {
    return {
      consumerKey: process.env.PESAPAL_CONSUMER_KEY || 'YdD5wiLJ3zCiIijV3Wb2xnV+7Sjugby+',
      consumerSecret: process.env.PESAPAL_CONSUMER_SECRET || 'q/nU5o64KI8OW8pDUIgl4BV9VI4=',
      environment: (process.env.PESAPAL_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'live') as 'sandbox' | 'live',
      currency: process.env.PESAPAL_CURRENCY || 'UGX',
      ipnId: process.env.PESAPAL_IPN_ID || '',
    };
  }

  private getBaseUrl(): string {
    const config = this.getConfig();
    return config.environment === 'live'
      ? 'https://pay.pesapal.com/v3/api'
      : 'https://cybqa.pesapal.com/pesapalv3/api';
  }

  public isConfigured(): boolean {
    const config = this.getConfig();
    return Boolean(config.consumerKey && config.consumerSecret);
  }

  /**
   * Request Bearer token from Pesapal Authentication API
   */
  public async getAuthToken(): Promise<string | null> {
    const config = this.getConfig();
    if (!config.consumerKey || !config.consumerSecret) {
      console.warn('[Pesapal] Consumer Key or Consumer Secret not configured in environment.');
      return null;
    }

    const now = Date.now();
    if (this.token && this.tokenExpiry > now + 60000) {
      return this.token;
    }

    try {
      const url = `${this.getBaseUrl()}/Auth/RequestToken`;
      console.log(`[Pesapal] Requesting auth token from ${url} (${config.environment})...`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          consumer_key: config.consumerKey.trim(),
          consumer_secret: config.consumerSecret.trim(),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Pesapal] Auth Token request failed (${response.status}):`, errText);
        return null;
      }

      const data = (await response.json()) as { token: string; expiryDate: string; status: string };
      if (data && data.token) {
        this.token = data.token;
        // Expiry is typically 5 minutes (300 seconds)
        this.tokenExpiry = now + 4 * 60 * 1000;
        console.log('[Pesapal] Auth token received successfully.');
        return this.token;
      }
      return null;
    } catch (err) {
      console.error('[Pesapal] Exception requesting auth token:', err);
      return null;
    }
  }

  /**
   * Auto-register IPN URL if not configured
   */
  public async getOrRegisterIpnId(appBaseUrl: string): Promise<string | null> {
    const config = this.getConfig();
    if (config.ipnId) {
      return config.ipnId;
    }

    if (this.ipnId) {
      return this.ipnId;
    }

    // Try reading cached IPN ID from disk
    try {
      if (fs.existsSync(IPN_CACHE_FILE)) {
        const raw = fs.readFileSync(IPN_CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.ipn_id) {
          this.ipnId = parsed.ipn_id;
          return this.ipnId;
        }
      }
    } catch (e) {
      // ignore
    }

    const token = await this.getAuthToken();
    if (!token) return null;

    try {
      const ipnCallbackUrl = `${appBaseUrl.replace(/\/$/, '')}/api/pesapal/ipn`;
      const url = `${this.getBaseUrl()}/URLSetup/RegisterIPN`;
      console.log(`[Pesapal] Registering IPN URL: ${ipnCallbackUrl}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: ipnCallbackUrl,
          ipn_notification_type: 'POST',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Pesapal] IPN Registration failed:', errText);
        return null;
      }

      const data = (await response.json()) as { ipn_id: string; status: string };
      if (data && data.ipn_id) {
        this.ipnId = data.ipn_id;
        try {
          const dir = path.dirname(IPN_CACHE_FILE);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(IPN_CACHE_FILE, JSON.stringify({ ipn_id: data.ipn_id, registeredAt: Date.now() }), 'utf-8');
        } catch (err) {
          console.warn('[Pesapal] Could not save IPN cache file:', err);
        }
        console.log(`[Pesapal] IPN registered successfully! IPN ID: ${data.ipn_id}`);
        return this.ipnId;
      }
      return null;
    } catch (err) {
      console.error('[Pesapal] Exception registering IPN:', err);
      return null;
    }
  }

  /**
   * Submit Order Request to Pesapal v3
   */
  public async submitOrder(params: PesapalOrderParams, appBaseUrl: string): Promise<PesapalOrderResult> {
    const config = this.getConfig();
    const token = await this.getAuthToken();

    const merchantRef = `CHK_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // If Pesapal credentials are not configured or token fails, generate safe sandbox demo simulation
    if (!token) {
      console.log('[Pesapal Demo Mode] Generating demo checkout session for testing...');
      return {
        order_tracking_id: `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        merchant_reference: merchantRef,
        redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${params.amount}&currency=${params.currency || config.currency}&userId=${params.userId}`,
        status: '200',
      };
    }

    const ipnId = await this.getOrRegisterIpnId(appBaseUrl);

    try {
      const url = `${this.getBaseUrl()}/Transactions/SubmitOrderRequest`;
      const currency = params.currency || config.currency;

      // Clean phone number format for Mobile Money in East Africa (UG: 256, KE: 254)
      let phone = params.phoneNumber?.replace(/\D/g, '') || '';
      if (phone.startsWith('0')) {
        phone = '256' + phone.substring(1);
      } else if (phone.length === 9) {
        phone = '256' + phone;
      }
      if (!phone) phone = '256700000000';

      const payload = {
        id: merchantRef,
        currency: currency,
        amount: Number(params.amount),
        description: params.description || `Checkers Arena Wallet Deposit (${params.amount} ${currency})`,
        callback_url: params.callbackUrl,
        notification_id: ipnId || undefined,
        billing_address: {
          email_address: params.email || `${params.username.toLowerCase().replace(/[^a-z0-9]/g, '')}@checkersarena.com`,
          phone_number: phone,
          country_code: 'UG',
          first_name: params.username || 'Checkers',
          last_name: 'Player',
        },
      };

      console.log(`[Pesapal] Submitting order to ${url}:`, JSON.stringify(payload, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Pesapal] Order submission failed (${response.status}):`, errText);
        throw new Error(`Pesapal order submission returned status ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as PesapalOrderResult;
      console.log('[Pesapal] Order created response:', data);

      if (!data || !data.redirect_url) {
        console.warn('[Pesapal] No redirect_url returned in Pesapal response, using fallback simulated payment:', data);
        return {
          order_tracking_id: data?.order_tracking_id || `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          merchant_reference: data?.merchant_reference || merchantRef,
          redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${params.amount}&currency=${params.currency || config.currency}&userId=${params.userId}`,
          status: '200',
        };
      }

      return data;
    } catch (err: any) {
      console.error('[Pesapal] Exception submitting order:', err);
      // Fallback to simulated checkout if external gateway is blocked, unreachable, or credentials pending approval
      return {
        order_tracking_id: `DEMO_TRK_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        merchant_reference: merchantRef,
        redirect_url: `/api/pesapal/mock-checkout?ref=${merchantRef}&amount=${params.amount}&currency=${params.currency || config.currency}&userId=${params.userId}`,
        status: '200',
      };
    }
  }

  /**
   * Get Transaction Status from Pesapal
   */
  public async getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus | null> {
    if (orderTrackingId.startsWith('DEMO_TRK_')) {
      return {
        status_code: 0,
        payment_status_description: 'Pending',
        amount: 5000,
        merchant_reference: orderTrackingId,
        currency: 'UGX',
        payment_method: 'Mobile Money',
      };
    }

    const token = await this.getAuthToken();
    if (!token) return null;

    try {
      const url = `${this.getBaseUrl()}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`;
      console.log(`[Pesapal] Querying transaction status: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Pesapal] Status check failed (${response.status}):`, errText);
        return null;
      }

      const data = (await response.json()) as PesapalTransactionStatus;
      console.log('[Pesapal] Transaction status result:', data);
      return data;
    } catch (err) {
      console.error('[Pesapal] Exception checking status:', err);
      return null;
    }
  }
}

export const pesapalService = new PesapalService();
