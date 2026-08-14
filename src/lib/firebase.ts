import { initializeApp } from 'firebase/app';
import {
  getAuth,
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
} from 'firebase/firestore';
import { UserProfile } from '../types';

// Web App's Firebase Configuration
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBGLFB8enRtpk9LXDzxJQZtz9iM_L-LEkY",
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

// Check if username is already taken by another user in Firestore
export async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  try {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return false;
    const q = query(collection(db, 'users'), where('usernameLowercase', '==', normalized));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) return false;
    if (excludeUid && querySnap.docs.length === 1 && querySnap.docs[0].id === excludeUid) {
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Firestore isUsernameTaken query fallback:', err);
    return false;
  }
}

// Save or Update User Profile in Firestore
export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  try {
    const userRef = doc(db, 'users', profile.id);
    const dataToSave = {
      ...profile,
      usernameLowercase: (profile.username || '').toLowerCase(),
      isOnline: profile.isOnline ?? true,
      lastActiveTimestamp: Date.now(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, dataToSave, { merge: true });
    console.log(`[Firestore] Profile saved successfully for ${profile.username} (${profile.id})`);
  } catch (err) {
    console.error('Firestore saveUserProfileToFirestore error:', err);
    throw err;
  }
}

// Register a new user in-app directly into Firestore
export async function registerInAppUser(params: {
  username: string;
  realName: string;
  phoneNumber: string;
  avatarId: string;
}): Promise<UserProfile> {
  const cleanUsername = params.username.trim();
  const taken = await isUsernameTaken(cleanUsername);
  if (taken) {
    throw new Error('This username is already taken. Please choose another username.');
  }

  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const newProfile: UserProfile = {
    id: userId,
    username: cleanUsername,
    realName: params.realName.trim(),
    phoneNumber: params.phoneNumber.trim(),
    avatarId: params.avatarId || 'avatar-crown',
    termsAccepted: true,
    wins: 0,
    losses: 0,
    draws: 0,
    gamesPlayed: 0,
    rating: 1200,
    elo: 1200,
    status: 'online',
    isOnline: true,
    lastActiveTimestamp: Date.now(),
    createdAt: Date.now(),
  };

  await saveUserProfileToFirestore(newProfile);
  localStorage.setItem('checkers_user_profile', JSON.stringify(newProfile));
  return newProfile;
}

// Direct In-App User Login by Username or Phone Number from Firestore
export async function loginWithUsernameOrPhone(identifier: string): Promise<UserProfile | null> {
  try {
    const clean = identifier.trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();
    const usersRef = collection(db, 'users');

    // 1. Query by lowercase username
    const qUser = query(usersRef, where('usernameLowercase', '==', lower));
    let snap = await getDocs(qUser);

    // 2. Query by phone number if not found
    if (snap.empty) {
      const qPhone = query(usersRef, where('phoneNumber', '==', clean));
      snap = await getDocs(qPhone);
    }

    if (!snap.empty) {
      const userDoc = snap.docs[0];
      const profile = userDoc.data() as UserProfile;
      const updatedProfile: UserProfile = {
        ...profile,
        status: 'online',
        isOnline: true,
        lastActiveTimestamp: Date.now(),
      };
      await saveUserProfileToFirestore(updatedProfile);
      localStorage.setItem('checkers_user_profile', JSON.stringify(updatedProfile));
      return updatedProfile;
    }
  } catch (err) {
    console.error('In-app login lookup error:', err);
    throw err;
  }
  return null;
}

// Fetch Top Leaderboard Entries from Firestore
export async function getLeaderboardFromFirestore(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const list: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const u = docSnap.data() as UserProfile;
      if (u && u.username) {
        list.push(u);
      }
    });
    // Sort by rating descending
    list.sort((a, b) => (b.rating || b.elo || 1200) - (a.rating || a.elo || 1200));
    return list.slice(0, 50);
  } catch (err) {
    console.warn('Firestore leaderboard fetch warning:', err);
    return [];
  }
}

// Subscribe to Realtime Leaderboard from Firestore
export function subscribeToLeaderboard(callback: (leaderboard: UserProfile[]) => void) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, limit(100));
    return onSnapshot(q, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data && data.username) {
          list.push(data);
        }
      });
      list.sort((a, b) => (b.rating || b.elo || 1200) - (a.rating || a.elo || 1200));
      callback(list);
    }, (err) => {
      console.warn('Realtime leaderboard listener warning:', err);
    });
  } catch (err) {
    console.warn('Realtime leaderboard listener failed:', err);
    return () => {};
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

// Subscribe to Realtime Online Users in Firestore
export function subscribeToOnlineUsers(callback: (users: UserProfile[]) => void) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, limit(100));
    return onSnapshot(q, (snapshot) => {
      const active: UserProfile[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data && data.username) {
          // Consider user online if active within last 5 minutes
          const isRecentlyActive = !data.lastActiveTimestamp || (now - data.lastActiveTimestamp < 300000);
          if (data.isOnline !== false && isRecentlyActive) {
            active.push(data);
          }
        }
      });
      callback(active);
    }, (err) => {
      console.warn('Realtime online users listener warning:', err);
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
    // If document doesn't exist or offline, ignore heartbeat error
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
  try {
    const raw = localStorage.getItem('checkers_user_profile');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.id) {
        const userRef = doc(db, 'users', user.id);
        await updateDoc(userRef, { isOnline: false, lastActiveTimestamp: Date.now() });
      }
    }
  } catch (e) {
    // ignore
  }
  localStorage.removeItem('checkers_user_profile');
  await signOut(auth);
}

