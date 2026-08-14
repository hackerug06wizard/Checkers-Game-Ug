import React, { useState } from 'react';
import { UserProfile } from '../types';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { AvatarBadge } from './AvatarBadge';
import {
  X,
  ShieldAlert,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateProfile: (avatarId: string, username?: string) => void;
  onDeleteAccount?: () => Promise<void> | void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile,
  onDeleteAccount,
}) => {
  const [username, setUsername] = useState(currentUser.username);
  const [selectedAvatarId, setSelectedAvatarId] = useState(currentUser.avatarId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Delete Account Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteConfirmed = async () => {
    if (!onDeleteAccount) return;
    try {
      setIsDeleting(true);
      await onDeleteAccount();
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete account.');
      setIsDeleting(false);
    }
  };

  const totalGames = currentUser.wins + currentUser.losses + currentUser.draws;
  const winRate = totalGames > 0 ? Math.round((currentUser.wins / totalGames) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3.5">
          <AvatarBadge avatarId={selectedAvatarId} size="lg" showStatus status="online" />
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black text-white truncate">{currentUser.username}</h2>
            <p className="text-xs text-amber-400 font-bold">{currentUser.rating || 1200} ELO Rating</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5 p-3 bg-slate-950 rounded-2xl border border-slate-800 text-center">
          <div>
            <div className="text-[11px] text-slate-500 font-semibold">Wins</div>
            <div className="text-sm sm:text-base font-black text-emerald-400">{currentUser.wins}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-semibold">Losses</div>
            <div className="text-sm sm:text-base font-black text-rose-400">{currentUser.losses}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-semibold">Win Rate</div>
            <div className="text-sm sm:text-base font-black text-amber-400">{winRate}%</div>
          </div>
        </div>

        {/* Edit Username */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Username (Letters only)
          </label>
          <input
            type="text"
            value={username}
            onChange={handleInputChange}
            maxLength={20}
            className={`w-full px-3.5 py-2.5 bg-slate-950 border ${
              hasDigits ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'
            } rounded-xl text-slate-100 text-xs sm:text-sm font-bold focus:outline-none`}
          />
          {hasDigits && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" /> No numbers/digits allowed!
            </p>
          )}
        </div>

        {/* Change Avatar */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Change Avatar
          </label>
          <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1 custom-scrollbar">
            {AVATAR_OPTIONS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                onClick={() => setSelectedAvatarId(avatar.id)}
                className={`p-1.5 rounded-xl flex items-center justify-center transition ${
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

        {errorMsg && (
          <p className="text-xs text-rose-400 bg-rose-950/50 p-2.5 rounded-xl border border-rose-900">
            {errorMsg}
          </p>
        )}

        {/* Buttons Row */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={handleSave}
            disabled={hasDigits || !username.trim()}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs sm:text-sm transition shadow-lg disabled:opacity-50"
          >
            Save Profile Changes
          </button>

          {/* Delete Account Button */}
          {onDeleteAccount && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2 rounded-xl bg-slate-950 hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Player Account</span>
            </button>
          )}
        </div>

        {/* Confirmation Modal for Delete Account */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm bg-slate-900 border border-rose-800/80 rounded-2xl p-5 space-y-4 shadow-2xl text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-black text-white">Delete Account?</h3>
                <p className="text-xs text-slate-400">
                  Are you sure you want to permanently delete your account (<strong className="text-rose-400">{currentUser.username}</strong>)? All your match history, wins, and rating data in Firestore will be completely erased.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDeleteConfirmed}
                  disabled={isDeleting}
                  className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/50"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

