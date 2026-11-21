import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { firebaseApp } from './auth.js';
import { getData, replaceCloudData } from './data.js';

const db = getFirestore(firebaseApp);
const MAX_DOCUMENT_BYTES = 850_000;
let activeUid = '';
let documentRef = null;
let stopSnapshot = null;
let dataListener = null;
let writeTimer = 0;
let statusListener = () => {};
let lastSavedJson = '';

function notifyStatus(status) {
  statusListener(status);
  window.dispatchEvent(new CustomEvent('dayflow:sync-status', { detail: status }));
}

function makeEnvelope(uid, payload) {
  return { uid, schemaVersion: 1, updatedAt: Date.now(), payload };
}

function isPayload(value) {
  return value && typeof value === 'object' && value.version === 1 &&
    Array.isArray(value.tasks) && Array.isArray(value.projects) &&
    Array.isArray(value.lists) && Array.isArray(value.goals) &&
    Array.isArray(value.habits) && Array.isArray(value.focusSessions) &&
    value.settings && typeof value.settings === 'object';
}

function checkSize(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > MAX_DOCUMENT_BYTES) {
    const error = new Error('資料量已超過單份 Firestore 文件的安全上限。請先匯出備份，再整理舊任務或附件後重試同步。');
    error.code = 'dayflow/document-too-large';
    throw error;
  }
}

async function writeCurrentData() {
  if (!activeUid || !documentRef) return;
  const uid = activeUid;
  const payload = getData();
  checkSize(payload);
  const json = JSON.stringify(payload);
  if (json === lastSavedJson) { notifyStatus('synced'); return; }
  await setDoc(documentRef, makeEnvelope(uid, payload));
  if (activeUid !== uid) return;
  lastSavedJson = json;
  notifyStatus('synced');
}

function handleLocalDataChange(event) {
  if (!activeUid || event.detail?.remote || !documentRef) return;
  const uid = activeUid;
  const payload = event.detail?.data || getData();
  if (JSON.stringify(payload) === lastSavedJson) return;
  clearTimeout(writeTimer);
  notifyStatus('saving');
  writeTimer = window.setTimeout(() => {
    if (activeUid !== uid) return;
    writeCurrentData().catch(error => {
      console.error('DAYFLOW Firestore 同步失敗。', error);
      notifyStatus('error');
    });
  }, 450);
}

export async function startCloudSync(uid, onStatus = () => {}) {
  stopCloudSync();
  activeUid = uid;
  statusListener = onStatus;
  documentRef = doc(db, 'users', uid, 'dayflow', 'main');
  lastSavedJson = '';
  notifyStatus('syncing');

  try {
    const snapshot = await getDoc(documentRef);
    if (activeUid !== uid) return;
    if (!snapshot.exists()) {
      notifyStatus('local-only');
      return { needsInitialUpload: true };
    }
    const envelope = snapshot.data();
    if (envelope.uid !== uid || !isPayload(envelope.payload)) throw new Error('Cloud document is not a valid DAYFLOW record.');
    replaceCloudData(envelope.payload);
    lastSavedJson = JSON.stringify(envelope.payload);
    notifyStatus('synced');
  } catch (error) {
    console.error('DAYFLOW 初始 Firestore 同步失敗。', error);
    if (activeUid === uid) notifyStatus('error');
    return { error };
  }

  if (activeUid !== uid) return;
  attachUserSync(uid);
  return { needsInitialUpload: false };
}

function attachUserSync(uid) {
  if (activeUid !== uid || !documentRef) return;
  dataListener = handleLocalDataChange;
  window.addEventListener('dayflow:data', dataListener);
  stopSnapshot = onSnapshot(documentRef, snapshot => {
    if (activeUid !== uid || snapshot.metadata.hasPendingWrites || !snapshot.exists()) return;
    const envelope = snapshot.data();
    if (envelope.uid !== uid || !isPayload(envelope.payload)) {
      notifyStatus('error');
      return;
    }
    const nextJson = JSON.stringify(envelope.payload);
    if (nextJson !== JSON.stringify(getData())) replaceCloudData(envelope.payload);
    lastSavedJson = nextJson;
    notifyStatus('synced');
  }, error => {
    console.error('DAYFLOW Firestore listener failed.', error);
    if (activeUid === uid) notifyStatus('error');
  });
}

export async function enableInitialUpload(uid) {
  if (activeUid !== uid || !documentRef) return;
  notifyStatus('saving');
  const initial = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(documentRef);
    if (snapshot.exists()) {
      const envelope = snapshot.data();
      if (envelope.uid !== uid || !isPayload(envelope.payload)) throw new Error('Cloud document is not a valid DAYFLOW record.');
      return { source: 'cloud', payload: envelope.payload };
    }
    const payload = getData();
    checkSize(payload);
    transaction.set(documentRef, makeEnvelope(uid, payload));
    return { source: 'local', payload };
  });
  if (activeUid !== uid) return;
  if (initial.source === 'cloud') replaceCloudData(initial.payload);
  lastSavedJson = JSON.stringify(initial.payload);
  notifyStatus('synced');
  attachUserSync(uid);
}

export function stopCloudSync() {
  clearTimeout(writeTimer);
  writeTimer = 0;
  stopSnapshot?.();
  stopSnapshot = null;
  if (dataListener) window.removeEventListener('dayflow:data', dataListener);
  dataListener = null;
  activeUid = '';
  documentRef = null;
  lastSavedJson = '';
  statusListener = () => {};
}
