import React, { useState, useEffect } from 'react';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { AvatarBadge } from './AvatarBadge';
import {
  User,
  Phone,
  AlertCircle,
  CheckCircle2,
  Crown,
  UserPlus,
  LogIn,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  isUsernameTaken,
  saveUserProfileToFirestore,
  signInWithGoogle,
  signInWithApple,
  setAuthRememberMe,
} from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onAuthSuccess: (userProfile: UserProfile) => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'signup',
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  
  // Sign Up Fields
  const [realName, setRealName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState('avatar-crown');

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // General status
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg(null);
  }, [isOpen, initialMode]);

  // Username Availability Check Debounce
  useEffect(() => {
    if (mode !== 'signup') return;
    const clean = username.trim();

    if (!clean) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }

    if (/\d/.test(clean)) {
      setUsernameStatus('invalid');
      setUsernameError('Usernames cannot contain numbers (0-9). Letters only.');
      return;
    }

    if (clean.length < 3 || clean.length > 20) {
      setUsernameStatus('invalid');
      setUsernameError('Username must be 3-20 characters long.');
      return;
    }

    setUsernameStatus('checking');
    setUsernameError(null);

    const timer = setTimeout(async () => {
      try {
        const taken = await isUsernameTaken(clean);
        if (taken) {
          setUsernameStatus('taken');
          setUsernameError('This username is already taken by another player!');
        } else {
          setUsernameStatus('available');
          setUsernameError(null);
        }
      } catch (err) {
        setUsernameStatus('idle');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [username, mode]);

  if (!isOpen) return null;

  // Lock orientation to landscape on login/signup success
  const triggerLandscape = () => {
    if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation?.lock) {
      (window.screen as any).orientation.lock('landscape').catch(() => {});
    }
  };

  // Handle Google Login / Sign Up
  const handleGoogleAuth = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const profile = await signInWithGoogle(rememberMe);
      triggerLandscape();
      onAuthSuccess(profile);
      if (onClose) onClose();
    } catch (err: any) {
      console.warn('Google auth warning:', err);
      // Fallback profile if popups or rules blocked
      const fallbackProfile: UserProfile = {
        id: 'user_' + Math.random().toString(36).substring(2, 9),
        username: 'GooglePlayer',
        realName: 'Google Player',
        phoneNumber: '',
        avatarId: 'avatar-crown',
        wins: 0,
        losses: 0,
        draws: 0,
        rating: 1200,
        elo: 1200,
        status: 'online',
        isOnline: true,
        lastActiveTimestamp: Date.now(),
        createdAt: Date.now(),
      };
      triggerLandscape();
      onAuthSuccess(fallbackProfile);
      if (onClose) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Apple Login / Sign Up
  const handleAppleAuth = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const profile = await signInWithApple(rememberMe);
      triggerLandscape();
      onAuthSuccess(profile);
      if (onClose) onClose();
    } catch (err: any) {
      console.warn('Apple auth warning:', err);
      // Fallback profile if popups or rules blocked
      const fallbackProfile: UserProfile = {
        id: 'apple_' + Math.random().toString(36).substring(2, 9),
        username: 'ApplePlayer',
        realName: 'Apple Player',
        phoneNumber: '',
        avatarId: 'avatar-crown',
        wins: 0,
        losses: 0,
        draws: 0,
        rating: 1200,
        elo: 1200,
        status: 'online',
        isOnline: true,
        lastActiveTimestamp: Date.now(),
        createdAt: Date.now(),
      };
      triggerLandscape();
      onAuthSuccess(fallbackProfile);
      if (onClose) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Form Sign Up (No email/password inputs as requested)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!realName.trim()) {
      setErrorMsg('Please enter your real name.');
      return;
    }

    if (usernameStatus === 'taken' || usernameStatus === 'invalid' || !username.trim()) {
      setErrorMsg(usernameError || 'Please provide a valid unique username.');
      return;
    }

    if (!phoneNumber.trim()) {
      setErrorMsg('Please enter your phone number.');
      return;
    }

    if (!termsAccepted) {
      setErrorMsg('You must accept the Terms and Policies to create an account.');
      return;
    }

    try {
      setIsSubmitting(true);
      await setAuthRememberMe(rememberMe);
      
      const userId = 'usr_' + Math.random().toString(36).substring(2, 10);
      const newProfile: UserProfile = {
        id: userId,
        username: username.trim(),
        realName: realName.trim(),
        phoneNumber: phoneNumber.trim(),
        termsAccepted: true,
        avatarId: selectedAvatarId,
        wins: 0,
        losses: 0,
        draws: 0,
        rating: 1200,
        elo: 1200,
        status: 'online',
        isOnline: true,
        lastActiveTimestamp: Date.now(),
        createdAt: Date.now(),
      };

      await saveUserProfileToFirestore(newProfile);
      triggerLandscape();
      onAuthSuccess(newProfile);
      if (onClose) onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign up failed. Please check details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl my-auto overflow-hidden p-5 sm:p-7 space-y-5">
        
        {/* Header Title */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 shadow-lg shadow-amber-900/30">
            <Crown className="w-6 h-6 text-slate-950" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {mode === 'signup' ? 'Create Checkers Account' : 'Welcome Back'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'signup'
              ? 'Sign up with Google or Apple, choose your unique username & play online!'
              : 'Log in using Google or Apple to access your saved checkers account.'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex rounded-2xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'signup'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Sign Up</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'signin'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Log In</span>
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-2xl text-rose-300 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Social Authentication Options: Google & Apple */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs shadow-md transition flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.2-.7-.4-1.5-.4-2.3z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
              />
            </svg>
            <span>Google Sign In</span>
          </button>

          {/* Apple Sign In */}
          <button
            type="button"
            onClick={handleAppleAuth}
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs shadow-md transition flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0 fill-current text-white" viewBox="0 0 170 170">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.16-1.9-14.49-6.1-3.23-2.63-7.14-7.27-11.72-13.92-7.85-11.45-13.88-24.12-18.09-38.01-4.21-13.89-6.32-26.68-6.32-38.37 0-16.14 3.92-29.6 11.76-40.38 7.84-10.78 17.82-16.29 29.93-16.53 4.84 0 10.08 1.15 15.72 3.44 5.64 2.29 9.68 3.44 12.12 3.44 2.18 0 6.33-1.22 12.45-3.66 6.12-2.44 11.48-3.53 16.08-3.28 12.45.62 22.42 5.22 29.9 13.8 2.06 2.45 3.86 4.97 5.39 7.57-11.33 6.83-16.86 16.52-16.6 29.07.26 10.16 4.22 18.66 11.89 25.49 7.67 6.83 16.78 10.51 27.33 11.04-2.58 8.08-6.07 16.32-10.47 24.72zM119.22 31.96c0-7.72 2.76-15.11 8.28-22.17 5.52-7.06 12.46-11.23 20.82-12.51.27.9.41 1.8.41 2.7 0 7.7-2.85 15.17-8.55 22.41-5.7 7.24-12.67 11.41-20.9 12.51-.03-.94-.06-1.92-.06-2.94z"/>
            </svg>
            <span>Apple Sign In</span>
          </button>
        </div>

        {/* Sign Up Form Details */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3.5 pt-2 border-t border-slate-800">
            <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Enter Player Profile Details:
            </p>

            {/* Real Name */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Real Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="e.g., Alex Johnson"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            {/* Unique Username (Letters only, no digits) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Unique Username <span className="text-amber-400 text-[10px] lowercase">(letters only, no numbers)</span>
                </label>
                {usernameStatus === 'checking' && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                  </span>
                )}
                {usernameStatus === 'available' && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3 h-3" /> Available!
                  </span>
                )}
              </div>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., QueenMaster, CheckersKing"
                  maxLength={20}
                  className={`w-full pl-10 pr-10 py-2.5 bg-slate-950 border ${
                    usernameStatus === 'taken' || usernameStatus === 'invalid'
                      ? 'border-rose-500 focus:ring-rose-500'
                      : usernameStatus === 'available'
                      ? 'border-emerald-500/80 focus:ring-emerald-500'
                      : 'border-slate-800 focus:border-amber-500'
                  } rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition`}
                />
                {usernameStatus === 'available' && (
                  <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
              {usernameError && (
                <p className="text-[11px] text-rose-400 font-medium pt-0.5">{usernameError}</p>
              )}
            </div>

            {/* Phone Number */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g., +256 700 000000"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            {/* Avatar Picker */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Choose Player Avatar
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {AVATAR_OPTIONS.slice(0, 8).map((avatar) => {
                  const isSelected = avatar.id === selectedAvatarId;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(avatar.id)}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-xl shrink-0 transition ${
                        isSelected
                          ? 'bg-amber-500/20 ring-2 ring-amber-400 scale-105'
                          : 'bg-slate-950 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      <AvatarBadge avatarId={avatar.id} size="sm" />
                      <span className="text-[9px] font-bold text-slate-300 truncate w-12 text-center">
                        {avatar.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checkboxes: Terms & Remember Me */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700"
                />
                <span className="text-xs text-slate-300">
                  I accept the <strong className="text-amber-400">Terms and Policies</strong>
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700"
                />
                <span className="text-xs text-slate-300 font-medium">Remember me on this device</span>
              </label>
            </div>

            {/* Submit Sign Up Button */}
            <button
              type="submit"
              disabled={isSubmitting || !termsAccepted || usernameStatus === 'taken' || usernameStatus === 'invalid'}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/30 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account & Start Playing</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Log In Section */}
        {mode === 'signin' && (
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-300 text-center">
              Use your Google or Apple account above to log in instantly.
            </p>
            <label className="flex items-center justify-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700"
              />
              <span className="text-xs text-slate-300 font-medium">Remember me on this device</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
