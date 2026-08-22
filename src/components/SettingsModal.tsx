import React, { useState } from 'react';
import { Palette, Volume2, VolumeX, LogOut, Trash2, X, Sparkles, Check, AlertTriangle, ShieldAlert } from 'lucide-react';
import { sounds } from '../lib/sound';
import { BoardTheme } from './CheckersBoard';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: BoardTheme;
  onSelectTheme?: (theme: BoardTheme) => void;
  onChangeTheme?: (theme: BoardTheme) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

const THEME_OPTIONS: { id: BoardTheme; name: string; darkHex: string; lightHex: string; borderHex: string }[] = [
  {
    id: 'wood',
    name: 'Classic Mahogany',
    darkHex: '#3b2314',
    lightHex: '#e6d5be',
    borderHex: '#78350f',
  },
  {
    id: 'crimson',
    name: 'Royal Crimson',
    darkHex: '#581420',
    lightHex: '#fcecd3',
    borderHex: '#e11d48',
  },
  {
    id: 'neon',
    name: 'Cyberpunk Neon',
    darkHex: '#0b1329',
    lightHex: '#1e293b',
    borderHex: '#06b6d4',
  },
  {
    id: 'emerald',
    name: 'Emerald Marble',
    darkHex: '#064e3b',
    lightHex: '#dcfce7',
    borderHex: '#10b981',
  },
  {
    id: 'slate',
    name: 'Midnight Steel',
    darkHex: '#18181b',
    lightHex: '#cbd5e1',
    borderHex: '#64748b',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
  onChangeTheme,
  soundEnabled,
  onToggleSound,
  onLogout,
  onDeleteAccount,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInputText, setDeleteInputText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleThemeChange = (themeId: BoardTheme) => {
    sounds.playMove();
    if (onChangeTheme) onChangeTheme(themeId);
    if (onSelectTheme) onSelectTheme(themeId);
    localStorage.setItem('checkers_board_theme', themeId);
  };

  const isDeleteConfirmed = deleteInputText.trim() === 'Delete my account';

  const handleConfirmDelete = async () => {
    if (!isDeleteConfirmed) return;
    setIsDeleting(true);
    try {
      await onDeleteAccount();
      setShowDeleteConfirm(false);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-black text-white tracking-tight">Game Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          {/* 1. Theme Selection Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Palette className="w-4 h-4" /> Board Theme
              </label>
              <span className="text-xs text-slate-400 font-semibold">
                {THEME_OPTIONS.find((t) => t.id === currentTheme)?.name}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {THEME_OPTIONS.map((theme) => {
                const isSelected = currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-2.5 relative group ${
                      isSelected
                        ? 'bg-slate-950 ring-2 ring-amber-400 shadow-lg shadow-amber-500/20'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                    style={{ borderColor: isSelected ? theme.borderHex : undefined }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-slate-200">{theme.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>

                    {/* Mini board preview tiles */}
                    <div className="grid grid-cols-2 grid-rows-2 w-full h-8 rounded-lg overflow-hidden border border-slate-700/50 shadow-inner">
                      <div style={{ backgroundColor: theme.lightHex }} />
                      <div style={{ backgroundColor: theme.darkHex }} />
                      <div style={{ backgroundColor: theme.darkHex }} />
                      <div style={{ backgroundColor: theme.lightHex }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Audio & Sound FX Section */}
          <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl border ${soundEnabled ? 'bg-emerald-950/80 border-emerald-700 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-sm font-extrabold text-white">In-Game Sound FX</div>
                  <div className="text-xs text-slate-400">Audio for movement, captures, and blasts</div>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={onToggleSound}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                  soundEnabled ? 'bg-emerald-600 border-emerald-400' : 'bg-slate-800 border-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sound Testing / Verification Buttons */}
            {soundEnabled && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Test Sound Differentiation:
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => sounds.playMove()}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] font-bold text-slate-300 text-center transition active:scale-95"
                  >
                    🎲 Move Piece
                  </button>
                  <button
                    onClick={() => sounds.playCapture()}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] font-bold text-rose-300 text-center transition active:scale-95"
                  >
                    💥 Eat/Capture
                  </button>
                  <button
                    onClick={() => sounds.playBlast()}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] font-bold text-amber-300 text-center transition active:scale-95"
                  >
                    ⚡ Emoji Blast
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Account Actions (Logout & Delete Account) */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">
              Account Management
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Logout Button */}
              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs transition active:scale-95 shadow"
              >
                <LogOut className="w-4 h-4 text-slate-400" />
                <span>Log Out</span>
              </button>

              {/* Delete Account Button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 font-bold text-xs transition active:scale-95 shadow"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Pop-out Modal for Account Deletion */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border-2 border-rose-600 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-950/80 border border-rose-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Permanently Delete Account?</h3>
                <p className="text-xs text-rose-400 font-medium">This action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                Deleting your account will permanently wipe your profile, Elo rating, match history, and tournament records.
              </p>
              <div className="font-bold text-amber-400">
                To confirm, please type <span className="text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 select-all">Delete my account</span> below:
              </div>
            </div>

            {/* Verification text input */}
            <div>
              <input
                type="text"
                value={deleteInputText}
                onChange={(e) => setDeleteInputText(e.target.value)}
                placeholder="Type 'Delete my account'"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl text-white font-mono text-sm outline-none transition"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteInputText('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!isDeleteConfirmed || isDeleting}
                onClick={handleConfirmDelete}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 shadow-lg ${
                  isDeleteConfirmed && !isDeleting
                    ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer active:scale-95'
                    : 'bg-rose-950/40 text-rose-800 border border-rose-900/50 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
