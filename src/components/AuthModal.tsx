import React, { useState, useEffect } from 'react';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { AvatarBadge } from './AvatarBadge';
import {
  User,
  Mail,
  Lock,
  Phone,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Crown,
  Sparkles,
  Smartphone,
  CheckSquare,
  Square,
  LogIn,
  UserPlus,
  Loader2,
} from 'lucide-react';
import {
  auth,
  isUsernameTaken,
  saveUserProfileToFirestore,
  signInWithGoogle,
  setAuthRememberMe,
} from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
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
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState('avatar-crown');

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Sign In Fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
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
      setUsernameError('Usernames cannot contain digits (0-9). Letters only.');
      return;
    }

    if (clean.length < 3 || clean.length > 20) {
      setUsernameStatus('invalid');
      setUsernameError('Username must be 3-20 characters.');
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

  // Handle Google Login
  const handleGoogleAuth = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const profile = await signInWithGoogle(rememberMe);
      onAuthSuccess(profile);
      if (onClose) onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google Authentication failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Sign Up
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

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!phoneNumber.trim()) {
      setErrorMsg('Please enter your phone number.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (!termsAccepted) {
      setErrorMsg('You must accept the Terms & Policies to create an account.');
      return;
    }

    try {
      setIsSubmitting(true);
      await setAuthRememberMe(rememberMe);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      
      const newProfile: UserProfile = {
        id: cred.user.uid,
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
      onAuthSuccess(newProfile);
      if (onClose) onClose();
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('An account with this email already exists. Try signing in!');
      } else {
        setErrorMsg(err?.message || 'Sign up failed. Please check details.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!loginEmail.trim() || !loginPassword) {
      setErrorMsg('Please provide email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await setAuthRememberMe(rememberMe);
      const cred = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      
      let profile = await import('../lib/firebase').then(m => m.getUserProfileFromFirestore(cred.user.uid));
      if (!profile) {
        profile = {
          id: cred.user.uid,
          username: cred.user.email?.split('@')[0] || 'Player',
          avatarId: 'avatar-crown',
          wins: 0,
          losses: 0,
          draws: 0,
          rating: 1200,
          status: 'online',
          createdAt: Date.now(),
        };
        await saveUserProfileToFirestore(profile);
      } else {
        profile.isOnline = true;
        profile.lastActiveTimestamp = Date.now();
        await saveUserProfileToFirestore(profile);
      }

      onAuthSuccess(profile);
      if (onClose) onClose();
    } catch (err: any) {
      setErrorMsg('Invalid email or password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl my-8 overflow-hidden p-6 sm:p-8 space-y-6">
        
        {/* Header Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 shadow-lg shadow-amber-900/30">
            <Crown className="w-6 h-6 text-slate-950" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            {mode === 'signup' ? 'Create Your Account' : 'Welcome Back'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            {mode === 'signup'
              ? 'Join online checkers, save your progress & challenge real players!'
              : 'Sign in to access your game stats, rating, and active matches.'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex rounded-2xl bg-slate-950 p-1.5 border border-slate-800">
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

        {/* Google Quick Login Button */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={isSubmitting}
          className="w-full py-3 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs shadow-md transition flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-800 w-full"></div>
          <span className="bg-slate-900 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 absolute">
            Or with email
          </span>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-950/80 border border-rose-800 rounded-2xl text-rose-300 text-xs font-semibold flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Sign Up Form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
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
                  placeholder="e.g., John Doe"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            {/* Unique Username */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Username <span className="text-amber-400 text-[10px] lowercase">(no digits, must be unique)</span>
                </label>
                {usernameStatus === 'checking' && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                  </span>
                )}
                {usernameStatus === 'available' && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3 h-3" /> Unique & Available!
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
                  placeholder="e.g., QueenAura, CheckersKing"
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

            {/* Email */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., player@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
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

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            {/* Avatar Picker */}
            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Pick Your Avatar
              </label>
              <div className="flex gap-2.5 overflow-x-auto pb-1 custom-scrollbar">
                {AVATAR_OPTIONS.slice(0, 8).map((avatar) => {
                  const isSelected = avatar.id === selectedAvatarId;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(avatar.id)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl shrink-0 transition ${
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
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
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
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/30 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>Create Account & Start Playing</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Log In Form */}
        {mode === 'signin' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email / Username */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Enter your registered email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-slate-100 placeholder-slate-600 text-xs font-semibold transition"
                />
              </div>
            </div>

            {/* Remember Me */}
            <div className="pt-1">
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

            {/* Submit Log In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/30 transition transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Log In To Your Account</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
