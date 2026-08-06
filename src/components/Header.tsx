import React from 'react';
import { UserProfile } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { Crown, Volume2, VolumeX, Trophy, Smartphone } from 'lucide-react';

interface HeaderProps {
  currentUser: UserProfile | null;
  onlineCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenLeaderboard: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAndroidInstall: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onlineCount,
  soundEnabled,
  onToggleSound,
  onOpenLeaderboard,
  onOpenProfile,
  onOpenAuth,
  onOpenAndroidInstall,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-red-600 to-rose-500 p-0.5 shadow-md shadow-red-950/30">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Crown className="w-6 h-6 text-amber-400 drop-shadow" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-red-400 bg-clip-text text-transparent">
              Checkers Arena
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{onlineCount} {onlineCount === 1 ? 'Player' : 'Players'} Online</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Android App Button */}
          <button
            onClick={onOpenAndroidInstall}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 transition font-bold text-xs"
            title="Install Android App"
          >
            <Smartphone className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="hidden md:inline">Android App</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60"
            title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Leaderboard Button */}
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-amber-300 transition border border-slate-700/60 font-semibold text-xs md:text-sm"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Leaderboard</span>
          </button>

          {/* User Account / Profile */}
          {currentUser ? (
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-800/90 hover:from-slate-700 hover:to-slate-800 text-slate-100 border border-slate-700/80 transition shadow-sm"
            >
              <AvatarBadge avatarId={currentUser.avatarId} size="sm" showStatus status="online" />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-slate-100 max-w-[110px] truncate">
                  {currentUser.username}
                </div>
                <div className="text-[10px] text-amber-400 font-semibold">
                  {currentUser.rating} ELO
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-950/20 transition"
            >
              Create Account / Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
