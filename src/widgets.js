import { dateKey, dayLabel } from './dates.js';
import { escapeHTML } from './ui.js';
import { icon } from './components.js';

const active = data => data.tasks.filter(task => task.status !== 'completed');
const byDate = (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || String(a.startTime || '').localeCompare(String(b.startTime || '')) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
const link = (route, label) => `<button class="widget-open-link" data-navigate="${route}">${escapeHTML(label)}${icon('chevronRight')}</button>`;

function renderContent(type, data, context, item) {
  const today = dateKey();
  if (type === 'upcoming') {
    const tasks = active(data).filter(task => !task.dueDate || task.dueDate >= today).sort(byDate);
    return `<p class="widget-summary">${tasks.length}<span>項待辦</span></p>${tasks.slice(0, 3).map(task => `<button class="widget-task" data-action="task-detail" data-id="${escapeHTML(task.id)}"><span>${task.dueDate ? `<small>${escapeHTML(dayLabel(task.dueDate))}</small>` : '<small>未安排</small>'}${escapeHTML(task.title)}</span>${icon('chevronRight')}</button>`).join('') || '<p class="empty-inline">目前沒有接下來的安排。</p>'}${link('calendar', '查看行事曆')}`;
  }
  if (type === 'habits') {
    const weekday = new Date(`${today}T12:00:00`).getDay();
    const habits = data.habits.filter(habit => (habit.frequency || []).includes(weekday));
    const done = habits.filter(habit => habit.logs?.[today]).length;
    return `<p class="widget-summary">${done}<span> / ${habits.length} 個今日習慣完成</span></p>${habits.slice(0, 3).map(habit => `<button class="widget-task" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}"><span>${escapeHTML(habit.name)}</span><b class="widget-habit-status">${habit.logs?.[today] ? '✓' : '○'}</b></button>`).join('') || '<p class="empty-inline">尚未安排今日習慣。</p>'}${link('habits', '查看習慣')}`;
  }
  const focus = context.focus;
  const duration = Number(focus.durations[focus.mode] || 25) * 60000;
  const remaining = Math.max(0, focus.running ? focus.endAt - Date.now() : focus.started ? focus.remainingMs : duration);
  const progress = Math.max(0, Math.min(100, (1 - remaining / duration) * 100));
  const time = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor(remaining % 60000 / 1000)).padStart(2, '0')}`;
  return `<button class="mini-focus" data-navigate="focus" aria-label="開啟${escapeHTML(item.name || '專注計時')}"><span class="mini-focus-ring" style="--focus-progress:${progress}%"><strong id="home-focus-clock">${time}</strong></span><span>${focus.running ? '專注進行中' : focus.started ? '已暫停' : '準備開始'}</span></button><button class="button button-small" data-action="${focus.running ? 'focus-pause' : 'focus-start'}">${focus.running ? '暫停' : focus.started ? '繼續' : '開始專注'}</button>`;
}

export const WIDGET_REGISTRY = {
  upcoming: { name: '接下來', category: '待辦', description: '近期與尚未安排日期的待辦', route: 'calendar', icon: 'calendar', size: 'medium', render: renderContent },
  habits: { name: '習慣追蹤', category: '習慣', description: '完成今日習慣並查看進度', route: 'habits', icon: 'habits', size: 'medium', render: renderContent },
  focusTimer: { name: '專注計時', category: '專注', description: '查看並控制目前的專注計時', route: 'focus', icon: 'focus', size: 'small', render: renderContent },
};

export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);
export const WIDGET_CATEGORIES = [...new Set(Object.values(WIDGET_REGISTRY).map(item => item.category))];
export const defaultWidget = (type, id = `${type}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`) => ({ id, type, name: WIDGET_REGISTRY[type]?.name || type, size: WIDGET_REGISTRY[type]?.size || 'medium', config: {} });

const layoutSeeds = {
  desktop: [defaultWidget('upcoming', 'upcoming'), defaultWidget('habits', 'habits'), defaultWidget('focusTimer', 'focus')],
  tablet: [defaultWidget('upcoming', 'upcoming'), defaultWidget('habits', 'habits'), defaultWidget('focusTimer', 'focus')],
  mobile: [defaultWidget('upcoming', 'upcoming'), defaultWidget('habits', 'habits'), defaultWidget('focusTimer', 'focus')].map(item => ({ ...item, size: 'small' })),
};

function normalizeType(type) {
  return ({ calendar: 'upcoming', monthCalendar: 'upcoming', focus: 'focusTimer', pomodoro: 'focusTimer', focusHistory: 'focusTimer', dailyHabits: 'habits', weeklyHabits: 'habits' })[type] || type;
}

function normalizeLayout(stored = {}, device = 'desktop') {
  const defaults = layoutSeeds[device];
  if (Array.isArray(stored.items)) {
    const seen = new Set();
    const items = stored.items.filter(Boolean).flatMap(item => {
      const type = normalizeType(item.type);
      if (!WIDGET_REGISTRY[type] || seen.has(type)) return [];
      seen.add(type);
      const oldDefaultName = item.name === item.type || item.name === WIDGET_REGISTRY[type].name || item.type === 'calendar' && item.name === '行事曆';
      return [{ ...defaultWidget(type, item.id || undefined), ...item, type, name: oldDefaultName ? WIDGET_REGISTRY[type].name : item.name, config: {} }];
    });
    return { items, hidden: Array.isArray(stored.hidden) ? [...new Set(stored.hidden.filter(id => items.some(item => item.id === id)))] : [], locked: Boolean(stored.locked) };
  }
  const oldOrder = Array.isArray(stored.order) ? stored.order : [];
  const oldHidden = Array.isArray(stored.hidden) ? stored.hidden : [];
  const oldSizes = stored.sizes && typeof stored.sizes === 'object' ? stored.sizes : {};
  const ordered = [...new Set([...oldOrder, ...defaults.map(item => item.id)])].flatMap(value => {
    const type = normalizeType(value);
    const base = defaults.find(item => item.id === value || item.type === type);
    return base ? [base] : [];
  });
  const seen = new Set();
  const items = ordered.filter(item => !seen.has(item.type) && seen.add(item.type)).map(item => ({ ...item, size: oldSizes[item.id] === 'wide' || oldSizes[item.type] === 'wide' ? 'full' : item.size }));
  const hidden = oldHidden.map(id => items.find(item => item.id === id || item.type === normalizeType(id))?.id).filter(Boolean);
  return { items, hidden: [...new Set(hidden)], locked: Boolean(stored.locked) };
}

export function createHomeLayout(stored = {}, device = 'desktop') { return normalizeLayout(stored, device); }

export function createHomeLayouts(stored = {}) {
  const layouts = {};
  for (const device of Object.keys(layoutSeeds)) {
    const entry = stored.layouts?.[device] || (device === 'desktop' && !stored.layouts ? stored : {});
    layouts[device] = normalizeLayout(entry, device);
  }
  return layouts;
}

export function defaultHomeLayouts() { return createHomeLayouts(); }

export function renderHomeWidgets(data, context) {
  const layout = context.homeLayout;
  return layout.items.filter(item => !layout.hidden.includes(item.id)).map(item => {
    const definition = WIDGET_REGISTRY[item.type];
    const controls = context.homeEditMode ? `<div class="widget-edit-controls"><button class="button button-small" data-action="home-widget-size" data-id="${escapeHTML(item.id)}" aria-label="調整${escapeHTML(item.name)}尺寸">${({ small: '小', medium: '中', large: '大', full: '全寬' })[item.size] || '中'}</button><button class="icon-button" data-action="home-widget-settings" data-id="${escapeHTML(item.id)}" aria-label="重新命名${escapeHTML(item.name)}">${icon('edit')}</button><button class="icon-button" data-action="home-widget-hide" data-id="${escapeHTML(item.id)}" aria-label="隱藏${escapeHTML(item.name)}">⌑</button></div>` : '';
    return `<section class="panel home-widget-card ${context.homeEditMode ? 'is-editable' : ''}" data-widget="${escapeHTML(item.id)}" data-widget-type="${escapeHTML(item.type)}" data-size="${escapeHTML(item.size || 'medium')}" aria-label="${escapeHTML(item.name || definition.name)}"><div class="home-widget-card-heading"><div><p class="eyebrow">${escapeHTML(definition.category)}</p><h3>${escapeHTML(item.name || definition.name)}</h3></div>${controls}</div><div class="home-widget-content">${definition.render(item.type, data, context, item)}</div><span class="widget-resize-handle" data-widget-resize="true" data-id="${escapeHTML(item.id)}" role="slider" tabindex="0" aria-label="調整${escapeHTML(item.name)}大小" aria-valuetext="${({ small: '小', medium: '中', large: '大', full: '全寬' })[item.size] || '中'}"></span></section>`;
  }).join('');
}

export function renderWidgetPicker(layout) {
  return `<div class="widget-picker-intro"><p>加入需要的首頁摘要，並依照使用習慣調整排列。</p></div><div class="widget-catalog">${WIDGET_CATEGORIES.map(category => `<section class="widget-category"><h3>${escapeHTML(category)}</h3><div>${WIDGET_TYPES.filter(type => WIDGET_REGISTRY[type].category === category).map(type => { const entry = WIDGET_REGISTRY[type]; const exists = layout.items.some(item => item.type === type); return `<article class="widget-catalog-item"><span class="entry-icon">${icon(entry.icon)}</span><div><strong>${escapeHTML(entry.name)}</strong><p>${escapeHTML(entry.description)}</p></div><button class="button button-small" data-action="home-widget-add" data-type="${type}" ${exists ? 'disabled title="此小工具已在首頁"' : ''}>${exists ? '已新增' : '新增'}</button></article>`; }).join('')}</div></section>`).join('')}</div>${layout.hidden.length ? `<section class="hidden-widgets"><h3>已隱藏</h3>${layout.hidden.map(id => { const item = layout.items.find(entry => entry.id === id); return item ? `<button class="button button-small" data-action="home-widget-unhide" data-id="${escapeHTML(item.id)}">顯示「${escapeHTML(item.name)}」</button>` : ''; }).join('')}</section>` : ''}`;
}
