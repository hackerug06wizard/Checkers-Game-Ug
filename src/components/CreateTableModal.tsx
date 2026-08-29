import React, { useState } from 'react';
import { UserProfile, STAKE_TIERS, StakeTier } from '../types';
import { PlusCircle, Swords, Clock, X, Coins, ShieldAlert, Wallet, Sparkles } from 'lucide-react';

interface CreateTableModalProps {
  currentUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onCreateTable: (tableName: string, stakeAmount: number, timeLimitSeconds: number) => void;
  onOpenWallet: () => void;
}

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onCreateTable,
  onOpenWallet,
}) => {
  const [selectedStake, setSelectedStake] = useState<number>(0);
  const [tableName, setTableName] = useState<string>(`${currentUser.username}'s Arena Table`);
  const [timeLimit, setTimeLimit] = useState<number>(900); // 15 mins default

  if (!isOpen) return null;

  const currentBalance = currentUser.walletBalance || 0;
  const hasInsufficientBalance = selectedStake > 0 && currentBalance < selectedStake;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasInsufficientBalance) {
      onOpenWallet();
      return;
    }
    onCreateTable(tableName.trim() || `${currentUser.username}'s Table`, selectedStake, timeLimit);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative space-y-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-slate-950 shadow-md">
            <PlusCircle className="w-5 h-5 font-black" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white">Create Game Table</h2>
            <p className="text-xs text-slate-400 font-medium">Choose your stake section & game parameters</p>
          </div>
        </div>

        {/* User Balance Bar */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-300">Your Wallet Balance:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-amber-400">
              {currentBalance.toLocaleString()} UGX
            </span>
            <button
              type="button"
              onClick={onOpenWallet}
              className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition"
            >
              + Deposit
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Table Name */}
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-300">Table Name</label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g. Master's High Roller Table"
              maxLength={40}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-bold focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Stake Tier Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>Stake Section</span>
              </label>
              {selectedStake > 0 && (
                <span className="text-xs font-black text-emerald-400">
                  Winner Pot: {(selectedStake * 2).toLocaleString()} UGX
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Free Play Option */}
              <button
                type="button"
                onClick={() => setSelectedStake(0)}
                className={`py-2.5 px-2 rounded-xl text-xs font-black border transition flex flex-col items-center justify-center ${
                  selectedStake === 0
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>Free Play</span>
                <span className="text-[9px] text-slate-500">0 UGX</span>
              </button>

              {/* 500, 1000, 2000, 5000, 10000, 20000 Stakes */}
              {STAKE_TIERS.map((tier) => (
                <button
                  key={tier.amount}
                  type="button"
                  onClick={() => setSelectedStake(tier.amount)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-black border transition flex flex-col items-center justify-center ${
                    selectedStake === tier.amount
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow'
                      : currentBalance < tier.amount
                      ? 'bg-slate-950/60 border-slate-800/60 text-slate-500 opacity-80'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>{tier.label}</span>
                  <span className="text-[9px] text-slate-500">{tier.category}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time Limit */}
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Turn Clock Limit</span>
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: '5 Mins', val: 300 },
                { label: '15 Mins (Standard)', val: 900 },
                { label: '25 Mins', val: 1500 },
              ].map((t) => (
                <button
                  key={t.val}
                  type="button"
                  onClick={() => setTimeLimit(t.val)}
                  className={`py-2 rounded-xl font-bold border transition ${
                    timeLimit === t.val
                      ? 'bg-slate-800 border-amber-400 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Insufficient balance notice or Action */}
          {hasInsufficientBalance ? (
            <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-800/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <span>
                  Insufficient Balance for {selectedStake.toLocaleString()} UGX stake table.
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenWallet}
                className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Top Up with Pesapal (Need {(selectedStake - currentBalance).toLocaleString()} UGX)</span>
              </button>
            </div>
          ) : (
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4" />
              <span>
                {selectedStake > 0
                  ? `Host Table (Stake ${selectedStake.toLocaleString()} UGX)`
                  : 'Host Free Play Table'}
              </span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
