import { addDays, dateKey, dayLabel, formatDate, formatMonth } from './dates.js';
import { escapeHTML } from './ui.js';
import { icon } from './components.js';

const active = data => data.tasks.filter(task => task.status !== 'completed');
const byDate = (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || String(a.startTime || '').localeCompare(String(b.startTime || ''));
const link = (route, label, symbol = 'chevronRight') => `<button class="widget-open-link" data-navigate="${route}">${escapeHTML(label)}${icon(symbol)}</button>`;
const taskLinks = tasks => tasks.slice(0, 3).map(task => `<button class="widget-task" data-action="task-detail" data-id="${escapeHTML(task.id)}"><span>${task.dueDate ? `<small>${escapeHTML(dayLabel(task.dueDate))}</small>` : ''}${escapeHTML(task.title)}</span>${icon('chevronRight')}</button>`).join('') || '<p class="empty-inline">目前沒有事項。</p>';
const dateToday = () => dateKey();
const todayTasks = (data, context) => data.tasks.filter(task => task.dueDate === (context.homeDate || dateToday()));

function focusWidget(data, context, item) {
  const focus = context.focus;
  const duration = Number(focus.durations[focus.mode] || 25) * 60000;
  const remaining = Math.max(0, focus.running ? focus.endAt - Date.now() : focus.started ? focus.remainingMs : duration);
  const progress = Math.max(0, Math.min(100, (1 - remaining / duration) * 100));
  const time = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor(remaining % 60000 / 1000)).padStart(2, '0')}`;
  return `<button class="mini-focus" data-navigate="focus" aria-label="開啟${escapeHTML(item.name || '專注計時')}"><span class="mini-focus-ring" style="--focus-progress:${progress}%"><strong id="home-focus-clock">${time}</strong></span><span>${focus.running ? '專注進行中' : focus.started ? '已暫停' : '準備開始'}</span></button><button class="button button-small" data-action="${focus.running ? 'focus-pause' : 'focus-start'}">${focus.running ? '暫停' : focus.started ? '繼續' : '開始專注'}</button>`;
}

function renderContent(type, data, context, item) {
  const tasks = active(data).sort(byDate);
  const inbox = tasks.filter(task => !task.dueDate && !task.projectId && (!task.listId || task.listId === 'list-inbox'));
  const future = tasks.filter(task => task.dueDate >= dateToday()).sort(byDate);
  const completed = data.tasks.filter(task => task.status === 'completed').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const projects = data.projects;
  const route = type === 'upcoming' ? 'calendar' : (WIDGET_REGISTRY[type]?.route || 'today');
  switch (type) {
    case 'today': return `<p class="widget-summary">${todayTasks(data, context).filter(task => task.status !== 'completed').length}<span>項尚未完成</span></p>${taskLinks(todayTasks(data, context))}${link('today', '查看今天')}`;
    case 'allTasks': return `<p class="widget-summary">${tasks.length}<span>項尚未完成</span></p>${taskLinks(tasks)}${link('today', '查看待辦')}`;
    case 'inbox': return `<button class="entry-widget" data-navigate="inbox"><span class="entry-icon">${icon('inbox')}</span><span><strong>收件匣</strong><small>${inbox.length} 項待整理</small></span>${icon('chevronRight')}</button>`;
    case 'lists': return `<p class="widget-summary">${data.lists.length}<span>個清單</span></p>${data.lists.slice(0, 4).map(list => `<button class="widget-task" data-navigate="lists"><span>${escapeHTML(list.name)}</span><b class="widget-list-count">${tasks.filter(task => task.listId === list.id).length}</b></button>`).join('') || '<p class="empty-inline">還沒有清單。</p>'}${link('lists', '管理清單')}`;
    case 'completed': return `<p class="widget-summary">${completed.length}<span>項已完成</span></p>${taskLinks(completed)}${link('today', '查看任務')}`;
    case 'calendar':
    case 'monthCalendar': return `<button class="entry-widget" data-navigate="calendar"><span class="entry-icon">${icon('calendar')}</span><span><strong>${escapeHTML(formatMonth(new Date()))}</strong><small>${future.length} 項接下來的待辦</small></span>${icon('chevronRight')}</button>`;
    case 'upcoming': return `<button class="entry-widget" data-navigate="calendar"><span class="entry-icon">${icon('calendar')}</span><span><strong>接下來</strong><small>${future.length} 項未來待辦</small></span>${icon('chevronRight')}</button>`;
    case 'countdown': {
      const date = item.config?.date || '';
      const label = item.config?.target || '設定倒數目標';
      const days = date ? Math.ceil((new Date(`${date}T12:00:00`) - new Date(`${dateToday()}T12:00:00`)) / 86400000) : null;
      return `<button class="countdown-widget" data-action="home-widget-settings" data-id="${escapeHTML(item.id)}"><strong>${days === null ? '＋' : Math.abs(days)}</strong><span>${days === null ? escapeHTML(label) : `${days < 0 ? '天前' : '天後'} · ${escapeHTML(label)}`}</span></button>`;
    }
    case 'habits':
    case 'dailyHabits':
    case 'weeklyHabits': {
      const day = new Date(`${context.homeDate || dateToday()}T12:00:00`).getDay();
      const habits = data.habits.filter(habit => type === 'weeklyHabits' || (habit.frequency || []).includes(day));
      if (type === 'weeklyHabits') return `<p class="widget-summary">${habits.reduce((sum, habit) => sum + Object.values(habit.logs || {}).filter(Boolean).length, 0)}<span>次習慣完成</span></p>${link('habits', '查看每週習慣')}`;
      return `<p class="widget-summary">${habits.filter(habit => habit.logs?.[context.homeDate || dateToday()]).length}<span> / ${habits.length} 個習慣完成</span></p>${habits.slice(0, 3).map(habit => `<button class="widget-task" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}"><span>${escapeHTML(habit.name)}</span><b class="widget-list-count">${habit.logs?.[context.homeDate || dateToday()] ? '✓' : '○'}</b></button>`).join('') || '<p class="empty-inline">還沒有習慣。</p>'}${link('habits', '查看習慣')}`;
    }
    case 'goals': {
      const goals = (data.goals || []).filter(goal => !item.config?.goalId || goal.id === item.config.goalId);
      return `<p class="widget-summary">${goals.length}<span>${goals.length === 1 ? '個目標' : '個目標'}</span></p>${goals.slice(0, 4).map(goal => `<div class="goal-widget-row"><span>${escapeHTML(goal.name)}</span><strong>${Math.min(100, Math.round(Number(goal.progress || 0) / Math.max(1, Number(goal.target || 1)) * 100))}%</strong></div>`).join('') || '<p class="empty-inline">新增一個自訂目標，追蹤自己的進度。</p>'}<button class="text-button" data-action="home-widget-settings" data-id="${escapeHTML(item.id)}">管理目標 ${icon('chevronRight')}</button>`;
    }
    case 'focusTimer':
    case 'pomodoro': return focusWidget(data, context, item);
    case 'focusHistory': return `<p class="widget-summary">${data.focusSessions.reduce((sum, session) => sum + Number(session.minutes || 0), 0)}<span>分鐘專注紀錄</span></p>${data.focusSessions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map(session => `<div class="history-row"><span>${escapeHTML(formatDate(session.date))}</span><strong>${session.minutes} 分鐘</strong></div>`).join('') || '<p class="empty-inline">完成專注時段後會顯示紀錄。</p>'}${link('focus', '查看專注')}`;
    case 'projectProgress': return projects.slice(0, 3).map(project => { const own = data.tasks.filter(task => task.projectId === project.id); const done = own.filter(task => task.status === 'completed').length; return `<div class="widget-project-progress"><span>${escapeHTML(project.name)}</span><div><i style="width:${own.length ? done / own.length * 100 : 0}%;--project-color:${escapeHTML(project.color || '#6674b8')}"></i></div><small>${done}/${own.length}</small></div>`; }).join('') || '<p class="empty-inline">還沒有專案。</p>';
    case 'projectTasks': {
      const projectId = item.config?.projectId || projects[0]?.id;
      const project = projects.find(entry => entry.id === projectId);
      const own = project ? active(data).filter(task => task.projectId === project.id) : [];
      return `<p class="widget-summary">${own.length}<span>${escapeHTML(project?.name || '尚未選擇專案')}</span></p>${taskLinks(own)}${link('projects', '查看專案')}`;
    }
    case 'projectList': return projects.slice(0, 4).map(project => `<button class="widget-task" data-navigate="project/${encodeURIComponent(project.id)}"><span>${escapeHTML(project.name)}</span>${icon('chevronRight')}</button>`).join('') || '<p class="empty-inline">還沒有專案。</p>';
    default: return `<button class="entry-widget" data-navigate="${route}"><span class="entry-icon">${icon('today')}</span><span><strong>${escapeHTML(item.name || '小工具')}</strong><small>開啟詳細內容</small></span>${icon('chevronRight')}</button>`;
  }
}

export const WIDGET_REGISTRY = {
  today: { name: '今天待辦', category: '待辦', description: '今天尚未完成的任務', route: 'today', icon: 'today', size: 'medium', render: renderContent },
  allTasks: { name: '所有任務', category: '待辦', description: '查看所有尚未完成的任務', route: 'today', icon: 'today', size: 'medium', render: renderContent },
  inbox: { name: '收件匣', category: '待辦', description: '以圖示快速開啟未整理事項', route: 'inbox', icon: 'inbox', size: 'small', render: renderContent },
  lists: { name: '我的清單', category: '待辦', description: '清單名稱與待辦數量', route: 'lists', icon: 'projects', size: 'medium', render: renderContent },
  completed: { name: '已完成任務', category: '待辦', description: '最近完成的事項', route: 'today', icon: 'habits', size: 'medium', render: renderContent },
  calendar: { name: '行事曆', category: '時間', description: '行事曆與接下來的安排', route: 'calendar', icon: 'calendar', size: 'small', render: renderContent },
  upcoming: { name: '接下來', category: '時間', description: '以圖示開啟未來安排', route: 'calendar', icon: 'calendar', size: 'small', render: renderContent },
  monthCalendar: { name: '月曆', category: '時間', description: '開啟月曆及近期任務', route: 'calendar', icon: 'calendar', size: 'small', render: renderContent },
  countdown: { name: '日期倒數', category: '時間', description: '倒數至自訂日期', route: 'calendar', icon: 'calendar', size: 'small', render: renderContent },
  habits: { name: '習慣追蹤', category: '習慣', description: '打卡並查看今日習慣', route: 'habits', icon: 'habits', size: 'medium', render: renderContent },
  dailyHabits: { name: '每日習慣', category: '習慣', description: '快速完成今日習慣', route: 'habits', icon: 'habits', size: 'medium', render: renderContent },
  weeklyHabits: { name: '每週習慣', category: '習慣', description: '回顧本週習慣完成次數', route: 'habits', icon: 'habits', size: 'small', render: renderContent },
  goals: { name: '目標追蹤', category: '個人管理', description: '設定並查看自訂目標', route: 'statistics', icon: 'stats', size: 'medium', render: renderContent },
  focusTimer: { name: '專注計時', category: '專注', description: '開始、暫停番茄鐘', route: 'focus', icon: 'focus', size: 'small', render: renderContent },
  pomodoro: { name: '番茄鐘', category: '專注', description: '另一個專注計時入口', route: 'focus', icon: 'focus', size: 'small', render: renderContent },
  focusHistory: { name: '專注紀錄', category: '專注', description: '最近的專注時段', route: 'focus', icon: 'focus', size: 'medium', render: renderContent },
  projectProgress: { name: '專案進度', category: '專案', description: '各專案完成比例', route: 'projects', icon: 'projects', size: 'medium', render: renderContent },
  projectTasks: { name: '專案任務', category: '專案', description: '顯示指定專案的未完成任務', route: 'projects', icon: 'projects', size: 'medium', render: renderContent },
  projectList: { name: '專案清單', category: '專案', description: '快速開啟既有專案', route: 'projects', icon: 'projects', size: 'small', render: renderContent },
};

export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);
export const WIDGET_CATEGORIES = [...new Set(Object.values(WIDGET_REGISTRY).map(item => item.category))];
export const defaultWidget = (type, id = `${type}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`) => ({ id, type, name: WIDGET_REGISTRY[type]?.name || type, size: WIDGET_REGISTRY[type]?.size || 'medium', config: {} });

export function createHomeLayout(stored = {}) {
  const defaults = [
    defaultWidget('inbox', 'inbox'),
    defaultWidget('focusTimer', 'focus'),
    defaultWidget('calendar', 'calendar'),
    defaultWidget('lists', 'lists'),
  ];
  const normalizeType = type => type === 'focus' ? 'focusTimer' : type === 'upcoming' ? 'calendar' : type;
  if (Array.isArray(stored.items)) {
    const seen = new Set();
    const items = stored.items.filter(Boolean).flatMap(item => {
      const type = normalizeType(item.type);
      if (!WIDGET_REGISTRY[type] || seen.has(type)) return [];
      seen.add(type);
      const name = item.type === 'focus' && item.name === 'focus' ? WIDGET_REGISTRY[type].name : item.type === 'upcoming' && item.name === WIDGET_REGISTRY.upcoming.name ? WIDGET_REGISTRY[type].name : item.name;
      return [{ ...defaultWidget(type, item.id || undefined), ...item, type, name: name || WIDGET_REGISTRY[type].name, config: { ...(item.config || {}) } }];
    });
    return { items, hidden: Array.isArray(stored.hidden) ? stored.hidden : [], locked: Boolean(stored.locked) };
  }
  const oldOrder = Array.isArray(stored.order) ? stored.order : [];
  const oldHidden = Array.isArray(stored.hidden) ? stored.hidden : [];
  const oldSizes = stored.sizes && typeof stored.sizes === 'object' ? stored.sizes : {};
  const defaultById = new Map(defaults.map(item => [item.id, item]));
  const defaultByType = new Map(defaults.map(item => [item.type, item]));
  const ordered = [...new Set([...oldOrder, ...defaults.map(item => item.id)])].flatMap(value => {
    const type = normalizeType(value);
    const base = defaultById.get(value) || defaultByType.get(type);
    return base ? [base] : [];
  });
  const seen = new Set();
  const items = ordered.filter(item => !seen.has(item.type) && seen.add(item.type)).map(item => ({ ...item, size: oldSizes[item.id] === 'wide' || oldSizes[item.type] === 'wide' || item.type === 'calendar' && oldSizes.upcoming === 'wide' ? 'full' : item.size }));
  const hidden = oldHidden.map(id => items.find(item => item.id === id || item.type === normalizeType(id))?.id).filter(Boolean);
  return { items, hidden: [...new Set(hidden)], locked: Boolean(stored.locked) };
}

export function renderHomeWidgets(data, context) {
  const layout = context.homeLayout;
  return layout.items.filter(item => !layout.hidden.includes(item.id)).map((item, index) => {
    const definition = WIDGET_REGISTRY[item.type] || WIDGET_REGISTRY.today;
    const controls = context.homeEditMode ? `<div class="widget-edit-controls"><button class="icon-button widget-drag-handle" draggable="true" data-widget-drag="${escapeHTML(item.id)}" aria-label="拖曳移動${escapeHTML(item.name)}">⠿</button><button class="button button-small" data-action="home-widget-size" data-id="${escapeHTML(item.id)}">${({ small: '小', medium: '中', large: '大', full: '全寬' })[item.size] || '中'}</button><button class="icon-button" data-action="home-widget-settings" data-id="${escapeHTML(item.id)}" aria-label="設定${escapeHTML(item.name)}">${icon('settings')}</button><button class="icon-button" data-action="home-widget-hide" data-id="${escapeHTML(item.id)}" aria-label="隱藏${escapeHTML(item.name)}">⌑</button><button class="icon-button" data-action="home-widget-delete" data-id="${escapeHTML(item.id)}" aria-label="移除首頁上的${escapeHTML(item.name)}">×</button></div>` : '';
    return `<section class="panel home-widget-card size-${escapeHTML(item.size || 'medium')} ${context.homeEditMode ? 'is-editable' : ''}" data-widget="${escapeHTML(item.id)}" data-widget-type="${escapeHTML(item.type)}" ${context.homeEditMode ? `data-widget-index="${index}"` : ''}><div class="home-widget-card-heading"><div><p class="eyebrow">${escapeHTML(definition.category)}</p><button class="widget-title" data-action="home-widget-open-settings" data-id="${escapeHTML(item.id)}"><h3>${escapeHTML(item.name || definition.name)}</h3></button></div>${controls}</div><div class="home-widget-content">${definition.render(item.type, data, context, item)}</div>${context.homeEditMode ? '<span class="widget-resize-handle" data-widget-resize="true" data-action="home-widget-size" data-id="' + escapeHTML(item.id) + '" aria-label="調整小工具尺寸"></span>' : ''}</section>`;
  }).join('');
}

export function renderWidgetPicker(layout) {
  return `<div class="widget-picker-intro"><p>挑選要放在首頁的功能卡片。每張卡片都可以獨立命名、設定與調整版面。</p></div><div class="widget-catalog">${WIDGET_CATEGORIES.map(category => `<section class="widget-category"><h3>${escapeHTML(category)}</h3><div>${WIDGET_TYPES.filter(type => type !== 'upcoming' && WIDGET_REGISTRY[type].category === category).map(type => { const entry = WIDGET_REGISTRY[type]; const exists = layout.items.some(item => item.type === type); return `<article class="widget-catalog-item"><span class="entry-icon">${icon(entry.icon)}</span><div><strong>${escapeHTML(entry.name)}</strong><p>${escapeHTML(entry.description)}</p><span class="widget-preview">${escapeHTML(entry.category)} · ${entry.size === 'small' ? '小卡' : '資訊卡'}</span></div><button class="button button-small" data-action="home-widget-add" data-type="${type}" ${exists ? 'disabled title="此小工具已在首頁"' : ''}>${exists ? '已新增' : '新增'}</button></article>`; }).join('')}</div></section>`).join('')}</div>${layout.hidden.length ? `<section class="hidden-widgets"><h3>已隱藏</h3>${layout.hidden.map(id => { const item = layout.items.find(entry => entry.id === id); return item ? `<button class="button button-small" data-action="home-widget-unhide" data-id="${escapeHTML(item.id)}">顯示「${escapeHTML(item.name)}」</button>` : ''; }).join('')}</section>` : ''}`;
}
