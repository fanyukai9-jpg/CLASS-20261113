const DATA_KEY = 'dayflow.data.v1';
const UI_KEY = 'dayflow.ui.v1';
const MIGRATION_OWNER_KEY = 'dayflow.data.migration-owner.v1';
const VERSION = 1;
function makeSeedData() {
  return {
    version: VERSION,
    tasks: [], projects: [], lists: [], goals: [], habits: [], focusSessions: [],
    settings: { theme: 'system', accent: '#48515b', compact: false, weekStartsMonday: true, hour24: true, defaultPriority: 'p3' },
  };
}

function normalizeData(value) {
  const seed = makeSeedData();
  if (!value || typeof value !== 'object') return seed;
  return {
    version: VERSION,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(task => ({ ...task })) : [],
    projects: Array.isArray(value.projects) ? value.projects : [],
    lists: Array.isArray(value.lists) ? value.lists : [],
    goals: Array.isArray(value.goals) ? value.goals : [],
    habits: Array.isArray(value.habits) ? value.habits : [],
    focusSessions: Array.isArray(value.focusSessions) ? value.focusSessions : [],
    settings: { ...seed.settings, ...(value.settings && typeof value.settings === 'object' ? value.settings : {}) },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch (error) {
    console.warn('DAYFLOW 資料讀取失敗，已建立空白資料。', error);
  }
  const seed = makeSeedData();
  try { localStorage.setItem(DATA_KEY, JSON.stringify(seed)); } catch (error) { console.warn('DAYFLOW 無法儲存資料。', error); }
  return seed;
}

let activeUserId = '';
const scopedKey = key => activeUserId ? `${key}.user.${activeUserId}` : key;
let data = loadData();
let uiState = (() => {
  try { return { collapsed: false, route: 'today', ...(JSON.parse(localStorage.getItem(UI_KEY) || '{}')) }; }
  catch { return { collapsed: false, route: 'today' }; }
})();

export function getData() { return data; }
export function getUIState() { return uiState; }

export function activateUserScope(userId) {
  const nextUserId = String(userId || '');
  if (activeUserId === nextUserId) return data;
  activeUserId = nextUserId;
  if (!activeUserId) return data;

  const userDataKey = scopedKey(DATA_KEY);
  const userUiKey = scopedKey(UI_KEY);
  const savedUserData = localStorage.getItem(userDataKey);
  const migrationOwner = localStorage.getItem(MIGRATION_OWNER_KEY);
  if (savedUserData) {
    try { data = normalizeData(JSON.parse(savedUserData)); }
    catch { data = makeSeedData(); }
  } else if (!migrationOwner) {
    // Keep the existing browser's local-first data for the first account that signs in.
    data = loadData();
    localStorage.setItem(userDataKey, JSON.stringify(data));
    localStorage.setItem(MIGRATION_OWNER_KEY, activeUserId);
  } else {
    data = makeSeedData();
    localStorage.setItem(userDataKey, JSON.stringify(data));
  }

  try {
    const savedUiState = localStorage.getItem(userUiKey);
    uiState = { collapsed: false, route: 'today', ...(savedUiState ? JSON.parse(savedUiState) : {}) };
  } catch { uiState = { collapsed: false, route: 'today' }; }
  return data;
}

export function replaceCloudData(value) {
  data = normalizeData(value);
  try { localStorage.setItem(scopedKey(DATA_KEY), JSON.stringify(data)); } catch { /* The cloud remains the source of truth. */ }
  window.dispatchEvent(new CustomEvent('dayflow:data', { detail: { data, remote: true } }));
  return data;
}

export function saveData(next) {
  data = normalizeData(next);
  try { localStorage.setItem(scopedKey(DATA_KEY), JSON.stringify(data)); }
  catch (error) { console.error('DAYFLOW 無法儲存資料。', error); }
  window.dispatchEvent(new CustomEvent('dayflow:data', { detail: { data, remote: false } }));
  return data;
}

export function updateData(updater) {
  const next = structuredClone(data);
  updater(next);
  return saveData(next);
}

export function updateUI(updater) {
  uiState = { ...uiState, ...updater };
  try { localStorage.setItem(scopedKey(UI_KEY), JSON.stringify(uiState)); } catch { /* UI preferences are optional. */ }
  return uiState;
}

export function newId(prefix = 'item') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function createTask(input = {}) {
  const now = new Date().toISOString();
  return {
    id: newId('task'), title: String(input.title || '').trim(), description: input.description || '',
    status: input.status || 'todo', priority: input.priority ?? data.settings.defaultPriority ?? 'p3',
    dueDate: input.dueDate || '', startTime: input.startTime || '', notes: input.notes || '',
    estimateMinutes: Number.isInteger(Number(input.estimateMinutes)) && Number(input.estimateMinutes) >= 1 && Number(input.estimateMinutes) <= 720 ? Number(input.estimateMinutes) : '',
    createdAt: now, completedAt: input.status === 'completed' ? now : '',
    sortOrder: Date.now(), demo: false,
  };
}

export function importData(value) {
  if (!value || !Array.isArray(value.tasks) || !Array.isArray(value.habits)) {
    throw new Error('檔案格式不正確，請選擇 DAYFLOW 匯出的 JSON。');
  }
  return saveData(normalizeData(value));
}

export function exportData() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}
