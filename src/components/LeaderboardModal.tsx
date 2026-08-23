import React from 'react';
import { LeaderboardEntry } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { Trophy, X, Crown, Swords, Shield, Flame, Zap, Award } from 'lucide-react';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
}

export interface PlayerTitleInfo {
  title: string;
  subtitle: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  glowColor: string;
  icon: string;
}

export function getRankTitle(rank: number): PlayerTitleInfo | null {
  switch (rank) {
    case 1:
      return {
        title: 'Grandmaster',
        subtitle: 'Apex Champion',
        badgeBg: 'bg-amber-500/15',
        badgeBorder: 'border-amber-400/80',
        textColor: 'text-amber-300',
        glowColor: 'shadow-amber-500/20',
        icon: '👑',
      };
    case 2:
      return {
        title: 'Master',
        subtitle: 'Grand Champion',
        badgeBg: 'bg-rose-500/15',
        badgeBorder: 'border-rose-400/80',
        textColor: 'text-rose-300',
        glowColor: 'shadow-rose-500/20',
        icon: '⚔️',
      };
    case 3:
      return {
        title: 'Elite',
        subtitle: 'Board Tactician',
        badgeBg: 'bg-emerald-500/15',
        badgeBorder: 'border-emerald-400/80',
        textColor: 'text-emerald-300',
        glowColor: 'shadow-emerald-500/20',
        icon: '🛡️',
      };
    case 4:
      return {
        title: 'Veteran',
        subtitle: 'Senior Strategist',
        badgeBg: 'bg-orange-500/15',
        badgeBorder: 'border-orange-400/80',
        textColor: 'text-orange-300',
        glowColor: 'shadow-orange-500/20',
        icon: '🔥',
      };
    case 5:
      return {
        title: 'Knight',
        subtitle: 'Rising Prodigy',
        badgeBg: 'bg-cyan-500/15',
        badgeBorder: 'border-cyan-400/80',
        textColor: 'text-cyan-300',
        glowColor: 'shadow-cyan-500/20',
        icon: '⚡',
      };
    default:
      return null;
  }
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  entries,
}) => {
  if (!isOpen) return null;

  const top5Entries = entries.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 shadow-md text-slate-950">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-white flex items-center gap-2">
              Global Checkers Leaderboard
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-bold">
                Top 5 Titled
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Rankings and official prestige titles awarded to the top 5 arena players.
            </p>
          </div>
        </div>

        {/* Top 5 Titled Champions Showcase */}
        {top5Entries.length > 0 && (
          <div className="shrink-0 space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Hall of Titled Champions</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {top5Entries.map((entry) => {
                const titleInfo = getRankTitle(entry.rank);
                if (!titleInfo) return null;
                return (
                  <div
                    key={`top-${entry.username}`}
                    className={`rounded-2xl p-2.5 flex flex-col items-center text-center relative border shadow-md transition hover:scale-102 ${titleInfo.badgeBg} ${titleInfo.badgeBorder} ${titleInfo.glowColor}`}
                  >
                    <div className="absolute top-1.5 right-1.5 text-xs">
                      {titleInfo.icon}
                    </div>
                    <div className="mb-1">
                      <AvatarBadge avatarId={entry.avatarId} size="sm" />
                    </div>
                    <div className="font-extrabold text-xs text-slate-100 truncate w-full">
                      {entry.username}
                    </div>
                    <div
                      className={`text-[10px] font-black uppercase tracking-wider mt-0.5 ${titleInfo.textColor}`}
                    >
                      {titleInfo.title}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {titleInfo.subtitle}
                    </div>
                    <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-950/70 border border-slate-800 text-[10px] font-black text-amber-400">
                      {entry.rating} ELO
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rankings Table */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 custom-scrollbar min-h-0">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No leaderboard entries recorded yet. Play matches to climb ranks!
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider bg-slate-900/90 sticky top-0 z-10">
                  <th className="py-3 px-4">Rank & Title</th>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4 text-center">W / L / D</th>
                  <th className="py-3 px-4 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.map((entry) => {
                  const titleInfo = getRankTitle(entry.rank);
                  return (
                    <tr
                      key={entry.username}
                      className="hover:bg-slate-900/60 transition"
                    >
                      <td className="py-3 px-4 font-black">
                        {entry.rank === 1 ? (
                          <span className="flex items-center gap-1.5 text-amber-400 font-black">
                            <Crown className="w-4 h-4 text-amber-400 shrink-0" /> #1
                          </span>
                        ) : entry.rank === 2 ? (
                          <span className="flex items-center gap-1.5 text-rose-400 font-black">
                            <Swords className="w-3.5 h-3.5 text-rose-400 shrink-0" /> #2
                          </span>
                        ) : entry.rank === 3 ? (
                          <span className="flex items-center gap-1.5 text-emerald-400 font-black">
                            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> #3
                          </span>
                        ) : entry.rank === 4 ? (
                          <span className="flex items-center gap-1.5 text-orange-400 font-black">
                            <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" /> #4
                          </span>
                        ) : entry.rank === 5 ? (
                          <span className="flex items-center gap-1.5 text-cyan-400 font-black">
                            <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> #5
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">#{entry.rank}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <AvatarBadge avatarId={entry.avatarId} size="sm" />
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span className="font-extrabold text-slate-100">
                              {entry.username}
                            </span>
                            {titleInfo && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${titleInfo.badgeBg} ${titleInfo.badgeBorder} ${titleInfo.textColor}`}
                              >
                                <span>{titleInfo.icon}</span>
                                <span>{titleInfo.title}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-amber-400">
                        {entry.rating} ELO
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-300">
                        {entry.wins} / {entry.losses} / {entry.draws}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-emerald-400">
                        {entry.winRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

