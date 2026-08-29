import React from 'react';
import { UserProfile } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { AppLogo } from './AppLogo';
import { Trophy, LogIn, Users, UserPlus, Wallet, Plus } from 'lucide-react';

interface HeaderProps {
  currentUser: UserProfile | null;
  onlineCount: number;
  onOpenLeaderboard: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenWallet?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onlineCount,
  onOpenLeaderboard,
  onOpenProfile,
  onOpenAuth,
  onOpenWallet,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 px-3 sm:px-6 py-2.5 shadow-xl select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* 1. Game Heading with Logo and Live Online Count */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <AppLogo size="md" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2.5">
            <h1 className="text-base sm:text-xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-rose-400 bg-clip-text text-transparent">
              Checkers Arena
            </h1>
            {/* Live Online Player Count */}
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-[10px] sm:text-xs font-black shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>{Math.max(1, onlineCount)} Online</span>
            </div>
          </div>
        </div>

        {/* Action Controls: Leaderboard, Wallet & User Profile / Sign In */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Wallet Balance & Deposit Quick Pill */}
          {currentUser && onOpenWallet && (
            <button
              onClick={onOpenWallet}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-gradient-to-r from-amber-950/80 to-slate-900 border border-amber-500/40 hover:border-amber-400 text-amber-300 transition shadow-md active:scale-95 cursor-pointer group"
              title="Pesapal Wallet & Deposits"
            >
              <Wallet className="w-4 h-4 text-amber-400 group-hover:scale-110 transition shrink-0" />
              <div className="flex items-center gap-1">
                <span className="text-xs font-black text-white">
                  {(currentUser.walletBalance || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-amber-400 font-bold">UGX</span>
              </div>
              <div className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black text-[10px] ml-0.5 shrink-0">
                <Plus className="w-3 h-3 stroke-[3]" />
              </div>
            </button>
          )}

          {/* Global Checkers Leaderboard */}
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-amber-300 transition border border-slate-700/80 font-bold text-xs shadow-sm active:scale-95"
            title="Global Checkers Leaderboard"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Leaderboard</span>
          </button>

          {/* User Data / Profile Icon or Create Account */}
          {currentUser ? (
            <div className="flex items-center gap-2">
              {currentUser.isGuest && (
                <button
                  onClick={onOpenAuth}
                  className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition"
                  title="Create a permanent account"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              )}
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-850 hover:from-slate-750 hover:to-slate-800 text-slate-100 border border-slate-700/80 transition shadow-md active:scale-95"
                title="View Player Profile"
              >
                <AvatarBadge avatarId={currentUser.avatarId} size="sm" showStatus status={currentUser.status || 'online'} />
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-black text-slate-100 max-w-[110px] truncate">
                    {currentUser.username}
                  </div>
                  <div className="text-[10px] text-amber-400 font-bold">
                    {currentUser.rating || currentUser.elo || 1200} ELO
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-md transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Create Account / Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

