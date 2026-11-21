import { addDays, dateKey, DAY } from './dates.js';

const DATA_KEY = 'dayflow.data.v1';
const UI_KEY = 'dayflow.ui.v1';
const MIGRATION_OWNER_KEY = 'dayflow.data.migration-owner.v1';
const VERSION = 1;
const DEFAULT_LISTS = [
  { id: 'list-inbox', name: '待整理', color: '#9299a5', system: true },
  { id: 'list-work', name: '工作', color: '#6574b8', system: true },
  { id: 'list-personal', name: '個人', color: '#5b9279', system: true },
];

function makeSeedData() {
  const today = dateKey();
  const day = offset => dateKey(addDays(today, offset));
  const projects = [
    { id: 'project-work', name: '工作專案', description: '把重要工作一步一步完成。', color: '#6574b8', icon: 'briefcase', deadline: day(14), createdAt: new Date().toISOString(), demo: true },
    { id: 'project-life', name: '生活整理', description: '照顧日常，也照顧自己。', color: '#5b9279', icon: 'leaf', deadline: '', createdAt: new Date().toISOString(), demo: true },
    { id: 'project-study', name: '持續學習', description: '留一點時間給好奇心。', color: '#bb8752', icon: 'book', deadline: day(30), createdAt: new Date().toISOString(), demo: true },
  ];
  const task = (id, title, offset, priority, projectId, startTime, tags, subtasks = []) => ({
    id, title, description: '', status: 'todo', priority, dueDate: offset === null ? '' : day(offset), startTime,
    endTime: '', estimatedDuration: 30, projectId, tags, subtasks: subtasks.map((name, index) => ({ id: `${id}-sub-${index}`, title: name, done: index === 0 })),
    notes: '', recurrence: 'none', createdAt: new Date(Date.now() - 86400000).toISOString(), completedAt: '', sortOrder: Date.now() + Math.random(), demo: true,
  });
  return {
    version: VERSION,
    tasks: [
      task('demo-1', '整理本週工作重點', 0, 'p2', 'project-work', '09:30', ['規劃'], ['確認本週目標', '整理待辦']),
      task('demo-2', '回覆設計合作信件', 0, 'p3', 'project-work', '11:00', ['溝通']),
      task('demo-3', '下班後買些水果', 0, 'p4', 'project-life', '', ['生活']),
      task('demo-4', '準備團隊提案初稿', 1, 'p1', 'project-work', '14:00', ['提案', '重要'], ['整理資料', '完成簡報']),
      task('demo-5', '安排週末散步路線', 2, 'p4', 'project-life', '', ['休息']),
      task('demo-6', '閱讀產品設計章節', 3, 'p3', 'project-study', '20:00', ['閱讀']),
      task('demo-7', '整理雲端資料夾', null, 'p3', '', '', ['收集箱']),
      task('demo-8', '更新個人作品集', 5, 'p2', 'project-study', '', ['作品集']),
      task('demo-9', '完成採訪問題清單', -1, 'p2', 'project-work', '', ['訪談']),
      { ...task('demo-10', '記錄本月靈感', -2, 'p3', 'project-study', '', ['靈感']), status: 'completed', completedAt: new Date().toISOString() },
    ],
    projects,
    habits: [
      { id: 'habit-water', name: '喝足水分', description: '一天補充 8 杯水。', icon: 'drop', color: '#668dbb', frequency: [1, 2, 3, 4, 5, 6, 0], target: 1, logs: { [today]: true }, createdAt: new Date().toISOString(), demo: true },
      { id: 'habit-read', name: '閱讀 20 分鐘', description: '每天讀一點，慢慢累積。', icon: 'book', color: '#b88a55', frequency: [1, 2, 3, 4, 5, 6, 0], target: 1, logs: {}, createdAt: new Date().toISOString(), demo: true },
      { id: 'habit-walk', name: '出門走走', description: '讓身體活動一下。', icon: 'walk', color: '#5b9279', frequency: [1, 3, 5], target: 1, logs: {}, createdAt: new Date().toISOString(), demo: true },
      { id: 'habit-journal', name: '寫下今日回顧', description: '記下一件值得感謝的事。', icon: 'pen', color: '#9574ad', frequency: [1, 2, 3, 4, 5, 6, 0], target: 1, logs: {}, createdAt: new Date().toISOString(), demo: true },
      { id: 'habit-stretch', name: '伸展肩頸', description: '適時放鬆，保持舒服姿勢。', icon: 'spark', color: '#c17d6b', frequency: [1, 2, 3, 4, 5], target: 1, logs: {}, createdAt: new Date().toISOString(), demo: true },
    ],
    focusSessions: [
      { id: 'focus-demo-1', date: day(-1), minutes: 25, taskId: 'demo-10', createdAt: new Date(Date.now() - DAY).toISOString(), demo: true },
      { id: 'focus-demo-2', date: day(-2), minutes: 50, taskId: 'demo-6', createdAt: new Date(Date.now() - 2 * DAY).toISOString(), demo: true },
    ],
    settings: { theme: 'system', accent: '#6674b8', compact: false, weekStartsMonday: true, hour24: true, defaultPriority: 'p3' },
  };
}

function normalizeData(value) {
  const seed = makeSeedData();
  if (!value || typeof value !== 'object') return seed;
  return {
    version: VERSION,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(task => ({ ...task, listId: String(task.listId || '') })) : [],
    projects: Array.isArray(value.projects) ? value.projects : [],
    lists: Array.isArray(value.lists) ? value.lists : structuredClone(DEFAULT_LISTS),
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
    console.warn('DAYFLOW 資料讀取失敗，已載入示範資料。', error);
  }
  const seed = makeSeedData();
  try { localStorage.setItem(DATA_KEY, JSON.stringify(seed)); } catch (error) { console.warn('DAYFLOW 無法儲存示範資料。', error); }
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
    dueDate: input.dueDate || '', startTime: input.startTime || '', endTime: input.endTime || '', listId: input.listId || '',
    estimatedDuration: Number(input.estimatedDuration) || 25, projectId: input.projectId || '',
    tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    subtasks: Array.isArray(input.subtasks) ? input.subtasks : [], notes: input.notes || '',
    recurrence: input.recurrence || 'none', createdAt: now, completedAt: input.status === 'completed' ? now : '',
    sortOrder: Date.now(), demo: false,
  };
}

export function clearDemoData() {
  updateData(next => {
    next.tasks = next.tasks.filter(item => !item.demo);
    next.habits = next.habits.filter(item => !item.demo);
    next.focusSessions = next.focusSessions.filter(item => !item.demo);
    const usedProjects = new Set(next.tasks.map(item => item.projectId).filter(Boolean));
    next.projects = next.projects.filter(item => !item.demo || usedProjects.has(item.id));
  });
}

export function resetDemoData() {
  const current = data;
  const demo = makeSeedData();
  const keep = list => current[list].filter(item => !item.demo);
  demo.tasks.push(...keep('tasks'));
  demo.habits.push(...keep('habits'));
  demo.focusSessions.push(...keep('focusSessions'));
  demo.projects = [...demo.projects, ...current.projects.filter(item => !item.demo)];
  demo.lists = current.lists?.length ? current.lists : structuredClone(DEFAULT_LISTS);
  demo.goals = current.goals || [];
  return saveData(demo);
}

export function clearAllData() {
  const next = makeSeedData();
  next.tasks = [];
  next.projects = [];
  next.habits = [];
  next.focusSessions = [];
  return saveData(next);
}

export function importData(value) {
  if (!value || !Array.isArray(value.tasks) || !Array.isArray(value.projects) || !Array.isArray(value.habits)) {
    throw new Error('檔案格式不正確，請選擇 DAYFLOW 匯出的 JSON。');
  }
  return saveData(normalizeData(value));
}

export function exportData() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}
