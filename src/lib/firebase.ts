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
  deleteDoc,
  collection,
  query,
  where,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { UserProfile, Challenge, GameRoom, ChatMessage, GamePlayer } from '../types';
import { createInitialBoard } from './checkersEngine';

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

// Normalize phone number for consistent uniqueness matching (removes spaces, dashes, parentheses)
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)\.]/g, '').trim();
}

// Check if a phone number is already registered to another account
export async function isPhoneNumberTaken(phoneNumber: string, excludeUid?: string): Promise<boolean> {
  try {
    const clean = normalizePhoneNumber(phoneNumber);
    if (!clean || clean.length < 6) return false;

    const usersRef = collection(db, 'users');
    
    // 1. Query by normalizedPhone
    const qNorm = query(usersRef, where('normalizedPhone', '==', clean));
    const snapNorm = await getDocs(qNorm);
    if (!snapNorm.empty) {
      for (const docSnap of snapNorm.docs) {
        if (!excludeUid || docSnap.id !== excludeUid) {
          return true;
        }
      }
    }

    // 2. Query by raw phoneNumber as well
    const qRaw = query(usersRef, where('phoneNumber', '==', phoneNumber.trim()));
    const snapRaw = await getDocs(qRaw);
    if (!snapRaw.empty) {
      for (const docSnap of snapRaw.docs) {
        if (!excludeUid || docSnap.id !== excludeUid) {
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.warn('Firestore isPhoneNumberTaken query error:', err);
    return false;
  }
}

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
    const cleanPhone = profile.phoneNumber ? profile.phoneNumber.trim() : '';
    const normPhone = normalizePhoneNumber(cleanPhone);
    const isGuestUser = Boolean(profile.isGuest || profile.id.startsWith('guest_'));

    const dataToSave = {
      ...profile,
      phoneNumber: cleanPhone,
      normalizedPhone: normPhone,
      isGuest: isGuestUser,
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

// Delete a guest player's data from Firestore immediately
export async function deleteGuestPlayerFromFirestore(guestId: string): Promise<void> {
  try {
    if (!guestId || (!guestId.startsWith('guest_') && !guestId.includes('guest'))) return;
    const userRef = doc(db, 'users', guestId);
    await deleteDoc(userRef);
    console.log(`[Firestore] Guest player ${guestId} data cleared on exit.`);
  } catch (err) {
    console.warn('deleteGuestPlayerFromFirestore warning:', err);
  }
}

// Clean up all guest player accounts from Firestore database
export async function cleanUpAllGuestPlayersFromFirestore(): Promise<number> {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    let deletedCount = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data() as UserProfile;
      const isGuest =
        data.isGuest ||
        docSnap.id.startsWith('guest_') ||
        (data.username && data.username.toLowerCase().startsWith('guest'));

      if (isGuest) {
        await deleteDoc(docSnap.ref);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`[Firestore] Cleaned up ${deletedCount} guest player records from database.`);
    }
    return deletedCount;
  } catch (err) {
    console.warn('cleanUpAllGuestPlayersFromFirestore error:', err);
    return 0;
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
    normalizedPhone: normalizePhoneNumber(user.phoneNumber || ''),
    isGuest: false,
    avatarId: 'avatar-crown',
    termsAccepted: true,
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

// Google Sign In (Configured with prompt: 'select_account' to show ALL accounts on device)
export async function signInWithGoogle(rememberMe: boolean = true): Promise<UserProfile> {
  await setAuthRememberMe(rememberMe);
  const provider = new GoogleAuthProvider();
  // Ensure the account selector is ALWAYS displayed so the user can choose from all device accounts
  provider.setCustomParameters({
    prompt: 'select_account',
  });

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

  localStorage.setItem('checkers_user_profile', JSON.stringify(existingProfile));
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

  localStorage.setItem('checkers_user_profile', JSON.stringify(existingProfile));
  return existingProfile;
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

  const cleanPhone = params.phoneNumber ? params.phoneNumber.trim() : '';
  if (cleanPhone) {
    const phoneTaken = await isPhoneNumberTaken(cleanPhone);
    if (phoneTaken) {
      throw new Error('This phone number is already registered with another account. Please use a different phone number.');
    }
  }

  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const newProfile: UserProfile = {
    id: userId,
    username: cleanUsername,
    realName: params.realName.trim(),
    phoneNumber: cleanPhone,
    normalizedPhone: normalizePhoneNumber(cleanPhone),
    isGuest: false,
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

// Subscribe to Realtime Online Users in Firestore (Real-Time Only)
export function subscribeToOnlineUsers(callback: (users: UserProfile[]) => void) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, limit(100));
    return onSnapshot(q, (snapshot) => {
      const active: UserProfile[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data && data.id && data.username) {
          // Strictly check real-time active heartbeat (within past 60s) and isOnline flag
          const isRecentlyActive = !!data.lastActiveTimestamp && (now - data.lastActiveTimestamp < 60000);
          if (data.isOnline === true && isRecentlyActive) {
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

// Mark user offline in Firestore
export async function setUserOfflineInFirestore(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isOnline: false,
      lastActiveTimestamp: Date.now(),
    });
  } catch (e) {
    // ignore
  }
}

// ==========================================
// REAL-TIME FIRESTORE CHALLENGE SYSTEM
// ==========================================

export async function sendChallengeToFirestore(
  fromUser: UserProfile,
  toUser: UserProfile,
  customChallengeId?: string
): Promise<string> {
  const challengeId = customChallengeId || `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const challengeDoc = doc(db, 'challenges', challengeId);
  const challengeData = {
    id: challengeId,
    fromUser,
    toUser,
    targetUserId: toUser.id,
    status: 'pending',
    createdAt: Date.now(),
  };
  await setDoc(challengeDoc, challengeData);
  console.log(`[Firestore] Challenge created ${challengeId} from ${fromUser.username} to ${toUser.username}`);
  return challengeId;
}

export function subscribeToIncomingChallenges(userId: string, callback: (challenge: Challenge | null) => void) {
  try {
    const q = query(
      collection(db, 'challenges'),
      where('targetUserId', '==', userId),
      where('status', '==', 'pending'),
      limit(5)
    );
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Find most recent valid pending challenge
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as Challenge;
          if (Date.now() - (data.createdAt || 0) < 120000 && data.status === 'pending') {
            callback(data);
            return;
          }
        }
      }
      callback(null);
    });
  } catch (err) {
    console.warn('subscribeToIncomingChallenges error:', err);
    return () => {};
  }
}

export function subscribeToChallengeDoc(challengeId: string, callback: (challenge: any) => void) {
  try {
    const challengeRef = doc(db, 'challenges', challengeId);
    return onSnapshot(challengeRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      }
    });
  } catch (err) {
    console.warn('subscribeToChallengeDoc error:', err);
    return () => {};
  }
}

export async function respondToChallengeInFirestore(
  challengeId: string,
  accept: boolean,
  fromUser: UserProfile,
  toUser: UserProfile,
  existingRoomId?: string
): Promise<{ roomId: string; room: GameRoom } | null> {
  try {
    const challengeRef = doc(db, 'challenges', challengeId);
    if (!accept) {
      await updateDoc(challengeRef, { status: 'declined' });
      return null;
    }

    const roomId = existingRoomId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isFromRed = Math.random() < 0.5;

    const redPlayer: GamePlayer = {
      id: isFromRed ? fromUser.id : toUser.id,
      username: isFromRed ? fromUser.username : toUser.username,
      avatarId: isFromRed ? fromUser.avatarId : toUser.avatarId,
      rating: isFromRed ? fromUser.rating || 1200 : toUser.rating || 1200,
      color: 'red',
    };

    const blackPlayer: GamePlayer = {
      id: isFromRed ? toUser.id : fromUser.id,
      username: isFromRed ? toUser.username : fromUser.username,
      avatarId: isFromRed ? toUser.avatarId : fromUser.avatarId,
      rating: isFromRed ? toUser.rating || 1200 : fromUser.rating || 1200,
      color: 'black',
    };

    const newRoom: GameRoom = {
      id: roomId,
      name: `${redPlayer.username} vs ${blackPlayer.username}`,
      status: 'playing',
      redPlayer,
      blackPlayer,
      currentTurn: 'red',
      board: createInitialBoard(),
      history: [],
      capturedRed: 0,
      capturedBlack: 0,
      winner: null,
      createdAt: Date.now(),
      lastMoveTimestamp: Date.now(),
      turnTimeLimitSeconds: 45,
      turnDeadline: Date.now() + 45000,
      spectatorsCount: 0,
    };

    await saveGameRoomToFirestore(newRoom);
    await setDoc(challengeRef, { status: 'accepted', roomId, room: newRoom }, { merge: true });
    return { roomId, room: newRoom };
  } catch (e) {
    console.error('respondToChallengeInFirestore error:', e);
    return null;
  }
}

// ==========================================
// REAL-TIME FIRESTORE GAME ROOM & CHAT
// ==========================================

export async function saveGameRoomToFirestore(room: GameRoom): Promise<void> {
  try {
    const roomRef = doc(db, 'rooms', room.id);
    await setDoc(roomRef, room, { merge: true });
  } catch (e) {
    console.warn('saveGameRoomToFirestore error:', e);
  }
}

export async function deleteGameRoomFromFirestore(roomId: string): Promise<void> {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    await deleteDoc(roomRef);
    console.log(`[Firestore] Game table room ${roomId} deleted.`);
  } catch (e) {
    console.warn('deleteGameRoomFromFirestore error:', e);
  }
}

export function subscribeToAllGameRooms(callback: (rooms: GameRoom[]) => void) {
  try {
    const q = query(collection(db, 'rooms'), limit(30));
    return onSnapshot(q, (snapshot) => {
      const rooms: GameRoom[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as GameRoom;
        if (data && (data.status === 'waiting' || data.status === 'playing')) {
          rooms.push(data);
        }
      });
      rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(rooms);
    });
  } catch (e) {
    console.warn('subscribeToAllGameRooms error:', e);
    return () => {};
  }
}

export function subscribeToGameRoom(roomId: string, callback: (room: GameRoom | null) => void) {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    return onSnapshot(roomRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data() as GameRoom);
      }
    });
  } catch (e) {
    console.warn('subscribeToGameRoom error:', e);
    return () => {};
  }
}

export async function sendGameChatToFirestore(roomId: string, message: ChatMessage): Promise<void> {
  try {
    const msgRef = doc(db, 'rooms', roomId, 'messages', message.id);
    await setDoc(msgRef, message);
  } catch (e) {
    console.warn('sendGameChatToFirestore error:', e);
  }
}

export function subscribeToGameChat(roomId: string, callback: (messages: ChatMessage[]) => void) {
  try {
    const q = query(collection(db, 'rooms', roomId, 'messages'), limit(50));
    return onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        msgs.push(docSnap.data() as ChatMessage);
      });
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
    });
  } catch (e) {
    console.warn('subscribeToGameChat error:', e);
    return () => {};
  }
}

// ==========================================
// DELETE ACCOUNT
// ==========================================

export async function deleteUserAccount(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  } catch (e) {
    console.warn('deleteDoc user error:', e);
  }

  if (auth.currentUser) {
    try {
      await auth.currentUser.delete();
    } catch (e) {
      // ignore
    }
  }

  localStorage.removeItem('checkers_user_profile');
  await signOut(auth);
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


