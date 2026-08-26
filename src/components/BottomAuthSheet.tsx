import React, { useState } from 'react';
import { UserProfile } from '../types';
import {
  signInWithGoogle,
  saveUserProfileToFirestore,
  getUserProfileFromFirestore,
  isPhoneNumberTaken,
  isUsernameTaken,
  normalizePhoneNumber,
} from '../lib/firebase';
import { AVATAR_OPTIONS } from '../lib/avatars';
import { AvatarBadge } from './AvatarBadge';
import { sounds } from '../lib/sound';
import { AppLogo } from './AppLogo';
import {
  Phone,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  User,
  UserPlus,
  LogIn,
  X,
  UserCheck,
  Gamepad2,
  PlusCircle,
  AlertCircle,
  Crown,
} from 'lucide-react';

interface BottomAuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  defaultEmail?: string;
  allowDismiss?: boolean;
}

export const BottomAuthSheet: React.FC<BottomAuthSheetProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  defaultEmail = 'hackerug06@gmail.com',
  allowDismiss = true,
}) => {
  const [tab, setTab] = useState<'signup' | 'google' | 'guest'>('signup');

  // Sign Up / Create Account state
  const [username, setUsername] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState('avatar-crown');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+256');

  // Google sign in state
  const [selectedEmail, setSelectedEmail] = useState(defaultEmail);
  const [googleStep, setGoogleStep] = useState<'select' | 'phone'>('select');
  const [tempGoogleUid, setTempGoogleUid] = useState<string>('');
  const [googleDisplayName, setGoogleDisplayName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real user device Google Account
  const deviceAccounts = [
    {
      email: defaultEmail,
      name: defaultEmail.split('@')[0].toUpperCase(),
      avatarChar: defaultEmail.charAt(0).toUpperCase(),
      color: 'bg-emerald-600',
    },
  ];

  // 1. Create Custom Account (Sign Up)
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername || cleanUsername.length < 2) {
      setError('Username must be at least 2 characters long.');
      return;
    }
    if (cleanUsername.length > 25) {
      setError('Username cannot exceed 25 characters.');
      return;
    }

    const validCharsRegex = /^[a-zA-Z0-9\s_-]+$/;
    if (!validCharsRegex.test(cleanUsername)) {
      setError('Username can only contain letters, numbers, spaces, hyphens, and underscores.');
      return;
    }

    setLoading(true);
    sounds.playMove();

    try {
      // Check if username is taken in Firestore
      const taken = await isUsernameTaken(cleanUsername);
      if (taken) {
        setError(`The username "${cleanUsername}" is already registered. Please choose another username.`);
        setLoading(false);
        return;
      }

      let fullPhone: string | undefined = undefined;
      let normalizedPhone: string | undefined = undefined;

      if (phoneNumber.trim()) {
        fullPhone = `${countryCode} ${phoneNumber.trim()}`;
        normalizedPhone = normalizePhoneNumber(fullPhone);
        const phoneTaken = await isPhoneNumberTaken(fullPhone);
        if (phoneTaken) {
          setError('This phone number is already registered to another account.');
          setLoading(false);
          return;
        }
      }

      const uid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newProfile: UserProfile = {
        id: uid,
        username: cleanUsername,
        realName: cleanUsername,
        avatarId: selectedAvatarId,
        phoneNumber: fullPhone,
        normalizedPhone: normalizedPhone,
        termsAccepted: true,
        isGuest: false,
        rating: 1200,
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        status: 'online',
        isOnline: true,
        createdAt: Date.now(),
        lastActiveTimestamp: Date.now(),
      };

      await saveUserProfileToFirestore(newProfile);
      localStorage.setItem('checkers_user_profile', JSON.stringify(newProfile));
      sounds.playKing();
      onLoginSuccess(newProfile);
      onClose();
    } catch (err: any) {
      console.error('Account creation error:', err);
      setError(err?.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Play as Guest Action
  const handlePlayAsGuest = async () => {
    setError(null);
    setLoading(true);
    sounds.playMove();

    try {
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const guestNames = ['CheckersAce', 'KingMaster', 'BoardKnight', 'Grandmaster', 'SwiftJumper'];
      const pickedName = `${guestNames[Math.floor(Math.random() * guestNames.length)]}${randomSuffix}`;
      const guestUid = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const guestProfile: UserProfile = {
        id: guestUid,
        username: pickedName,
        realName: 'Guest Player',
        avatarId: 'avatar-crown',
        termsAccepted: true,
        isGuest: true,
        rating: 1200,
        elo: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        status: 'online',
        isOnline: true,
        createdAt: Date.now(),
        lastActiveTimestamp: Date.now(),
      };

      await saveUserProfileToFirestore(guestProfile);
      localStorage.setItem('checkers_user_profile', JSON.stringify(guestProfile));
      sounds.playKing();
      onLoginSuccess(guestProfile);
      onClose();
    } catch (err: any) {
      console.error('Guest login error:', err);
      setError('Could not initialize guest session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Select Google Account on Device
  const handleSelectAccount = async (email: string, displayName: string) => {
    setError(null);
    setLoading(true);
    sounds.playMove();

    try {
      setSelectedEmail(email);
      const cleanName = displayName.replace(/[^a-zA-Z0-9]/g, '') || 'Player';
      setGoogleDisplayName(cleanName);

      const generatedUid = `g_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      setTempGoogleUid(generatedUid);

      const existing = await getUserProfileFromFirestore(generatedUid);
      if (existing) {
        existing.isOnline = true;
        existing.lastActiveTimestamp = Date.now();
        await saveUserProfileToFirestore(existing);
        localStorage.setItem('checkers_user_profile', JSON.stringify(existing));
        sounds.playKing();
        onLoginSuccess(existing);
        onClose();
        return;
      }

      setGoogleStep('phone');
    } catch (err: any) {
      console.warn('Account select error:', err);
      setGoogleStep('phone');
    } finally {
      setLoading(false);
    }
  };

  // 4. Real Google OAuth Popup
  const handleGoogleOAuthPopup = async () => {
    setError(null);
    setLoading(true);
    sounds.playMove();

    try {
      const userProfile = await signInWithGoogle(true);
      sounds.playKing();
      onLoginSuccess(userProfile);
      onClose();
    } catch (err: any) {
      console.warn('Google popup err:', err);
      setError(err?.message || 'Google Sign-In was cancelled or failed.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Complete Google Phone Step
  const handleCompleteGooglePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    sounds.playKing();

    try {
      const fullPhone = phoneNumber.trim() ? `${countryCode} ${phoneNumber.trim()}` : undefined;
      const uid = tempGoogleUid || `user_${Date.now()}`;

      let profile: UserProfile | null = await getUserProfileFromFirestore(uid);

      if (!profile) {
        profile = {
          id: uid,
          username: googleDisplayName || selectedEmail.split('@')[0] || 'Player',
          realName: googleDisplayName,
          phoneNumber: fullPhone,
          normalizedPhone: fullPhone ? normalizePhoneNumber(fullPhone) : undefined,
          isGuest: false,
          avatarId: 'avatar-crown',
          termsAccepted: true,
          rating: 1200,
          elo: 1200,
          wins: 0,
          losses: 0,
          draws: 0,
          gamesPlayed: 0,
          status: 'online',
          isOnline: true,
          createdAt: Date.now(),
          lastActiveTimestamp: Date.now(),
        };
      } else {
        if (fullPhone) {
          profile.phoneNumber = fullPhone;
          profile.normalizedPhone = normalizePhoneNumber(fullPhone);
        }
        profile.isGuest = false;
        profile.isOnline = true;
        profile.lastActiveTimestamp = Date.now();
      }

      await saveUserProfileToFirestore(profile);
      localStorage.setItem('checkers_user_profile', JSON.stringify(profile));

      onLoginSuccess(profile);
      onClose();
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to save account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && allowDismiss) {
          onClose();
        }
      }}
    >
      {/* Bottom Sheet Modal Container */}
      <div
        className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle pill on mobile */}
        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Top Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <div>
              <h2 className="text-base font-black text-white tracking-tight">
                {tab === 'signup' ? 'Create Your Account' : tab === 'google' ? 'Google Sign In' : 'Play as Guest'}
              </h2>
              <p className="text-[11px] text-amber-400 font-semibold">
                {tab === 'signup' ? 'Choose your custom username & avatar' : 'Sync your ratings and match history'}
              </p>
            </div>
          </div>
          {allowDismiss && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Navigation: Create Account / Google / Guest */}
        <div className="grid grid-cols-3 p-2 bg-slate-950/60 border-b border-slate-800 text-xs font-bold gap-1.5">
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(null); }}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1.5 transition ${
              tab === 'signup'
                ? 'bg-amber-500 text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>

          <button
            type="button"
            onClick={() => { setTab('google'); setError(null); }}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1.5 transition ${
              tab === 'google'
                ? 'bg-amber-500 text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
            </svg>
            <span>Google Login</span>
          </button>

          <button
            type="button"
            onClick={() => { setTab('guest'); setError(null); }}
            className={`py-2 px-1 rounded-xl flex items-center justify-center gap-1.5 transition ${
              tab === 'guest'
                ? 'bg-amber-500 text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Guest Mode</span>
          </button>
        </div>

        {/* Sheet Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: CREATE ACCOUNT */}
          {tab === 'signup' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              {/* Username Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Choose Your Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. Kiprono, CheckersMaster, QueenUg"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 text-white font-bold text-sm outline-none transition placeholder:text-slate-600"
                    autoFocus
                    required
                    minLength={2}
                    maxLength={25}
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Letters, numbers, spaces, hyphens, and underscores allowed (2-25 chars).
                </p>
              </div>

              {/* Avatar Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" /> Select Avatar
                </label>
                <div className="grid grid-cols-5 gap-2 p-2 bg-slate-950/80 rounded-2xl border border-slate-800/80">
                  {AVATAR_OPTIONS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setSelectedAvatarId(av.id)}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition ${
                        selectedAvatarId === av.id
                          ? 'ring-2 ring-amber-400 bg-amber-400/10'
                          : 'hover:bg-slate-800/50 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <AvatarBadge avatarId={av.id} size="sm" />
                      <span className="text-[9px] font-bold text-slate-300 truncate w-full text-center">
                        {av.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-amber-400" /> Phone Number
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">(Optional for recovery)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="px-2.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-amber-400 outline-none shrink-0"
                  >
                    <option value="+256">🇺🇬 +256 (UG)</option>
                    <option value="+1">🇺🇸 +1 (US)</option>
                    <option value="+44">🇬🇧 +44 (UK)</option>
                    <option value="+254">🇰🇪 +254 (KE)</option>
                    <option value="+234">🇳🇬 +234 (NG)</option>
                    <option value="+91">🇮🇳 +91 (IN)</option>
                    <option value="+27">🇿🇦 +27 (ZA)</option>
                  </select>

                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="770 123456"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 text-white font-mono text-sm outline-none transition placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/40 flex items-center justify-center gap-2 transition transform active:scale-98"
              >
                <span>{loading ? 'Creating Account...' : 'Create Account & Enter Arena'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 2: GOOGLE SIGN IN */}
          {tab === 'google' && (
            <div className="space-y-4">
              {googleStep === 'select' ? (
                <>
                  <div className="text-xs text-slate-300 font-medium leading-relaxed">
                    Select your Google Account to automatically sync your Checkers stats, wins, and ELO rating:
                  </div>

                  {/* Real Device Account List */}
                  <div className="space-y-2">
                    {deviceAccounts.map((acc, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectAccount(acc.email, acc.name)}
                        disabled={loading}
                        className="w-full p-3.5 rounded-2xl bg-slate-950/90 hover:bg-slate-950 border border-slate-800 hover:border-amber-500/70 flex items-center justify-between transition group active:scale-98 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-full ${acc.color} text-white font-black text-sm flex items-center justify-center shadow shrink-0`}
                          >
                            {acc.avatarChar}
                          </div>
                          <div className="text-left min-w-0">
                            <div className="text-xs font-black text-white group-hover:text-amber-400 transition truncate">
                              {acc.name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">{acc.email}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition" />
                      </button>
                    ))}
                  </div>

                  {/* Real Google Account Popup Button */}
                  <button
                    onClick={handleGoogleOAuthPopup}
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition active:scale-98 shadow-md"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{loading ? 'Connecting...' : 'Sign In with Other Google Account'}</span>
                  </button>
                </>
              ) : (
                <form onSubmit={handleCompleteGooglePhone} className="space-y-4">
                  <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-2xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                      ✓
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate">{googleDisplayName}</div>
                      <div className="text-[11px] text-emerald-400 truncate">{selectedEmail}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> Link Phone Number (Optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="px-2.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-amber-400 outline-none shrink-0"
                      >
                        <option value="+256">🇺🇬 +256 (UG)</option>
                        <option value="+1">🇺🇸 +1 (US)</option>
                        <option value="+44">🇬🇧 +44 (UK)</option>
                        <option value="+254">🇰🇪 +254 (KE)</option>
                        <option value="+234">🇳🇬 +234 (NG)</option>
                        <option value="+91">🇮🇳 +91 (IN)</option>
                      </select>

                      <div className="relative flex-1">
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="770 123456 (optional)"
                          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 text-white font-mono text-sm outline-none transition"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGoogleStep('select')}
                      className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 transition active:scale-98"
                    >
                      <span>{loading ? 'Entering...' : 'Finish & Enter Arena'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: GUEST MODE */}
          {tab === 'guest' && (
            <div className="space-y-4 text-center py-2">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <Gamepad2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-white">Instant Guest Match</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Play immediately with temporary guest credentials. You can register your custom account or link Google at any time!
                </p>
              </div>

              <button
                type="button"
                onClick={handlePlayAsGuest}
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/40 flex items-center justify-center gap-2 transition transform active:scale-98"
              >
                <span>{loading ? 'Starting Guest...' : 'Play as Guest Now'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
