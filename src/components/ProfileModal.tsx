import React, { useState } from 'react';
import { UserProfile } from '../types';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { AvatarBadge } from './AvatarBadge';
import { X, User, ShieldAlert, CheckCircle2, Award, Trophy, Zap } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateProfile: (avatarId: string, username?: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile,
}) => {
  const [username, setUsername] = useState(currentUser.username);
  const [selectedAvatarId, setSelectedAvatarId] = useState(currentUser.avatarId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasDigits = /\d/.test(username);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUsername(val);

    if (/\d/.test(val)) {
      setErrorMsg('Usernames cannot contain any numbers or digits!');
    } else {
      setErrorMsg(null);
    }
  };

  const handleSave = () => {
    const clean = username.trim();
    if (hasDigits) return;
    if (!clean) {
      setErrorMsg('Username cannot be empty.');
      return;
    }
    onUpdateProfile(selectedAvatarId, clean !== currentUser.username ? clean : undefined);
    onClose();
  };

  const totalGames = currentUser.wins + currentUser.losses + currentUser.draws;
  const winRate = totalGames > 0 ? Math.round((currentUser.wins / totalGames) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          <AvatarBadge avatarId={selectedAvatarId} size="lg" showStatus status="online" />
          <div>
            <h2 className="text-xl font-black text-white">{currentUser.username}</h2>
            <p className="text-xs text-amber-400 font-bold">{currentUser.rating} ELO Rating</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
          <div>
            <div className="text-xs text-slate-500">Wins</div>
            <div className="text-base font-black text-emerald-400">{currentUser.wins}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Losses</div>
            <div className="text-base font-black text-rose-400">{currentUser.losses}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Win Rate</div>
            <div className="text-base font-black text-amber-400">{winRate}%</div>
          </div>
        </div>

        {/* Edit Username */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase text-slate-300">
            Username (Digit-Free)
          </label>
          <input
            type="text"
            value={username}
            onChange={handleInputChange}
            maxLength={20}
            className={`w-full px-4 py-3 bg-slate-950 border ${
              hasDigits ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'
            } rounded-2xl text-slate-100 text-sm font-bold focus:outline-none`}
          />
          {hasDigits && (
            <p className="text-xs text-rose-400 flex items-center gap-1 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" /> No numbers/digits allowed!
            </p>
          )}
        </div>

        {/* Change Avatar */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase text-slate-300">
            Change Avatar
          </label>
          <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto p-1 custom-scrollbar">
            {AVATAR_OPTIONS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                onClick={() => setSelectedAvatarId(avatar.id)}
                className={`p-1.5 rounded-2xl flex items-center justify-center transition ${
                  avatar.id === selectedAvatarId
                    ? 'bg-amber-500/20 ring-2 ring-amber-400'
                    : 'bg-slate-950/60 hover:bg-slate-800'
                }`}
              >
                <AvatarBadge avatarId={avatar.id} size="sm" />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={hasDigits || !username.trim()}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm transition disabled:opacity-50"
        >
          Save Profile Changes
        </button>
      </div>
    </div>
  );
};
