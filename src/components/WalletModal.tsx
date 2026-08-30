import React, { useState, useEffect } from 'react';
import { UserProfile, STAKE_TIERS, WalletTransaction } from '../types';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  CreditCard,
  Phone,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Coins,
  ShieldCheck,
} from 'lucide-react';

interface WalletModalProps {
  currentUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onBalanceUpdated: (newBalance: number) => void;
  initialTab?: 'deposit' | 'withdraw' | 'history';
}

export const WalletModal: React.FC<WalletModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onBalanceUpdated,
  initialTab = 'deposit',
}) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>(initialTab);
  const [depositAmount, setDepositAmount] = useState<number>(5000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [provider, setProvider] = useState<'mtn' | 'airtel' | 'card'>('mtn');
  const [email, setEmail] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(false);

  // In-app embedded Pesapal Checkout frame state
  const [inAppCheckoutUrl, setInAppCheckoutUrl] = useState<string | null>(null);
  const [activeOrderTrackingId, setActiveOrderTrackingId] = useState<string | null>(null);
  const [activeMerchantRef, setActiveMerchantRef] = useState<string | null>(null);

  // Pesapal Configuration details
  const [pesapalConfig, setPesapalConfig] = useState<{ configured: boolean; environment: string; currency: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchPesapalConfig();
      fetchTransactions();
    } else {
      setInAppCheckoutUrl(null);
      setActiveOrderTrackingId(null);
      setActiveMerchantRef(null);
    }
  }, [isOpen, currentUser.id]);

  // Safe JSON fetcher to prevent HTML/Doctype parse crashes on static hosts
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return { ok: res.ok, status: res.status, data: json };
      } catch (parseErr) {
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          return {
            ok: false,
            status: res.status,
            data: {
              success: false,
              message:
                'Static hosting detected: This deployment appears to be on a static CDN (like Netlify) without the Node.js API backend running. Please run or connect to the full-stack server (Node/Cloud Run) to execute live Pesapal transactions.',
              isStaticHost: true,
            },
          };
        }
        return {
          ok: false,
          status: res.status,
          data: { success: false, message: `Unexpected response: ${text.slice(0, 100)}` },
        };
      }
    } catch (networkErr: any) {
      return {
        ok: false,
        status: 0,
        data: { success: false, message: networkErr.message || 'Network connection error' },
      };
    }
  };

  const fetchPesapalConfig = async () => {
    try {
      const res = await safeFetchJson('/api/pesapal/config-status');
      if (res.ok && res.data) {
        setPesapalConfig(res.data);
      }
    } catch (e) {
      console.error('Failed to load Pesapal config', e);
    }
  };

  const fetchTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const res = await safeFetchJson(`/api/wallet/transactions?userId=${currentUser.id}`);
      if (res.ok && res.data && res.data.success && Array.isArray(res.data.transactions)) {
        setTransactions(res.data.transactions);
      }
    } catch (e) {
      console.error('Failed to fetch transactions', e);
    } finally {
      setTransactionsLoading(false);
    }
  };

  if (!isOpen) return null;

  const effectiveDepositAmount = customAmount ? Number(customAmount) : depositAmount;

  // Handle Real/Demo Pesapal Deposit Initiation
  const handleInitiateDeposit = async () => {
    if (!effectiveDepositAmount || effectiveDepositAmount < 500) {
      setStatusMessage({ type: 'error', text: 'Minimum deposit is 500 UGX' });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: 'Connecting to Pesapal Payment Gateway...' });

    try {
      const res = await safeFetchJson('/api/pesapal/initiate-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          amount: effectiveDepositAmount,
          currency: 'UGX',
          phoneNumber: phoneNumber || undefined,
          email: email || `${currentUser.username.toLowerCase().replace(/\s+/g, '')}@checkers.ug`,
          description: `Checkers Arena Deposit - ${effectiveDepositAmount.toLocaleString()} UGX`,
        }),
      });

      const data = res.data;

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to initiate deposit');
      }

      setStatusMessage({
        type: 'info',
        text: 'Pesapal secure checkout ready! Complete payment below.',
      });

      // Display in-app embedded Pesapal Checkout frame
      if (data.redirectUrl) {
        setInAppCheckoutUrl(data.redirectUrl);
        setActiveOrderTrackingId(data.orderTrackingId || null);
        setActiveMerchantRef(data.merchantReference || null);
      }

      // Listen for message from iframe or popup
      const handlePaymentMessage = async (e: MessageEvent) => {
        if (e.data?.type === 'PESAPAL_PAYMENT_SUCCESS' || e.data?.status === 'COMPLETED') {
          window.removeEventListener('message', handlePaymentMessage);
          await checkPaymentStatus(data.orderTrackingId, data.merchantReference);
        }
      };
      window.addEventListener('message', handlePaymentMessage);

      // Poll payment status every 3 seconds while in-app checkout is active
      const interval = setInterval(async () => {
        const isDone = await checkPaymentStatus(data.orderTrackingId, data.merchantReference);
        if (isDone) {
          clearInterval(interval);
          window.removeEventListener('message', handlePaymentMessage);
          setInAppCheckoutUrl(null);
        }
      }, 3000);

      setTimeout(() => clearInterval(interval), 180000); // 3 minute timeout
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Deposit initiation failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async (orderTrackingId?: string, merchantReference?: string): Promise<boolean> => {
    try {
      const url = `/api/pesapal/verify-status?userId=${currentUser.id}&orderTrackingId=${orderTrackingId || ''}&merchantReference=${merchantReference || ''}`;
      const res = await safeFetchJson(url);
      const data = res.data;

      if (data && data.completed) {
        setStatusMessage({
          type: 'success',
          text: `Payment Successful! ${data.amount.toLocaleString()} UGX has been credited to your wallet.`,
        });
        onBalanceUpdated(data.walletBalance);
        fetchTransactions();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // Instant Practice Top-Up for testing/demo
  const handleTestCredit = async (amountToAdd: number) => {
    setLoading(true);
    try {
      const res = await safeFetchJson('/api/wallet/test-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, amount: amountToAdd }),
      });
      const data = res.data;
      if (data && data.success) {
        setStatusMessage({
          type: 'success',
          text: `Practice funds added: +${amountToAdd.toLocaleString()} UGX`,
        });
        onBalanceUpdated(data.walletBalance);
        fetchTransactions();
      } else {
        // Fallback for static demo client
        const newBal = (currentUser.walletBalance || 0) + amountToAdd;
        onBalanceUpdated(newBal);
        setStatusMessage({
          type: 'success',
          text: `Local balance updated: +${amountToAdd.toLocaleString()} UGX`,
        });
      }
    } catch (err) {
      console.error(err);
      const newBal = (currentUser.walletBalance || 0) + amountToAdd;
      onBalanceUpdated(newBal);
    } finally {
      setLoading(false);
    }
  };

  // Handle Withdrawal Request
  const handleWithdraw = async () => {
    const amt = effectiveDepositAmount;
    if (!amt || amt < 500) {
      setStatusMessage({ type: 'error', text: 'Minimum withdrawal is 500 UGX' });
      return;
    }
    if ((currentUser.walletBalance || 0) < amt) {
      setStatusMessage({ type: 'error', text: 'Insufficient balance to withdraw this amount' });
      return;
    }
    if (!phoneNumber || phoneNumber.length < 8) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid Mobile Money phone number' });
      return;
    }

    setLoading(true);
    try {
      const res = await safeFetchJson('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          amount: amt,
          phoneNumber,
          provider: provider === 'mtn' ? 'MTN MoMo' : 'Airtel Money',
        }),
      });
      const data = res.data;
      if (res.ok && data && data.success) {
        setStatusMessage({
          type: 'success',
          text: `Withdrawal of ${amt.toLocaleString()} UGX submitted successfully!`,
        });
        onBalanceUpdated(data.walletBalance);
        fetchTransactions();
      } else {
        setStatusMessage({ type: 'error', text: data?.message || 'Withdrawal failed' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Withdrawal failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative space-y-4 max-h-[92vh] flex flex-col justify-between overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header & Current Balance Card */}
        <div className="space-y-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-slate-950 shadow-md">
              <Wallet className="w-5 h-5 font-black" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">Checkers Wallet</h2>
              <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Pesapal Secure Payments ({pesapalConfig?.environment === 'live' ? 'Live Gateway' : 'Sandbox / Demo'})
              </p>
            </div>
          </div>

          {/* Balance Hero Card */}
          <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-inner">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Available Cash Balance
              </span>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
                {(currentUser.walletBalance || 0).toLocaleString()}{' '}
                <span className="text-xs font-bold text-slate-400">UGX</span>
              </div>
            </div>

            <div className="text-right space-y-0.5">
              <span className="text-[10px] text-emerald-400 font-bold block">
                Total Won: +{(currentUser.totalWon || 0).toLocaleString()} UGX
              </span>
              <span className="text-[10px] text-slate-400 block">
                Staked: {(currentUser.totalStaked || 0).toLocaleString()} UGX
              </span>
            </div>
          </div>
        </div>

        {/* Tabs: Deposit / Withdraw / History */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => {
              setActiveTab('deposit');
              setStatusMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'deposit'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" /> Deposit
          </button>
          <button
            onClick={() => {
              setActiveTab('withdraw');
              setStatusMessage(null);
            }}
            className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'withdraw'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Withdraw
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              setStatusMessage(null);
              fetchTransactions();
            }}
            className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" /> History
          </button>
        </div>

        {/* Feedback Messages */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                : 'bg-amber-950/80 border-amber-800 text-amber-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-amber-400" />
            )}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* Tab 1: Pesapal Deposit */}
        {activeTab === 'deposit' && (
          <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            {inAppCheckoutUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-amber-500/40">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-black text-amber-300">
                      In-App Pesapal Payment Checkout
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setInAppCheckoutUrl(null);
                      if (activeOrderTrackingId || activeMerchantRef) {
                        checkPaymentStatus(activeOrderTrackingId || undefined, activeMerchantRef || undefined);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold transition cursor-pointer"
                  >
                    Done / Close Frame
                  </button>
                </div>

                <div className="relative w-full h-[420px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-inner">
                  <iframe
                    src={inAppCheckoutUrl}
                    title="Pesapal Checkout"
                    className="w-full h-full border-0"
                    allow="payment *; clipboard-write *"
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[11px] text-slate-400">
                    Auto-checking payment approval every 3s...
                  </span>
                  <button
                    onClick={() => checkPaymentStatus(activeOrderTrackingId || undefined, activeMerchantRef || undefined)}
                    className="text-amber-400 hover:underline font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Check Status</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-300 flex items-center justify-between">
                    <span>Select Stake Deposit Amount (UGX)</span>
                    <span className="text-[10px] text-amber-400">Match Lobby Stakes</span>
                  </label>

                  {/* Preset Stakes buttons: 500, 1000, 2000, 5000, 10000, 20000 */}
                  <div className="grid grid-cols-3 gap-2">
                    {STAKE_TIERS.map((tier) => (
                      <button
                        key={tier.amount}
                        type="button"
                        onClick={() => {
                          setDepositAmount(tier.amount);
                          setCustomAmount('');
                        }}
                        className={`py-2 px-2 rounded-xl text-xs font-black border transition flex flex-col items-center justify-center cursor-pointer ${
                          effectiveDepositAmount === tier.amount && !customAmount
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span>{tier.label}</span>
                        <span className="text-[9px] text-slate-500 font-semibold">{tier.category}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Amount Input */}
                  <div className="pt-1">
                    <input
                      type="number"
                      placeholder="Or enter custom amount (e.g. 50000)"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Payment Method / Provider */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-300">Payment Method via Pesapal</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setProvider('mtn')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                        provider === 'mtn'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5 text-amber-400" />
                      <span>MTN MoMo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvider('airtel')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                        provider === 'airtel'
                          ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5 text-rose-400" />
                      <span>Airtel Money</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvider('card')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                        provider === 'card'
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                      <span>Visa/Mastercard</span>
                    </button>
                  </div>
                </div>

                {/* Mobile Money Phone Input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">
                    Phone Number (for Mobile Money Prompt)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 0771234567 or +256701234567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Submit Pesapal Deposit */}
                <button
                  onClick={handleInitiateDeposit}
                  disabled={loading || effectiveDepositAmount < 500}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Connecting to Pesapal...'
                      : `Pay ${effectiveDepositAmount.toLocaleString()} UGX with Pesapal`}
                  </span>
                </button>

                {/* Sandbox Quick Practice Top-up */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">Testing Arena?</span>
                  <button
                    onClick={() => handleTestCredit(10000)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[11px] border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>+10,000 UGX Sandbox Credit</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Withdraw */}
        {activeTab === 'withdraw' && (
          <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-300">Amount to Withdraw (UGX)</label>
              <input
                type="number"
                placeholder="Enter amount (min 500 UGX)"
                value={effectiveDepositAmount}
                onChange={(e) => {
                  setDepositAmount(Number(e.target.value));
                  setCustomAmount(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400">
                Max available: {(currentUser.walletBalance || 0).toLocaleString()} UGX
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-slate-300">
                Payout Mobile Money Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 0770000000"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              onClick={handleWithdraw}
              disabled={loading || (currentUser.walletBalance || 0) < 500}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Withdraw Funds</span>
            </button>
          </div>
        )}

        {/* Tab 3: Transaction History */}
        {activeTab === 'history' && (
          <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-1">
            {transactionsLoading ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                <span>Loading transaction records...</span>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-1">
                <History className="w-6 h-6 mx-auto text-slate-600" />
                <p>No transactions yet.</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="font-black text-slate-200 truncate">{tx.description}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(tx.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`font-black ${
                        tx.type === 'stake_win' || tx.type === 'deposit' || tx.type === 'stake_refund'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {tx.type === 'stake_win' || tx.type === 'deposit' || tx.type === 'stake_refund'
                        ? `+${tx.amount.toLocaleString()}`
                        : `-${tx.amount.toLocaleString()}`}{' '}
                      UGX
                    </div>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        tx.status === 'completed'
                          ? 'bg-emerald-950 text-emerald-400'
                          : tx.status === 'pending'
                          ? 'bg-amber-950 text-amber-400'
                          : 'bg-rose-950 text-rose-400'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
