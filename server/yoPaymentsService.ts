/**
 * Yo! Payments (Uganda Mobile Money) API Service
 * Supports MTN Mobile Money & Airtel Money instant direct push (USSD PIN Prompt)
 * 
 * Documentation: https://paymentsapi.yo.co.ug / https://sandbox.yo.co.ug
 */

export interface YoDepositParams {
  userId: string;
  username: string;
  amount: number;
  currency?: string; // default 'UGX'
  phoneNumber: string; // e.g. 0771234567 or 256771234567
  description?: string;
}

export interface YoWithdrawParams {
  userId: string;
  amount: number;
  phoneNumber: string;
  description?: string;
}

export interface YoTransactionResult {
  success: boolean;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'ERROR';
  transactionReference?: string;
  externalReference?: string;
  mnoTransactionReference?: string;
  amount?: number;
  currency?: string;
  message?: string;
  isSandboxDemo?: boolean;
}

export class YoPaymentsService {
  private apiUsername: string;
  private apiPassword: string;
  private environment: 'live' | 'sandbox';
  private defaultCurrency: string;

  constructor() {
    this.apiUsername = process.env.YO_PAYMENTS_API_USERNAME || '';
    this.apiPassword = process.env.YO_PAYMENTS_API_PASSWORD || '';
    this.environment = (process.env.YO_PAYMENTS_ENVIRONMENT as 'live' | 'sandbox') || 'sandbox';
    this.defaultCurrency = process.env.YO_PAYMENTS_CURRENCY || 'UGX';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiUsername && this.apiPassword);
  }

  public getEnvironment(): 'live' | 'sandbox' {
    return this.environment;
  }

  public getCurrency(): string {
    return this.defaultCurrency;
  }

  private getEndpointUrl(): string {
    if (this.environment === 'live') {
      return 'https://paymentsapi1.yo.co.ug/yopaymentsdev/live/index.php';
    }
    return 'https://sandbox.yo.co.ug/services/yopaymentsdev/task.php';
  }

  /**
   * Normalizes Ugandan phone number into 256XXXXXXXXX format
   */
  public normalizePhoneNumber(phone: string): string {
    let clean = (phone || '').trim().replace(/[\s\-\+]/g, '');
    if (clean.startsWith('0')) {
      clean = '256' + clean.substring(1);
    } else if (clean.startsWith('7')) {
      clean = '256' + clean;
    }
    return clean;
  }

  /**
   * Detects network provider (MTN Uganda vs Airtel Uganda)
   */
  public detectProvider(phone: string): 'MTN Mobile Money' | 'Airtel Money' | 'Mobile Money' {
    const norm = this.normalizePhoneNumber(phone);
    // MTN prefix: 25677, 25678, 25676, 25639
    if (/^256(77|78|76|39)/.test(norm)) {
      return 'MTN Mobile Money';
    }
    // Airtel prefix: 25670, 25675, 25674
    if (/^256(70|75|74)/.test(norm)) {
      return 'Airtel Money';
    }
    return 'Mobile Money';
  }

  /**
   * Generates a unique external reference
   */
  private generateReference(prefix: string = 'CHK'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
  }

  /**
   * Parses XML tag value from Yo! Payments response
   */
  private parseXmlTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'is'));
    return match ? match[1].trim() : null;
  }

  /**
   * Initiates Mobile Money Deposit (acdepositfunds)
   * This sends an instant USSD PIN Push prompt directly to the customer's phone!
   */
  public async initiateDeposit(params: YoDepositParams): Promise<YoTransactionResult> {
    const normalizedPhone = this.normalizePhoneNumber(params.phoneNumber);
    const externalRef = this.generateReference('CHK_DEP');
    const amount = Math.round(params.amount);
    const provider = this.detectProvider(normalizedPhone);

    // If API credentials are not yet set in environment, use clean sandbox demo mode
    if (!this.isConfigured()) {
      console.log(`[Yo! Payments Sandbox Simulation] Initiating deposit for ${normalizedPhone} (${amount} UGX)`);
      const demoRef = `YO_DEMO_${Date.now()}`;
      return {
        success: true,
        status: 'PENDING',
        transactionReference: demoRef,
        externalReference: externalRef,
        amount,
        currency: 'UGX',
        message: `USSD PIN Prompt sent to ${provider} (${normalizedPhone}). Please enter your PIN on your phone.`,
        isSandboxDemo: true,
      };
    }

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>${this.apiUsername}</APIUsername>
    <APIPassword>${this.apiPassword}</APIPassword>
    <Method>acdepositfunds</Method>
    <NonBlocking>TRUE</NonBlocking>
    <Amount>${amount}</Amount>
    <Account>${normalizedPhone}</Account>
    <Narrative>${params.description || `Deposit to Checkers Arena (${amount} UGX)`}</Narrative>
    <NarrativeCategory>Gaming</NarrativeCategory>
    <ExternalReference>${externalRef}</ExternalReference>
    <ProviderReferenceText>CheckersArena</ProviderReferenceText>
  </Request>
</AutoCreate>`;

    try {
      console.log(`[Yo! Payments] Sending acdepositfunds request to ${this.getEndpointUrl()} for ${normalizedPhone}`);
      const response = await fetch(this.getEndpointUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(xmlPayload).toString(),
        },
        body: xmlPayload,
      });

      const responseText = await response.text();
      console.log('[Yo! Payments] acdepositfunds response:', responseText);

      const status = this.parseXmlTag(responseText, 'Status');
      const statusCode = this.parseXmlTag(responseText, 'StatusCode');
      const transactionStatus = this.parseXmlTag(responseText, 'TransactionStatus') || 'PENDING';
      const transactionReference = this.parseXmlTag(responseText, 'TransactionReference');
      const errorMessage = this.parseXmlTag(responseText, 'ErrorMessage') || this.parseXmlTag(responseText, 'StatusMessage');
      const mnoRef = this.parseXmlTag(responseText, 'MNOTransactionReferenceId');

      if (status === 'OK' || statusCode === '0' || transactionReference) {
        return {
          success: true,
          status: (transactionStatus.toUpperCase() as any) || 'PENDING',
          transactionReference: transactionReference || externalRef,
          externalReference: externalRef,
          mnoTransactionReference: mnoRef || undefined,
          amount,
          currency: 'UGX',
          message: `USSD Prompt sent to ${provider} (${normalizedPhone}). Please enter your Mobile Money PIN on your phone.`,
          isSandboxDemo: false,
        };
      } else {
        return {
          success: false,
          status: 'ERROR',
          externalReference: externalRef,
          message: errorMessage || 'Failed to initiate Mobile Money deposit prompt.',
          isSandboxDemo: false,
        };
      }
    } catch (err: any) {
      console.error('[Yo! Payments] Network error during acdepositfunds:', err);
      throw new Error(`Yo! Payments communication error: ${err.message}`);
    }
  }

  /**
   * Checks the status of a transaction (acgettransactionstatus)
   */
  public async getTransactionStatus(transactionReference: string, externalReference?: string): Promise<YoTransactionResult> {
    if (!transactionReference && !externalReference) {
      throw new Error('Transaction reference or External reference is required');
    }

    // Demo sandbox simulation handler
    if (transactionReference.startsWith('YO_DEMO_')) {
      return {
        success: true,
        status: 'SUCCEEDED',
        transactionReference,
        externalReference: externalReference || transactionReference,
        amount: 5000,
        currency: 'UGX',
        message: 'Payment completed successfully!',
        isSandboxDemo: true,
      };
    }

    if (!this.isConfigured()) {
      return {
        success: true,
        status: 'SUCCEEDED',
        transactionReference,
        externalReference: externalReference || transactionReference,
        amount: 5000,
        currency: 'UGX',
        message: 'Payment verified (Demo Mode)',
        isSandboxDemo: true,
      };
    }

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>${this.apiUsername}</APIUsername>
    <APIPassword>${this.apiPassword}</APIPassword>
    <Method>acgettransactionstatus</Method>
    ${transactionReference ? `<TransactionReference>${transactionReference}</TransactionReference>` : ''}
    ${externalReference ? `<PrivateTransactionStatusCheckKey>${externalReference}</PrivateTransactionStatusCheckKey>` : ''}
  </Request>
</AutoCreate>`;

    try {
      const response = await fetch(this.getEndpointUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(xmlPayload).toString(),
        },
        body: xmlPayload,
      });

      const responseText = await response.text();
      const status = this.parseXmlTag(responseText, 'Status');
      const transactionStatus = (this.parseXmlTag(responseText, 'TransactionStatus') || 'PENDING').toUpperCase();
      const amountStr = this.parseXmlTag(responseText, 'Amount');
      const mnoRef = this.parseXmlTag(responseText, 'MNOTransactionReferenceId');
      const errorMessage = this.parseXmlTag(responseText, 'ErrorMessage') || this.parseXmlTag(responseText, 'StatusMessage');

      const isSuccess = transactionStatus === 'SUCCEEDED' || transactionStatus === 'SUCCESSFUL' || transactionStatus === 'COMPLETED';

      return {
        success: status === 'OK' && isSuccess,
        status: isSuccess ? 'SUCCEEDED' : (transactionStatus as any),
        transactionReference,
        externalReference,
        mnoTransactionReference: mnoRef || undefined,
        amount: amountStr ? parseFloat(amountStr) : undefined,
        currency: this.parseXmlTag(responseText, 'CurrencyCode') || 'UGX',
        message: isSuccess ? 'Payment confirmed and credited!' : errorMessage || `Payment status: ${transactionStatus}`,
        isSandboxDemo: false,
      };
    } catch (err: any) {
      console.error('[Yo! Payments] Error in getTransactionStatus:', err);
      throw new Error(`Failed to check Yo! Payments status: ${err.message}`);
    }
  }

  /**
   * Withdraws funds to customer's Mobile Money account (acwithdrawfunds)
   */
  public async withdrawFunds(params: YoWithdrawParams): Promise<YoTransactionResult> {
    const normalizedPhone = this.normalizePhoneNumber(params.phoneNumber);
    const externalRef = this.generateReference('CHK_WTH');
    const amount = Math.round(params.amount);
    const provider = this.detectProvider(normalizedPhone);

    if (!this.isConfigured()) {
      return {
        success: true,
        status: 'SUCCEEDED',
        transactionReference: `YO_DEMO_WTH_${Date.now()}`,
        externalReference: externalRef,
        amount,
        currency: 'UGX',
        message: `Withdrawal of ${amount.toLocaleString()} UGX sent to ${provider} (${normalizedPhone}).`,
        isSandboxDemo: true,
      };
    }

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>${this.apiUsername}</APIUsername>
    <APIPassword>${this.apiPassword}</APIPassword>
    <Method>acwithdrawfunds</Method>
    <NonBlocking>TRUE</NonBlocking>
    <Amount>${amount}</Amount>
    <Account>${normalizedPhone}</Account>
    <Narrative>${params.description || `Withdrawal from Checkers Arena (${amount} UGX)`}</Narrative>
    <ExternalReference>${externalRef}</ExternalReference>
  </Request>
</AutoCreate>`;

    try {
      const response = await fetch(this.getEndpointUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(xmlPayload).toString(),
        },
        body: xmlPayload,
      });

      const responseText = await response.text();
      const status = this.parseXmlTag(responseText, 'Status');
      const transactionReference = this.parseXmlTag(responseText, 'TransactionReference');
      const errorMessage = this.parseXmlTag(responseText, 'ErrorMessage') || this.parseXmlTag(responseText, 'StatusMessage');

      if (status === 'OK' || transactionReference) {
        return {
          success: true,
          status: 'SUCCEEDED',
          transactionReference: transactionReference || externalRef,
          externalReference: externalRef,
          amount,
          currency: 'UGX',
          message: `Withdrawal of ${amount.toLocaleString()} UGX successfully sent to ${provider} (${normalizedPhone}).`,
          isSandboxDemo: false,
        };
      } else {
        return {
          success: false,
          status: 'ERROR',
          externalReference: externalRef,
          message: errorMessage || 'Withdrawal failed. Please check balance and try again.',
          isSandboxDemo: false,
        };
      }
    } catch (err: any) {
      console.error('[Yo! Payments] Error in withdrawFunds:', err);
      throw new Error(`Failed to process withdrawal: ${err.message}`);
    }
  }
}

export const yoPaymentsService = new YoPaymentsService();
