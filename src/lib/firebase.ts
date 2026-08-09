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
  initializeFirestore,
  memoryLocalCache,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  limit,
  orderBy,
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

let firestoreDb: any;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

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

// Fetch Top Leaderboard Entries from Firestore
export async function getLeaderboardFromFirestore(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const list: UserProfile[] = [];
    snap.forEach((docSnap) => {
      list.push(docSnap.data() as UserProfile);
    });
    // Sort by rating descending
    list.sort((a, b) => (b.rating || b.elo || 1200) - (a.rating || a.elo || 1200));
    return list.slice(0, 50);
  } catch (err) {
    console.warn('Firestore leaderboard fetch warning:', err);
    return [];
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

// Lookup or login by username or phone number directly in-app
export async function loginWithUsernameOrPhone(identifier: string): Promise<UserProfile | null> {
  try {
    const clean = identifier.trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();
    const usersRef = collection(db, 'users');

    // Query by username lowercase or phone number
    const qUser = query(usersRef, where('usernameLowercase', '==', lower));
    let snap = await getDocs(qUser);

    if (snap.empty) {
      const qPhone = query(usersRef, where('phoneNumber', '==', clean));
      snap = await getDocs(qPhone);
    }

    if (!snap.empty) {
      const userDoc = snap.docs[0];
      const profile = userDoc.data() as UserProfile;
      profile.isOnline = true;
      profile.lastActiveTimestamp = Date.now();
      await saveUserProfileToFirestore(profile);
      return profile;
    }
  } catch (err) {
    console.warn('In-app login lookup error:', err);
  }
  return null;
}

// Subscribe to Realtime Online Users in Firestore
export function subscribeToOnlineUsers(callback: (users: UserProfile[]) => void) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, limit(50));
    return onSnapshot(q, (snapshot) => {
      const active: UserProfile[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data && data.username) {
          // Consider user online if active within last 4 minutes
          const isRecentlyActive = !data.lastActiveTimestamp || (now - data.lastActiveTimestamp < 240000);
          if (data.isOnline !== false && isRecentlyActive) {
            active.push(data);
          }
        }
      });
      callback(active);
    }, (err) => {
      console.warn('Realtime online users listener fallback:', err);
    });
  } catch (err) {
    console.warn('Realtime listener failed:', err);
    return () => {};
  }
}

// Update presence heartbeat in Firestore
export async function updatePresenceHeartbeat(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isOnline: true,
      lastActiveTimestamp: Date.now(),
    });
  } catch (e) {
    // ignore
  }
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
