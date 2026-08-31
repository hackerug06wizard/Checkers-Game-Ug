import fs from 'fs';
import path from 'path';

export interface PesapalConfig {
  consumerKey: string;
  consumerSecret: string;
  environment: 'live' | 'sandbox';
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

  public getConfig(): PesapalConfig {
    const rawEnv = (process.env.PESAPAL_ENVIRONMENT || 'live').toLowerCase();
    const environment: 'live' | 'sandbox' = rawEnv === 'sandbox' ? 'sandbox' : 'live';

    return {
      consumerKey: process.env.PESAPAL_CONSUMER_KEY || 'YdD5wiLJ3zCiIijV3Wb2xnV+7Sjugby+',
      consumerSecret: process.env.PESAPAL_CONSUMER_SECRET || 'q/nU5o64KI8OW8pDUIgl4BV9VI4=',
      environment,
      currency: process.env.PESAPAL_CURRENCY || 'UGX',
      ipnId: process.env.PESAPAL_IPN_ID || '',
    };
  }

  public getBaseUrl(): string {
    const config = this.getConfig();
    return config.environment === 'sandbox'
      ? 'https://cybqa.pesapal.com/pesapalv3/api'
      : 'https://pay.pesapal.com/v3/api';
  }

  public getIframeBaseUrl(): string {
    const config = this.getConfig();
    return config.environment === 'sandbox'
      ? 'https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index'
      : 'https://pay.pesapal.com/iframe/PesapalIframe3/Index';
  }

  public isConfigured(): boolean {
    const config = this.getConfig();
    return Boolean(config.consumerKey && config.consumerSecret);
  }

  public setExplicitIpnId(id: string) {
    if (!id) return;
    this.ipnId = id.trim();
    try {
      const dir = path.dirname(IPN_CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(IPN_CACHE_FILE, JSON.stringify({ ipn_id: this.ipnId, updatedAt: Date.now() }), 'utf-8');
      console.log(`[Pesapal] Explicit IPN ID saved: ${this.ipnId}`);
    } catch (e) {
      console.warn('[Pesapal] Could not save IPN ID to cache file:', e);
    }
  }

  public clearCachedIpn() {
    this.ipnId = null;
    try {
      if (fs.existsSync(IPN_CACHE_FILE)) {
        fs.unlinkSync(IPN_CACHE_FILE);
      }
    } catch (e) {
      // ignore
    }
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

      const data = (await response.json()) as { token: string; expiryDate: string; status: string; error?: any };
      if (data && data.token) {
        this.token = data.token;
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
   * Fetch registered IPN list from Pesapal
   */
  public async getRegisteredIpns(): Promise<Array<{ ipn_id: string; url: string; created_date?: string }>> {
    const token = await this.getAuthToken();
    if (!token) return [];

    try {
      const url = `${this.getBaseUrl()}/URLSetup/GetIpnList`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          return data
            .filter((item: any) => item && (item.ipn_id || item.notification_id))
            .map((item: any) => ({
              ipn_id: item.ipn_id || item.notification_id,
              url: item.url || '',
              created_date: item.created_date || item.date_created,
            }));
        }
      }
    } catch (e) {
      console.warn('[Pesapal] Could not fetch IPN list:', e);
    }
    return [];
  }

  /**
   * Auto-register or fetch existing IPN URL
   */
  public async getOrRegisterIpnId(appBaseUrl: string, forceFresh: boolean = false): Promise<string | null> {
    const config = this.getConfig();
    if (config.ipnId && !forceFresh) {
      return config.ipnId;
    }

    if (this.ipnId && !forceFresh) {
      return this.ipnId;
    }

    // Try reading cached IPN ID from disk if not forcing fresh
    if (!forceFresh) {
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
    }

    const token = await this.getAuthToken();
    if (!token) return null;

    // 1. Check existing IPN list first from live Pesapal account
    const existingList = await this.getRegisteredIpns();
    if (existingList.length > 0) {
      // Find one that matches our IPN path or use the newest registered IPN
      const match = existingList.find((item) => item.url && item.url.includes('/api/pesapal/ipn')) || existingList[existingList.length - 1];
      if (match && match.ipn_id) {
        this.ipnId = match.ipn_id;
        this.setExplicitIpnId(this.ipnId);
        console.log(`[Pesapal] Found active IPN ID from account: ${this.ipnId} (${match.url})`);
        return this.ipnId;
      }
    }

    // 2. Register new IPN if none found or fresh requested
    try {
      // Determine the best public URL
      let targetDomain = 'checkersarena-beta.vercel.app';
      if (appBaseUrl && !appBaseUrl.includes('localhost') && !appBaseUrl.includes('127.0.0.1')) {
        targetDomain = appBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      }

      const ipnCallbackUrl = `https://${targetDomain}/api/pesapal/ipn`;
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

      if (response.ok) {
        const data = (await response.json()) as { ipn_id: string; status: string; url?: string };
        if (data && data.ipn_id) {
          this.ipnId = data.ipn_id;
          this.setExplicitIpnId(data.ipn_id);
          console.log(`[Pesapal] IPN registered successfully! IPN ID: ${data.ipn_id}`);
          return this.ipnId;
        }
      } else {
        const errText = await response.text();
        console.warn('[Pesapal] RegisterIPN response:', errText);
      }

      // Retry fetching list
      const listAfter = await this.getRegisteredIpns();
      if (listAfter.length > 0 && listAfter[0].ipn_id) {
        this.ipnId = listAfter[0].ipn_id;
        this.setExplicitIpnId(this.ipnId);
        return this.ipnId;
      }

      return null;
    } catch (err) {
      console.error('[Pesapal] Exception registering IPN:', err);
      return null;
    }
  }

  /**
   * Submit Order Request to Pesapal v3 with auto-retry on invalid IPN
   */
  public async submitOrder(params: PesapalOrderParams, appBaseUrl: string, isRetry: boolean = false): Promise<PesapalOrderResult> {
    const config = this.getConfig();
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Pesapal Authentication failed. Please check your Consumer Key & Secret.');
    }

    const merchantRef = `CHK_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const ipnId = await this.getOrRegisterIpnId(appBaseUrl, isRetry);

    const url = `${this.getBaseUrl()}/Transactions/SubmitOrderRequest`;
    const currency = params.currency || config.currency || 'UGX';

    // Format phone number for MTN MoMo & Airtel Money (UG: 256...)
    let phone = params.phoneNumber?.replace(/\D/g, '') || '';
    if (phone.startsWith('0')) {
      phone = '256' + phone.substring(1);
    } else if (phone.length === 9) {
      phone = '256' + phone;
    }
    if (!phone || phone.length < 9) {
      phone = '256794915844';
    }

    const cleanUsername = (params.username || 'Player').replace(/[^a-zA-Z0-9]/g, '') || 'Player';
    const email = params.email || `${cleanUsername.toLowerCase()}@checkersarena.ug`;

    const payload: any = {
      id: merchantRef,
      currency: currency,
      amount: Number(params.amount),
      description: params.description || `Checkers Arena Deposit (${params.amount} ${currency})`,
      callback_url: params.callbackUrl,
      billing_address: {
        email_address: email,
        phone_number: phone,
        country_code: 'UG',
        first_name: cleanUsername,
        middle_name: '',
        last_name: 'Arena',
        line_1: 'Kampala Road',
        line_2: '',
        city: 'Kampala',
        state: 'Central',
        postal_code: '10101',
        zip_code: '10101',
      },
    };

    if (ipnId) {
      payload.notification_id = ipnId;
    }

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

    const responseText = await response.text();
    console.log(`[Pesapal] Order submission HTTP ${response.status}:`, responseText);

    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Pesapal order failed (${response.status}): ${responseText.substring(0, 150)}`);
    }

    // Check if error is related to invalid IPN ID and auto-retry once with fresh IPN
    const rawError = JSON.stringify(data).toLowerCase();
    if (
      !isRetry &&
      (!response.ok || data.status !== '200') &&
      (rawError.includes('ipn') || rawError.includes('notification_id') || rawError.includes('invalid ipn'))
    ) {
      console.warn('[Pesapal] Detected Invalid IPN ID error. Re-registering IPN with Pesapal and retrying order...');
      this.clearCachedIpn();
      return this.submitOrder(params, appBaseUrl, true);
    }

    if (!response.ok || (data.status && data.status !== '200' && data.status !== 200)) {
      const errMsg =
        (typeof data.error === 'string' ? data.error : data.error?.message) ||
        data.message ||
        `Pesapal API error (HTTP ${response.status})`;
      throw new Error(errMsg);
    }

    const orderTrackingId = data.order_tracking_id || data.orderTrackingId || data.tracking_id;
    const returnedMerchantRef = data.merchant_reference || data.merchantReference || merchantRef;

    let redirectUrl = data.redirect_url || data.redirectUrl || data.url;
    if (!redirectUrl && orderTrackingId) {
      redirectUrl = `${this.getIframeBaseUrl()}?OrderTrackingId=${orderTrackingId}`;
    }

    if (!redirectUrl) {
      throw new Error(
        data?.error?.message ||
        data?.message ||
        'Pesapal did not return a checkout URL. Please verify merchant credentials.'
      );
    }

    return {
      order_tracking_id: orderTrackingId,
      merchant_reference: returnedMerchantRef,
      redirect_url: redirectUrl,
      status: String(data.status || '200'),
    };
  }

  /**
   * Get Transaction Status from Pesapal
   */
  public async getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus | null> {
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
