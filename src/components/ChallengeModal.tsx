import React, { useState } from 'react';
import { UserProfile, STAKE_TIERS } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { Swords, X, Coins, Wallet, ShieldAlert } from 'lucide-react';

interface ChallengeModalProps {
  currentUser: UserProfile;
  targetPlayer: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSendChallenge: (targetUserId: string, stakeAmount: number) => void;
  onOpenWallet: () => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  currentUser,
  targetPlayer,
  isOpen,
  onClose,
  onSendChallenge,
  onOpenWallet,
}) => {
  const [selectedStake, setSelectedStake] = useState<number>(0);

  if (!isOpen || !targetPlayer) return null;

  const currentBalance = currentUser.walletBalance || 0;
  const hasInsufficientBalance = selectedStake > 0 && currentBalance < selectedStake;

  const handleSend = () => {
    if (hasInsufficientBalance) {
      onOpenWallet();
      return;
    }
    onSendChallenge(targetPlayer.id, selectedStake);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 mb-1">
            <Swords className="w-6 h-6" />
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">Challenge Player</h3>
          <p className="text-xs text-slate-400">
            Select a stake level to challenge <span className="text-amber-400 font-bold">{targetPlayer.username}</span>
          </p>
        </div>

        {/* Target Player Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AvatarBadge avatarId={targetPlayer.avatarId} size="sm" />
            <div>
              <div className="text-xs font-black text-slate-200">{targetPlayer.username}</div>
              <div className="text-[10px] text-amber-400">{targetPlayer.rating || targetPlayer.elo || 1200} ELO</div>
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-400 font-bold">
            {targetPlayer.wins}W / {targetPlayer.losses}L
          </div>
        </div>

        {/* Stake Tier Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Select Match Stake</span>
            </label>
            {selectedStake > 0 && (
              <span className="text-xs font-black text-emerald-400">
                Winner Pot: {(selectedStake * 2).toLocaleString()} UGX
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
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

        {/* Insufficient balance notice */}
        {hasInsufficientBalance ? (
          <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>
                You need {selectedStake.toLocaleString()} UGX in your wallet to send this challenge.
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenWallet}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Top Up with Pesapal</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Swords className="w-4 h-4" />
            <span>
              {selectedStake > 0
                ? `Send Challenge (${selectedStake.toLocaleString()} UGX Stake)`
                : 'Send Free Challenge'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
