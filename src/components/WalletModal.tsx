import React, { useState, useEffect, useRef } from 'react';
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
  Check,
  CreditCard,
  Lock,
  ArrowLeft,
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

  // In-App Pesapal Embedded Checkout (No external redirects)
  const [pesapalIframeUrl, setPesapalIframeUrl] = useState<string | null>(null);
  const [activeOrderTrackingId, setActiveOrderTrackingId] = useState<string | null>(null);
  const [activeMerchantRef, setActiveMerchantRef] = useState<string | null>(null);

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
    setPesapalIframeUrl(null);
    setActiveOrderTrackingId(null);
    setActiveMerchantRef(null);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  };

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val);
    const clean = val.replace(/[\s\-\+]/g, '');
    if (clean.startsWith('077') || clean.startsWith('078') || clean.startsWith('076') || clean.startsWith('25677') || clean.startsWith('25678')) {
      setProvider('mtn');
    } else if (clean.startsWith('070') || clean.startsWith('075') || clean.startsWith('074') || clean.startsWith('25670') || clean.startsWith('25675')) {
      setProvider('airtel');
    }
  };

  const safeFetchJson = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return { ok: res.ok, status: res.status, data: json };
      } catch {
        return {
          ok: false,
          status: res.status,
          data: { success: false, message: text && text.length < 200 ? text : `Server error (${res.status})` },
        };
      }
    } catch (networkErr: any) {
      return {
        ok: false,
        status: 0,
        data: { success: false, message: networkErr?.message || 'Network connection error' },
      };
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

  // 1. Initiate Pesapal In-App (No redirection away from the website or app)
  const handleInitiatePesapalDeposit = async () => {
    if (!effectiveDepositAmount || effectiveDepositAmount < 500) {
      setStatusMessage({ type: 'error', text: 'Minimum deposit is 500 UGX' });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: 'Opening secure Pesapal in-app checkout...' });

    try {
      const res = await safeFetchJson('/api/pesapal/initiate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          email: `${currentUser.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'player'}@checkersarena.ug`,
          amount: effectiveDepositAmount,
          phoneNumber: phoneNumber || '0770000000',
          description: `Deposit ${effectiveDepositAmount.toLocaleString()} UGX into Checkers Arena`,
        }),
      });

      const data = res.data;
      if (!res.ok || !data.success || !data.redirectUrl) {
        throw new Error(data.message || 'Failed to initialize Pesapal checkout.');
      }

      setPesapalIframeUrl(data.redirectUrl);
      setActiveOrderTrackingId(data.orderTrackingId || null);
      setActiveMerchantRef(data.merchantReference || null);
      setStatusMessage(null);

      // Start automatic background verification polling every 3s
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        if (data.orderTrackingId || data.merchantReference) {
          const completed = await checkPesapalPaymentStatus(data.orderTrackingId, data.merchantReference);
          if (completed) {
            clearInterval(pollIntervalRef.current);
          }
        }
      }, 3000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Payment initialization failed.' });
    } finally {
      setLoading(false);
    }
  };

  // 2. Verify Pesapal Transaction Status
  const checkPesapalPaymentStatus = async (orderTrackingId?: string | null, merchantRef?: string | null): Promise<boolean> => {
    try {
      const url = `/api/pesapal/verify-status?userId=${currentUser.id}&orderTrackingId=${encodeURIComponent(orderTrackingId || '')}&merchantReference=${encodeURIComponent(merchantRef || '')}`;
      const res = await safeFetchJson(url);
      const data = res.data;

      if (data && (data.completed || data.status === 'COMPLETED' || data.status === 'SUCCESSFUL')) {
        setStatusMessage({
          type: 'success',
          text: `Payment Confirmed! +${effectiveDepositAmount.toLocaleString()} UGX credited to your balance.`,
        });
        onBalanceUpdated(data.walletBalance || (currentUser.walletBalance + effectiveDepositAmount));
        fetchTransactions();
        setPesapalIframeUrl(null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 3. Practice Top-Up
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 4. Withdrawal Cashout
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
          text: `Cashout of ${amt.toLocaleString()} UGX processed successfully!`,
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
                In-App Pesapal Checkout • Mobile Money & Cards
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

            <div className="text-right space-y-0.5">
              <span className="text-[10px] text-emerald-400 font-bold block">
                Won: +{(currentUser.totalWon || 0).toLocaleString()} UGX
              </span>
              <span className="text-[10px] text-slate-400 block">
                Staked: {(currentUser.totalStaked || 0).toLocaleString()} UGX
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        {!pesapalIframeUrl && (
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
        {statusMessage && !pesapalIframeUrl && (
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

        {/* IN-APP PESAPAL EMBEDDED CHECKOUT CONTAINER (No external redirects) */}
        {pesapalIframeUrl && (
          <div className="flex-1 flex flex-col space-y-2 overflow-hidden min-h-[380px]">
            <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>In-App Pesapal Secure Checkout</span>
              </div>
              <button
                onClick={resetActivePayment}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Cancel / Change Amount</span>
              </button>
            </div>

            {/* Embedded Pesapal Payment Frame */}
            <div className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner relative">
              <iframe
                src={pesapalIframeUrl}
                title="Pesapal Checkout"
                className="w-full h-full border-0 min-h-[330px] rounded-2xl"
                allow="payment"
              />
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                onClick={() => checkPesapalPaymentStatus(activeOrderTrackingId, activeMerchantRef)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-98"
              >
                <Check className="w-3.5 h-3.5" />
                <span>I've Completed Payment (Verify & Credit Balance)</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Deposit */}
        {activeTab === 'deposit' && !pesapalIframeUrl && (
          <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
            {/* Stake Amount Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-300 flex items-center justify-between">
                <span>Select Deposit Stake Amount (UGX)</span>
                <span className="text-[10px] text-amber-400 font-bold">Matches Stakes</span>
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
                  placeholder="Or enter custom amount (e.g. 20000)"
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
                  Mobile Number (Optional for Card)
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">MTN / Airtel / Card</span>
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
                  <span>Opening In-App Checkout...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Pay {effectiveDepositAmount.toLocaleString()} UGX (In-App Pesapal)</span>
                </>
              )}
            </button>

            {/* Practice Top-up */}
            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Testing Mode?</span>
              <button
                onClick={() => handleTestCredit(10000)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[11px] border border-slate-700 transition flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>+10,000 UGX Practice Top-Up</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Withdraw */}
        {activeTab === 'withdraw' && !pesapalIframeUrl && (
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
        {activeTab === 'history' && !pesapalIframeUrl && (
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
