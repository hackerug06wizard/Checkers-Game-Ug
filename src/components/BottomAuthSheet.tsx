import React, { useState } from 'react';
import { UserProfile } from '../types';
import {
  signInWithGoogle,
  saveUserProfileToFirestore,
  getUserProfileFromFirestore,
} from '../lib/firebase';
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
  X,
  UserCheck,
  Gamepad2,
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
  allowDismiss = false,
}) => {
  const [step, setStep] = useState<'select_email' | 'phone_number'>('select_email');
  const [selectedEmail, setSelectedEmail] = useState(defaultEmail);
  const [selectedName, setSelectedName] = useState(
    defaultEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'Player'
  );
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+256');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempUid, setTempUid] = useState<string>(
    () => `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  );

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

  // 1. Play as Guest Action
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

  // 2. Select Google Account on Device
  const handleSelectAccount = async (email: string, displayName: string) => {
    setError(null);
    setLoading(true);
    sounds.playMove();

    try {
      setSelectedEmail(email);
      const cleanName = displayName.replace(/[^a-zA-Z0-9]/g, '') || 'Player';
      setSelectedName(cleanName);

      // Check if user profile already exists in Firestore for this email/uid
      const generatedUid = `g_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      setTempUid(generatedUid);

      const existing = await getUserProfileFromFirestore(generatedUid);
      if (existing && existing.phoneNumber) {
        existing.isOnline = true;
        existing.lastActiveTimestamp = Date.now();
        await saveUserProfileToFirestore(existing);
        localStorage.setItem('checkers_user_profile', JSON.stringify(existing));
        sounds.playKing();
        onLoginSuccess(existing);
        onClose();
        return;
      }

      // Transition to phone number step
      setStep('phone_number');
    } catch (err: any) {
      console.warn('Account select error:', err);
      setStep('phone_number');
    } finally {
      setLoading(false);
    }
  };

  // 3. Real Google OAuth Popup
  const handleGoogleOAuthPopup = async () => {
    setError(null);
    setLoading(true);
    sounds.playMove();

    try {
      const userProfile = await signInWithGoogle(true);
      if (userProfile.phoneNumber) {
        sounds.playKing();
        onLoginSuccess(userProfile);
        onClose();
      } else {
        setSelectedEmail(userProfile.username + '@gmail.com');
        setSelectedName(userProfile.username);
        setTempUid(userProfile.id);
        setStep('phone_number');
      }
    } catch (err: any) {
      console.warn('Google popup err:', err);
      setStep('phone_number');
    } finally {
      setLoading(false);
    }
  };

  // 4. Complete Phone Number Registration
  const handleCompletePhoneRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim() || phoneNumber.trim().length < 6) {
      setError('Please enter a valid phone number (at least 6 digits)');
      return;
    }

    setLoading(true);
    setError(null);
    sounds.playKing();

    try {
      const fullPhone = `${countryCode} ${phoneNumber.trim()}`;
      const uid = tempUid || `user_${Date.now()}`;

      let profile: UserProfile | null = await getUserProfileFromFirestore(uid);

      if (!profile) {
        profile = {
          id: uid,
          username: selectedName || selectedEmail.split('@')[0] || 'Player',
          realName: selectedName,
          phoneNumber: fullPhone,
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
        profile.phoneNumber = fullPhone;
        profile.isOnline = true;
        profile.lastActiveTimestamp = Date.now();
      }

      await saveUserProfileToFirestore(profile);
      localStorage.setItem('checkers_user_profile', JSON.stringify(profile));

      onLoginSuccess(profile);
      onClose();
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to save phone number. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none"
      onClick={(e) => {
        // Prevent accidental closing if clicking background unless allowDismiss is true
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
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <div>
              <h2 className="text-base font-black text-white tracking-tight">
                {step === 'select_email' ? 'Sign In to Checkers Arena' : 'Add Phone Number'}
              </h2>
              <p className="text-[11px] text-amber-400 font-semibold">
                {step === 'select_email' ? 'Choose Google account or Play as Guest' : 'Security & player identity'}
              </p>
            </div>
          </div>
          {allowDismiss && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sheet Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* STEP 1: Select Email / Google Account OR Play as Guest */}
          {step === 'select_email' && (
            <div className="space-y-3.5">
              <div className="text-xs text-slate-300 font-medium leading-relaxed">
                Choose your Google Account to sync rating and stats, or jump in as a Guest:
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
                className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs flex items-center justify-center gap-2.5 transition active:scale-98 shadow-md"
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
                <span>{loading ? 'Connecting...' : 'Sign In with Google Account'}</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-1.5 text-slate-600 text-xs">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[11px] font-bold text-slate-500">OR QUICK START</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {/* PLAY AS GUEST BUTTON */}
              <button
                onClick={handlePlayAsGuest}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-slate-800 via-slate-750 to-slate-800 hover:from-amber-600/30 hover:to-amber-500/20 border border-slate-700 hover:border-amber-400 text-amber-300 hover:text-amber-200 font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition active:scale-98 shadow-md"
              >
                <Gamepad2 className="w-4 h-4 text-amber-400" />
                <span>Play Instantly as Guest</span>
              </button>
            </div>
          )}

          {/* STEP 2: Add Phone Number */}
          {step === 'phone_number' && (
            <form onSubmit={handleCompletePhoneRegistration} className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                  ✓
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-200 truncate">{selectedName}</div>
                  <div className="text-[11px] text-emerald-400 truncate">{selectedEmail}</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Enter Phone Number
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
                    <option value="+27">🇿🇦 +27 (ZA)</option>
                  </select>

                  <div className="relative flex-1">
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="770 123456"
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 text-white font-mono text-sm outline-none transition"
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Your phone number will be securely linked to your Checkers Arena account for matchmaking.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('select_email')}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
                >
                  Back
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 transition active:scale-98"
                >
                  <span>{loading ? 'Adding Account...' : 'Finish & Enter Arena'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={handlePlayAsGuest}
                  className="text-xs text-slate-400 hover:text-amber-400 underline transition"
                >
                  Or skip and play as guest
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
