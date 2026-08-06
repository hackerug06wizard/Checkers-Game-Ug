import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  User as FirebaseUser,
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
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { UserProfile } from '../types';

// Web App's Firebase Configuration provided by user
export const firebaseConfig = {
  apiKey: "AIzaSyCEzDbBHKvmL0qg19CnvCCRZsYwx03NlTc",
  authDomain: "checkers-game-ug.firebaseapp.com",
  projectId: "checkers-game-ug",
  storageBucket: "checkers-game-ug.firebasestorage.app",
  messagingSenderId: "726155928996",
  appId: "1:726155928996:web:4e4cd4d3160e2fd5514d31"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Check if username is already taken by another user
export async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  const q = query(collection(db, 'users'), where('usernameLowercase', '==', normalized));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) return false;
  if (excludeUid && querySnap.docs.length === 1 && querySnap.docs[0].id === excludeUid) {
    return false;
  }
  return true;
}

// Save or Update User Profile in Firestore
export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  const userRef = doc(db, 'users', profile.id);
  const dataToSave = {
    ...profile,
    usernameLowercase: profile.username.toLowerCase(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(userRef, dataToSave, { merge: true });
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
    console.error('Error getting profile from Firestore:', err);
  }
  return null;
}

// Configure Auth Persistence
export async function setAuthRememberMe(remember: boolean): Promise<void> {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

// Google Sign In
export async function signInWithGoogle(rememberMe: boolean = true): Promise<UserProfile> {
  await setAuthRememberMe(rememberMe);
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  // Check if profile exists
  let existingProfile = await getUserProfileFromFirestore(user.uid);
  if (!existingProfile) {
    // Generate clean unique username from email/displayName
    const baseName = (user.displayName || user.email?.split('@')[0] || 'Player')
      .replace(/[^a-zA-Z]/g, '');
    let cleanUsername = baseName || 'MasterPlayer';
    
    let isTaken = await isUsernameTaken(cleanUsername);
    let attempts = 1;
    while (isTaken) {
      // Append letter variations if taken
      cleanUsername = `${baseName}User${attempts}`;
      isTaken = await isUsernameTaken(cleanUsername);
      attempts++;
    }

    existingProfile = {
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

    await saveUserProfileToFirestore(existingProfile);
  } else {
    // Update online status
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
