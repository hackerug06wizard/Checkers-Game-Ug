import React, { useState, useEffect } from 'react';
import { UserProfile, STAKE_TIERS, WalletTransaction } from '../types';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Phone,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Check,
  Send,
  Zap,
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
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(false);

  // Active Yo! Payments direct USSD push state
  const [activeTxRef, setActiveTxRef] = useState<string | null>(null);
  const [activeExtRef, setActiveExtRef] = useState<string | null>(null);
  const [promptSentPhone, setPromptSentPhone] = useState<string | null>(null);
  const [isAwaitingPin, setIsAwaitingPin] = useState<boolean>(false);

  // Yo! Payments config
  const [yoConfig, setYoConfig] = useState<{ configured: boolean; environment: string; currency: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchYoConfig();
      fetchTransactions();
    } else {
      setIsAwaitingPin(false);
      setActiveTxRef(null);
      setActiveExtRef(null);
      setPromptSentPhone(null);
    }
  }, [isOpen, currentUser.id]);

  // Automatically detect provider from phone number
  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val);
    const clean = val.replace(/[\s\-\+]/g, '');
    if (clean.startsWith('077') || clean.startsWith('078') || clean.startsWith('076') || clean.startsWith('25677') || clean.startsWith('25678') || clean.startsWith('25676')) {
      setProvider('mtn');
    } else if (clean.startsWith('070') || clean.startsWith('075') || clean.startsWith('074') || clean.startsWith('25670') || clean.startsWith('25675') || clean.startsWith('25674')) {
      setProvider('airtel');
    }
  };

  // Safe JSON fetcher
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return { ok: res.ok, status: res.status, data: json };
      } catch {
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          return {
            ok: false,
            status: res.status,
            data: {
              success: false,
              message: 'Static hosting mode: Connect to full-stack server to process live Mobile Money.',
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

  const fetchYoConfig = async () => {
    try {
      const res = await safeFetchJson('/api/yo/config-status');
      if (res.ok && res.data) {
        setYoConfig(res.data);
      }
    } catch (e) {
      console.error('Failed to load Yo! Payments config', e);
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

  // Handle Yo! Payments Instant Mobile Money Push Deposit (acdepositfunds)
  const handleInitiateYoDeposit = async () => {
    if (!effectiveDepositAmount || effectiveDepositAmount < 500) {
      setStatusMessage({ type: 'error', text: 'Minimum deposit is 500 UGX' });
      return;
    }

    if (!phoneNumber || phoneNumber.trim().length < 9) {
      setStatusMessage({ type: 'error', text: 'Please enter your MTN or Airtel Mobile Money phone number' });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: 'Dispatching instant USSD PIN Prompt to your phone...' });

    try {
      const res = await safeFetchJson('/api/yo/initiate-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          amount: effectiveDepositAmount,
          phoneNumber: phoneNumber.trim(),
          description: `Deposit ${effectiveDepositAmount.toLocaleString()} UGX into Checkers Arena`,
        }),
      });

      const data = res.data;

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to initiate Yo! Payments Mobile Money deposit.');
      }

      setIsAwaitingPin(true);
      setActiveTxRef(data.transactionReference || null);
      setActiveExtRef(data.externalReference || null);
      setPromptSentPhone(phoneNumber.trim());

      setStatusMessage({
        type: 'info',
        text: `USSD PIN Prompt sent to ${phoneNumber.trim()}. Please look at your phone screen and enter your Mobile Money PIN.`,
      });

      // Start polling for PIN authorization status
      const txRef = data.transactionReference;
      const extRef = data.externalReference;

      const interval = setInterval(async () => {
        const isDone = await checkYoPaymentStatus(txRef, extRef);
        if (isDone) {
          clearInterval(interval);
          setIsAwaitingPin(false);
        }
      }, 2500);

      setTimeout(() => clearInterval(interval), 180000); // 3-minute poll window
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Deposit initiation failed. Please check your number.' });
      setIsAwaitingPin(false);
    } finally {
      setLoading(false);
    }
  };

  // Check Yo! Payments Transaction Status
  const checkYoPaymentStatus = async (txRef?: string | null, extRef?: string | null): Promise<boolean> => {
    try {
      const url = `/api/yo/verify-status?userId=${currentUser.id}&transactionReference=${encodeURIComponent(txRef || '')}&externalReference=${encodeURIComponent(extRef || '')}`;
      const res = await safeFetchJson(url);
      const data = res.data;

      if (data && data.completed) {
        setStatusMessage({
          type: 'success',
          text: `Payment Confirmed! ${data.amount.toLocaleString()} UGX has been credited to your wallet.`,
        });
        onBalanceUpdated(data.walletBalance);
        fetchTransactions();
        setIsAwaitingPin(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Instant Practice Top-Up
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

  // Handle Withdrawal Request via Yo! Payments Mobile Money
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
    if (!phoneNumber || phoneNumber.trim().length < 9) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid MTN or Airtel Mobile Money phone number' });
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
          phoneNumber: phoneNumber.trim(),
          provider: provider === 'mtn' ? 'MTN Mobile Money' : 'Airtel Money',
        }),
      });
      const data = res.data;
      if (res.ok && data && data.success) {
        setStatusMessage({
          type: 'success',
          text: `Withdrawal of ${amt.toLocaleString()} UGX processed successfully to ${phoneNumber.trim()}!`,
        });
        onBalanceUpdated(data.walletBalance);
        fetchTransactions();
      } else {
        setStatusMessage({ type: 'error', text: data?.message || 'Withdrawal failed. Please check your balance.' });
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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center text-slate-950 shadow-md">
              <Wallet className="w-5 h-5 font-black" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">Checkers Wallet</h2>
              <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Yo! Payments Uganda Direct Mobile Money
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
            className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
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
            className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
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
            className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" /> History
          </button>
        </div>

        {/* Feedback Messages */}
        {statusMessage && !isAwaitingPin && (
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

        {/* Tab 1: Yo! Payments Deposit */}
        {activeTab === 'deposit' && (
          <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            {isAwaitingPin ? (
              /* Waiting for Phone USSD PIN Approval View */
              <div className="space-y-4 py-2">
                <div className="bg-gradient-to-b from-amber-500/10 via-slate-900 to-slate-950 border-2 border-amber-500/50 rounded-3xl p-5 text-center space-y-3 shadow-xl">
                  <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
                    <div className="w-14 h-14 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
                      <Smartphone className="w-7 h-7 animate-bounce" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-black text-white">
                      PIN Prompt Sent to Your Phone!
                    </h3>
                    <p className="text-xs text-amber-300 font-bold">
                      {promptSentPhone} • {provider === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}
                    </p>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 text-left space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-400 font-black">
                      <Zap className="w-4 h-4" />
                      <span>Action Required on Handset:</span>
                    </div>
                    <ol className="list-decimal list-inside text-slate-300 space-y-1 text-[11px] font-medium">
                      <li>Check your phone screen for the <strong className="text-white">Mobile Money PIN prompt</strong>.</li>
                      <li>Enter your PIN to authorize <strong className="text-amber-400">{effectiveDepositAmount.toLocaleString()} UGX</strong>.</li>
                      <li>Your wallet updates instantly upon approval!</li>
                    </ol>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={() => checkYoPaymentStatus(activeTxRef, activeExtRef)}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      <Check className="w-4 h-4" />
                      <span>I Have Entered My PIN (Check Status)</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsAwaitingPin(false);
                        setStatusMessage(null);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline font-semibold transition cursor-pointer"
                    >
                      Change Number / Resend Prompt
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Normal Deposit Form */
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-300 flex items-center justify-between">
                    <span>Select Stake Deposit Amount (UGX)</span>
                    <span className="text-[10px] text-amber-400 font-bold">Match Lobby Stakes</span>
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

                {/* Network Provider Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-300">Select Mobile Money Network</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setProvider('mtn')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-black border transition flex items-center justify-center gap-2 cursor-pointer ${
                        provider === 'mtn'
                          ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-md ring-1 ring-amber-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Phone className="w-4 h-4 text-amber-400" />
                      <span>MTN MoMo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvider('airtel')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-black border transition flex items-center justify-center gap-2 cursor-pointer ${
                        provider === 'airtel'
                          ? 'bg-rose-500/25 border-rose-400 text-rose-300 shadow-md ring-1 ring-rose-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Phone className="w-4 h-4 text-rose-400" />
                      <span>Airtel Money</span>
                    </button>
                  </div>
                </div>

                {/* Mobile Money Phone Input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Your {provider === 'mtn' ? 'MTN' : 'Airtel'} Phone Number</span>
                    <span className="text-[10px] text-emerald-400 font-bold">Direct Instant Push</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      placeholder="e.g. 0771234567 or 0701234567"
                      value={phoneNumber}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
                    />
                    <Smartphone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    The USSD PIN prompt will popup instantly on this phone screen.
                  </p>
                </div>

                {/* Submit Yo! Payments Deposit Button */}
                <button
                  onClick={handleInitiateYoDeposit}
                  disabled={loading || effectiveDepositAmount < 500 || !phoneNumber}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending PIN Prompt to Phone...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send PIN Prompt for {effectiveDepositAmount.toLocaleString()} UGX</span>
                    </>
                  )}
                </button>

                {/* Quick Practice Top-up */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">Testing Arena?</span>
                  <button
                    onClick={() => handleTestCredit(10000)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[11px] border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>+10,000 UGX Practice Top-Up</span>
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
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400">
                Max available: {(currentUser.walletBalance || 0).toLocaleString()} UGX
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-300">Payout Network</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider('mtn')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
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
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                    provider === 'airtel'
                      ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5 text-rose-400" />
                  <span>Airtel Money</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-slate-300">
                Payout Mobile Money Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 0770000000 or 0700000000"
                value={phoneNumber}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              onClick={handleWithdraw}
              disabled={loading || (currentUser.walletBalance || 0) < 500 || !phoneNumber}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Withdraw via Yo! Payments Mobile Money</span>
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
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
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
