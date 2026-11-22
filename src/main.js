import { addDays, dateKey, formatDate, formatTime, parseDate, parseQuickDate } from './dates.js';
import { activateUserScope, createTask, exportData, getData, getUIState, importData, newId, updateData, updateUI } from './data.js';
import { icon, renderTaskForm } from './components.js';
import { renderPage } from './pages.js';
import { createHomeLayouts, defaultHomeLayouts, defaultWidget, renderWidgetPicker, WIDGET_REGISTRY } from './widgets.js';
import { confirmDialog, escapeHTML, openDialog, toast } from './ui.js';
import { askDayflowAI, buildAIContext, getAIStatus, validateAIAction } from './ai.js?v=dayflow-ai-lite-1';

const app = document.getElementById('app');
const dialogRoot = document.getElementById('dialog-root');
let authClient = null;
let authUser = null;
let authReady = false;
let authBusy = false;
let authError = '';
let authLoadError = false;
let cloudClient = null;
let cloudSyncStatus = 'syncing';
const appStorageKey = key => authUser?.uid ? `${key}.user.${authUser.uid}` : key;
const validRoutes = new Set(['today', 'calendar', 'habits', 'focus', 'settings', 'search']);
let focus = loadFocus();
let route = location.hash.replace(/^#\/?/, '').split('?')[0] || getUIState().route || 'today';
if (!validRoutes.has(route)) {
  route = 'today';
  if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}#today`);
}
let calendarDate = dateKey();
let taskSort = 'time';
let taskStatusFilter = 'all';
let query = '';
let draggedTaskId = '';
let draggedWidgetId = '';
let widgetResizeStart = null;
let widgetPointerStart = null;
let widgetPressTimer = 0;
let widgetDragSession = null;
let layoutUndo = null;
let suppressWidgetResizeClickUntil = 0;
let filterRenderTimer;
let homeDate = dateKey();
let observedToday = homeDate;
let homeCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
let drawerOpen = false;
let homeEditMode = false;
let homeTransitionDirection = 0;
let layoutPreviewDevice = null;
let homeLayouts = loadHomeLayouts();
let homeLayout = homeLayouts[activeLayoutDevice()];
let aiMessages = loadAIMessages();
let aiPanelContext = { route: 'global', taskId: '', habitId: '' };
let aiBusy = false;
let aiPreviewMessage = null;

function detectLayoutDevice() {
  return matchMedia('(max-width: 700px)').matches ? 'mobile' : matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop';
}

function activeLayoutDevice() {
  return layoutPreviewDevice || detectLayoutDevice();
}

function loadHomeLayouts() {
  try {
    const saved = localStorage.getItem(appStorageKey('dayflow.home-layout.v3')) || localStorage.getItem(appStorageKey('dayflow.home-layout.v2')) || localStorage.getItem(appStorageKey('dayflow.home-layout.v1'));
    return createHomeLayouts(saved ? JSON.parse(saved) : {});
  } catch { return defaultHomeLayouts(); }
}

function saveHomeLayout() {
  try {
    homeLayouts[activeLayoutDevice()] = homeLayout;
    localStorage.setItem(appStorageKey('dayflow.home-layout.v3'), JSON.stringify({ layouts: homeLayouts }));
  } catch { /* The home arrangement is optional. */ }
}

function rememberLayoutUndo() {
  layoutUndo = { device: activeLayoutDevice(), layout: JSON.parse(JSON.stringify(homeLayout)) };
}

function showLayoutUndo(message) {
  const snapshot = layoutUndo;
  if (!snapshot) { toast(message); return; }
  toast(message, 'success', { label: '復原', run: () => {
    homeLayouts[snapshot.device] = snapshot.layout;
    if (activeLayoutDevice() === snapshot.device) homeLayout = homeLayouts[snapshot.device];
    saveHomeLayout(); render();
  } });
}

function setLayoutDevice(device) {
  if (!homeLayouts[device]) return;
  layoutPreviewDevice = device === detectLayoutDevice() ? null : device;
  homeLayout = homeLayouts[device];
  homeEditMode = false;
  render();
}

function loadFocus() {
  const defaults = { mode: 'focus', durations: { focus: 25, rest: 10 }, remainingMs: 25 * 60000, running: false, started: false, endAt: 0, taskId: '', focusGoal: '', completedCount: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(appStorageKey('dayflow.focus.v1')) || '{}');
    const oldDurations = saved.durations && typeof saved.durations === 'object' ? saved.durations : {};
    const oldRestDuration = oldDurations.rest ?? (saved.mode === 'long' ? oldDurations.long : oldDurations.short) ?? oldDurations.short ?? oldDurations.long ?? defaults.durations.rest;
    const legacyRestDefault = [5, 15].includes(Number(oldRestDuration));
    const restDuration = legacyRestDefault ? defaults.durations.rest : oldRestDuration;
    const normalizeDuration = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(120, Math.round(Number(value)))) : fallback;
    const durations = { focus: normalizeDuration(oldDurations.focus, defaults.durations.focus), rest: normalizeDuration(restDuration, defaults.durations.rest) };
    const mode = ['rest', 'short', 'long'].includes(saved.mode) ? 'rest' : 'focus';
    const savedRemaining = Number(saved.remainingMs);
    const migrateRestCountdown = legacyRestDefault && !saved.running && !saved.started && mode === 'rest' && savedRemaining === Number(oldRestDuration) * 60000;
    return { ...defaults, ...saved, mode, durations, remainingMs: migrateRestCountdown ? durations.rest * 60000 : Number.isFinite(savedRemaining) && savedRemaining >= 0 ? savedRemaining : durations[mode] * 60000 };
  }
  catch { return defaults; }
}

function saveFocus() {
  try { localStorage.setItem(appStorageKey('dayflow.focus.v1'), JSON.stringify(focus)); } catch { /* Timer state can be recreated. */ }
}

function loadAIMessages() {
  try {
    const messages = JSON.parse(localStorage.getItem(appStorageKey('dayflow.ai-messages.v1')) || '[]');
    return Array.isArray(messages) ? messages.filter(item => ['user', 'model'].includes(item.role) && typeof item.text === 'string').slice(-40) : [];
  } catch { return []; }
}

function saveAIMessages() {
  try { localStorage.setItem(appStorageKey('dayflow.ai-messages.v1'), JSON.stringify(aiMessages.slice(-40))); }
  catch { toast('無法儲存此裝置上的 AI 對話。', 'error'); }
}

function currentAIContext() {
  return buildAIContext({ route: aiPanelContext.route || route, data: getData(), focus, currentTaskId: aiPanelContext.taskId, currentHabitId: aiPanelContext.habitId, calendarDate, homeDate });
}

function aiPrompts(feature) {
  const prompts = {
    today: ['整理今天的優先順序', '幫我安排今天', '我現在最適合先做什麼？'],
    calendar: ['幫我安排這週的待辦', '分析近期工作量與時間衝突', '把未完成任務分散到接下來幾天'],
    habits: ['分析我的近期習慣紀錄', '幫我建立容易持續的新習慣', '規劃這週的習慣執行方式'],
    habit: ['分析這個習慣的近期紀錄', '幫我調整成更容易做到的版本', '安排這個習慣的一週計畫'],
    task: ['幫我把這件事拆成可執行步驟', '估算時間並建議排程', '幫我整理任務內容'],
    focus: ['推薦我現在最適合做的任務', '幫我縮小目前任務的範圍', '設定本次專注目標和時間'],
    global: ['整理今天的事情', '規劃接下來一週', '我現在不知道該做什麼'],
  };
  return prompts[feature] || prompts.global;
}

function renderAIPanel() {
  const status = getAIStatus();
  const feature = aiPanelContext.route || route;
  const suggestions = aiPrompts(feature);
  const thread = aiMessages.map((message, index) => {
    const content = `<p>${escapeHTML(message.text)}</p>`;
    const proposal = message.role === 'model' && message.actions?.length
      ? `<div class="ai-proposal-note">${message.applied?.length ? `已套用 ${message.applied.length} 項` : `${message.actions.length} 項待確認操作`}<button class="text-button" type="button" data-action="ai-preview" data-message="${index}">檢視方案</button></div>` : '';
    return `<article class="ai-message ai-message-${message.role}"><span class="ai-message-label">${message.role === 'user' ? '你' : 'DAYFLOW AI'}</span>${content}${proposal}</article>`;
  }).join('');
  const preview = aiPreviewMessage == null ? '' : renderAIProposalPreview(aiPreviewMessage);
  const ready = status.ready;
  return `<section class="ai-panel" aria-label="DAYFLOW AI 助理"><div class="ai-panel-intro"><span class="ai-mark">D</span><div><strong>依照目前情境協助你</strong><span>${escapeHTML(status.message)}</span></div></div><div class="ai-privacy-note">送出後只會傳送這次功能所需的任務、習慣與專注摘要至 Firebase AI Logic；對話只保存在此裝置。</div><div class="ai-thread" data-ai-thread aria-live="polite">${thread || `<div class="ai-welcome"><strong>你想先整理哪一件事？</strong><span>我會參考${escapeHTML(({ today: '今天的待辦', calendar: '行事曆與近期安排', habits: '習慣紀錄', habit: '這個習慣', task: '這項待辦', focus: '目前專注狀態與未完成任務', search: 'DAYFLOW 的近期安排' })[feature] || 'DAYFLOW 的近期安排')}，建議操作會先列出預覽，經你確認後才寫入。</span></div>`}${preview}</div><div class="ai-suggestions">${suggestions.map(prompt => `<button type="button" class="ai-suggestion" data-action="ai-prompt" data-prompt="${escapeHTML(prompt)}" ${!ready || aiBusy ? 'disabled' : ''}>${escapeHTML(prompt)}</button>`).join('')}</div><form class="ai-composer" data-form="ai-chat"><textarea name="message" rows="2" maxlength="2000" placeholder="說說你想完成什麼…" aria-label="詢問 DAYFLOW AI" required ${!ready || aiBusy ? 'disabled' : ''}></textarea><div class="ai-composer-footer"><button class="text-button" type="button" data-action="ai-clear" ${!aiMessages.length || aiBusy ? 'disabled' : ''}>清除對話</button><button class="button button-primary" type="submit" ${!ready || aiBusy ? 'disabled' : ''}>${aiBusy ? '整理中…' : '送出'}</button></div></form></section>`;
}

function refreshAIPanel(keepScroll = true) {
  const dialog = dialogRoot.querySelector('dialog[open]');
  if (!dialog?.classList.contains('ai-dialog')) return;
  const thread = dialog.querySelector('[data-ai-thread]');
  const oldScroll = thread?.scrollTop || 0;
  dialog.querySelector('.dialog-content').innerHTML = renderAIPanel();
  const nextThread = dialog.querySelector('[data-ai-thread]');
  if (keepScroll && nextThread) nextThread.scrollTop = Math.max(oldScroll, nextThread.scrollHeight);
}

function openAIPanel(options = {}) {
  aiPanelContext = { route: options.route || route, taskId: options.taskId || '', habitId: options.habitId || '' };
  aiMessages = loadAIMessages();
  const dialog = openDialog('DAYFLOW AI', renderAIPanel(), { wide: true });
  dialog.classList.add('ai-dialog');
  requestAnimationFrame(() => { const thread = dialog.querySelector('[data-ai-thread]'); if (thread) thread.scrollTop = thread.scrollHeight; });
}

async function sendAIMessage(value) {
  const message = String(value || '').trim();
  if (!message || aiBusy) return;
  const status = getAIStatus();
  if (!status.ready) { toast(status.message, 'error'); return; }
  const context = currentAIContext();
  // Prior turns contain only the visible conversation. The current, bounded data
  // context is attached separately by the AI service for this request.
  const history = aiMessages.map(item => ({ role: item.role, parts: [{ text: item.text }] }));
  aiMessages.push({ role: 'user', text: message });
  saveAIMessages(); aiBusy = true; refreshAIPanel(false);
  try {
    const answer = await askDayflowAI(message, { context, history });
    aiMessages.push({ role: 'model', text: answer.reply || '我已整理好建議。', actions: answer.actions });
    saveAIMessages();
  } catch (error) {
    aiMessages.push({ role: 'model', text: error.message || '目前無法連線 AI，DAYFLOW 其他功能仍可正常使用。' });
    saveAIMessages();
  } finally { aiBusy = false; refreshAIPanel(false); }
}

function validateAIProposal(action, data) {
  if (action.type === 'focus_setup' && focus.started) return { valid: false, message: '目前專注計時已開始，先結束或重設計時後才能套用新設定。' };
  const result = validateAIAction(action, data);
  if (!result.valid) return result;
  if (!['create_task', 'update_task'].includes(action.type)) return result;
  const existing = action.type === 'update_task' ? data.tasks.find(task => task.id === action.taskId) : null;
  const date = action.type === 'create_task' ? action.dueDate || dateKey() : action.dueDate != null ? action.dueDate : existing?.dueDate;
  const time = action.startTime != null ? action.startTime : existing?.startTime;
  if (!date || !time) return result;
  const [hour, minute] = time.split(':').map(Number);
  const begin = hour * 60 + minute;
  const duration = Number(action.estimateMinutes ?? existing?.estimateMinutes) || 30;
  const conflict = data.tasks.find(task => task.id !== action.taskId && task.status !== 'completed' && task.dueDate === date && task.startTime && (() => {
    const [h, m] = task.startTime.split(':').map(Number);
    const otherBegin = h * 60 + m;
    const otherDuration = Number(task.estimateMinutes) || 30;
    return begin < otherBegin + otherDuration && otherBegin < begin + duration;
  })());
  return conflict ? { valid: false, message: `與「${conflict.title}」時間重疊。` } : result;
}

function scheduleOfProposal(action, data) {
  if (!['create_task', 'update_task'].includes(action.type)) return null;
  const task = action.type === 'update_task' ? data.tasks.find(item => item.id === action.taskId) : null;
  const dueDate = action.type === 'create_task' ? action.dueDate || dateKey() : action.dueDate != null ? action.dueDate : task?.dueDate;
  const startTime = action.startTime != null ? action.startTime : task?.startTime;
  if (!dueDate || !startTime) return null;
  const [hours, minutes] = startTime.split(':').map(Number);
  return { dueDate, start: hours * 60 + minutes, end: hours * 60 + minutes + (Number(action.estimateMinutes ?? task?.estimateMinutes) || 30) };
}

function proposalScheduleConflicts(actions, data) {
  const conflicts = [];
  for (let i = 0; i < actions.length; i++) {
    const left = scheduleOfProposal(actions[i], data);
    if (!left) continue;
    for (let j = i + 1; j < actions.length; j++) {
      const right = scheduleOfProposal(actions[j], data);
      if (right && left.dueDate === right.dueDate && left.start < right.end && right.start < left.end) conflicts.push([i, j]);
    }
  }
  return conflicts;
}

function aiProposalLabel(action, data) {
  const task = data.tasks.find(item => item.id === action.taskId);
  const habit = data.habits.find(item => item.id === action.habitId);
  if (action.type === 'create_task') return `新增待辦：${action.title} · ${action.dueDate ? formatDate(action.dueDate) : `${formatDate(dateKey())}（預設今天）`}${action.startTime ? ` ${action.startTime}` : ''}${action.estimateMinutes ? ` · ${action.estimateMinutes} 分鐘` : ''}`;
  if (action.type === 'update_task') {
    const scheduleChanged = action.dueDate != null || action.startTime != null;
    const oldSchedule = task ? `${task.dueDate ? formatDate(task.dueDate) : '未安排日期'} ${task.startTime || '未設定時間'}` : '';
    const nextDate = action.dueDate != null ? action.dueDate : task?.dueDate;
    const nextTime = action.startTime != null ? action.startTime : task?.startTime;
    const newSchedule = `${nextDate ? formatDate(nextDate) : '未安排日期'} ${nextTime || '未設定時間'}`;
    return `調整「${task?.title || '待辦'}」${scheduleChanged ? ` · ${oldSchedule} → ${newSchedule}` : ''}${action.priority ? ` · ${({ none: '無', p4: '低', p3: '中', p2: '高' })[action.priority]}優先` : ''}`;
  }
  if (action.type === 'create_habit') return `新增習慣：${action.name} · 每週 ${action.frequency?.length || 0} 天`;
  if (action.type === 'update_habit') return `調整「${habit?.name || '習慣'}」· 每週 ${action.frequency?.length || 0} 天`;
  return `專注設定：${action.focusMinutes} 分鐘 · ${action.focusGoal}`;
}

function renderAIProposalPreview(messageIndex) {
  const message = aiMessages[messageIndex];
  if (!message?.actions?.length) return '';
  const data = getData();
  const validItems = message.actions.map((action, index) => ({ action, index, check: validateAIProposal(action, data) }));
  const hasScheduleConflict = proposalScheduleConflicts(message.actions, data).length > 0;
  return `<section class="ai-inline-preview"><div class="ai-preview-heading"><strong>AI 操作預覽</strong><button class="text-button" type="button" data-action="ai-preview-close">收起</button></div><p class="ai-preview-copy">只套用已勾選的項目；資料會在確認後才更新。</p>${hasScheduleConflict ? '<p class="ai-conflict-note">方案包含互相重疊的時段；請取消其中一個，系統也會在套用前再次檢查。</p>' : ''}<div class="ai-preview-list">${validItems.map(({ action, index, check }) => `<label class="ai-preview-item ${check.valid ? '' : 'is-invalid'}"><input type="checkbox" data-ai-proposal-index="${index}" ${check.valid ? 'checked' : 'disabled'}><span><strong>${escapeHTML(aiProposalLabel(action, data))}</strong><small>${escapeHTML(action.reason || 'AI 建議')}</small>${check.valid ? '' : `<em>${escapeHTML(check.message)}</em>`}</span></label>`).join('')}</div><div class="form-actions"><button class="button button-primary" type="button" data-action="ai-apply" data-message="${messageIndex}" ${validItems.every(item => !item.check.valid) ? 'disabled' : ''}>確認套用已選項目</button></div></section>`;
}

function showAIProposal(messageIndex) {
  const proposal = aiMessages[messageIndex];
  if (!proposal?.actions?.length) return;
  aiPreviewMessage = messageIndex;
  refreshAIPanel(false);
}

async function applyAIProposal(messageIndex) {
  const message = aiMessages[messageIndex];
  const dialog = dialogRoot.querySelector('dialog[open]');
  const selected = [...(dialog?.querySelectorAll('[data-ai-proposal-index]:checked') || [])].map(input => Number(input.dataset.aiProposalIndex));
  if (!message?.actions || !selected.length) return;
  const data = getData();
  const selectedActions = selected.map(index => message.actions[index]).filter(Boolean);
  if (proposalScheduleConflicts(selectedActions, data).length) {
    toast('已選的排程方案彼此重疊，請取消至少一個項目後再套用。', 'error');
    return;
  }
  const actions = selected.map(index => ({ index, action: message.actions[index] })).filter(({ action }) => action && validateAIProposal(action, data).valid);
  if (!actions.length) { toast('方案資料已變更，請重新檢視。', 'error'); dialog?.close(); return; }
  const count = actions.length;
  if (!await confirmDialog(`即將套用 ${count} 項 AI 建議到待辦、習慣或專注設定。請先確認以上預覽內容。`, '確認套用')) { aiPreviewMessage = null; openAIPanel(aiPanelContext); return; }
  const focusAction = actions.find(item => item.action.type === 'focus_setup')?.action;
  updateData(next => {
    for (const { action } of actions) {
      if (action.type === 'create_task') {
        next.tasks.push(createTask({ title: String(action.title).trim(), dueDate: action.dueDate || dateKey(), startTime: action.startTime || '', priority: action.priority === 'none' ? '' : action.priority, estimateMinutes: action.estimateMinutes || '', notes: String(action.notes || '').slice(0, 1000) }));
      } else if (action.type === 'update_task') {
        const task = next.tasks.find(item => item.id === action.taskId);
        if (!task) continue;
        if (action.title != null) task.title = String(action.title).trim();
        if (action.dueDate != null) task.dueDate = action.dueDate;
        if (action.startTime != null) task.startTime = action.startTime;
        if (action.priority != null) task.priority = action.priority === 'none' ? '' : action.priority;
        if (action.estimateMinutes != null) task.estimateMinutes = action.estimateMinutes;
        if (action.notes != null) task.notes = String(action.notes).slice(0, 1000);
      } else if (action.type === 'create_habit') {
        next.habits.push({ id: newId('habit'), name: String(action.name).trim(), description: String(action.description || '').slice(0, 120), frequency: [...new Set(action.frequency)].sort((a, b) => a - b), target: action.target || 1, logs: {}, createdAt: new Date().toISOString(), demo: false });
      } else if (action.type === 'update_habit') {
        const habit = next.habits.find(item => item.id === action.habitId);
        if (!habit) continue;
        habit.name = String(action.name).trim();
        habit.description = String(action.description || '').slice(0, 120);
        habit.frequency = [...new Set(action.frequency)].sort((a, b) => a - b);
        if (action.target != null) habit.target = action.target;
      }
    }
  });
  if (focusAction) {
    focus.durations.focus = focusAction.focusMinutes;
    focus.remainingMs = focusAction.focusMinutes * 60_000;
    focus.taskId = focusAction.taskId || focus.taskId;
    focus.focusGoal = String(focusAction.focusGoal).trim();
    saveFocus();
  }
  message.applied = [...new Set([...(message.applied || []), ...actions.map(item => item.index)])];
  aiPreviewMessage = null;
  saveAIMessages();
  dialogRoot.querySelector('dialog[open]')?.close();
  toast(`已套用 ${count} 項 AI 建議`);
  render();
  openAIPanel(aiPanelContext);
}

function context() {
  if (focus.running) focus.remainingMs = Math.max(0, focus.endAt - Date.now());
  return { taskSort, taskStatusFilter, calendarDate, query, focus, homeDate, homeCalendarMonth, homeLayout, homeEditMode, homeTransitionDirection, layoutDevice: activeLayoutDevice() };
}

function renderAuthGate() {
  const title = !authReady ? '正在確認登入狀態' : authLoadError ? '登入服務暫時無法載入' : '登入 DAYFLOW';
  const message = !authReady ? '正在安全地連線至 Firebase Authentication。' : authLoadError ? '請檢查網路連線後重新載入頁面。' : '使用 Google 帳戶登入，開始整理你的每一天。';
  const googleMark = `<svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.9 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.7-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.7a20 20 0 0 0 0 17.6l6.9-5.2Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.7 15.2l6.9 5.2C14.2 15.6 18.7 12 24 12Z"/></svg>`;
  app.innerHTML = `<main class="auth-screen"><section class="auth-card" aria-labelledby="auth-title"><div class="auth-mark">D</div><p class="eyebrow">YOUR DAY, IN FLOW</p><h1 id="auth-title">${title}</h1><p class="auth-description">${message}</p>${authReady && !authLoadError ? `<button class="google-sign-in" data-action="google-sign-in" ${authBusy ? 'disabled' : ''}>${googleMark}<span>${authBusy ? '正在連線…' : '使用 Google 帳戶繼續'}</span></button>` : ''}${authLoadError ? '<button class="button button-primary auth-retry" data-action="auth-retry">重新載入</button>' : ''}${authError ? `<p class="auth-error" role="alert">${escapeHTML(authError)}</p>` : ''}<p class="auth-footnote">登入後即可使用 DAYFLOW。你的任務資料仍保存在目前的瀏覽器中。</p></section></main>`;
}

function confirmCloudDataUpload() {
  return new Promise(resolve => {
    const dialog = openDialog('同步目前的 DAYFLOW 資料？', `<p class="confirm-copy">這會將待辦、習慣、專注紀錄與偏好寫入 Firebase Firestore 專案 <strong>class-20261016</strong>，並綁定目前的 Google 帳號。之後的變更會同步到該帳號；本機仍會保留一份資料。</p><div class="form-actions"><button class="button button-primary" type="button" data-cloud-consent="yes">同步至 Firebase</button><button class="button" type="button" data-cloud-consent="no">先使用本機</button></div>`);
    let settled = false;
    const settle = value => { if (!settled) { settled = true; resolve(value); } };
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-cloud-consent]');
      if (!button) return;
      const accepted = button.dataset.cloudConsent === 'yes';
      dialog.close();
      settle(accepted);
    });
    dialog.addEventListener('close', () => settle(false), { once: true });
  });
}

async function enableCloudDataForCurrentUser() {
  if (!authUser || !cloudClient) return;
  const uid = authUser.uid;
  if (!await confirmCloudDataUpload()) {
    cloudSyncStatus = 'local-only';
    render();
    return;
  }
  cloudSyncStatus = 'saving';
  render();
  try { await cloudClient.enableInitialUpload(uid); }
  catch (error) {
    console.error('DAYFLOW Firestore 初始資料同步失敗。', error);
    if (authUser?.uid === uid) { cloudSyncStatus = 'error'; toast('雲端同步失敗，資料仍保存在此裝置。', 'error'); render(); }
  }
}

function render() {
  if (!authReady || !authUser) { renderAuthGate(); return; }
  const data = getData();
  applyPreferences(data.settings);
  const cloudLabels = { syncing: '載入雲端', saving: '同步中', synced: '已同步', error: '本機暫存', 'local-only': '僅本機' };
  const cloudLabel = cloudLabels[cloudSyncStatus] || '載入雲端';
  app.innerHTML = `<div class="app-shell">
      <div class="app-main"><header class="topbar"><div class="topbar-inner"><a class="brand" href="#today" data-navigate="today" aria-label="DAYFLOW 首頁"><span class="brand-mark">D</span><span class="brand-name">DAYFLOW</span></a><nav class="primary-nav" aria-label="主要功能">${[['today','今天'],['calendar','行事曆'],['habits','習慣'],['focus','專注']].map(([id,label]) => `<a href="#${id}" data-navigate="${id}" class="${route === id ? 'is-active' : ''}">${label}</a>`).join('')}</nav><div class="topbar-actions"><button class="button ai-launch-button" data-action="ai-open" aria-label="開啟 DAYFLOW AI 助理" title="以目前功能情境開啟 AI 助理"><span aria-hidden="true">✳</span> AI</button><button class="icon-button topbar-icon" data-action="open-search" aria-label="搜尋待辦" title="搜尋待辦">${icon('search')}</button><button class="button button-primary quick-add-button" data-action="quick-add" aria-label="新增待辦" title="新增待辦">${icon('plus')}<span>新增</span></button><button class="cloud-status cloud-${cloudSyncStatus}" data-action="cloud-enable-sync" ${cloudSyncStatus === 'local-only' || cloudSyncStatus === 'error' ? '' : 'disabled'} title="${cloudSyncStatus === 'local-only' ? '啟用 Firebase 雲端同步' : cloudSyncStatus === 'error' ? '同步暫時失敗，資料仍保存在本機' : `雲端資料${cloudLabel}`}" aria-label="雲端資料狀態：${cloudLabel}"><i></i><span>${cloudLabel}</span></button><span class="auth-account" title="${escapeHTML(authUser.email || authUser.displayName || '')}">${authUser.photoURL ? `<img src="${escapeHTML(authUser.photoURL)}" alt="">` : `<span class="auth-avatar-fallback">${escapeHTML((authUser.displayName || authUser.email || 'G').slice(0,1).toUpperCase())}</span>`}<span class="auth-account-name">${escapeHTML(authUser.displayName || authUser.email || 'Google 帳戶')}</span></span><button class="button auth-sign-out" data-action="google-sign-out">登出</button><button class="icon-button topbar-icon mobile-menu-button" data-action="toggle-drawer" aria-label="開啟選單" aria-expanded="${drawerOpen}" title="選單">${icon('menu')}</button></div></div></header>
      <main class="main-content">${renderPage(route, data, context())}</main>
    </div>
    ${drawerOpen ? renderDrawer() : ''}
  </div>`;
}

function renderDrawer() {
  const routes = [['today', '今天', 'today'], ['calendar', '行事曆／接下來', 'calendar'], ['habits', '習慣追蹤', 'habits'], ['focus', '專注計時', 'focus'], ['settings', '設定', 'menu']];
  return `<div class="drawer-scrim" data-action="close-drawer" aria-hidden="true"></div><aside class="app-drawer" aria-label="主選單"><div class="drawer-heading"><div><p class="eyebrow">DAYFLOW</p><h2>功能</h2></div><button class="icon-button" data-action="close-drawer" aria-label="關閉選單">${icon('close')}</button></div><nav class="drawer-nav">${routes.map(([id, label, symbol]) => `<a href="#${id}" data-navigate="${id}" class="drawer-nav-link ${route === id ? 'is-active' : ''}">${icon(symbol)}<span>${label}</span></a>`).join('')}</nav><div class="drawer-footer"><span class="local-indicator"></span>資料儲存在此裝置</div></aside>`;
}

function applyPreferences(settings) {
  const dark = settings.theme === 'dark' || settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', settings.accent || '#48515b');
  document.documentElement.classList.toggle('density-compact', Boolean(settings.compact));
}

function setRoute(value) {
  if (!validRoutes.has(value)) value = 'today';
  route = value;
  drawerOpen = false;
  updateUI({ route: value });
  if (location.hash !== `#${value}`) location.hash = value;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openQuickAdd(options = {}) {
  const data = getData();
  const defaultDate = options.dueDate || (route === 'today' ? homeDate : dateKey());
  const dialog = openDialog('新增待辦', `<form class="form-grid quick-add-form" data-form="quick-add"><label class="field full"><span>要做什麼？</span><input name="title" maxlength="120" required autofocus value="${escapeHTML(options.title || '')}" placeholder="例如：整理會議重點"></label><details class="quick-add-options full" ${options.showDetails ? 'open' : ''}><summary>日期、時間、優先程度與備註</summary><div class="quick-add-fields"><label class="field"><span>日期</span><input type="date" name="dueDate" value="${escapeHTML(defaultDate)}"></label><label class="field"><span>時間</span><input type="time" name="startTime" value="${escapeHTML(options.startTime || '')}"></label><label class="field"><span>優先程度</span><select name="priority">${[['', '無'], ['p4', '低'], ['p3', '中'], ['p2', '高']].map(([value, label]) => `<option value="${value}" ${value === (options.priority || data.settings.defaultPriority || '') || value === '' && options.priority === 'none' ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field full"><span>備註</span><textarea name="notes" rows="2" maxlength="1000" placeholder="選填"></textarea></label></div></details><p class="quick-parse-note full" data-parse-note>未選日期時會安排在今天。</p><div class="form-actions full"><button class="button button-primary" type="submit">新增待辦</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  const form = dialog.querySelector('form');
  form.addEventListener('input', event => {
    if (event.target.name !== 'title') return;
    const suggestion = parseQuickDate(event.target.value);
    dialog.querySelector('[data-parse-note]').textContent = suggestion.date ? `可辨識日期：${formatDate(suggestion.date)}${suggestion.time ? ` ${formatTime(suggestion.time, data.settings.hour24)}` : ''}` : '未選日期時會安排在今天。';
    if (suggestion.date) { form.elements.dueDate.value = suggestion.date; form.querySelector('.quick-add-options').open = true; }
    if (suggestion.time && !form.elements.startTime.value) form.elements.startTime.value = suggestion.time;
  });
}

function openTaskEditor(taskId = '', options = {}) {
  const data = getData();
  const task = taskId ? data.tasks.find(item => item.id === taskId) : null;
  if (taskId && !task) return;
  openDialog(task ? '編輯待辦' : '新增待辦', renderTaskForm(task, data, options));
}

function openTaskDetail(taskId) {
  const data = getData();
  const task = data.tasks.find(item => item.id === taskId);
  if (!task) return;
  const priorityLabel = ({ none: '無', p4: '低', p3: '中', p2: '高', p1: '高' })[task.priority || 'none'] || '無';
  const note = task.notes || task.description || '';
  openDialog('待辦詳細', `<div class="task-detail"><h2>${escapeHTML(task.title)}</h2><div class="detail-meta"><span class="detail-priority"><i class="priority-dot ${task.priority || 'none'}"></i>${priorityLabel}優先程度</span>${task.dueDate ? `<span>日期：${escapeHTML(formatDate(task.dueDate))}</span>` : '<span>未安排日期</span>'}${task.startTime ? `<span>時間：${escapeHTML(formatTime(task.startTime, data.settings.hour24))}</span>` : ''}${task.estimateMinutes ? `<span>預估：${Number(task.estimateMinutes)} 分鐘</span>` : ''}</div>${note ? `<div class="detail-notes"><h3>備註</h3><p>${escapeHTML(note)}</p></div>` : '<p class="muted">尚未新增備註。</p>'}<div class="form-actions"><button class="button" data-action="ai-open" data-ai-route="task" data-id="${escapeHTML(task.id)}">✳ AI 協助</button><button class="button button-primary" data-action="task-edit" data-id="${escapeHTML(task.id)}">編輯</button><button class="button" data-action="toggle-task" data-id="${escapeHTML(task.id)}">${task.status === 'completed' ? '標記未完成' : '完成待辦'}</button><button class="button button-danger" data-action="task-delete" data-id="${escapeHTML(task.id)}">刪除</button></div></div>`);
}

function openWidgetSettings(widgetId) {
  const item = homeLayout.items.find(entry => entry.id === widgetId);
  if (!item) return;
  openDialog('重新命名模組', `<form class="form-grid" data-form="widget-settings"><input type="hidden" name="id" value="${escapeHTML(item.id)}"><label class="field full"><span>模組名稱</span><input name="name" maxlength="40" value="${escapeHTML(item.name || WIDGET_REGISTRY[item.type]?.name || '')}"></label><div class="form-actions full"><button class="button button-primary" type="submit">儲存</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
}

function openWidgetSizePicker(widgetId) {
  const item = homeLayout.items.find(entry => entry.id === widgetId);
  if (!item) return;
  const choices = [['small', '小尺寸', '▰'], ['medium', '中尺寸', '▰▰'], ['large', '大尺寸', '▰▰▰'], ['full', '全寬', '▰　▰']];
  openDialog('調整小工具大小', `<div class="widget-size-options">${choices.map(([size, label, preview]) => `<button class="widget-size-option ${item.size === size ? 'is-selected' : ''}" data-action="home-widget-size-set" data-id="${escapeHTML(item.id)}" data-size="${size}"><span>${preview}</span><strong>${label}</strong></button>`).join('')}</div>`);
}

function openWidgetPicker() {
  const dialog = openDialog('新增小工具', renderWidgetPicker(homeLayout), { wide: true });
  dialog.classList.add('widget-picker-dialog');
}

function openHabitForm(id = '') {
  const habit = id ? getData().habits.find(item => item.id === id) : null;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const frequency = habit?.frequency || days;
  const daily = frequency.length === 7;
  const dialog = openDialog(habit ? '編輯習慣' : '新增習慣', `<form class="form-grid" data-form="habit"><input type="hidden" name="id" value="${escapeHTML(habit?.id || '')}"><label class="field full"><span>習慣名稱</span><input name="name" required maxlength="60" value="${escapeHTML(habit?.name || '')}" placeholder="例如：散步 20 分鐘"></label><label class="field full"><span>備註</span><input name="description" maxlength="120" value="${escapeHTML(habit?.description || '')}" placeholder="選填"></label><fieldset class="field full frequency-field"><legend>頻率</legend><div class="frequency-kind"><label><input type="radio" name="frequencyType" value="daily" ${daily ? 'checked' : ''}><span>每天</span></label><label><input type="radio" name="frequencyType" value="weekly" ${daily ? '' : 'checked'}><span>每週選日</span></label></div><div class="weekday-picker ${daily ? 'is-disabled' : ''}">${days.map((day, index) => `<label><input type="checkbox" name="frequency" value="${day}" ${frequency.includes(day) ? 'checked' : ''} ${daily ? 'disabled' : ''}><span>${['一', '二', '三', '四', '五', '六', '日'][index]}</span></label>`).join('')}</div></fieldset><div class="form-actions full"><button class="button button-primary" type="submit">${habit ? '儲存習慣' : '建立習慣'}</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  dialog.querySelectorAll('[name="frequencyType"]').forEach(input => input.addEventListener('change', () => {
    const isDaily = dialog.querySelector('[name="frequencyType"]:checked')?.value === 'daily';
    dialog.querySelector('.weekday-picker').classList.toggle('is-disabled', isDaily);
    dialog.querySelectorAll('[name="frequency"]').forEach(day => { day.disabled = isDaily; if (isDaily) day.checked = true; });
  }));
  dialog.querySelector('input[name="name"]')?.focus({ preventScroll: true });
}

function parseFormTask(form) {
  const formData = new FormData(form);
  const id = String(formData.get('id') || '');
  const original = id ? getData().tasks.find(item => item.id === id) : null;
  const task = createTask({
    title: formData.get('title'), status: original?.status || 'todo', priority: formData.get('priority'),
    dueDate: formData.get('dueDate') || (original ? '' : dateKey()), startTime: formData.get('startTime'), notes: formData.get('notes'), estimateMinutes: formData.get('estimateMinutes'),
  });
  if (original) return { ...original, ...task, id: original.id, createdAt: original.createdAt, completedAt: original.completedAt };
  return task;
}

function submitTask(form) {
  const task = parseFormTask(form);
  if (!task.title) return;
  updateData(data => {
    const index = data.tasks.findIndex(item => item.id === task.id);
    if (index >= 0) data.tasks[index] = task;
    else data.tasks.push(task);
  });
  dialogRoot.querySelector('dialog')?.close();
  toast(form.elements.id.value ? '任務已更新' : '任務已建立');
  render();
}

function submitQuickAdd(form) {
  const raw = String(form.elements.title.value || '').trim();
  const parsed = parseQuickDate(raw);
  const task = createTask({
    title: parsed.title,
    dueDate: parsed.date || form.elements.dueDate.value || dateKey(),
    startTime: form.elements.startTime.value || parsed.time,
    priority: form.elements.priority.value,
    notes: form.elements.notes.value,
  });
  if (!task.title) return;
  updateData(data => data.tasks.push(task));
  dialogRoot.querySelector('dialog')?.close();
  toast('任務已加入');
  render();
}

function toggleTask(taskId) {
  let previous;
  updateData(data => {
    const task = data.tasks.find(item => item.id === taskId);
    if (!task) return;
    previous = task.status;
    task.status = previous === 'completed' ? 'todo' : 'completed';
    task.completedAt = task.status === 'completed' ? new Date().toISOString() : '';
  });
  if (previous !== undefined) {
    if (previous === 'completed') toast('任務已重新開啟');
    else toast('任務已完成', 'success', { label: '復原', run: () => updateData(data => { const task = data.tasks.find(item => item.id === taskId); if (task) { task.status = 'todo'; task.completedAt = ''; } render(); }) });
  }
  render();
}

async function deleteTask(taskId) {
  const task = getData().tasks.find(item => item.id === taskId);
  if (!task || !await confirmDialog(`確定刪除「${task.title}」？此動作無法復原。`)) return;
  const row = app.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
  if (row) { row.classList.add('is-removing'); await new Promise(resolve => setTimeout(resolve, 160)); }
  updateData(data => { data.tasks = data.tasks.filter(item => item.id !== taskId); });
  dialogRoot.querySelector('dialog')?.close();
  toast('任務已刪除');
  render();
}

function submitWidgetSettings(form) {
  const fields = new FormData(form);
  const item = homeLayout.items.find(entry => entry.id === fields.get('id'));
  if (!item) return;
  item.name = String(fields.get('name') || '').trim() || WIDGET_REGISTRY[item.type]?.name || '小工具';
  item.config = {};
  saveHomeLayout();
  dialogRoot.querySelector('dialog')?.close();
  toast('小工具已更新');
  render();
}

function submitHabit(form) {
  const fields = new FormData(form);
  const id = String(fields.get('id') || '');
  const current = id ? getData().habits.find(item => item.id === id) : null;
  const selectedDays = fields.get('frequencyType') === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : fields.getAll('frequency').map(Number);
  if (!selectedDays.length) { toast('請選擇每週頻率', 'error'); return; }
  const habit = { ...current, id: id || newId('habit'), name: String(fields.get('name')).trim(), description: String(fields.get('description') || '').trim(), frequency: selectedDays, target: 1, logs: current?.logs || {}, createdAt: current?.createdAt || new Date().toISOString(), demo: false };
  updateData(data => { const index = data.habits.findIndex(item => item.id === id); if (index >= 0) data.habits[index] = habit; else data.habits.push(habit); });
  dialogRoot.querySelector('dialog')?.close();
  toast(id ? '習慣已更新' : '習慣已建立');
  render();
}

async function deleteHabit(id) {
  const habit = getData().habits.find(item => item.id === id);
  if (!habit || !await confirmDialog(`確定刪除習慣「${habit.name}」？`)) return;
  updateData(data => { data.habits = data.habits.filter(item => item.id !== id); });
  toast('習慣已刪除'); render();
}

function toggleHabit(id, day = dateKey()) {
  updateData(data => {
    const habit = data.habits.find(item => item.id === id);
    if (!habit) return;
    habit.logs ||= {};
    if (habit.logs[day]) delete habit.logs[day]; else habit.logs[day] = true;
  });
  toast('習慣紀錄已更新'); render();
}

function persistSetting(name, value) {
  updateData(data => {
    if (name === 'compact' || name === 'weekStartsMonday' || name === 'hour24') data.settings[name] = value === true || value === 'true';
    else if (name === 'defaultPriority') data.settings[name] = value;
    else data.settings[name] = value;
  });
  render();
}

function persistFocusTask(value) { focus.taskId = value; saveFocus(); }

function timerStart() {
  if (focus.remainingMs <= 0) focus.remainingMs = Number(focus.durations[focus.mode] || 25) * 60000;
  focus.endAt = Date.now() + focus.remainingMs;
  focus.started = true;
  focus.running = true;
  saveFocus(); render();
}

function timerPause() {
  focus.remainingMs = Math.max(0, focus.endAt - Date.now());
  focus.running = false;
  focus.started = true;
  focus.endAt = 0;
  saveFocus(); render();
}

function timerEnd() {
  const duration = Number(focus.durations[focus.mode] || 25) * 60000;
  const remaining = Math.max(0, focus.running ? focus.endAt - Date.now() : focus.remainingMs);
  const elapsed = Math.floor((duration - remaining) / 60000);
  if (focus.mode === 'focus' && focus.started && elapsed > 0) {
    updateData(data => data.focusSessions.push({ id: newId('focus'), date: dateKey(), minutes: elapsed, taskId: focus.taskId, createdAt: new Date().toISOString(), demo: false }));
    toast(`已記錄 ${elapsed} 分鐘專注`);
  } else toast('計時已結束');
  focus.running = false;
  focus.started = false;
  focus.endAt = 0;
  focus.remainingMs = duration;
  saveFocus();
  render();
}

function timerReset() {
  focus.running = false; focus.started = false; focus.endAt = 0; focus.remainingMs = focus.durations[focus.mode] * 60000;
  saveFocus(); render();
}

function timerChangeMode(mode) {
  if (focus.started || focus.running || !Object.hasOwn(focus.durations, mode)) return;
  focus.mode = mode; focus.running = false; focus.started = false; focus.endAt = 0; focus.remainingMs = focus.durations[mode] * 60000;
  saveFocus(); render();
}

function timerFinish() {
  focus.running = false; focus.started = false; focus.endAt = 0;
  if (focus.mode === 'focus') {
    const minutes = Number(focus.durations.focus);
    focus.completedCount++;
    updateData(data => data.focusSessions.push({ id: newId('focus'), date: dateKey(), minutes, taskId: focus.taskId, createdAt: new Date().toISOString(), demo: false }));
    const taskName = getData().tasks.find(item => item.id === focus.taskId)?.title;
    toast(taskName ? `已完成專注：${taskName}` : '專注時段完成');
    focus.mode = 'rest';
  } else { toast('休息結束，準備開始下一段專注', 'info'); focus.mode = 'focus'; }
  focus.remainingMs = Number(focus.durations[focus.mode] || (focus.mode === 'rest' ? 10 : 25)) * 60000;
  saveFocus(); render();
}

function timerTick() {
  if (focus.running) {
    focus.remainingMs = Math.max(0, focus.endAt - Date.now());
    const display = `${String(Math.floor(focus.remainingMs / 60000)).padStart(2, '0')}:${String(Math.floor(focus.remainingMs % 60000 / 1000)).padStart(2, '0')}`;
    const clock = document.getElementById('focus-clock');
    if (clock) clock.textContent = display;
    const homeClock = document.getElementById('home-focus-clock');
    if (homeClock) homeClock.textContent = display;
    const duration = Number(focus.durations[focus.mode] || 25) * 60000;
    const progress = Math.max(0, Math.min(100, (1 - focus.remainingMs / duration) * 100));
    document.querySelector('.focus-ring')?.style.setProperty('--focus-progress', `${progress}%`);
    document.querySelector('.mini-focus-ring')?.style.setProperty('--focus-progress', `${progress}%`);
  }
  const eta = document.getElementById('focus-finish-estimate');
  if (eta) {
    const finishAt = focus.running ? focus.endAt : Date.now() + Math.max(0, focus.remainingMs);
    const etaMinute = String(Math.floor(finishAt / 60000));
    if (eta.dataset.etaMinute !== etaMinute) {
      const hour24 = getData().settings.hour24 !== false;
      const finishTime = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: hour24 ? 'h23' : 'h12' }).format(new Date(finishAt));
      eta.textContent = focus.running ? `預估 ${finishTime} 完成` : focus.started ? `繼續後約 ${finishTime} 完成` : `現在開始，預估 ${finishTime} 完成`;
      eta.dataset.etaMinute = etaMinute;
    }
  }
  if (focus.running && focus.remainingMs <= 0) timerFinish();
}

function setFocusDuration(value) {
  if (focus.started || focus.running) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) { render(); return; }
  const next = Math.max(1, Math.min(120, Math.round(parsed)));
  focus.durations[focus.mode] = next;
  focus.remainingMs = next * 60000;
  saveFocus(); render();
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  switch (action) {
    case 'google-sign-in':
      if (!authClient || authBusy) break;
      authBusy = true; authError = ''; renderAuthGate();
      try { await authClient.signInWithGoogle(); }
      catch (error) { authError = authClient.authErrorMessage(error); }
      finally { authBusy = false; render(); }
      break;
    case 'google-sign-out':
      if (!authClient || !authUser) break;
      try { await authClient.signOutUser(); }
      catch (error) { toast(authClient.authErrorMessage(error), 'error'); }
      break;
    case 'cloud-enable-sync': await enableCloudDataForCurrentUser(); break;
    case 'auth-retry': location.reload(); break;
    case 'ai-open': openAIPanel({ route: element.dataset.aiRoute || route, taskId: element.dataset.aiRoute === 'task' ? id : '', habitId: element.dataset.aiRoute === 'habit' ? id : '' }); break;
    case 'ai-prompt': await sendAIMessage(element.dataset.prompt); break;
    case 'ai-preview': showAIProposal(Number(element.dataset.message)); break;
    case 'ai-preview-close': aiPreviewMessage = null; refreshAIPanel(false); break;
    case 'ai-apply': await applyAIProposal(Number(element.dataset.message)); break;
    case 'ai-clear': { const cleared = await confirmDialog('清除保存在此裝置的 DAYFLOW AI 對話？', '清除對話'); if (cleared) aiMessages = []; saveAIMessages(); openAIPanel(aiPanelContext); break; }
    case 'quick-add': openQuickAdd({ dueDate: element.dataset.date || (route === 'today' ? homeDate : dateKey()), showDetails: Boolean(element.dataset.date) }); break;
    case 'task-edit': dialogRoot.querySelector('dialog')?.close(); openTaskEditor(id); break;
    case 'task-detail': openTaskDetail(id); break;
    case 'toggle-task': if (element.closest('dialog')) dialogRoot.querySelector('dialog')?.close(); toggleTask(id); break;
    case 'task-delete': await deleteTask(id); break;
    case 'close-dialog': dialogRoot.querySelector('dialog')?.close(); break;
    case 'toggle-drawer': drawerOpen = !drawerOpen; render(); break;
    case 'close-drawer': drawerOpen = false; render(); break;
    case 'open-search': query = ''; setRoute('search'); setTimeout(() => document.getElementById('search-page-input')?.focus(), 0); break;
    case 'task-status-filter': taskStatusFilter = element.dataset.filter; render(); break;
    case 'habit-add': openHabitForm(); break;
    case 'habit-edit': openHabitForm(id); break;
    case 'habit-delete': await deleteHabit(id); break;
    case 'toggle-habit': toggleHabit(id); break;
    case 'calendar-today': calendarDate = dateKey(); render(); break;
    case 'calendar-shift': { const current = parseDate(calendarDate); current.setDate(1); current.setMonth(current.getMonth() + Number(element.dataset.step)); calendarDate = dateKey(current); render(); break; }
    case 'calendar-add': openQuickAdd({ dueDate: element.dataset.date }); break;
    case 'home-date-today': homeDate = dateKey(); homeCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12); render(); break;
    case 'home-date-select': homeDate = element.dataset.date; { const selected = parseDate(homeDate); homeCalendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1, 12); } render(); break;
    case 'home-month-shift': { const next = new Date(homeCalendarMonth); next.setDate(1); next.setMonth(next.getMonth() + Number(element.dataset.step)); homeCalendarMonth = next; render(); break; }
    case 'home-layout-device': setLayoutDevice(element.dataset.device); break;
    case 'home-layout-reset': {
      const device = activeLayoutDevice();
      rememberLayoutUndo();
      homeLayouts[device] = defaultHomeLayouts()[device]; homeLayout = homeLayouts[device];
      saveHomeLayout(); render(); showLayoutUndo('已重置目前裝置版面'); break;
    }
    case 'home-widget-edit': if (homeLayout.locked) { toast('首頁配置已鎖定，請先解除鎖定'); break; } homeEditMode = !homeEditMode; render(); break;
    case 'home-widget-lock': homeLayout.locked = !homeLayout.locked; if (homeLayout.locked) homeEditMode = false; saveHomeLayout(); render(); break;
    case 'home-widget-picker': openWidgetPicker(); break;
    case 'home-widget-settings':
    case 'home-widget-open-settings': openWidgetSettings(id); break;
    case 'home-widget-size': if (activeLayoutDevice() === 'mobile') openWidgetSizePicker(id); else { const sizes = ['small','medium','large','full']; const item = homeLayout.items.find(entry => entry.id === id); if (item) { rememberLayoutUndo(); item.size = sizes[(sizes.indexOf(item.size) + 1) % sizes.length]; saveHomeLayout(); render(); showLayoutUndo('小工具尺寸已更新'); } } break;
    case 'home-widget-size-set': { const item = homeLayout.items.find(entry => entry.id === id); if (item) { rememberLayoutUndo(); item.size = element.dataset.size; } saveHomeLayout(); dialogRoot.querySelector('dialog')?.close(); render(); showLayoutUndo('小工具尺寸已更新'); break; }
    case 'home-widget-hide': rememberLayoutUndo(); homeLayout.hidden = [...new Set([...homeLayout.hidden, id])]; saveHomeLayout(); render(); showLayoutUndo('已隱藏模組'); break;
    case 'home-widget-unhide': rememberLayoutUndo(); homeLayout.hidden = homeLayout.hidden.filter(item => item !== id); saveHomeLayout(); dialogRoot.querySelector('dialog')?.close(); render(); showLayoutUndo('已顯示模組'); break;
    case 'home-widget-add': { const type = element.dataset.type; if (WIDGET_REGISTRY[type] && !homeLayout.items.some(item => item.type === type)) { rememberLayoutUndo(); const item = defaultWidget(type); if (activeLayoutDevice() === 'mobile') item.size = 'small'; homeLayout.items.push(item); saveHomeLayout(); dialogRoot.querySelector('dialog')?.close(); homeEditMode = false; render(); showLayoutUndo('已加入首頁模組'); } break; }
    case 'focus-mode': timerChangeMode(element.dataset.mode); break;
    case 'focus-start': timerStart(); break;
    case 'focus-pause': timerPause(); break;
    case 'focus-end': timerEnd(); break;
    case 'focus-reset': timerReset(); break;
    case 'export-data': downloadExport(); break;
    default: break;
  }
}

function downloadExport() {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `dayflow-backup-${dateKey()}.json`; link.click(); URL.revokeObjectURL(url);
  toast('資料備份已下載');
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (form.dataset.form === 'task') submitTask(form);
  if (form.dataset.form === 'quick-add') submitQuickAdd(form);
  if (form.dataset.form === 'widget-settings') submitWidgetSettings(form);
  if (form.dataset.form === 'habit') submitHabit(form);
  if (form.dataset.form === 'ai-chat') { void sendAIMessage(form.elements.message.value); form.elements.message.value = ''; }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-task-sort]')) { taskSort = target.value; render(); return; }
  if (target.matches('[data-focus-duration]')) { setFocusDuration(target.value); return; }
  if (target.matches('[data-setting]')) {
    if (target.dataset.setting === 'focus-task') { persistFocusTask(target.value); return; }
    persistSetting(target.dataset.setting, target.value); return;
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.id === 'search-page-input') {
    query = target.value;
    clearTimeout(filterRenderTimer);
    filterRenderTimer = setTimeout(() => { render(); const input = document.getElementById('search-page-input'); input?.focus(); input?.setSelectionRange(query.length, query.length); }, 160);
  }
}

function handleClick(event) {
  const link = event.target.closest('[data-navigate]');
  if (link) { event.preventDefault(); dialogRoot.querySelector('dialog')?.close(); setRoute(link.dataset.navigate); return; }
  const actionElement = event.target.closest('[data-action]');
  if (actionElement?.matches('[data-widget-resize]') && Date.now() < suppressWidgetResizeClickUntil) return;
  if (actionElement) handleAction(actionElement.dataset.action, actionElement);
}

app.addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-widget-resize]');
  if (handle) {
    if (homeLayout.locked || activeLayoutDevice() === 'mobile') return;
    const card = handle.closest('.home-widget-card');
    const item = homeLayout.items.find(entry => entry.id === handle.dataset.id);
    if (!card || !item) return;
    event.preventDefault(); event.stopPropagation();
    rememberLayoutUndo();
    widgetResizeStart = { id: item.id, pointerId: event.pointerId, card, startX: event.clientX, startWidth: card.getBoundingClientRect().width, originalSize: item.size, device: activeLayoutDevice() };
    if (event.isTrusted) handle.setPointerCapture?.(event.pointerId);
    card.classList.add('is-resizing');
    return;
  }
  const card = event.target.closest('.home-widget-card');
  if (!card || route !== 'today' || drawerOpen || document.querySelector('dialog[open]') || homeLayout.locked) return;
  if (event.target.closest('button,a,input,textarea,select,[contenteditable="true"],[data-widget-resize]')) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  widgetPointerStart = { pointerId: event.pointerId, card, x: event.clientX, y: event.clientY, pointerType: event.pointerType, pointerTrusted: event.isTrusted };
  if (event.pointerType === 'mouse') beginWidgetDrag(event.clientX, event.clientY);
  else widgetPressTimer = window.setTimeout(() => {
    if (!widgetPointerStart || widgetPointerStart.pointerId !== event.pointerId) return;
    beginWidgetDrag(widgetPointerStart.x, widgetPointerStart.y);
  }, 380);
}, { passive: false });

function beginWidgetDrag(x, y) {
  const start = widgetPointerStart;
  if (!start || widgetDragSession || homeLayout.locked) return;
  const card = start.card;
  const grid = card.closest('.home-widgets');
  const rect = card.getBoundingClientRect();
  const placeholder = document.createElement('div');
  placeholder.className = `widget-drop-placeholder size-${card.dataset.size || 'medium'}`;
  placeholder.dataset.size = card.dataset.size || 'medium';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.height = `${rect.height}px`;
  const preview = card.cloneNode(true);
  preview.removeAttribute('id'); preview.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  preview.setAttribute('aria-hidden', 'true');
  preview.classList.add('is-floating');
  Object.assign(preview.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: '1000', pointerEvents: 'none', margin: '0', transform: 'translate3d(0,0,0) scale(1.025)' });
  if (start.pointerTrusted) card.setPointerCapture?.(start.pointerId);
  card.replaceWith(placeholder);
  document.body.append(preview);
  grid.classList.add('is-reordering');
  document.body.classList.add('widget-drag-active');
  widgetDragSession = { id: card.dataset.widget, card, grid, placeholder, preview, startX: x, startY: y, dx: 0, dy: 0, device: activeLayoutDevice() };
}

function handleWidgetPointerMove(event) {
  const start = widgetPointerStart;
  if (!start || event.pointerId !== start.pointerId) return;
  if (!widgetDragSession) {
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) {
      clearTimeout(widgetPressTimer); widgetPressTimer = 0; widgetPointerStart = null;
    }
    return;
  }
  event.preventDefault();
  const session = widgetDragSession;
  session.dx = event.clientX - session.startX; session.dy = event.clientY - session.startY;
  session.pointerX = event.clientX; session.pointerY = event.clientY;
  session.preview.style.transform = `translate3d(${session.dx}px,${session.dy}px,0) scale(1.025)`;
  autoScrollWidget(session);
  const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('.home-widget-card');
  if (!hit || hit === session.card || hit.parentElement !== session.grid) return;
  const rect = hit.getBoundingClientRect();
  const sameRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
  const before = sameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
  if ((before && session.placeholder.nextElementSibling !== hit) || (!before && hit.nextElementSibling !== session.placeholder)) {
    const beforeRects = new Map([...session.grid.querySelectorAll('.home-widget-card')].map(card => [card, card.getBoundingClientRect()]));
    if (before) session.grid.insertBefore(session.placeholder, hit);
    else session.grid.insertBefore(session.placeholder, hit.nextElementSibling);
    requestAnimationFrame(() => beforeRects.forEach((oldRect, card) => {
      if (!card.isConnected) return;
      const nextRect = card.getBoundingClientRect();
      const dx = oldRect.left - nextRect.left; const dy = oldRect.top - nextRect.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      card.style.transition = 'none'; card.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      requestAnimationFrame(() => { card.style.transition = ''; card.style.transform = ''; });
    }));
  }
}

function autoScrollWidget(session) {
  if (session.autoScrollFrame || !widgetDragSession || session !== widgetDragSession) return;
  session.autoScrollFrame = requestAnimationFrame(() => {
    session.autoScrollFrame = 0;
    if (!widgetDragSession || session !== widgetDragSession) return;
    const edge = 64;
    const direction = session.pointerY < edge ? -1 : session.pointerY > window.innerHeight - edge ? 1 : 0;
    if (!direction) return;
    const speed = Math.min(20, Math.max(7, Math.round((direction < 0 ? edge - session.pointerY : session.pointerY - (window.innerHeight - edge)) / 3)));
    window.scrollBy(0, direction * speed);
    handleWidgetPointerMove({ pointerId: widgetPointerStart?.pointerId, clientX: session.pointerX, clientY: session.pointerY, preventDefault() {} });
  });
}

function finishWidgetPointer(event, canceled = false) {
  clearTimeout(widgetPressTimer); widgetPressTimer = 0;
  if (widgetResizeStart && event.pointerId === widgetResizeStart.pointerId) {
    const current = homeLayout.items.find(item => item.id === widgetResizeStart.id);
    const changed = current && current.size !== widgetResizeStart.originalSize;
    widgetResizeStart.card.classList.remove('is-resizing');
    widgetResizeStart = null;
    if (changed) { suppressWidgetResizeClickUntil = Date.now() + 400; saveHomeLayout(); showLayoutUndo('尺寸已儲存'); }
  }
  if (!widgetPointerStart || event.pointerId !== widgetPointerStart.pointerId) return;
  widgetPointerStart = null;
  if (!widgetDragSession) return;
  const session = widgetDragSession;
  widgetDragSession = null;
  if (session.autoScrollFrame) cancelAnimationFrame(session.autoScrollFrame);
  session.preview.remove();
  document.body.classList.remove('widget-drag-active');
  session.grid.classList.remove('is-reordering');
  if (canceled || Math.hypot(session.dx, session.dy) < 4) {
    session.placeholder.replaceWith(session.card);
    return;
  }
  session.placeholder.replaceWith(session.card);
  const visibleOrder = [...session.grid.querySelectorAll('.home-widget-card[data-widget]')].map(node => node.dataset.widget);
  const visible = new Set(visibleOrder);
  const itemById = new Map(homeLayout.items.map(item => [item.id, item]));
  const reordered = visibleOrder.map(id => itemById.get(id)).filter(Boolean);
  const hiddenItems = homeLayout.items.filter(item => !visible.has(item.id));
  homeLayout.items = [...reordered, ...hiddenItems];
  saveHomeLayout();
  suppressWidgetResizeClickUntil = Date.now() + 400;
  showLayoutUndo('版面已儲存');
}

window.addEventListener('pointermove', event => {
  if (widgetResizeStart && event.pointerId === widgetResizeStart.pointerId) {
    event.preventDefault();
    const item = homeLayout.items.find(entry => entry.id === widgetResizeStart.id);
    const gridWidth = widgetResizeStart.card.closest('.home-widgets')?.getBoundingClientRect().width || widgetResizeStart.startWidth;
    const ratio = Math.max(.18, Math.min(1, (widgetResizeStart.startWidth + event.clientX - widgetResizeStart.startX) / gridWidth));
    const candidates = activeLayoutDevice() === 'tablet' ? [['small', .25], ['medium', .5], ['large', .75], ['full', 1]] : [['small', .25], ['medium', 1/3], ['large', .5], ['full', 1]];
    const size = candidates.reduce((best, value) => Math.abs(value[1] - ratio) < Math.abs(best[1] - ratio) ? value : best)[0];
    if (item) { item.size = size; widgetResizeStart.card.dataset.size = size; widgetResizeStart.card.classList.remove('size-small','size-medium','size-large','size-full'); widgetResizeStart.card.classList.add(`size-${size}`); }
    return;
  }
  handleWidgetPointerMove(event);
}, { passive: false });
window.addEventListener('pointerup', event => finishWidgetPointer(event));
window.addEventListener('pointercancel', event => finishWidgetPointer(event, true));

function handleFile(event) {
  const input = event.target.closest('[data-action="import-data"]');
  if (!input || !input.files?.[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const value = JSON.parse(String(reader.result));
      if (!await confirmDialog('匯入會取代目前瀏覽器中的 DAYFLOW 資料，建議先匯出備份。要繼續嗎？', '匯入並取代')) return;
      importData(value); toast('資料匯入完成'); render();
    } catch (error) { toast(error.message || '無法讀取這個 JSON 檔案', 'error'); }
  };
  reader.readAsText(file);
}

function handleDragStart(event) {
  const card = event.target.closest('[data-task-id]');
  if (!card) return;
  draggedTaskId = card.dataset.taskId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
  card.classList.add('is-dragging');
}

function handleDragEnd(event) { event.target.closest('[data-task-id]')?.classList.remove('is-dragging'); document.querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target')); draggedTaskId = ''; }
function handleDragOver(event) {
  if (event.target.closest('[data-drop-date],[data-task-id]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
}

function handleDrop(event) {
  const taskId = draggedTaskId || event.dataTransfer.getData('text/plain');
  if (!taskId) return;
  const dateTarget = event.target.closest('[data-drop-date]');
  const taskTarget = event.target.closest('[data-task-id]');
  event.preventDefault();
  if (dateTarget) {
    updateData(data => { const task = data.tasks.find(item => item.id === taskId); if (task) task.dueDate = dateTarget.dataset.dropDate; });
    toast(`已移至 ${formatDate(dateTarget.dataset.dropDate)}`); render(); return;
  }
  if (taskTarget && taskTarget.dataset.taskId !== taskId) {
    const targetId = taskTarget.dataset.taskId;
    updateData(data => {
      const target = data.tasks.find(item => item.id === targetId);
      const dragged = data.tasks.find(item => item.id === taskId);
      if (target && dragged && target.dueDate === dragged.dueDate) dragged.sortOrder = Number(target.sortOrder || 0) - 0.5;
    });
    taskSort = 'manual'; render();
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') { if (drawerOpen) { drawerOpen = false; render(); return; } document.querySelector('dialog[open]')?.close(); return; }
  if (event.target instanceof Element && event.target.matches('[data-widget-resize]') && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const item = homeLayout.items.find(entry => entry.id === event.target.closest('.home-widget-card')?.dataset.widget);
    const sizes = ['small','medium','large','full'];
    if (item) { rememberLayoutUndo(); item.size = sizes[Math.max(0, Math.min(3, sizes.indexOf(item.size) + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1)))]; saveHomeLayout(); render(); showLayoutUndo('小工具尺寸已更新'); }
    return;
  }
  const typing = event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable=true]');
  if (route === 'today' && !typing && !drawerOpen && !document.querySelector('dialog[open]') && !event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); shiftHomeDate(event.key === 'ArrowLeft' ? 1 : -1); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); query = ''; setRoute('search'); setTimeout(() => document.getElementById('search-page-input')?.focus(), 0); return; }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { const form = event.target.closest('form'); if (form) { event.preventDefault(); form.requestSubmit(); } return; }
  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'q') { event.preventDefault(); openQuickAdd({ dueDate: route === 'today' ? homeDate : '' }); }
}

function shiftHomeDate(amount) {
  homeDate = dateKey(addDays(homeDate, amount));
  const selected = parseDate(homeDate);
  homeCalendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  homeTransitionDirection = amount > 0 ? 1 : -1;
  render();
  window.setTimeout(() => { homeTransitionDirection = 0; }, 260);
}

let swipeStart = null;
app.addEventListener('touchstart', event => {
  if (route !== 'today' || drawerOpen || document.querySelector('dialog[open]') || event.touches.length !== 1) { swipeStart = null; return; }
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest('.today-task-list, .home-calendar, .home-widget-tools, .home-widget-card, button, a, input, textarea, select, [data-no-day-swipe]')) { swipeStart = null; return; }
  swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
app.addEventListener('touchend', event => {
  if (!swipeStart || route !== 'today' || drawerOpen || document.querySelector('dialog[open]')) { swipeStart = null; return; }
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.25) shiftHomeDate(dx < 0 ? 1 : -1);
}, { passive: true });
app.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', handleChange);
document.addEventListener('input', handleInput);
document.addEventListener('change', handleFile);
document.addEventListener('dragstart', handleDragStart);
document.addEventListener('dragend', handleDragEnd);
document.addEventListener('dragover', handleDragOver);
document.addEventListener('drop', handleDrop);
document.addEventListener('keydown', handleKeydown);
window.addEventListener('hashchange', () => {
  const requested = location.hash.replace(/^#\/?/, '').split('?')[0] || 'today';
  route = validRoutes.has(requested) ? requested : 'today';
  if (requested !== route) location.hash = route;
  updateUI({ route }); render();
});
let layoutResizeTimer = 0;
window.addEventListener('resize', () => {
  if (layoutPreviewDevice) return;
  clearTimeout(layoutResizeTimer);
  layoutResizeTimer = window.setTimeout(() => {
    const device = activeLayoutDevice();
    if (homeLayout !== homeLayouts[device]) { homeLayout = homeLayouts[device]; homeEditMode = false; render(); }
  }, 120);
}, { passive: true });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getData().settings.theme === 'system') render(); });
window.setInterval(timerTick, 250);
window.setInterval(() => {
  const clock = document.getElementById('home-clock');
  if (clock) clock.textContent = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
  const systemToday = dateKey();
  if (systemToday !== observedToday) {
    if (homeDate === observedToday) homeDate = systemToday;
    observedToday = systemToday;
    if (homeDate === systemToday) homeCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
    if (route === 'today') render();
  }
}, 1000);
window.addEventListener('dayflow:data', () => { if (!document.querySelector('dialog[open]')) render(); });

async function initializeAuthentication() {
  renderAuthGate();
  try {
    authClient = await import('./auth.js');
    authClient.observeAuthState(async user => {
      authUser = user;
      authReady = true;
      authLoadError = false;
      authError = '';
      if (!user) {
        cloudClient?.stopCloudSync();
        cloudSyncStatus = 'idle';
        render();
        return;
      }

      activateUserScope(user.uid);
      focus = loadFocus();
      homeLayouts = loadHomeLayouts();
      homeLayout = homeLayouts[activeLayoutDevice()];
      homeEditMode = false;
      cloudSyncStatus = 'syncing';
      render();
      try {
        cloudClient ||= await import('./cloud-store.js');
        const result = await cloudClient.startCloudSync(user.uid, status => {
          if (authUser?.uid !== user.uid) return;
          cloudSyncStatus = status;
          if (authReady && authUser) render();
        });
        if (result?.needsInitialUpload && authUser?.uid === user.uid) await enableCloudDataForCurrentUser();
      } catch (error) {
        console.error('DAYFLOW Firestore 啟動失敗。', error);
        if (authUser?.uid === user.uid) { cloudSyncStatus = 'error'; render(); }
      }
    });
  } catch (error) {
    console.error('DAYFLOW Firebase Authentication 初始化失敗。', error);
    authReady = true;
    authLoadError = true;
    renderAuthGate();
  }
}

initializeAuthentication();
