import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDJjPexEMLjq5_NjMbpCzxvKeYnAtEf2h4',
  authDomain: 'class-20261016.firebaseapp.com',
  projectId: 'class-20261016',
  storageBucket: 'class-20261016.firebasestorage.app',
  messagingSenderId: '813757781225',
  appId: '1:813757781225:web:928166f9944a1090564c78',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const observeAuthState = callback => onAuthStateChanged(auth, callback);
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signOutUser = () => signOut(auth);

export function authErrorMessage(error) {
  const messages = {
    'auth/popup-blocked': '瀏覽器封鎖了登入視窗，請允許彈出視窗後再試一次。',
    'auth/popup-closed-by-user': '登入視窗已關閉，尚未完成登入。',
    'auth/cancelled-popup-request': '登入流程已取消，請再試一次。',
    'auth/unauthorized-domain': '這個網站網域尚未獲 Firebase 授權，請聯絡管理者。',
    'auth/operation-not-allowed': 'Firebase 專案尚未啟用 Google 登入。',
    'auth/network-request-failed': '網路連線失敗，請檢查網路後再試。',
  };
  return messages[error?.code] || '目前無法完成登入，請稍後再試。';
}
