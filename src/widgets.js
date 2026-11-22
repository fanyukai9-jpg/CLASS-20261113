import { addDays, dateKey, datesInRange, dayLabel } from './dates.js';
import { escapeHTML } from './ui.js';
import { icon } from './components.js';

const active = data => data.tasks.filter(task => task.status !== 'completed');
const byDate = (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || String(a.startTime || '').localeCompare(String(b.startTime || '')) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
const link = (route, label) => `<button class="widget-open-link" data-navigate="${route}">${escapeHTML(label)}${icon('chevronRight')}</button>`;

function renderContent(type, data, context, item) {
  const today = dateKey();
  if (type === 'upcoming') {
    const tasks = active(data).filter(task => !task.dueDate || task.dueDate >= today).sort(byDate);
    return `<p class="widget-summary">${tasks.length}<span>項待辦</span></p>${tasks.slice(0, 3).map(task => { const date = task.dueDate === today ? '今天' : task.dueDate ? dayLabel(task.dueDate) : '未安排'; return `<button class="widget-task" data-action="task-detail" data-id="${escapeHTML(task.id)}"><span class="widget-task-copy"><small class="widget-task-date">${escapeHTML(date)}</small><span class="widget-task-title">${escapeHTML(task.title)}</span></span>${icon('chevronRight')}</button>`; }).join('') || '<p class="empty-inline">目前沒有接下來的安排。</p>'}${link('calendar', '查看行事曆')}`;
  }
  if (type === 'habits') {
    const weekday = new Date(`${today}T12:00:00`).getDay();
    const habits = data.habits.filter(habit => (habit.frequency || []).includes(weekday));
    const done = habits.filter(habit => habit.logs?.[today]).length;
    return `<p class="widget-summary">${done}<span> / ${habits.length} 個今日習慣完成</span></p>${habits.slice(0, 3).map(habit => `<button class="widget-task" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}"><span class="widget-task-copy"><span class="widget-task-title">${escapeHTML(habit.name)}</span></span><b class="widget-habit-status">${habit.logs?.[today] ? '✓' : '○'}</b></button>`).join('') || '<p class="empty-inline">尚未安排今日習慣。</p>'}${link('habits', '查看習慣')}`;
  }
  if (type === 'habitHistory28') {
    const days = datesInRange(addDays(today, -27), 28);
    if (!data.habits.length) return `<p class="empty-inline">新增習慣後，這裡會顯示最近 28 天的每日紀錄。</p>${link('habits', '新增習慣')}`;
    return `<div class="widget-habit-history"><div class="widget-habit-history-range"><span>${escapeHTML(dayLabel(dateKey(days[0])))}</span><span>最近 28 天</span><span>${escapeHTML(dayLabel(today))}</span></div><div class="widget-habit-history-legend"><span><i class="widget-habit-history-cell is-done" aria-hidden="true"></i>已完成</span><span><i class="widget-habit-history-cell" aria-hidden="true"></i>未完成</span></div>${data.habits.map(habit => `<div class="widget-habit-history-row"><span class="widget-habit-history-name" title="${escapeHTML(habit.name)}">${escapeHTML(habit.name)}</span><div class="widget-habit-history-cells" role="group" aria-label="${escapeHTML(habit.name)} 最近 28 天每日紀錄">${days.map(day => { const key = dateKey(day); const done = Boolean(habit.logs?.[key]); return `<i class="widget-habit-history-cell ${done ? 'is-done' : ''}" role="img" title="${escapeHTML(dayLabel(key))} · ${done ? '已完成' : '未完成'}" aria-label="${escapeHTML(dayLabel(key))} ${done ? '已完成' : '未完成'}" style="--habit-color:${escapeHTML(habit.color || '#777')}"></i>`; }).join('')}</div></div>`).join('')}</div>${link('habits', '查看完整紀錄')}`;
  }
  const focus = context.focus;
  const duration = Number(focus.durations[focus.mode] || 25) * 60000;
  const remaining = Math.max(0, focus.running ? focus.endAt - Date.now() : focus.started ? focus.remainingMs : duration);
  const progress = Math.max(0, Math.min(100, (1 - remaining / duration) * 100));
  const time = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor(remaining % 60000 / 1000)).padStart(2, '0')}`;
  const modeLabel = focus.mode === 'rest' ? '休息' : '專注';
  const status = focus.running ? `${modeLabel}中` : focus.started ? '已暫停' : `準備${modeLabel}`;
  return `<button class="mini-focus" data-navigate="focus" aria-label="開啟${escapeHTML(item.name || '專注計時')}"><span class="mini-focus-ring" style="--focus-progress:${progress}%"><strong id="home-focus-clock">${time}</strong></span><span>${status}</span></button><button class="button button-small" data-action="${focus.running ? 'focus-pause' : 'focus-start'}">${focus.running ? '暫停' : focus.started ? '繼續' : `開始${modeLabel}`}</button>`;
}

export const WIDGET_REGISTRY = {
  upcoming: { name: '接下來', category: '待辦', description: '近期與尚未安排日期的待辦', route: 'calendar', icon: 'calendar', size: 'medium', render: renderContent },
  habits: { name: '習慣追蹤', category: '習慣', description: '完成今日習慣並查看進度', route: 'habits', icon: 'habits', size: 'medium', render: renderContent },
  habitHistory28: { name: '習慣最近 28 天', category: '習慣', description: '查看每個習慣最近 28 天的每日完成記錄', route: 'habits', icon: 'habits', size: 'large', render: renderContent },
  focusTimer: { name: '專注計時', category: '專注', description: '查看並控制目前的專注計時', route: 'focus', icon: 'focus', size: 'small', render: renderContent },
};

export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);
export const WIDGET_CATEGORIES = [...new Set(Object.values(WIDGET_REGISTRY).map(item => item.category))];
export const defaultWidget = (type, id = `${type}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`) => ({ id, type, name: WIDGET_REGISTRY[type]?.name || type, size: WIDGET_REGISTRY[type]?.size || 'medium', config: {} });

const layoutSeeds = {
  desktop: [defaultWidget('upcoming', 'upcoming'), defaultWidget('habits', 'habits'), defaultWidget('focusTimer', 'focus'), defaultWidget('habitHistory28', 'habit-history-28')],
  tablet: [defaultWidget('upcoming', 'upcoming'), defaultWidget('habits', 'habits'), defaultWidget('focusTimer', 'focus'), defaultWidget('habitHistory28', 'habit-history-28')],
  mobile: [defaultWidget('upcoming', 'upcoming'), defaultWidget('habits', 'habits'), defaultWidget('focusTimer', 'focus'), defaultWidget('habitHistory28', 'habit-history-28')].map(item => ({ ...item, size: item.type === 'habitHistory28' ? 'large' : 'small' })),
};

function normalizeType(type) {
  return ({ calendar: 'upcoming', monthCalendar: 'upcoming', focus: 'focusTimer', pomodoro: 'focusTimer', focusHistory: 'focusTimer', dailyHabits: 'habits', weeklyHabits: 'habits', habitHistory: 'habitHistory28', dailyHabitHistory: 'habitHistory28', recentHabits: 'habitHistory28' })[type] || type;
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
    if (!items.some(item => item.type === 'habitHistory28')) items.push(defaultWidget('habitHistory28', `habit-history-28-${device}`));
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
    const openPage = definition.route ? `<button class="widget-heading-link" type="button" data-navigate="${escapeHTML(definition.route)}" aria-label="開啟${escapeHTML(definition.name)}頁面" title="開啟${escapeHTML(definition.name)}頁面">${icon('chevronRight')}</button>` : '';
    return `<section class="panel home-widget-card ${context.homeEditMode ? 'is-editable' : ''}" data-widget="${escapeHTML(item.id)}" data-widget-type="${escapeHTML(item.type)}" data-size="${escapeHTML(item.size || 'medium')}" aria-label="${escapeHTML(item.name || definition.name)}"><div class="home-widget-card-heading"><div class="home-widget-title"><p class="eyebrow">${escapeHTML(definition.category)}</p><h3>${escapeHTML(item.name || definition.name)}</h3></div><div class="home-widget-heading-actions">${openPage}${controls}</div></div><div class="home-widget-content">${definition.render(item.type, data, context, item)}</div><span class="widget-resize-handle" data-widget-resize="true" data-id="${escapeHTML(item.id)}" role="slider" tabindex="0" aria-label="調整${escapeHTML(item.name)}大小" aria-valuetext="${({ small: '小', medium: '中', large: '大', full: '全寬' })[item.size] || '中'}"></span></section>`;
  }).join('');
}

export function renderWidgetPicker(layout) {
  return `<div class="widget-picker-intro"><p>加入需要的首頁摘要，並依照使用習慣調整排列。</p></div><div class="widget-catalog">${WIDGET_CATEGORIES.map(category => `<section class="widget-category"><h3>${escapeHTML(category)}</h3><div>${WIDGET_TYPES.filter(type => WIDGET_REGISTRY[type].category === category).map(type => { const entry = WIDGET_REGISTRY[type]; const exists = layout.items.some(item => item.type === type); return `<article class="widget-catalog-item"><span class="entry-icon">${icon(entry.icon)}</span><div><strong>${escapeHTML(entry.name)}</strong><p>${escapeHTML(entry.description)}</p></div><button class="button button-small" data-action="home-widget-add" data-type="${type}" ${exists ? 'disabled title="此小工具已在首頁"' : ''}>${exists ? '已新增' : '新增'}</button></article>`; }).join('')}</div></section>`).join('')}</div>${layout.hidden.length ? `<section class="hidden-widgets"><h3>已隱藏</h3>${layout.hidden.map(id => { const item = layout.items.find(entry => entry.id === id); return item ? `<button class="button button-small" data-action="home-widget-unhide" data-id="${escapeHTML(item.id)}">顯示「${escapeHTML(item.name)}」</button>` : ''; }).join('')}</section>` : ''}`;
}
