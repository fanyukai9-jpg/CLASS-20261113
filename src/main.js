import { addDays, dateKey, formatDate, formatTime, getGreeting, parseDate, parseQuickDate } from './dates.js';
import { clearAllData, clearDemoData, createTask, exportData, getData, getUIState, importData, newId, resetDemoData, updateData, updateUI } from './data.js';
import { icon, renderTaskForm, statusLabels } from './components.js';
import { renderPage } from './pages.js';
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
let filterRenderTimer;

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
  return { greeting: getGreeting(), filters, taskView, projectView, calendarDate, calendarMode, statsRange, query, focus };
}

function render() {
  const data = getData();
  applyPreferences(data.settings);
  const selected = selectedTasks.size;
  app.innerHTML = `<div class="app-shell ${getUIState().collapsed ? 'sidebar-collapsed' : ''}">
    <aside class="sidebar"><a class="brand" href="#today" data-navigate="today"><span class="brand-mark">D</span><span class="brand-copy">DAYFLOW<small>PERSONAL SPACE</small></span></a><button class="sidebar-toggle icon-button" data-action="toggle-sidebar" aria-label="收合側邊欄">${icon('menu')}</button>
      <div class="nav-caption">工作空間</div><nav class="main-nav">${navItem('today', 'today', '今天')}${navItem('upcoming', 'calendar', '即將到來', dueSoonCount(data))}${navItem('calendar', 'calendar', '行事曆')}${navItem('inbox', 'inbox', '收集箱', inboxCount(data))}</nav>
      <div class="sidebar-section-heading"><span>專案</span><button class="icon-button mini-icon" data-action="project-add" aria-label="新增專案">${icon('plus')}</button></div><nav class="project-nav">${data.projects.slice(0, 7).map(project => `<a href="#project/${encodeURIComponent(project.id)}" data-navigate="project/${escapeHTML(project.id)}" class="nav-item ${route === `project/${project.id}` ? 'is-active' : ''}"><i class="project-nav-dot" style="--project-color:${escapeHTML(project.color || '#6674b8')}"></i><span>${escapeHTML(project.name)}</span></a>`).join('') || '<p class="nav-empty">尚無專案</p>'}</nav>
      <div class="nav-caption nav-caption-bottom">個人</div><nav class="main-nav">${navItem('habits', 'habits', '習慣')}${navItem('focus', 'focus', '專注')}${navItem('statistics', 'stats', '統計')}${navItem('settings', 'settings', '設定')}</nav>
      <div class="sidebar-footer"><span class="local-indicator"></span><span>資料儲存在此裝置</span></div>
    </aside>
    <div class="app-main"><header class="topbar"><button class="mobile-menu icon-button" data-action="more-nav" aria-label="開啟導覽">${icon('menu')}</button><div class="topbar-location"><span>${escapeHTML(routeLabel(route))}</span><span class="topbar-date">${escapeHTML(new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()))}</span></div><div class="topbar-actions"><button class="global-search" data-action="open-search">${icon('search')}<span>搜尋任務、專案…</span><kbd>Ctrl K</kbd></button><button class="button button-primary quick-add-button" data-action="quick-add">${icon('plus')}<span>新增任務</span><kbd>Q</kbd></button><span class="device-badge" title="資料只存在此瀏覽器">${icon('settings')}</span></div></header>
      <main class="main-content">${renderPage(route, data, context())}</main>
    </div>
    ${renderMobileNav()}
    ${selected ? `<div class="bulk-bar"><span>已選取 ${selected} 項</span><button class="button button-small" data-action="bulk-complete">全部完成</button><select data-bulk-priority aria-label="變更優先級"><option value="">變更優先級</option><option value="p1">P1 緊急</option><option value="p2">P2 高</option><option value="p3">P3 一般</option><option value="p4">P4 低</option></select><button class="button button-small button-danger" data-action="bulk-delete">刪除</button><button class="icon-button" data-action="clear-selection" aria-label="取消選取">${icon('close')}</button></div>` : ''}
  </div>`;
  applySelections();
}

function navItem(id, symbol, label, badge = 0) {
  return `<a class="nav-item ${route === id ? 'is-active' : ''}" href="#${id}" data-navigate="${id}">${icon(symbol)}<span>${label}</span>${badge ? `<i class="nav-badge">${badge}</i>` : ''}</a>`;
}

function renderMobileNav() {
  const items = [['today', 'today', '今天'], ['inbox', 'inbox', '收集箱'], ['calendar', 'calendar', '日曆'], ['projects', 'projects', '專案']];
  return `<nav class="mobile-nav">${items.map(([id, symbol, label]) => `<a class="mobile-nav-item ${route === id ? 'is-active' : ''}" href="#${id}" data-navigate="${id}">${icon(symbol)}<span>${label}</span></a>`).join('')}<button class="mobile-nav-item" data-action="more-nav">${icon('more')}<span>更多</span></button></nav>`;
}

function routeLabel(value) {
  if (value.startsWith('project/')) return getData().projects.find(item => item.id === value.slice(8))?.name || '專案';
  return ({ today: '今天', upcoming: '即將到來', calendar: '行事曆', inbox: '收集箱', projects: '專案', habits: '習慣', focus: '專注', statistics: '統計', settings: '設定', search: '搜尋' })[value] || '今天';
}

function dueSoonCount(data) { return data.tasks.filter(task => task.status !== 'completed' && task.dueDate >= dateKey() && task.dueDate <= dateKey(addDays(new Date(), 7))).length; }
function inboxCount(data) { return data.tasks.filter(task => task.status !== 'completed' && !task.dueDate && !task.projectId).length; }

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
  updateUI({ route: value });
  if (location.hash !== `#${value}`) location.hash = value;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openQuickAdd(options = {}) {
  const data = getData();
  const parsed = options.title ? parseQuickDate(options.title) : { date: options.dueDate || '', time: '', title: options.title || '', recurrence: 'none' };
  const projects = data.projects.map(project => `<option value="${escapeHTML(project.id)}" ${options.projectId === project.id ? 'selected' : ''}>${escapeHTML(project.name)}</option>`).join('');
  const recurrenceLabel = parsed.recurrence === 'daily' ? ' · 每天重複' : parsed.recurrence === 'weekly' ? ' · 每週重複' : '';
  const dialog = openDialog('快速新增', `<p class="muted quick-add-hint">支援「明天下午 3 點健身」、「每週一整理課程」等簡單日期與時間。</p><form class="form-grid quick-add-form" data-form="quick-add"><label class="field full"><span>任務名稱</span><input name="title" maxlength="120" required autofocus value="${escapeHTML(options.title || '')}" placeholder="先記下要做的事"></label><div class="quick-parse-note full" data-parse-note>${parsed.date ? `辨識為 ${escapeHTML(formatDate(parsed.date))}${parsed.time ? ` ${escapeHTML(formatTime(parsed.time, data.settings.hour24))}` : ''}${recurrenceLabel}` : '也可以稍後再安排時間。'}</div><label class="field"><span>日期</span><input type="date" name="dueDate" value="${escapeHTML(options.dueDate || '')}"></label><label class="field"><span>時間</span><input type="time" name="startTime"></label><label class="field"><span>優先級</span><select name="priority">${[['p1', 'P1 緊急'], ['p2', 'P2 高'], ['p3', 'P3 一般'], ['p4', 'P4 低']].map(([value, label]) => `<option value="${value}" ${data.settings.defaultPriority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>專案</span><select name="projectId"><option value="">收集箱／未分類</option>${projects}</select></label><label class="field full"><span>標籤</span><input name="tags" placeholder="以逗號分隔"></label><div class="form-actions full"><button class="button button-primary" type="submit">建立任務</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  const form = dialog.querySelector('form');
  if (options.inbox) { form.elements.projectId.value = ''; form.elements.dueDate.value = ''; }
  if (options.dueDate) form.elements.dueDate.value = options.dueDate;
  form.addEventListener('input', event => {
    if (event.target.name !== 'title') return;
    const suggestion = parseQuickDate(event.target.value);
    const recurrence = suggestion.recurrence === 'daily' ? ' · 每天重複' : suggestion.recurrence === 'weekly' ? ' · 每週重複' : '';
    dialog.querySelector('[data-parse-note]').textContent = suggestion.date ? `辨識為 ${formatDate(suggestion.date)}${suggestion.time ? ` ${formatTime(suggestion.time, data.settings.hour24)}` : ''}${recurrence}` : '未辨識日期，會保留原始任務名稱。';
    if (suggestion.date && !form.elements.dueDate.value) form.elements.dueDate.value = suggestion.date;
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
  const dialog = openDialog('任務詳細', `<div class="task-detail"><div class="task-detail-top"><span class="priority-label ${task.priority}">${task.priority.toUpperCase()} · ${({ p1: '緊急', p2: '高', p3: '一般', p4: '低' })[task.priority]}</span><select data-task-status="${escapeHTML(task.id)}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><h2>${escapeHTML(task.title)}</h2>${task.description ? `<p>${escapeHTML(task.description)}</p>` : '<p class="muted">尚未新增描述</p>'}<div class="detail-meta">${task.dueDate ? `<span>期限：${escapeHTML(formatDate(task.dueDate))}</span>` : '<span>尚未安排日期</span>'}${task.startTime ? `<span>開始：${escapeHTML(formatTime(task.startTime, data.settings.hour24))}</span>` : ''}${task.endTime ? `<span>結束：${escapeHTML(formatTime(task.endTime, data.settings.hour24))}</span>` : ''}<span>預估：${Number(task.estimatedDuration || 25)} 分鐘</span>${project ? `<span>專案：${escapeHTML(project.name)}</span>` : ''}<span>重複：${escapeHTML(({ none: '不重複', daily: '每天', weekly: '每週', monthly: '每月' })[task.recurrence] || '不重複')}</span><span>建立於 ${escapeHTML(formatDate(task.createdAt, { year: true }))}</span>${task.tags?.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join('') || ''}</div>${subtasks}${task.notes ? `<div class="detail-notes"><h3>備註</h3><p>${escapeHTML(task.notes)}</p></div>` : ''}<div class="form-actions"><button class="button button-primary" data-action="task-edit" data-id="${escapeHTML(task.id)}">編輯</button><button class="button" data-action="toggle-task" data-id="${escapeHTML(task.id)}">${task.status === 'completed' ? '標記未完成' : '完成任務'}</button><button class="button button-danger" data-action="task-delete" data-id="${escapeHTML(task.id)}">刪除</button></div></div>`, { wide: true });
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

function openHabitForm(id = '') {
  const habit = id ? getData().habits.find(item => item.id === id) : null;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const dialog = openDialog(habit ? '編輯習慣' : '新增習慣', `<form class="form-grid" data-form="habit"><input type="hidden" name="id" value="${escapeHTML(habit?.id || '')}"><label class="field full"><span>習慣名稱</span><input name="name" required maxlength="60" value="${escapeHTML(habit?.name || '')}" placeholder="例如：散步 20 分鐘"></label><label class="field full"><span>描述</span><input name="description" maxlength="120" value="${escapeHTML(habit?.description || '')}" placeholder="為什麼這件事對你重要？"></label><label class="field"><span>色彩</span><input type="color" name="color" value="${escapeHTML(habit?.color || '#6674b8')}"></label><fieldset class="field full frequency-field"><legend>每週頻率</legend><div class="weekday-picker">${days.map((day, index) => `<label><input type="checkbox" name="frequency" value="${day}" ${(habit?.frequency || [1, 2, 3, 4, 5, 6, 0]).includes(day) ? 'checked' : ''}><span>${['一', '二', '三', '四', '五', '六', '日'][index]}</span></label>`).join('')}</div></fieldset><div class="form-actions full"><button class="button button-primary" type="submit">${habit ? '儲存習慣' : '建立習慣'}</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`);
  dialog.querySelector('input[name="name"]')?.focus({ preventScroll: true });
}

function openTaskMenu(taskId) {
  openDialog('任務操作', `<div class="action-menu-list"><button class="button" data-action="task-edit" data-id="${escapeHTML(taskId)}">編輯任務</button><button class="button" data-action="duplicate-task" data-id="${escapeHTML(taskId)}">複製任務</button><button class="button button-danger" data-action="task-delete" data-id="${escapeHTML(taskId)}">刪除任務</button></div>`);
}

function openMoreNav() {
  const routes = [['upcoming', '即將到來'], ['habits', '習慣'], ['focus', '專注'], ['statistics', '統計'], ['settings', '設定']];
  openDialog('更多功能', `<div class="action-menu-list">${routes.map(([id, label]) => `<button class="button" data-navigate="${id}">${label}</button>`).join('')}</div>`);
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
    estimatedDuration: formData.get('estimatedDuration'), projectId: formData.get('projectId'), tags: formData.get('tags'),
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
    dueDate: form.elements.dueDate.value || parsed.date,
    startTime: form.elements.startTime.value || parsed.time,
    priority: form.elements.priority.value,
    projectId: form.elements.projectId.value,
    tags: form.elements.tags.value,
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
  const project = { id: id || newId('project'), name: String(fields.get('name')).trim(), description: String(fields.get('description') || '').trim(), color: fields.get('color'), deadline: fields.get('deadline') || '', icon: 'projects', createdAt: id ? getData().projects.find(item => item.id === id)?.createdAt : new Date().toISOString(), demo: false };
  updateData(data => { const index = data.projects.findIndex(item => item.id === id); if (index >= 0) data.projects[index] = project; else data.projects.push(project); });
  dialogRoot.querySelector('dialog')?.close();
  toast(id ? '專案已更新' : '專案已建立');
  if (!id) setRoute(`project/${project.id}`); else render();
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
  const clock = document.getElementById('focus-clock');
  if (clock) clock.textContent = `${String(Math.floor(focus.remainingMs / 60000)).padStart(2, '0')}:${String(Math.floor(focus.remainingMs % 60000 / 1000)).padStart(2, '0')}`;
  if (focus.remainingMs <= 0) timerFinish();
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  switch (action) {
    case 'navigate-projects': setRoute('projects'); break;
    case 'quick-add': openQuickAdd({ inbox: element.dataset.inbox === 'true', projectId: element.dataset.project || '', dueDate: element.dataset.date || '' }); break;
    case 'open-task-form': openTaskEditor('', { inbox: element.dataset.inbox === 'true' }); break;
    case 'task-edit': dialogRoot.querySelector('dialog')?.close(); openTaskEditor(id); break;
    case 'task-detail': openTaskDetail(id); break;
    case 'task-menu': openTaskMenu(id); break;
    case 'toggle-task': toggleTask(id); break;
    case 'task-delete': await deleteTask(id); break;
    case 'duplicate-task': duplicateTask(id); break;
    case 'close-dialog': dialogRoot.querySelector('dialog')?.close(); break;
    case 'toggle-sidebar': updateUI({ collapsed: !getUIState().collapsed }); render(); break;
    case 'more-nav': openMoreNav(); break;
    case 'open-search': query = ''; setRoute('search'); setTimeout(() => document.getElementById('search-page-input')?.focus(), 0); break;
    case 'task-view': taskView = element.dataset.view; render(); break;
    case 'project-add': openProjectForm(); break;
    case 'project-edit': openProjectForm(id); break;
    case 'project-delete': await deleteProject(id); break;
    case 'project-view': projectView = element.dataset.view; render(); break;
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
    case 'stats-range': statsRange = Number(element.dataset.range); render(); break;
    case 'focus-mode': timerChangeMode(element.dataset.mode); break;
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
  if (form.dataset.form === 'project') submitProject(form);
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
  if (actionElement) handleAction(actionElement.dataset.action, actionElement);
}

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

function handleDragEnd(event) { event.target.closest('[data-task-id]')?.classList.remove('is-dragging'); draggedTaskId = ''; }
function handleDragOver(event) { if (event.target.closest('[data-drop-date],[data-task-id],[data-status-column]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }

function handleDrop(event) {
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
  if (event.key === 'Escape') { document.querySelector('dialog[open]')?.close(); return; }
  const typing = event.target.matches('input,textarea,select,[contenteditable=true]');
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); query = ''; setRoute('search'); setTimeout(() => document.getElementById('search-page-input')?.focus(), 0); return; }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { const form = event.target.closest('form'); if (form) { event.preventDefault(); form.requestSubmit(); } return; }
  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'q') { event.preventDefault(); openQuickAdd(); }
}

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
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getData().settings.theme === 'system') render(); });
window.setInterval(timerTick, 250);
window.addEventListener('dayflow:data', () => { if (!document.querySelector('dialog[open]')) render(); });

render();
