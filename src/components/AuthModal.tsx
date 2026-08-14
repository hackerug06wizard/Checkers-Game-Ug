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
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import {
  isUsernameTaken,
  registerInAppUser,
  loginWithUsernameOrPhone,
  saveUserProfileToFirestore,
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
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState('avatar-crown');

  // Sign In Field
  const [loginIdentifier, setLoginIdentifier] = useState('');

  // Local saved profile detection for 1-Tap Fast Login
  const [savedUser, setSavedUser] = useState<UserProfile | null>(null);

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // General state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const raw = localStorage.getItem('checkers_user_profile');
      if (raw) {
        setSavedUser(JSON.parse(raw));
      }
    } catch (e) {
      // ignore
    }
  }, [isOpen, initialMode]);

  // Real-time Username Availability Check
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

    if (clean.length < 2 || clean.length > 20) {
      setUsernameStatus('invalid');
      setUsernameError('Username must be 2 to 20 characters long.');
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
        setUsernameStatus('available');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, mode]);

  if (!isOpen) return null;

  // Lock orientation to landscape on mobile
  const triggerLandscape = () => {
    if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation?.lock) {
      try {
        (window.screen as any).orientation.lock('landscape').catch(() => {});
      } catch (e) {
        // ignore
      }
    }
  };

  // Direct In-App Login Handler
  const handleInAppLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const identifier = loginIdentifier.trim();
    if (!identifier) {
      setErrorMsg('Please enter your username or phone number.');
      return;
    }

    try {
      setIsSubmitting(true);
      await setAuthRememberMe(rememberMe);

      // 1. Look up user directly in Firestore
      const profile = await loginWithUsernameOrPhone(identifier);
      if (profile) {
        setSuccessMsg(`Welcome back, ${profile.username}! Logging in...`);
        triggerLandscape();
        setTimeout(() => {
          onAuthSuccess(profile);
          if (onClose) onClose();
        }, 500);
        return;
      }

      // 2. Check local saved profile match
      if (
        savedUser &&
        (savedUser.username.toLowerCase() === identifier.toLowerCase() ||
          savedUser.phoneNumber === identifier)
      ) {
        const updated = { ...savedUser, isOnline: true, lastActiveTimestamp: Date.now() };
        await saveUserProfileToFirestore(updated);
        setSuccessMsg(`Welcome back, ${updated.username}!`);
        triggerLandscape();
        setTimeout(() => {
          onAuthSuccess(updated);
          if (onClose) onClose();
        }, 500);
        return;
      }

      // 3. User not found in Firestore
      setErrorMsg(
        `No account found with username/phone "${identifier}". Please check for typos or sign up with a new profile!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Login failed. Please verify your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick 1-Tap Login
  const handleQuickRestore = async () => {
    if (!savedUser) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const updated = { ...savedUser, isOnline: true, lastActiveTimestamp: Date.now() };
      await saveUserProfileToFirestore(updated);
      triggerLandscape();
      onAuthSuccess(updated);
      if (onClose) onClose();
    } catch (e) {
      triggerLandscape();
      onAuthSuccess(savedUser);
      if (onClose) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct In-App Account Creation Handler
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanRealName = realName.trim();
    const cleanUsername = username.trim();
    const cleanPhone = phoneNumber.trim();

    if (!cleanRealName) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    if (usernameStatus === 'taken' || usernameStatus === 'invalid' || !cleanUsername) {
      setErrorMsg(usernameError || 'Please choose a valid unique username.');
      return;
    }

    if (!cleanPhone) {
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

      // Register directly in Firestore
      const newProfile = await registerInAppUser({
        username: cleanUsername,
        realName: cleanRealName,
        phoneNumber: cleanPhone,
        avatarId: selectedAvatarId,
      });

      setSuccessMsg(`Account created for ${newProfile.username}! Starting arena...`);
      triggerLandscape();

      setTimeout(() => {
        onAuthSuccess(newProfile);
        if (onClose) onClose();
      }, 500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Account creation failed. Please try again.');
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
            {mode === 'signup' ? 'Create Arena Profile' : 'Player In-App Login'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'signup'
              ? 'Sign up directly within the app, pick your avatar & climb real-time leaderboards!'
              : 'Enter your username or phone number to sign in seamlessly.'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex rounded-2xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'signup'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Account</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMsg(null);
            }}
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

        {/* Success Banner */}
        {successMsg && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-2xl text-rose-300 text-xs font-semibold flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Quick In-App Restore Banner if Local User Exists */}
        {savedUser && (
          <div className="p-3 bg-slate-950 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              <AvatarBadge avatarId={savedUser.avatarId} size="sm" />
              <div className="truncate">
                <div className="text-xs font-black text-amber-400 truncate">{savedUser.username}</div>
                <div className="text-[10px] text-slate-400">
                  {savedUser.rating || 1200} ELO • Saved account
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleQuickRestore}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 transition shadow flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>1-Tap Play</span>
            </button>
          </div>
        )}

        {/* In-App Log In Form */}
        {mode === 'signin' && (
          <form onSubmit={handleInAppLogin} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Username or Phone Number
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="e.g., CheckersMaster or +256700000000"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700"
              />
              <span className="text-xs text-slate-300 font-medium">Keep me logged in on this device</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !loginIdentifier.trim()}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/30 transition transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Log In to Arena</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* In-App Sign Up Form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3.5 pt-1">
            {/* Real Name */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Full Name
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
                    <CheckCircle2 className="w-3 h-3" /> Available in Firestore!
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
                {AVATAR_OPTIONS.map((avatar) => {
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

        <div className="pt-2 text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Real-time Cloud Sync with Firebase Firestore Backend</span>
        </div>
      </div>
    </div>
  );
};
