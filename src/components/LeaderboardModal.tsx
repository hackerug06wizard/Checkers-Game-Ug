import React from 'react';
import { LeaderboardEntry } from '../types';
import { AvatarBadge } from './AvatarBadge';
import { Trophy, X, Medal, Crown } from 'lucide-react';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LeaderboardEntry[];
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  entries,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 shadow-md">
            <Trophy className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Global Checkers Leaderboard
            </h2>
            <p className="text-xs text-slate-400">
              Top ranked players sorted by Elo rating and competitive match victories.
            </p>
          </div>
        </div>

        {/* Rankings Table */}
        <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 custom-scrollbar">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No leaderboard entries recorded yet. Play matches to climb ranks!
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider bg-slate-900/80 sticky top-0 z-10">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4 text-center">W / L / D</th>
                  <th className="py-3 px-4 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.map((entry) => (
                  <tr
                    key={entry.username}
                    className="hover:bg-slate-900/60 transition"
                  >
                    <td className="py-3 px-4 font-black">
                      {entry.rank === 1 ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Crown className="w-4 h-4" /> 1st
                        </span>
                      ) : entry.rank === 2 ? (
                        <span className="text-slate-300">2nd</span>
                      ) : entry.rank === 3 ? (
                        <span className="text-amber-600">3rd</span>
                      ) : (
                        <span className="text-slate-500">#{entry.rank}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <AvatarBadge avatarId={entry.avatarId} size="sm" />
                        <span className="font-extrabold text-slate-100">
                          {entry.username}
                        </span>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
