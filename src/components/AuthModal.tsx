import React, { useState, useEffect } from 'react';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { AvatarBadge } from './AvatarBadge';
import { User, AlertCircle, ShieldAlert, CheckCircle2, Crown, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSubmitAuth: (username: string, avatarId: string) => void;
  initialUsername?: string;
  initialAvatarId?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onSubmitAuth,
  initialUsername = '',
  initialAvatarId = 'avatar-crown',
}) => {
  const [username, setUsername] = useState(initialUsername);
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setUsername(initialUsername);
    setSelectedAvatarId(initialAvatarId || 'avatar-crown');
    setErrorMsg(null);
  }, [initialUsername, initialAvatarId, isOpen]);

  if (!isOpen) return null;

  const hasDigits = /\d/.test(username);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUsername(val);

    if (/\d/.test(val)) {
      setErrorMsg('Usernames cannot contain any numbers or digits!');
    } else if (val.trim().length > 0 && val.trim().length < 2) {
      setErrorMsg('Username must be at least 2 characters long.');
    } else {
      setErrorMsg(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = username.trim();

    if (!clean) {
      setErrorMsg('Please enter a username.');
      return;
    }

    if (/\d/.test(clean)) {
      setErrorMsg('Usernames cannot contain any numbers or digits! Please remove digits.');
      return;
    }

    if (clean.length < 2 || clean.length > 20) {
      setErrorMsg('Username must be between 2 and 20 characters.');
      return;
    }

    onSubmitAuth(clean, selectedAvatarId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Modal Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 shadow-lg shadow-amber-900/30">
            <Crown className="w-6 h-6 text-slate-950" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Create Your Player Profile
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Choose a unique digit-free username and pick your arena avatar to enter online matches.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Username <span className="text-amber-400 text-[11px] font-normal">(No numbers or digits allowed)</span>
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={handleInputChange}
                placeholder="e.g., CheckersKing, RubyMaster, QueenAura"
                maxLength={20}
                className={`w-full pl-11 pr-10 py-3.5 bg-slate-950 border ${
                  hasDigits || errorMsg
                    ? 'border-rose-500/80 focus:ring-rose-500'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-amber-500'
                } rounded-2xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-opacity-50 text-sm font-semibold transition`}
              />
              {username && !hasDigits && username.trim().length >= 2 && (
                <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" />
              )}
            </div>

            {/* Error / Restriction Warning Notice */}
            {hasDigits && (
              <div className="flex items-start gap-2 p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-xs font-semibold">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Rule:</strong> Usernames cannot contain any digits or numbers (0-9). Please use letters only.
                </span>
              </div>
            )}

            {!hasDigits && errorMsg && (
              <div className="flex items-center gap-2 text-rose-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Avatar Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Choose Your Profile Avatar
            </label>
            <div className="grid grid-cols-5 gap-3 max-h-56 overflow-y-auto p-1 custom-scrollbar">
              {AVATAR_OPTIONS.map((avatar) => {
                const isSelected = avatar.id === selectedAvatarId;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(avatar.id)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition ${
                      isSelected
                        ? 'bg-amber-500/20 ring-2 ring-amber-400 scale-105'
                        : 'bg-slate-950/60 hover:bg-slate-800 border border-slate-800/80'
                    }`}
                  >
                    <AvatarBadge avatarId={avatar.id} size="md" />
                    <span className="text-[10px] font-bold text-slate-300 truncate w-full text-center">
                      {avatar.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview */}
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AvatarBadge avatarId={selectedAvatarId} size="lg" showStatus status="online" />
              <div>
                <div className="text-xs text-slate-400 font-medium">Avatar & Profile Preview</div>
                <div className="text-base font-extrabold text-amber-300">
                  {username.trim() || 'Your Username'}
                </div>
              </div>
            </div>
            <Sparkles className="w-5 h-5 text-amber-400 animate-bounce" />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={hasDigits || !username.trim() || username.trim().length < 2}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-base shadow-xl shadow-amber-950/30 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            Enter Checkers Arena
          </button>
        </form>
      </div>
    </div>
  );
};
