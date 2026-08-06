import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { UserProfile } from '../types';

// Web App's Firebase Configuration (read from environment variables or fallback to defaults)
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEzDbBHKvmL0qg19CnvCCRZsYwx03NlTc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "checkers-game-ug.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "checkers-game-ug",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "checkers-game-ug.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "726155928996",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:726155928996:web:4e4cd4d3160e2fd5514d31"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Check if username is already taken by another user
export async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  try {
    const normalized = username.trim().toLowerCase();
    const q = query(collection(db, 'users'), where('usernameLowercase', '==', normalized));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) return false;
    if (excludeUid && querySnap.docs.length === 1 && querySnap.docs[0].id === excludeUid) {
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Firestore isUsernameTaken query skipped due to rules/network:', err);
    return false;
  }
}

// Save or Update User Profile in Firestore
export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  try {
    const userRef = doc(db, 'users', profile.id);
    const dataToSave = {
      ...profile,
      usernameLowercase: profile.username.toLowerCase(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, dataToSave, { merge: true });
  } catch (err) {
    console.warn('Firestore setDoc warning (saving profile locally):', err);
  }
}

// Fetch User Profile from Firestore
export async function getUserProfileFromFirestore(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (err) {
    console.warn('Firestore getDoc warning:', err);
  }
  return null;
}

// Configure Auth Persistence
export async function setAuthRememberMe(remember: boolean): Promise<void> {
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) {
    console.warn('Auth persistence warning:', e);
  }
}

// Helper to construct profile object from Firebase User
function createProfileFromFirebaseUser(user: any): UserProfile {
  const baseName = (user.displayName || user.email?.split('@')[0] || 'Player')
    .replace(/[^a-zA-Z]/g, '');
  const cleanUsername = baseName || 'MasterPlayer';

  return {
    id: user.uid,
    username: cleanUsername,
    realName: user.displayName || cleanUsername,
    phoneNumber: user.phoneNumber || '',
    avatarId: 'avatar-crown',
    elo: 1200,
    rating: 1200,
    status: 'online',
    createdAt: Date.now(),
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    isOnline: true,
    lastActiveTimestamp: Date.now(),
  };
}

// Google Sign In
export async function signInWithGoogle(rememberMe: boolean = true): Promise<UserProfile> {
  await setAuthRememberMe(rememberMe);
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  let existingProfile = await getUserProfileFromFirestore(user.uid);
  if (!existingProfile) {
    existingProfile = createProfileFromFirebaseUser(user);
    await saveUserProfileToFirestore(existingProfile);
  } else {
    existingProfile.isOnline = true;
    existingProfile.lastActiveTimestamp = Date.now();
    await saveUserProfileToFirestore(existingProfile);
  }

  return existingProfile;
}

// Apple Sign In
export async function signInWithApple(rememberMe: boolean = true): Promise<UserProfile> {
  await setAuthRememberMe(rememberMe);
  const provider = new OAuthProvider('apple.com');
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  let existingProfile = await getUserProfileFromFirestore(user.uid);
  if (!existingProfile) {
    existingProfile = createProfileFromFirebaseUser(user);
    await saveUserProfileToFirestore(existingProfile);
  } else {
    existingProfile.isOnline = true;
    existingProfile.lastActiveTimestamp = Date.now();
    await saveUserProfileToFirestore(existingProfile);
  }

  return existingProfile;
}

// Logout
export async function logOutUser(): Promise<void> {
  if (auth.currentUser) {
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { isOnline: false, lastActiveTimestamp: Date.now() });
    } catch (e) {
      // ignore
    }
  }
  await signOut(auth);
}
