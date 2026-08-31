import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, STAKE_TIERS, WalletTransaction } from '../types';
import { apiFetchJson } from '../lib/api';
import { saveUserProfileToFirestore } from '../lib/firebase';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Phone,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  ShieldCheck,
  Check,
  CreditCard,
  Trash2,
  ArrowLeft,
  ExternalLink,
  Smartphone,
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
  const [phoneNumber, setPhoneNumber] = useState<string>(currentUser.phoneNumber || '');
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(false);
  const [resettingBalance, setResettingBalance] = useState<boolean>(false);

  // Live Pesapal In-App & Push Checkout
  const [pesapalCheckoutUrl, setPesapalCheckoutUrl] = useState<string | null>(null);
  const [activeOrderTrackingId, setActiveOrderTrackingId] = useState<string | null>(null);
  const [activeMerchantRef, setActiveMerchantRef] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTransactions();
    } else {
      resetActivePayment();
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, currentUser.id]);

  const resetActivePayment = () => {
    setPesapalCheckoutUrl(null);
    setActiveOrderTrackingId(null);
    setActiveMerchantRef(null);
    setIsVerifying(false);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  };

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val);
    const clean = val.replace(/[\s\-\+]/g, '');
    if (
      clean.startsWith('077') ||
      clean.startsWith('078') ||
      clean.startsWith('076') ||
      clean.startsWith('25677') ||
      clean.startsWith('25678') ||
      clean.startsWith('25676')
    ) {
      setProvider('mtn');
    } else if (
      clean.startsWith('070') ||
      clean.startsWith('075') ||
      clean.startsWith('074') ||
      clean.startsWith('25670') ||
      clean.startsWith('25675') ||
      clean.startsWith('25674')
    ) {
      setProvider('airtel');
    }
  };

  const fetchTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const res = await apiFetchJson(`/api/wallet/transactions?userId=${currentUser.id}`);
      if (res.ok && res.data && res.data.success && Array.isArray(res.data.transactions)) {
        setTransactions(res.data.transactions);
      }
    } catch (e) {
      console.error('Failed to fetch transactions', e);
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Reset Sandbox & Test Balances to 0 UGX
  const handleResetSandboxBalance = async () => {
    setResettingBalance(true);
    try {
      // 1. Reset on backend server
      await apiFetchJson('/api/wallet/reset-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });

      // 2. Reset in Firestore
      const updatedProfile: UserProfile = {
        ...currentUser,
        walletBalance: 0,
        totalWon: 0,
        totalStaked: 0,
      };
      await saveUserProfileToFirestore(updatedProfile);

      // 3. Reset in localStorage
      localStorage.setItem('checkers_user_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('checkers_sandbox_cleaned_v2', 'true');

      // 4. Update UI
      onBalanceUpdated(0);
      setTransactions([]);
      setStatusMessage({
        type: 'success',
        text: 'Sandbox balance successfully cleared! Available balance is now 0 UGX.',
      });
    } catch (err: any) {
      console.error('Failed to reset balance:', err);
      setStatusMessage({ type: 'error', text: 'Could not reset balance. Please try again.' });
    } finally {
      setResettingBalance(false);
    }
  };

  if (!isOpen) return null;

  const effectiveDepositAmount = customAmount ? Number(customAmount) : depositAmount;

  // 1. Initiate Real Pesapal Live Order (Triggers Push prompt on Phone)
  const handleInitiatePesapalDeposit = async () => {
    if (!effectiveDepositAmount || effectiveDepositAmount < 500) {
      setStatusMessage({ type: 'error', text: 'Minimum deposit is 500 UGX' });
      return;
    }

    if (!phoneNumber || phoneNumber.trim().length < 9) {
      setStatusMessage({ type: 'error', text: 'Please enter your Mobile Money phone number to receive the prompt.' });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: 'Connecting to Pesapal Live Payment Gateway...' });

    try {
      const res = await apiFetchJson('/api/pesapal/initiate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          email: `${currentUser.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'player'}@checkersarena.ug`,
          amount: effectiveDepositAmount,
          phoneNumber: phoneNumber.trim(),
          description: `Deposit ${effectiveDepositAmount.toLocaleString()} UGX into Checkers Arena`,
        }),
      });

      const data = res.data;
      if (!res.ok || !data || !data.success || !data.redirectUrl) {
        throw new Error(data?.message || 'Failed to initialize Pesapal checkout.');
      }

      setPesapalCheckoutUrl(data.redirectUrl);
      setActiveOrderTrackingId(data.orderTrackingId || null);
      setActiveMerchantRef(data.merchantReference || null);
      setStatusMessage(null);

      // Start automatic background verification polling every 4 seconds
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        if (data.orderTrackingId || data.merchantReference) {
          const completed = await checkPesapalPaymentStatus(data.orderTrackingId, data.merchantReference, false);
          if (completed) {
            clearInterval(pollIntervalRef.current);
          }
        }
      }, 4000);
    } catch (err: any) {
      console.error('Pesapal initiation error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Payment initialization failed. Please check your network or phone number.',
      });
    } finally {
      setLoading(false);
    }
  };

  // 2. Verify Pesapal Live Transaction Status
  const checkPesapalPaymentStatus = async (
    orderTrackingId?: string | null,
    merchantRef?: string | null,
    showFeedback: boolean = true
  ): Promise<boolean> => {
    if (showFeedback) setIsVerifying(true);
    try {
      const url = `/api/pesapal/verify-status?userId=${currentUser.id}&orderTrackingId=${encodeURIComponent(
        orderTrackingId || ''
      )}&merchantReference=${encodeURIComponent(merchantRef || '')}`;
      const res = await apiFetchJson(url);
      const data = res.data;

      if (data && (data.completed || data.status === 'Completed' || data.status === 'COMPLETED')) {
        const newBal = data.walletBalance || (currentUser.walletBalance + effectiveDepositAmount);
        setStatusMessage({
          type: 'success',
          text: `Payment Confirmed! +${effectiveDepositAmount.toLocaleString()} UGX credited to your wallet balance.`,
        });
        onBalanceUpdated(newBal);

        // Update Firestore profile with new real balance
        const updatedProf: UserProfile = { ...currentUser, walletBalance: newBal };
        saveUserProfileToFirestore(updatedProf).catch(() => {});
        localStorage.setItem('checkers_user_profile', JSON.stringify(updatedProf));

        fetchTransactions();
        setPesapalCheckoutUrl(null);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        return true;
      } else if (showFeedback) {
        setStatusMessage({
          type: 'info',
          text: 'Payment is still processing on your mobile phone. Once approved with your PIN, your balance will be credited.',
        });
      }
      return false;
    } catch {
      return false;
    } finally {
      if (showFeedback) setIsVerifying(false);
    }
  };

  // 3. Withdrawal Cashout via Mobile Money
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
      setStatusMessage({ type: 'error', text: 'Please enter a valid mobile number for cashout' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetchJson('/api/wallet/withdraw', {
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
        const newBal = data.walletBalance;
        setStatusMessage({
          type: 'success',
          text: `Cashout of ${amt.toLocaleString()} UGX processed successfully to ${phoneNumber.trim()}!`,
        });
        onBalanceUpdated(newBal);

        const updatedProf: UserProfile = { ...currentUser, walletBalance: newBal };
        saveUserProfileToFirestore(updatedProf).catch(() => {});
        localStorage.setItem('checkers_user_profile', JSON.stringify(updatedProf));

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative space-y-4 max-h-[94vh] flex flex-col justify-between overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header & Balance Card */}
        <div className="space-y-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-md font-black">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-1.5">
                <span>Checkers Arena Wallet</span>
              </h2>
              <p className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Live Pesapal Payments • MTN MoMo, Airtel & Cards
              </p>
            </div>
          </div>

          {/* Balance Hero Card */}
          <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between shadow-inner">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Available Cash Balance
              </span>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
                {(currentUser.walletBalance || 0).toLocaleString()}{' '}
                <span className="text-xs font-bold text-slate-400">UGX</span>
              </div>
            </div>

            <div className="text-right space-y-1.5">
              <div className="space-y-0.5">
                <span className="text-[10px] text-emerald-400 font-bold block">
                  Won: +{(currentUser.totalWon || 0).toLocaleString()} UGX
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Staked: {(currentUser.totalStaked || 0).toLocaleString()} UGX
                </span>
              </div>
              {(currentUser.walletBalance || 0) > 0 && (
                <button
                  type="button"
                  onClick={handleResetSandboxBalance}
                  disabled={resettingBalance}
                  className="text-[10px] px-2 py-1 rounded-lg bg-rose-950/70 border border-rose-800/80 text-rose-300 hover:bg-rose-900 hover:text-white transition flex items-center gap-1 ml-auto cursor-pointer"
                  title="Clear old sandbox demo money"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>{resettingBalance ? 'Clearing...' : 'Clear Sandbox (0 UGX)'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        {!pesapalCheckoutUrl && (
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => {
                setActiveTab('deposit');
                setStatusMessage(null);
              }}
              className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'deposit'
                  ? 'bg-amber-400 text-slate-950 shadow'
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
              className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'withdraw'
                  ? 'bg-amber-400 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Cashout
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                setStatusMessage(null);
                fetchTransactions();
              }}
              className={`flex-1 py-2 rounded-lg font-black text-xs transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-amber-400 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" /> History
            </button>
          </div>
        )}

        {/* Status Messages */}
        {statusMessage && !pesapalCheckoutUrl && (
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

        {/* PESAPAL LIVE CHECKOUT CONTAINER & MOBILE PROMPT MONITOR */}
        {pesapalCheckoutUrl && (
          <div className="flex-1 flex flex-col space-y-2 overflow-hidden min-h-[390px]">
            {/* Top Toolbar with direct link */}
            <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Smartphone className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Live Pesapal Checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={pesapalCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 underline"
                  title="Open in new window or external browser"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Browser</span>
                </a>
                <button
                  onClick={resetActivePayment}
                  className="text-[11px] text-slate-400 hover:text-white font-bold flex items-center gap-1 cursor-pointer ml-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>

            {/* Notification Banner about Mobile Prompt */}
            <div className="bg-amber-950/60 border border-amber-500/40 p-2.5 rounded-xl text-[11px] text-amber-200 flex items-center gap-2 shrink-0">
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
              <span>
                Enter your phone number in Pesapal below to receive the Mobile Money PIN prompt on your phone.
              </span>
            </div>

            {/* Embedded Pesapal Payment Frame */}
            <div className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner relative min-h-[260px]">
              <iframe
                src={pesapalCheckoutUrl}
                title="Pesapal Live Checkout"
                className="w-full h-full border-0 min-h-[260px] rounded-2xl"
                allow="payment"
              />
            </div>

            {/* Verification Button */}
            <div className="pt-1 text-xs shrink-0">
              <button
                onClick={() => checkPesapalPaymentStatus(activeOrderTrackingId, activeMerchantRef, true)}
                disabled={isVerifying}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying with Pesapal...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>I've Entered PIN on My Phone (Verify & Credit Balance)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Deposit */}
        {activeTab === 'deposit' && !pesapalCheckoutUrl && (
          <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            {/* Stake Amount Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-300 flex items-center justify-between">
                <span>Select Deposit Amount (UGX)</span>
                <span className="text-[10px] text-amber-400 font-bold">Matches Match Stakes</span>
              </label>

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
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{tier.label}</span>
                    <span className="text-[9px] text-slate-500 font-semibold">{tier.category}</span>
                  </button>
                ))}
              </div>

              <div className="pt-0.5">
                <input
                  type="number"
                  placeholder="Or enter custom amount (e.g. 10000)"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Phone Number Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  Mobile Money Phone Number (For Prompt)
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">MTN / Airtel</span>
              </label>
              <input
                type="tel"
                placeholder="e.g. 0771234567 or 0701234567"
                value={phoneNumber}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Initiate Button */}
            <button
              onClick={handleInitiatePesapalDeposit}
              disabled={loading || effectiveDepositAmount < 500}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connecting to Live Pesapal...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Pay {effectiveDepositAmount.toLocaleString()} UGX (Live Mobile Money)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Tab 2: Withdraw */}
        {activeTab === 'withdraw' && !pesapalCheckoutUrl && (
          <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-300">Amount to Cashout (UGX)</label>
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
                Available: {(currentUser.walletBalance || 0).toLocaleString()} UGX
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
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
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
                      ? 'bg-rose-400/20 border-rose-400 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5 text-rose-400" />
                  <span>Airtel Money</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-slate-300">Mobile Money Number</label>
              <input
                type="tel"
                placeholder="e.g. 0771234567 or 0701234567"
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
              <span>Cashout Winnings</span>
            </button>
          </div>
        )}

        {/* Tab 3: History */}
        {activeTab === 'history' && !pesapalCheckoutUrl && (
          <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-1">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-400">Recent Transactions</span>
              {(currentUser.walletBalance || 0) > 0 && (
                <button
                  type="button"
                  onClick={handleResetSandboxBalance}
                  disabled={resettingBalance}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Reset All to 0 UGX</span>
                </button>
              )}
            </div>

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
