// ============================================================
//  CaturKu - Firebase Module
//  Auth (Google Login) + Progress Sync + Multiplayer Rooms
// ============================================================
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc,
  updateDoc, onSnapshot, arrayUnion, serverTimestamp,
} from 'firebase/firestore';

// Config dari console.firebase.google.com
const firebaseConfig = {
  apiKey: "AIzaSyDWQb144m75YEGQ42ZF5ibbQFhniQLz_18",
  authDomain: "caturku-b3519.firebaseapp.com",
  projectId: "caturku-b3519",
  storageBucket: "caturku-b3519.firebasestorage.app",
  messagingSenderId: "981336561508",
  appId: "1:981336561508:web:31bcd250bc0005b9328c71",
  measurementId: "G-QTM4F68R0E"
};

// -- Init ------------------------------------------------------
const CONFIGURED = firebaseConfig.apiKey !== "YOUR_API_KEY";
let auth = null, db = null;

if (CONFIGURED) {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);
  } catch (e) {
    console.error('Firebase init gagal:', e);
  }
}

export { auth, db, CONFIGURED };

// -- Auth ------------------------------------------------------
export function onAuthChange(cb) {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}

export async function loginGoogle() {
  if (!auth) throw new Error('Firebase belum dikonfigurasi — isi firebaseConfig di firebase.js');
  const provider = new GoogleAuthProvider();
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export async function logoutUser() {
  if (auth) await signOut(auth);
}

// -- Progress cloud sync ---------------------------------------
export async function saveProgressCloud(uid, progress) {
  if (!db || !uid) return;
  try {
    await setDoc(doc(db, 'users', uid), { progress }, { merge: true });
  } catch (_) {}
}

export async function loadProgressCloud(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data().progress : null;
  } catch (_) { return null; }
}

// -- Multiplayer Rooms -----------------------------------------
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ232456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export async function createRoom(user, hostColor) {
  if (!db) throw new Error('Firebase belum dikonfigurasi');
  let code;
  for (let i = 0; i < 10; i++) {
    code = makeCode();
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) break;
  }
  await setDoc(doc(db, 'rooms', code), {
    host:      { uid: user.uid, name: user.displayName || 'Player', photo: user.photoURL || null },
    guest:     null,
    hostColor, // 'w' atau 'b' - warna bidak yang dimainkan host
    moves:     [], // array { from, to, promotion, san }
    status:    'waiting', // 'waiting' | 'playing' | 'ended'
    result:    null, // null | 'w' | 'b' | 'draw' | 'abandoned'
    createdAt: serverTimestamp(),
  });
  return code;
}

export async function joinRoom(rawCode, user) {
  if (!db) throw new Error('Firebase belum dikonfigurasi');
  const code = rawCode.toUpperCase().trim();
  const ref  = doc(db, 'rooms', code);
  const snap = await getDoc(ref);
  if (!snap.exists())           throw new Error('Kode room tidak ditemukan');
  const data = snap.data();
  if (data.host.uid === user.uid) throw new Error('Ini room kamu sendiri!');
  if (data.guest)                 throw new Error('Room sudah penuh');
  if (data.status !== 'waiting')  throw new Error('Room tidak tersedia');
  await updateDoc(ref, {
    guest:  { uid: user.uid, name: user.displayName || 'Player', photo: user.photoURL || null },
    status: 'playing',
  });
  return { code, ...data };
}

export function subscribeRoom(code, cb) {
  if (!db) return () => {};
  return onSnapshot(doc(db, 'rooms', code), snap => {
    if (snap.exists()) cb({ code: snap.id, ...snap.data() });
  });
}

export async function pushMove(code, move) {
  if (!db) return;
  await updateDoc(doc(db, 'rooms', code), { moves: arrayUnion(move) });
}

export async function finishRoom(code, result) {
  if (!db) return;
  try { await updateDoc(doc(db, 'rooms', code), { status: 'ended', result }); } catch (_) {}
}

export async function abandonRoom(code) {
  if (!db) return;
  try { await updateDoc(doc(db, 'rooms', code), { status: 'ended', result: 'abandoned' }); } catch (_) {}
}
