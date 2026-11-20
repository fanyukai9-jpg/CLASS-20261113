import { addDays, dateKey, formatDate, formatTime, getGreeting, parseDate, parseQuickDate } from './dates.js';
import { clearAllData, clearDemoData, createTask, exportData, getData, getUIState, importData, newId, resetDemoData, updateData, updateUI } from './data.js';
import { icon, renderTaskForm, statusLabels } from './components.js';
import { renderPage } from './pages.js';
import { createHomeLayouts, defaultHomeLayouts, defaultWidget, renderWidgetPicker, WIDGET_REGISTRY } from './widgets.js';
import { confirmDialog, escapeHTML, openDialog, toast } from './ui.js';

const app = document.getElementById('app');
const dialogRoot = document.getElementById('dialog-root');
const filters = { query: '', priority: '', project: '', date: '', sort: 'date' };
const selectedTasks = new Set();
const focus = loadFocus();
let route = location.hash.replace(/^#\/?/, '').split('?')[0] || getUIState().route || 'today';
let calendarDate = dateKey();
let calendarMode = 'month';
let taskView = 'list';
let projectView = 'list';
let statsRange = 7;
let query = '';
let draggedTaskId = '';
let draggedWidgetId = '';
let widgetResizeStart = null;
let widgetPointerStart = null;
let widgetPressTimer = 0;
let widgetDragSession = null;
let layoutUndo = null;
let suppressWidgetResizeClickUntil = 0;
let focusWheelScrollTimer;
const userScrolledFocusWheels = new WeakSet();
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

function detectLayoutDevice() {
  return matchMedia('(max-width: 700px)').matches ? 'mobile' : matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop';
}

function activeLayoutDevice() {
  return layoutPreviewDevice || detectLayoutDevice();
}

function loadHomeLayouts() {
  try {
    const saved = localStorage.getItem('dayflow.home-layout.v3') || localStorage.getItem('dayflow.home-layout.v2') || localStorage.getItem('dayflow.home-layout.v1');
    return createHomeLayouts(saved ? JSON.parse(saved) : {});
  } catch { return defaultHomeLayouts(); }
}

function saveHomeLayout() {
  try {
    homeLayouts[activeLayoutDevice()] = homeLayout;
    localStorage.setItem('dayflow.home-layout.v3', JSON.stringify({ layouts: homeLayouts }));
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
  const defaults = { mode: 'focus', durations: { focus: 25, short: 5, long: 15 }, remainingMs: 25 * 60000, running: false, started: false, endAt: 0, taskId: '', completedCount: 0 };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('dayflow.focus.v1') || '{}'), durations: { ...defaults.durations, ...(JSON.parse(localStorage.getItem('dayflow.focus.v1') || '{}').durations || {}) } }; }
  catch { return defaults; }
}

function saveFocus() {
  try { localStorage.setItem('dayflow.focus.v1', JSON.stringify(focus)); } catch { /* Timer state can be recreated. */ }
}

function context() {
  if (focus.running) focus.remainingMs = Math.max(0, focus.endAt - Date.now());
  return { greeting: getGreeting(), filters, taskView, projectView, calendarDate, calendarMode, statsRange, query, focus, homeDate, homeCalendarMonth, homeLayout, homeEditMode, homeTransitionDirection, layoutDevice: activeLayoutDevice() };
}

function render() {
  const data = getData();
  applyPreferences(data.settings);
  const selected = selectedTasks.size;
  app.innerHTML = `<div class="app-shell">
    <div class="app-main"><header class="topbar"><a class="brand" href="#today" data-navigate="today" aria-label="DAYFLOW 首頁"><span class="brand-mark">D</span><span class="brand-name">DAYFLOW</span></a><div class="topbar-actions"><button class="icon-button topbar-icon" data-action="open-search" aria-label="搜尋任務" title="搜尋任務">${icon('search')}</button><button class="button button-primary quick-add-button" data-action="quick-add" aria-label="新增待辦" title="新增待辦" ${route === 'today' ? `data-date="${escapeHTML(homeDate)}"` : ''}>${icon('plus')}<span>新增</span></button><button class="icon-button topbar-icon" data-action="toggle-drawer" aria-label="開啟選單" aria-expanded="${drawerOpen}" title="選單">${icon('menu')}</button></div></header>
      <main class="main-content">${renderPage(route, data, context())}</main>
    </div>
    ${drawerOpen ? renderDrawer(data) : ''}
    ${selected ? `<div class="bulk-bar"><span>已選取 ${selected} 項</span><button class="button button-small" data-action="bulk-complete">全部完成</button><select data-bulk-priority aria-label="變更優先級"><option value="">變更優先級</option><option value="p1">P1 緊急</option><option value="p2">P2 高</option><option value="p3">P3 一般</option><option value="p4">P4 低</option></select><button class="button button-small button-danger" data-action="bulk-delete">刪除</button><button class="icon-button" data-action="clear-selection" aria-label="取消選取">${icon('close')}</button></div>` : ''}
  </div>`;
  applySelections();
  requestAnimationFrame(() => app.querySelectorAll('.focus-wheel').forEach(wheel => {
    const selected = wheel.querySelector('[aria-selected="true"]');
    if (selected) wheel.scrollTop = selected.offsetTop - (wheel.clientHeight - selected.offsetHeight) / 2;
  }));
}

function renderDrawer(data) {
  const routes = [['today', '今天'], ['inbox', '收集箱', inboxCount(data)], ['calendar', '行事曆'], ['lists', '我的清單'], ['projects', '專案'], ['habits', '習慣'], ['focus', '專注'], ['statistics', '統計'], ['settings', '設定']];
  return `<div class="drawer-scrim" data-action="close-drawer" aria-hidden="true"></div><aside class="app-drawer" aria-label="主選單"><div class="drawer-heading"><div><p class="eyebrow">DAYFLOW</p><h2>導覽</h2></div><button class="icon-button" data-action="close-drawer" aria-label="關閉選單">${icon('close')}</button></div><nav class="drawer-nav">${routes.map(([id, label, badge]) => `<a href="#${id}" data-navigate="${id}" class="drawer-nav-link ${route === id ? 'is-active' : ''}">${icon(({ today: 'today', inbox: 'inbox', calendar: 'calendar', lists: 'projects', projects: 'projects', habits: 'habits', focus: 'focus', statistics: 'stats', settings: 'settings' })[id])}<span>${label}</span>${badge ? `<i>${badge}</i>` : ''}</a>`).join('')}</nav><div class="drawer-projects"><div class="drawer-section-heading"><span>專案捷徑</span><button class="icon-button" data-action="project-add" aria-label="新增專案">${icon('plus')}</button></div>${data.projects.map(project => `<a class="drawer-project-link" href="#project/${encodeURIComponent(project.id)}" data-navigate="project/${escapeHTML(project.id)}"><i style="--project-color:${escapeHTML(project.color || '#6674b8')}"></i>${escapeHTML(project.name)}</a>`).join('') || '<p class="empty-inline">尚無專案</p>'}</div><div class="drawer-footer"><span class="local-indicator"></span>資料儲存在此裝置</div></aside>`;
}

function dueSoonCount(data) { return data.tasks.filter(task => task.status !== 'completed' && task.dueDate >= dateKey() && task.dueDate <= dateKey(addDays(new Date(), 7))).length; }
function inboxCount(data) { return data.tasks.filter(task => task.status !== 'completed' && !task.dueDate && !task.projectId && (!task.listId || task.listId === 'list-inbox')).length; }

function applyPreferences(settings) {
  const dark = settings.theme === 'dark' || settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', settings.accent || '#6674b8');
  document.documentElement.classList.toggle('density-compact', Boolean(settings.compact));
}

function applySelections() {
  app.querySelectorAll('[data-select-task]').forEach(input => { input.checked = selectedTasks.has(input.dataset.selectTask); });
}

function setRoute(value) {
  route = value;
  drawerOpen = false;
  updateUI({ route: value });
  if (location.hash !== `#${value}`) location.hash = value;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openQuickAdd(options = {}) {
  const data = getData();
  if (options.kind === 'project') {
    const dialog = openDialog('快速新增', `<div class="quick-add-tabs"><button data-action="quick-add-type" data-type="task">待辦</button><button class="is-active" data-action="quick-add-type" data-type="project">專案</button></div><form class="form-grid quick-add-form" data-form="quick-project"><label class="field full"><span>專案名稱</span><input name="name" maxlength="60" value="${escapeHTML(options.name || '')}" placeholder="新專案"></label><label class="field"><span>專案顏色</span><input type="color" name="color" value="${escapeHTML(options.color || '#6674b8')}"></label><label class="field"><span>專案日期</span><input type="date" name="deadline" value="${escapeHTML(options.deadline || '')}"></label><label class="field full"><span>描述</span><textarea name="description" rows="2" placeholder="選填">${escapeHTML(options.description || '')}</textarea></label><div class="form-actions full"><button class="button button-primary" type="submit">建立專案</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
    return dialog;
  }
  const parsed = options.title ? parseQuickDate(options.title) : { date: options.dueDate || '', time: '', title: options.title || '', recurrence: 'none' };
  const projects = data.projects.map(project => `<option value="${escapeHTML(project.id)}" ${options.projectId === project.id ? 'selected' : ''}>${escapeHTML(project.name)}</option>`).join('');
  const lists = (data.lists || []).map(list => `<option value="${escapeHTML(list.id)}" ${options.listId === list.id || (!options.listId && list.id === 'list-inbox') ? 'selected' : ''}>${escapeHTML(list.name)}</option>`).join('');
  const recurrenceLabel = parsed.recurrence === 'daily' ? ' · 每天重複' : parsed.recurrence === 'weekly' ? ' · 每週重複' : '';
  const dialog = openDialog('快速新增', `<div class="quick-add-tabs"><button class="is-active" data-action="quick-add-type" data-type="task">待辦</button><button data-action="quick-add-type" data-type="project">專案</button></div><p class="muted quick-add-hint">支援「明天下午 3 點健身」、「每週一整理課程」等簡單日期與時間。</p><form class="form-grid quick-add-form" data-form="quick-add"><label class="field full"><span>任務名稱</span><input name="title" maxlength="120" required autofocus value="${escapeHTML(options.title || '')}" placeholder="先記下要做的事"></label><div class="quick-parse-note full" data-parse-note>${parsed.date ? `辨識為 ${escapeHTML(formatDate(parsed.date))}${parsed.time ? ` ${escapeHTML(formatTime(parsed.time, data.settings.hour24))}` : ''}${recurrenceLabel}` : '也可以稍後再安排時間。'}</div><label class="field"><span>清單</span><select name="listId">${lists}</select></label><label class="field"><span>所屬專案</span><select name="projectId"><option value="">不指定</option>${projects}</select></label><label class="field"><span>優先級</span><select name="priority">${[['', '無優先級'], ['p4', '低'], ['p3', '中'], ['p2', '高'], ['p1', '緊急']].map(([value, label]) => `<option value="${value}" ${value === (options.priority || '') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>日期</span><input type="date" name="dueDate" value="${escapeHTML(options.dueDate || '')}"></label><label class="field"><span>時間</span><input type="time" name="startTime" value="${escapeHTML(options.startTime || '')}"></label><div class="form-actions full"><button class="button button-primary" type="submit">建立待辦</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  const form = dialog.querySelector('form');
  if (options.inbox) { form.elements.projectId.value = ''; form.elements.listId.value = 'list-inbox'; form.elements.dueDate.value = ''; }
  if (options.dueDate) form.elements.dueDate.value = options.dueDate;
  form.addEventListener('input', event => {
    if (event.target.name !== 'title') return;
    const suggestion = parseQuickDate(event.target.value);
    const recurrence = suggestion.recurrence === 'daily' ? ' · 每天重複' : suggestion.recurrence === 'weekly' ? ' · 每週重複' : '';
    dialog.querySelector('[data-parse-note]').textContent = suggestion.date ? `辨識為 ${formatDate(suggestion.date)}${suggestion.time ? ` ${formatTime(suggestion.time, data.settings.hour24)}` : ''}${recurrence}` : '未辨識日期，會保留原始任務名稱。';
    if (suggestion.date) form.elements.dueDate.value = suggestion.date;
    if (suggestion.time && !form.elements.startTime.value) form.elements.startTime.value = suggestion.time;
  });
}

function openTaskEditor(taskId = '', options = {}) {
  const data = getData();
  const task = taskId ? data.tasks.find(item => item.id === taskId) : null;
  if (taskId && !task) return;
  const dialog = openDialog(task ? '編輯任務' : '新增任務', renderTaskForm(task, data, options), { wide: true });
  dialog.querySelector('form').dataset.project = options.projectId || '';
}

function openTaskDetail(taskId) {
  const data = getData();
  const task = data.tasks.find(item => item.id === taskId);
  if (!task) return;
  const project = data.projects.find(item => item.id === task.projectId);
  const subtasks = task.subtasks?.length ? `<div class="detail-subtasks"><h3>子任務</h3>${task.subtasks.map((subtask, index) => `<label class="subtask-row"><input type="checkbox" data-action="toggle-subtask" data-id="${escapeHTML(task.id)}" data-index="${index}" ${subtask.done ? 'checked' : ''}><span>${escapeHTML(subtask.title)}</span></label>`).join('')}</div>` : '';
  const dialog = openDialog('任務詳細', `<div class="task-detail"><div class="task-detail-top"><label class="priority-select-label"><span class="priority-dot ${task.priority || 'none'}"></span><select data-task-priority="${escapeHTML(task.id)}">${[['none','無優先級'],['p4','低'],['p3','中'],['p2','高'],['p1','緊急']].map(([value,label]) => `<option value="${value}" ${(task.priority || 'none') === value ? 'selected' : ''}>${label}優先級</option>`).join('')}</select></label><select data-task-status="${escapeHTML(task.id)}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><h2>${escapeHTML(task.title)}</h2>${task.description ? `<p>${escapeHTML(task.description)}</p>` : '<p class="muted">尚未新增描述</p>'}<div class="detail-meta">${task.dueDate ? `<span>期限：${escapeHTML(formatDate(task.dueDate))}</span>` : '<span>尚未安排日期</span>'}${task.startTime ? `<span>開始：${escapeHTML(formatTime(task.startTime, data.settings.hour24))}</span>` : ''}${task.endTime ? `<span>結束：${escapeHTML(formatTime(task.endTime, data.settings.hour24))}</span>` : ''}<span>預估：${Number(task.estimatedDuration || 25)} 分鐘</span>${project ? `<span>專案：${escapeHTML(project.name)}</span>` : ''}<span>重複：${escapeHTML(({ none: '不重複', daily: '每天', weekly: '每週', monthly: '每月' })[task.recurrence] || '不重複')}</span><span>建立於 ${escapeHTML(formatDate(task.createdAt, { year: true }))}</span>${task.tags?.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join('') || ''}</div>${subtasks}${task.notes ? `<div class="detail-notes"><h3>備註</h3><p>${escapeHTML(task.notes)}</p></div>` : ''}<div class="form-actions"><button class="button button-primary" data-action="task-edit" data-id="${escapeHTML(task.id)}">編輯</button><button class="button" data-action="toggle-task" data-id="${escapeHTML(task.id)}">${task.status === 'completed' ? '標記未完成' : '完成任務'}</button><button class="button button-danger" data-action="task-delete" data-id="${escapeHTML(task.id)}">刪除</button></div></div>`, { wide: true });
  dialog.querySelector('[data-task-status]')?.addEventListener('change', event => {
    updateData(next => { const found = next.tasks.find(item => item.id === task.id); if (found) { found.status = event.target.value; found.completedAt = found.status === 'completed' ? new Date().toISOString() : ''; } });
    toast('任務狀態已更新');
    openTaskDetail(task.id);
  });
}

function openProjectForm(projectId = '') {
  const project = projectId ? getData().projects.find(item => item.id === projectId) : null;
  const dialog = openDialog(project ? '編輯專案' : '新增專案', `<form class="form-grid" data-form="project"><input type="hidden" name="id" value="${escapeHTML(project?.id || '')}"><label class="field full"><span>專案名稱</span><input name="name" required maxlength="60" value="${escapeHTML(project?.name || '')}" placeholder="例如：作品集改版"></label><label class="field full"><span>描述</span><textarea name="description" rows="3">${escapeHTML(project?.description || '')}</textarea></label><label class="field"><span>專案色彩</span><input type="color" name="color" value="${escapeHTML(project?.color || '#6674b8')}"></label><label class="field"><span>期限</span><input type="date" name="deadline" value="${escapeHTML(project?.deadline || '')}"></label><div class="form-actions full"><button class="button button-primary" type="submit">${project ? '儲存專案' : '建立專案'}</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  dialog.querySelector('input[name="name"]')?.focus({ preventScroll: true });
}

function openWidgetSettings(widgetId) {
  const item = homeLayout.items.find(entry => entry.id === widgetId);
  if (!item) return;
  const data = getData();
  const projects = data.projects.map(project => `<option value="${escapeHTML(project.id)}" ${item.config?.projectId === project.id ? 'selected' : ''}>${escapeHTML(project.name)}</option>`).join('');
  const goals = data.goals || [];
  const selectedGoal = goals.find(goal => goal.id && goal.id === item.config?.goalId) || goals[0];
  const goalOptions = `<option value="">新增目標</option>${goals.map((goal, index) => `<option value="${escapeHTML(goal.id || `legacy-${index}`)}" ${(selectedGoal === goal) ? 'selected' : ''}>${escapeHTML(goal.name || `目標 ${index + 1}`)}</option>`).join('')}`;
  const dialog = openDialog('小工具設定', `<form class="form-grid" data-form="widget-settings"><input type="hidden" name="id" value="${escapeHTML(item.id)}"><label class="field full"><span>小工具名稱</span><input name="name" maxlength="40" value="${escapeHTML(item.name || WIDGET_REGISTRY[item.type]?.name || '')}"></label>${item.type === 'countdown' ? `<label class="field"><span>目標名稱</span><input name="target" value="${escapeHTML(item.config?.target || '')}" placeholder="例如：旅行"></label><label class="field"><span>目標日期</span><input type="date" name="date" value="${escapeHTML(item.config?.date || '')}"></label>` : ''}${item.type === 'projectTasks' ? `<label class="field full"><span>選擇專案</span><select name="projectId">${projects}</select></label>` : ''}${item.type === 'goals' ? `<label class="field full"><span>選擇或新增目標</span><select name="goalId">${goalOptions}</select></label><label class="field full"><span>目標名稱</span><input name="goalName" maxlength="60" value="${escapeHTML(selectedGoal?.name || '')}" placeholder="例如：每週閱讀"></label><label class="field"><span>目標值</span><input type="number" name="target" min="1" value="${Number(selectedGoal?.target || 1)}"></label><label class="field"><span>目前進度</span><input type="number" name="progress" min="0" value="${Number(selectedGoal?.progress || 0)}"></label>` : ''}<div class="form-actions full"><button class="button button-primary" type="submit">儲存</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  if (item.type === 'goals') {
    const selector = dialog.querySelector('[name="goalId"]');
    selector?.addEventListener('change', () => {
      const goal = goals.find((entry, index) => (entry.id || `legacy-${index}`) === selector.value);
      dialog.querySelector('[name="goalName"]').value = goal?.name || '';
      dialog.querySelector('[name="target"]').value = goal?.target || 1;
      dialog.querySelector('[name="progress"]').value = goal?.progress || 0;
    });
  }
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

function openListForm(listId = '') {
  const list = listId ? getData().lists.find(item => item.id === listId) : null;
  openDialog(list ? '編輯清單' : '新增清單', `<form class="form-grid" data-form="list"><input type="hidden" name="id" value="${escapeHTML(list?.id || '')}"><label class="field full"><span>清單名稱</span><input name="name" maxlength="50" required value="${escapeHTML(list?.name || '')}" placeholder="例如：閱讀清單"></label><label class="field"><span>顏色</span><input type="color" name="color" value="${escapeHTML(list?.color || '#6574b8')}"></label><div class="form-actions full"><button class="button button-primary" type="submit">${list ? '儲存清單' : '建立清單'}</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
}

function openHabitForm(id = '') {
  const habit = id ? getData().habits.find(item => item.id === id) : null;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const dialog = openDialog(habit ? '編輯習慣' : '新增習慣', `<form class="form-grid" data-form="habit"><input type="hidden" name="id" value="${escapeHTML(habit?.id || '')}"><label class="field full"><span>習慣名稱</span><input name="name" required maxlength="60" value="${escapeHTML(habit?.name || '')}" placeholder="例如：散步 20 分鐘"></label><label class="field full"><span>描述</span><input name="description" maxlength="120" value="${escapeHTML(habit?.description || '')}" placeholder="為什麼這件事對你重要？"></label><label class="field"><span>色彩</span><input type="color" name="color" value="${escapeHTML(habit?.color || '#6674b8')}"></label><fieldset class="field full frequency-field"><legend>每週頻率</legend><div class="weekday-picker">${days.map((day, index) => `<label><input type="checkbox" name="frequency" value="${day}" ${(habit?.frequency || [1, 2, 3, 4, 5, 6, 0]).includes(day) ? 'checked' : ''}><span>${['一', '二', '三', '四', '五', '六', '日'][index]}</span></label>`).join('')}</div></fieldset><div class="form-actions full"><button class="button button-primary" type="submit">${habit ? '儲存習慣' : '建立習慣'}</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  dialog.querySelector('input[name="name"]')?.focus({ preventScroll: true });
}

function openTaskMenu(taskId) {
  openDialog('任務操作', `<div class="action-menu-list"><button class="button" data-action="task-edit" data-id="${escapeHTML(taskId)}">編輯任務</button><button class="button" data-action="duplicate-task" data-id="${escapeHTML(taskId)}">複製任務</button><button class="button button-danger" data-action="task-delete" data-id="${escapeHTML(taskId)}">刪除任務</button></div>`);
}

function parseFormTask(form) {
  const formData = new FormData(form);
  const id = String(formData.get('id') || '');
  const original = id ? getData().tasks.find(item => item.id === id) : null;
  const subtasksByTitle = new Map((original?.subtasks || []).map(item => [item.title, item]));
  const subtasks = String(formData.get('subtasks') || '').split('\n').map(title => title.trim()).filter(Boolean).map(title => {
    const previous = subtasksByTitle.get(title);
    return previous ? { ...previous, title } : { id: newId('subtask'), title, done: false };
  });
  const task = createTask({
    title: formData.get('title'), description: formData.get('description'), status: original?.status || 'todo',
    priority: formData.get('priority'), dueDate: formData.get('dueDate'), startTime: formData.get('startTime'), endTime: formData.get('endTime'),
    estimatedDuration: formData.get('estimatedDuration'), projectId: formData.get('projectId'), listId: formData.get('listId'), tags: formData.get('tags'),
    subtasks, notes: formData.get('notes'), recurrence: formData.get('recurrence'),
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
    dueDate: parsed.date || form.elements.dueDate.value,
    startTime: form.elements.startTime.value || parsed.time,
    priority: form.elements.priority.value,
    projectId: form.elements.projectId.value,
    listId: form.elements.listId.value,
    recurrence: parsed.recurrence,
  });
  if (!task.title) return;
  updateData(data => data.tasks.push(task));
  dialogRoot.querySelector('dialog')?.close();
  toast('任務已加入');
  render();
}

function toggleTask(taskId) {
  let previous;
  let recurringId = '';
  updateData(data => {
    const task = data.tasks.find(item => item.id === taskId);
    if (!task) return;
    previous = task.status;
    task.status = previous === 'completed' ? 'todo' : 'completed';
    task.completedAt = task.status === 'completed' ? new Date().toISOString() : '';
    if (task.status === 'completed' && task.recurrence !== 'none' && task.dueDate) {
      const due = parseDate(task.dueDate);
      if (task.recurrence === 'daily') due.setDate(due.getDate() + 1);
      if (task.recurrence === 'weekly') due.setDate(due.getDate() + 7);
      if (task.recurrence === 'monthly') {
        const day = due.getDate();
        due.setDate(1);
        due.setMonth(due.getMonth() + 1);
        due.setDate(Math.min(day, new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()));
      }
      const next = createTask({ ...task, title: task.title, dueDate: dateKey(due), status: 'todo' });
      next.projectId = task.projectId; next.tags = [...task.tags]; next.subtasks = task.subtasks.map(item => ({ ...item, id: newId('subtask'), done: false })); next.recurrence = task.recurrence;
      recurringId = next.id;
      data.tasks.push(next);
    }
  });
  if (previous !== undefined) {
    if (previous === 'completed') toast('任務已重新開啟');
    else toast('任務已完成', 'success', { label: '復原', run: () => updateData(data => { const task = data.tasks.find(item => item.id === taskId); if (task) { task.status = 'todo'; task.completedAt = ''; } if (recurringId) data.tasks = data.tasks.filter(item => item.id !== recurringId); render(); }) });
  }
  render();
}

async function deleteTask(taskId) {
  const task = getData().tasks.find(item => item.id === taskId);
  if (!task || !await confirmDialog(`確定刪除「${task.title}」？此動作無法復原。`)) return;
  updateData(data => { data.tasks = data.tasks.filter(item => item.id !== taskId); });
  selectedTasks.delete(taskId);
  dialogRoot.querySelector('dialog')?.close();
  toast('任務已刪除');
  render();
}

function duplicateTask(taskId) {
  const task = getData().tasks.find(item => item.id === taskId);
  if (!task) return;
  const clone = createTask({ ...task, title: `${task.title}（副本）`, status: 'todo', subtasks: task.subtasks.map(item => ({ ...item, id: newId('subtask'), done: false })) });
  updateData(data => data.tasks.push(clone));
  dialogRoot.querySelector('dialog')?.close();
  toast('已建立副本');
  render();
}

function submitProject(form) {
  const fields = new FormData(form);
  const id = String(fields.get('id') || '');
  const quick = form.dataset.form === 'quick-project';
  const project = { id: id || newId('project'), name: String(fields.get('name') || '').trim() || '未命名專案', description: String(fields.get('description') || '').trim(), color: fields.get('color') || '#6674b8', deadline: fields.get('deadline') || '', icon: 'projects', createdAt: id ? getData().projects.find(item => item.id === id)?.createdAt : new Date().toISOString(), demo: false };
  updateData(data => { const index = data.projects.findIndex(item => item.id === id); if (index >= 0) data.projects[index] = project; else data.projects.push(project); });
  dialogRoot.querySelector('dialog')?.close();
  toast(id ? '專案已更新' : '專案已建立');
  if (!quick && !id) setRoute(`project/${project.id}`); else render();
}

function submitList(form) {
  const fields = new FormData(form);
  const id = String(fields.get('id') || '');
  const name = String(fields.get('name') || '').trim();
  if (!name) return;
  const current = id ? getData().lists.find(item => item.id === id) : null;
  const list = { id: id || newId('list'), name, color: fields.get('color') || '#6574b8', system: current?.system || false, createdAt: current?.createdAt || new Date().toISOString() };
  updateData(data => { const index = data.lists.findIndex(item => item.id === id); if (index >= 0) data.lists[index] = list; else data.lists.push(list); });
  dialogRoot.querySelector('dialog')?.close();
  toast(id ? '清單已更新' : '清單已建立');
  render();
}

async function deleteList(id) {
  const list = getData().lists.find(item => item.id === id);
  if (!list || list.system || !await confirmDialog(`刪除「${list.name}」？清單中的任務會保留並移到收集箱。`)) return;
  updateData(data => { data.lists = data.lists.filter(item => item.id !== id); data.tasks.forEach(task => { if (task.listId === id) task.listId = 'list-inbox'; }); });
  toast('清單已刪除，任務已保留');
  setRoute('lists');
}

function submitWidgetSettings(form) {
  const fields = new FormData(form);
  const item = homeLayout.items.find(entry => entry.id === fields.get('id'));
  if (!item) return;
  item.name = String(fields.get('name') || '').trim() || WIDGET_REGISTRY[item.type]?.name || '小工具';
  if (item.type === 'countdown') item.config = { ...item.config, target: String(fields.get('target') || '').trim(), date: String(fields.get('date') || '') };
  if (item.type === 'projectTasks') item.config = { ...item.config, projectId: String(fields.get('projectId') || '') };
  if (item.type === 'goals') {
    const selectedId = String(fields.get('goalId') || '');
    const currentGoals = getData().goals || [];
    let goalIndex = currentGoals.findIndex((goal, index) => (goal.id || `legacy-${index}`) === selectedId);
    const existing = goalIndex >= 0 ? currentGoals[goalIndex] : null;
    const goal = { ...existing, id: existing?.id || newId('goal'), name: String(fields.get('goalName') || '').trim() || '未命名目標', target: Math.max(1, Number(fields.get('target') || 1)), progress: Math.max(0, Number(fields.get('progress') || 0)) };
    updateData(data => { data.goals ||= []; if (goalIndex >= 0) data.goals[goalIndex] = goal; else data.goals.push(goal); });
    item.config = { ...item.config, goalId: goal.id };
  }
  saveHomeLayout();
  dialogRoot.querySelector('dialog')?.close();
  toast('小工具已更新');
  render();
}

async function deleteProject(projectId) {
  const project = getData().projects.find(item => item.id === projectId);
  if (!project || !await confirmDialog(`刪除「${project.name}」？專案中的任務會移到收集箱。`)) return;
  updateData(data => { data.projects = data.projects.filter(item => item.id !== projectId); data.tasks.forEach(task => { if (task.projectId === projectId) task.projectId = ''; }); });
  setRoute('projects');
  toast('專案已刪除，任務已保留在收集箱');
}

function submitHabit(form) {
  const fields = new FormData(form);
  const id = String(fields.get('id') || '');
  const current = id ? getData().habits.find(item => item.id === id) : null;
  const habit = { id: id || newId('habit'), name: String(fields.get('name')).trim(), description: String(fields.get('description') || '').trim(), color: fields.get('color'), frequency: fields.getAll('frequency').map(Number), target: 1, logs: current?.logs || {}, createdAt: current?.createdAt || new Date().toISOString(), demo: false };
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

function toggleSubtask(taskId, index) {
  dialogRoot.querySelector('dialog')?.close();
  updateData(data => { const task = data.tasks.find(item => item.id === taskId); if (task?.subtasks?.[index]) task.subtasks[index].done = !task.subtasks[index].done; });
  openTaskDetail(taskId);
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
  if (focus.remainingMs <= 0) focus.remainingMs = focus.durations[focus.mode] * 60000;
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

function timerReset() {
  focus.running = false; focus.started = false; focus.endAt = 0; focus.remainingMs = focus.durations[focus.mode] * 60000;
  saveFocus(); render();
}

function timerChangeMode(mode) {
  focus.mode = mode; focus.running = false; focus.started = false; focus.endAt = 0; focus.remainingMs = focus.durations[mode] * 60000;
  saveFocus(); render();
}

function timerSkip() {
  if (focus.mode === 'focus') focus.completedCount++;
  const nextMode = focus.mode === 'focus' ? focus.completedCount % 4 === 0 ? 'long' : 'short' : 'focus';
  timerChangeMode(nextMode);
  toast('已切換計時階段', 'info');
}

function timerFinish() {
  focus.running = false; focus.started = false; focus.endAt = 0;
  if (focus.mode === 'focus') {
    const minutes = Number(focus.durations.focus);
    focus.completedCount++;
    updateData(data => data.focusSessions.push({ id: newId('focus'), date: dateKey(), minutes, taskId: focus.taskId, createdAt: new Date().toISOString(), demo: false }));
    const taskName = getData().tasks.find(item => item.id === focus.taskId)?.title;
    toast(taskName ? `已完成專注：${taskName}` : '專注時段完成');
    focus.mode = focus.completedCount % 4 === 0 ? 'long' : 'short';
  } else { toast('休息結束，準備開始下一段專注', 'info'); focus.mode = 'focus'; }
  focus.remainingMs = focus.durations[focus.mode] * 60000;
  saveFocus(); render();
}

function timerTick() {
  if (!focus.running) return;
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
  if (focus.remainingMs <= 0) timerFinish();
}

function setFocusWheel(unit, value) {
  if (focus.started || focus.running) return;
  const current = Number(focus.durations[focus.mode] || 25);
  const hour = Math.floor(current / 60);
  const minute = current % 60;
  let next = unit === 'hours' ? Number(value) * 60 + (Number(value) === 2 ? 0 : minute) : (hour === 2 && Number(value) > 0 ? 60 : hour * 60) + Number(value);
  const max = focus.mode === 'focus' ? 120 : focus.mode === 'short' ? 60 : 90;
  next = Math.max(1, Math.min(max, next));
  focus.durations[focus.mode] = next;
  focus.remainingMs = next * 60000;
  saveFocus(); render();
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  switch (action) {
    case 'navigate-projects': setRoute('projects'); break;
    case 'quick-add': openQuickAdd({ inbox: element.dataset.inbox === 'true', projectId: element.dataset.project || '', dueDate: element.dataset.date || (route === 'today' ? homeDate : '') }); break;
    case 'quick-add-type': dialogRoot.querySelector('dialog')?.close(); openQuickAdd({ kind: element.dataset.type === 'project' ? 'project' : 'task' }); break;
    case 'open-task-form': openTaskEditor('', { inbox: element.dataset.inbox === 'true' }); break;
    case 'task-edit': dialogRoot.querySelector('dialog')?.close(); openTaskEditor(id); break;
    case 'task-detail': openTaskDetail(id); break;
    case 'task-menu': openTaskMenu(id); break;
    case 'toggle-task': toggleTask(id); break;
    case 'task-delete': await deleteTask(id); break;
    case 'duplicate-task': duplicateTask(id); break;
    case 'close-dialog': dialogRoot.querySelector('dialog')?.close(); break;
    case 'more-nav':
    case 'toggle-drawer': drawerOpen = !drawerOpen; render(); break;
    case 'close-drawer': drawerOpen = false; render(); break;
    case 'open-search': query = ''; setRoute('search'); setTimeout(() => document.getElementById('search-page-input')?.focus(), 0); break;
    case 'task-view': taskView = element.dataset.view; render(); break;
    case 'project-add': openProjectForm(); break;
    case 'project-edit': openProjectForm(id); break;
    case 'project-delete': await deleteProject(id); break;
    case 'project-view': projectView = element.dataset.view; render(); break;
    case 'list-add': openListForm(); break;
    case 'list-edit': openListForm(id); break;
    case 'list-delete': await deleteList(id); break;
    case 'habit-add': openHabitForm(); break;
    case 'habit-edit': openHabitForm(id); break;
    case 'habit-delete': await deleteHabit(id); break;
    case 'toggle-habit': toggleHabit(id); break;
    case 'toggle-subtask': toggleSubtask(id, Number(element.dataset.index)); break;
    case 'calendar-mode': calendarMode = element.dataset.mode; render(); break;
    case 'calendar-today': calendarDate = dateKey(); render(); break;
    case 'calendar-jump': calendarDate = element.dataset.date; calendarMode = 'day'; setRoute('calendar'); break;
    case 'calendar-shift': { const current = parseDate(calendarDate); const step = Number(element.dataset.step); if (calendarMode === 'month') current.setMonth(current.getMonth() + step); else current.setDate(current.getDate() + step * (calendarMode === 'week' ? 7 : 1)); calendarDate = dateKey(current); render(); break; }
    case 'calendar-add': openQuickAdd({ dueDate: element.dataset.date }); break;
    case 'home-date-today': homeDate = dateKey(); homeCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12); render(); break;
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
    case 'home-widget-delete': rememberLayoutUndo(); homeLayout.items = homeLayout.items.filter(item => item.id !== id); homeLayout.hidden = homeLayout.hidden.filter(item => item !== id); saveHomeLayout(); render(); showLayoutUndo('已從首頁移除小工具'); break;
    case 'home-widget-unhide': rememberLayoutUndo(); homeLayout.hidden = homeLayout.hidden.filter(item => item !== id); saveHomeLayout(); dialogRoot.querySelector('dialog')?.close(); render(); showLayoutUndo('已顯示模組'); break;
    case 'home-widget-add': { const type = element.dataset.type; if (WIDGET_REGISTRY[type] && !homeLayout.items.some(item => item.type === type)) { rememberLayoutUndo(); const item = defaultWidget(type); if (activeLayoutDevice() === 'mobile') item.size = 'small'; homeLayout.items.push(item); saveHomeLayout(); dialogRoot.querySelector('dialog')?.close(); homeEditMode = false; render(); showLayoutUndo('已加入首頁模組'); } break; }
    case 'stats-range': statsRange = Number(element.dataset.range); render(); break;
    case 'focus-mode': timerChangeMode(element.dataset.mode); break;
    case 'focus-duration-wheel': setFocusWheel(element.dataset.wheel, element.dataset.value); break;
    case 'focus-start': timerStart(); break;
    case 'focus-pause': timerPause(); break;
    case 'focus-reset': timerReset(); break;
    case 'focus-skip': timerSkip(); break;
    case 'export-data': downloadExport(); break;
    case 'clear-demo': if (await confirmDialog('移除範例任務、習慣和專注紀錄？自建資料會保留。', '清除範例')) { clearDemoData(); toast('範例資料已清除'); render(); } break;
    case 'restore-demo': if (await confirmDialog('重新載入示範資料？現有自建資料會保留。', '重新載入')) { resetDemoData(); toast('示範資料已載入'); render(); } break;
    case 'reset-data': if (await confirmDialog('清除本瀏覽器中的所有任務、專案、習慣和紀錄？此操作無法復原。', '清除所有資料')) { clearAllData(); selectedTasks.clear(); toast('資料已清除'); render(); } break;
    case 'bulk-complete': updateData(data => data.tasks.forEach(task => { if (selectedTasks.has(task.id)) { task.status = 'completed'; task.completedAt = new Date().toISOString(); } })); selectedTasks.clear(); toast('選取任務已完成'); render(); break;
    case 'bulk-delete': if (await confirmDialog(`刪除選取的 ${selectedTasks.size} 個任務？此動作無法復原。`)) { updateData(data => { data.tasks = data.tasks.filter(task => !selectedTasks.has(task.id)); }); selectedTasks.clear(); toast('選取任務已刪除'); render(); } break;
    case 'clear-selection': selectedTasks.clear(); render(); break;
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
  if (form.dataset.form === 'project' || form.dataset.form === 'quick-project') submitProject(form);
  if (form.dataset.form === 'widget-settings') submitWidgetSettings(form);
  if (form.dataset.form === 'list') submitList(form);
  if (form.dataset.form === 'habit') submitHabit(form);
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-filter]')) { filters[target.dataset.filter] = target.value; render(); return; }
  if (target.matches('[data-setting]')) {
    if (target.dataset.setting === 'focus-task') { persistFocusTask(target.value); return; }
    persistSetting(target.dataset.setting, target.value); return;
  }
  if (target.matches('[data-duration]')) {
    const mode = target.dataset.duration;
    const value = Math.max(1, Math.min(mode === 'focus' ? 120 : mode === 'short' ? 60 : 90, Number(target.value) || 1));
    focus.durations[mode] = value;
    if (focus.mode === mode && !focus.running && !focus.started) focus.remainingMs = value * 60000;
    saveFocus(); render(); return;
  }
  if (target.matches('[data-bulk-priority]') && target.value) {
    const priority = target.value;
    updateData(data => data.tasks.forEach(task => { if (selectedTasks.has(task.id)) task.priority = priority; }));
    selectedTasks.clear(); toast('優先級已更新'); render(); return;
  }
  if (target.matches('[data-task-priority]')) {
    updateData(data => { const task = data.tasks.find(item => item.id === target.dataset.taskPriority); if (task) task.priority = target.value === 'none' ? '' : target.value; });
    toast('優先級已更新'); openTaskDetail(target.dataset.taskPriority); return;
  }
  if (target.matches('[data-task-status]')) return;
  if (target.matches('[data-select-task]')) {
    if (target.checked) selectedTasks.add(target.dataset.selectTask); else selectedTasks.delete(target.dataset.selectTask);
    render(); return;
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches('[data-filter="query"]')) {
    filters.query = target.value;
    clearTimeout(filterRenderTimer);
    filterRenderTimer = setTimeout(() => { const input = document.activeElement; const selection = input?.selectionStart; render(); const next = app.querySelector('[data-filter="query"]'); next?.focus(); if (selection !== undefined) next?.setSelectionRange(selection, selection); }, 180);
  } else if (target.id === 'search-page-input') {
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

document.addEventListener('wheel', event => {
  const wheel = event.target.closest?.('.focus-wheel');
  if (wheel) userScrolledFocusWheels.add(wheel);
}, true);
document.addEventListener('pointerdown', event => {
  const wheel = event.target.closest?.('.focus-wheel');
  if (wheel) userScrolledFocusWheels.add(wheel);
}, true);
document.addEventListener('scroll', event => {
  const wheel = event.target.closest?.('.focus-wheel');
  if (!wheel || !userScrolledFocusWheels.has(wheel) || focus.started || focus.running) return;
  clearTimeout(focusWheelScrollTimer);
  focusWheelScrollTimer = setTimeout(() => {
    userScrolledFocusWheels.delete(wheel);
    const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
    const closest = [...wheel.querySelectorAll('[data-value]')].sort((a, b) => Math.abs(a.getBoundingClientRect().top + a.offsetHeight / 2 - center) - Math.abs(b.getBoundingClientRect().top + b.offsetHeight / 2 - center))[0];
    if (closest) setFocusWheel(wheel.getAttribute('aria-label') === '小時' ? 'hours' : 'minutes', closest.dataset.value);
  }, 120);
}, true);

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
  const widgetHandle = event.target.closest('[data-widget-drag]');
  if (widgetHandle) {
    if (homeLayout.locked) { event.preventDefault(); return; }
    draggedWidgetId = widgetHandle.dataset.widgetDrag;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/dayflow-widget', draggedWidgetId);
    widgetHandle.closest('[data-widget]')?.classList.add('is-dragging');
    return;
  }
  const card = event.target.closest('[data-task-id]');
  if (!card) return;
  draggedTaskId = card.dataset.taskId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
  card.classList.add('is-dragging');
}

function handleDragEnd(event) { event.target.closest('[data-task-id]')?.classList.remove('is-dragging'); event.target.closest('[data-widget]')?.classList.remove('is-dragging'); document.querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target')); draggedTaskId = ''; draggedWidgetId = ''; }
function handleDragOver(event) {
  const widget = event.target.closest('[data-widget]');
  if (draggedWidgetId && widget && widget.dataset.widget !== draggedWidgetId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; widget.classList.add('is-drop-target'); return; }
  if (event.target.closest('[data-drop-date],[data-task-id],[data-status-column]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
}

function handleDrop(event) {
  const widgetId = draggedWidgetId || event.dataTransfer.getData('text/dayflow-widget');
  if (widgetId) {
    const target = event.target.closest('[data-widget]');
    if (!target || target.dataset.widget === widgetId) return;
    event.preventDefault();
    const from = homeLayout.items.findIndex(item => item.id === widgetId);
    const to = homeLayout.items.findIndex(item => item.id === target.dataset.widget);
    if (from >= 0 && to >= 0) { const [item] = homeLayout.items.splice(from, 1); homeLayout.items.splice(to, 0, item); saveHomeLayout(); render(); }
    return;
  }
  const taskId = draggedTaskId || event.dataTransfer.getData('text/plain');
  if (!taskId) return;
  const dateTarget = event.target.closest('[data-drop-date]');
  const statusTarget = event.target.closest('[data-status-column]');
  const taskTarget = event.target.closest('[data-task-id]');
  event.preventDefault();
  if (dateTarget) {
    updateData(data => { const task = data.tasks.find(item => item.id === taskId); if (task) task.dueDate = dateTarget.dataset.dropDate; });
    toast(`已移至 ${formatDate(dateTarget.dataset.dropDate)}`); render(); return;
  }
  if (statusTarget) {
    updateData(data => { const task = data.tasks.find(item => item.id === taskId); if (task) { task.status = statusTarget.dataset.statusColumn; task.completedAt = task.status === 'completed' ? new Date().toISOString() : ''; } });
    toast('任務狀態已更新'); render(); return;
  }
  if (taskTarget && taskTarget.dataset.taskId !== taskId) {
    const targetId = taskTarget.dataset.taskId;
    updateData(data => {
      const target = data.tasks.find(item => item.id === targetId);
      const dragged = data.tasks.find(item => item.id === taskId);
      if (target && dragged && target.dueDate === dragged.dueDate) dragged.sortOrder = Number(target.sortOrder || 0) - 0.5;
    });
    filters.sort = 'manual'; render();
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
window.addEventListener('hashchange', () => { route = location.hash.replace(/^#\/?/, '').split('?')[0] || 'today'; updateUI({ route }); render(); });
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

render();
