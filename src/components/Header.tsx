import React from 'react';
import { UserProfile } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { AppLogo } from './AppLogo';
import { Trophy, LogIn } from 'lucide-react';

interface HeaderProps {
  currentUser: UserProfile | null;
  onOpenLeaderboard: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenLeaderboard,
  onOpenProfile,
  onOpenAuth,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 px-3 sm:px-6 py-2.5 shadow-xl select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* 1. Game Heading with Professional Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <AppLogo size="md" />
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-rose-400 bg-clip-text text-transparent">
              Checkers Arena
            </h1>
          </div>
        </div>

        {/* Action Controls: 2. Global Checkers Leaderboard Icon & 3. User Data Icon */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Global Checkers Leaderboard Icon */}
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-amber-300 transition border border-slate-700/80 font-bold text-xs shadow-sm active:scale-95"
            title="Global Checkers Leaderboard"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Leaderboard</span>
          </button>

          {/* User Data / Profile Icon at the right */}
          {currentUser ? (
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
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black text-xs shadow-md transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

