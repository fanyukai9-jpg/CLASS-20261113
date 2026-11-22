import { addDays, dateKey, dayLabel, datesInRange, formatDate, formatMonth, formatTime, parseDate, startOfWeek } from './dates.js';
import { escapeHTML } from './ui.js';
import { icon, priorityLabels, renderTask } from './components.js';
import { renderHomeWidgets } from './widgets.js';

const today = () => dateKey();
const activeTasks = data => data.tasks.filter(task => task.status !== 'completed');
const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

export function renderPage(route, data, context) {
  switch (route) {
    case 'calendar': return renderCalendar(data, context);
    case 'habits': return renderHabits(data);
    case 'focus': return renderFocus(data, context);
    case 'settings': return renderSettings(data);
    case 'search': return renderSearch(data, context);
    default: return renderToday(data, context);
  }
}

function renderToday(data, context) {
  const key = context.homeDate || today();
  const selectedDate = parseDate(key);
  const isToday = key === today();
  let tasks = data.tasks.filter(task => task.dueDate === key || isToday && !task.dueDate);
  if (context.taskStatusFilter === 'active') tasks = tasks.filter(task => task.status !== 'completed');
  if (context.taskStatusFilter === 'completed') tasks = tasks.filter(task => task.status === 'completed');
  if (context.taskSort === 'priority') {
    const rank = { p2: 0, p1: 0, p3: 1, p4: 2, '': 3 };
    tasks.sort((a, b) => (rank[a.priority || ''] ?? 3) - (rank[b.priority || ''] ?? 3) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
  } else if (context.taskSort === 'manual') tasks.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  else tasks.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const allTasks = data.tasks.filter(task => task.dueDate === key || isToday && !task.dueDate);
  const completed = allTasks.filter(task => task.status === 'completed').length;
  const rate = allTasks.length ? Math.round(completed / allTasks.length * 100) : 0;
  const homeWidgets = renderHomeWidgets(data, context);
  const taskStatusOptions = [['all', '全部'], ['active', '未完成'], ['completed', '已完成']];
  return `<div class="home-swipe-region ${context.homeTransitionDirection > 0 ? 'shift-next' : context.homeTransitionDirection < 0 ? 'shift-previous' : ''}">
    <section class="panel home-task-card" aria-labelledby="home-task-heading">
      <div class="home-task-heading"><div><p class="eyebrow">${isToday ? '今天要做什麼' : escapeHTML(dayLabel(key))}</p><h1 id="home-task-heading" aria-live="polite">${escapeHTML(formatDate(key, { weekday: true, year: true }))}</h1><p class="muted home-swipe-hint">${completed} / ${allTasks.length} 項完成</p></div><button class="button button-primary" data-action="quick-add" data-date="${escapeHTML(key)}">${icon('plus')}新增待辦</button></div>
      <div class="home-progress" role="progressbar" aria-label="當日待辦完成進度" aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100"><span style="width:${rate}%"></span></div>
      <div class="today-task-tools"><div class="today-filter-switch" role="group" aria-label="任務狀態篩選">${taskStatusOptions.map(([value, label]) => `<button data-action="task-status-filter" data-filter="${value}" class="${(context.taskStatusFilter || 'all') === value ? 'is-active' : ''}" aria-pressed="${(context.taskStatusFilter || 'all') === value}">${label}${value === 'completed' ? ` ${completed}` : value === 'active' ? ` ${allTasks.length - completed}` : ''}</button>`).join('')}</div><label class="task-sort-control"><span>排序</span><select data-task-sort aria-label="任務排序"><option value="time" ${context.taskSort !== 'priority' && context.taskSort !== 'manual' ? 'selected' : ''}>時間</option><option value="priority" ${context.taskSort === 'priority' ? 'selected' : ''}>優先程度</option><option value="manual" ${context.taskSort === 'manual' ? 'selected' : ''}>自訂</option></select></label></div>
      ${tasks.length ? `<div class="task-list today-task-list">${tasks.map(task => renderTask(task, data, { home: true })).join('')}</div>` : `<div class="home-empty"><span class="home-empty-mark">${icon('today')}</span><strong>${context.taskStatusFilter === 'completed' ? '這天還沒有已完成的待辦' : context.taskStatusFilter === 'active' ? '今天的待辦都完成了' : '這天還沒有待辦事項'}</strong><span>${context.taskStatusFilter === 'completed' ? '完成的事項會收在這裡。' : '把接下來要做的事先安排好。'}</span>${context.taskStatusFilter !== 'completed' ? `<button class="button" data-action="quick-add" data-date="${escapeHTML(key)}">${icon('plus')}新增第一項</button>` : ''}</div>`}
    </section>
    <section class="home-date-card" aria-label="現在時間與月曆">
      <div class="home-date-side"><span class="home-kicker">現在時間</span><time id="home-clock" class="home-clock">${escapeHTML(formatClock())}</time><div class="home-selected-date"><strong>${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日</strong><span>${escapeHTML(new Intl.DateTimeFormat('zh-TW', { weekday: 'long' }).format(selectedDate))}</span></div><button class="text-button home-today-button" data-action="home-date-today" ${isToday ? 'disabled' : ''}>${isToday ? '今天' : '回到今天'}</button></div>
      <div class="home-calendar-side"><div class="home-calendar-heading"><div><p class="eyebrow">快速瀏覽</p><h2>${escapeHTML(formatMonth(context.homeCalendarMonth || selectedDate))}</h2></div><div class="home-calendar-controls"><button class="icon-button" data-action="home-month-shift" data-step="-1" aria-label="上一個月">${icon('chevronLeft')}</button><button class="icon-button" data-action="home-month-shift" data-step="1" aria-label="下一個月">${icon('chevronRight')}</button></div></div>${renderHomeMonth(data, context.homeCalendarMonth || selectedDate, key)}</div>
    </section>
    <section class="home-widgets-section" aria-label="首頁模組"><div class="home-widgets-heading"><div><p class="eyebrow">依裝置分別保存</p><h2>我的首頁</h2></div><div class="home-widget-toolbar"><div class="layout-device-switch" role="group" aria-label="選擇要編輯的裝置版面">${[['desktop','桌機'],['tablet','平板'],['mobile','手機']].map(([device, label]) => `<button class="layout-device-button ${context.layoutDevice === device ? 'is-active' : ''}" data-action="home-layout-device" data-device="${device}" aria-pressed="${context.layoutDevice === device}">${label}</button>`).join('')}</div><div class="home-widget-tools">${context.homeLayout.locked ? `<button class="button button-small is-locked" data-action="home-widget-lock">解除鎖定</button>` : `<button class="button button-small" data-action="home-widget-edit">${context.homeEditMode ? '完成' : '自訂'}</button>`}<button class="icon-button" data-action="home-layout-reset" aria-label="恢復預設布局" title="恢復預設布局">↺</button>${context.homeEditMode && !context.homeLayout.locked ? `<button class="button button-small" data-action="home-widget-lock">鎖定</button>` : ''}</div></div></div><div class="home-widgets" data-layout-device="${context.layoutDevice}" aria-label="首頁模組">${homeWidgets}</div>${context.homeEditMode ? `<div class="home-edit-actions"><button class="button add-widget-button" data-action="home-widget-picker">${icon('plus')}新增模組</button>${context.homeLayout.hidden.length ? `<button class="button button-small" data-action="home-widget-picker">管理已隱藏模組</button>` : ''}</div>` : ''}</section>
  </div>`;
}

function renderHomeMonth(data, monthValue, selectedKey) {
  const month = new Date(monthValue.getFullYear(), monthValue.getMonth(), 1, 12);
  const monday = data.settings.weekStartsMonday;
  const weekdays = monday ? ['一', '二', '三', '四', '五', '六', '日'] : weekdayNames;
  const start = startOfWeek(month, monday);
  const days = datesInRange(start, 42);
  return `<div class="home-calendar" aria-label="${escapeHTML(formatMonth(month))}"><div class="home-weekdays">${weekdays.map(name => `<span>${name}</span>`).join('')}</div><div class="home-days">${days.map(day => {
    const key = dateKey(day);
    const taskCount = data.tasks.filter(task => task.dueDate === key && task.status !== 'completed').length;
    return `<button class="home-day ${day.getMonth() !== month.getMonth() ? 'is-outside' : ''} ${key === today() ? 'is-today' : ''} ${key === selectedKey ? 'is-selected' : ''}" data-action="home-date-select" data-date="${key}" aria-current="${key === today() ? 'date' : 'false'}" aria-label="${escapeHTML(formatDate(key, { weekday: true, year: true }))}${taskCount ? `，${taskCount} 項待辦` : ''}"><span>${day.getDate()}</span>${taskCount ? '<i aria-hidden="true"></i>' : ''}</button>`;
  }).join('')}</div></div>`;
}

function formatClock(value = new Date()) {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value);
}

function renderCalendar(data, context) {
  const date = parseDate(context.calendarDate || today());
  const monday = data.settings.weekStartsMonday;
  const month = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const days = datesInRange(startOfWeek(month, monday), 42);
  const weekdays = monday ? ['一', '二', '三', '四', '五', '六', '日'] : weekdayNames;
  const cells = days.map(day => {
    const key = dateKey(day);
    const tasks = data.tasks.filter(task => task.dueDate === key).sort(byDate);
    const muted = day.getMonth() !== date.getMonth();
    return `<div class="calendar-day ${key === today() ? 'is-today' : ''} ${muted ? 'is-muted' : ''}" data-drop-date="${key}"><button class="calendar-day-number" data-action="calendar-add" data-date="${key}">${day.getDate()}</button><div class="calendar-events">${tasks.slice(0, 3).map(task => `<button class="calendar-event priority-${escapeHTML(priorityTone(task.priority))} ${task.status === 'completed' ? 'is-complete' : ''}" draggable="true" data-task-id="${escapeHTML(task.id)}" data-action="task-detail" data-id="${escapeHTML(task.id)}" title="${escapeHTML(task.title)}">${task.startTime ? `${escapeHTML(formatTime(task.startTime, data.settings.hour24))} ` : ''}${escapeHTML(task.title)}</button>`).join('')}${tasks.length > 3 ? `<span class="calendar-more">+${tasks.length - 3} 項</span>` : ''}</div></div>`;
  }).join('');
  const future = activeTasks(data).filter(task => !task.dueDate || task.dueDate >= today()).sort(byDate);
  const groups = new Map();
  for (const task of future) {
    const key = task.dueDate || 'unscheduled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const schedule = groups.size ? [...groups].slice(0, 15).map(([day, items]) => `<section class="calendar-agenda-day"><h3>${day === 'unscheduled' ? '未安排日期' : `${escapeHTML(dayLabel(day))}<span>${escapeHTML(formatDate(day))}</span>`}</h3><div class="task-list">${items.map(task => renderTask(task, data, { compact: true })).join('')}</div></section>`).join('') : '<p class="empty-inline">目前沒有接下來的安排。從月曆日期新增待辦，它就會出現在這裡。</p>';
  const heading = formatMonth(date);
  return `<section class="page-intro"><div><p class="eyebrow">行事曆／接下來</p><h1>行事曆</h1><p class="muted">瀏覽日期，也看看接下來要做的事。</p></div><div class="page-intro-actions"><button class="button" data-action="ai-open" data-ai-route="calendar">✳ AI 安排</button><button class="button button-primary" data-action="quick-add">${icon('plus')}新增待辦</button></div></section><div class="calendar-page-layout"><section class="calendar-panel"><div class="calendar-toolbar"><div class="calendar-controls"><button class="icon-button" aria-label="上個月" data-action="calendar-shift" data-step="-1">${icon('chevronLeft')}</button><h2>${escapeHTML(heading)}</h2><button class="icon-button" aria-label="下個月" data-action="calendar-shift" data-step="1">${icon('chevronRight')}</button><button class="button button-small" data-action="calendar-today">今天</button></div></div><div class="calendar-weekdays">${weekdays.map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></section><aside class="panel calendar-agenda"><div class="panel-heading"><div><p class="eyebrow">接下來</p><h2>近期待辦</h2><p class="muted">${future.length} 項未完成</p></div></div>${schedule}</aside></div>`;
}

function renderHabits(data) {
  const key = today();
  const weekday = new Date(`${key}T12:00:00`).getDay();
  const todayHabits = data.habits.filter(habit => (habit.frequency || []).includes(weekday));
  const done = todayHabits.filter(habit => habit.logs?.[key]).length;
  const weekKeys = datesInRange(addDays(key, -6), 7).map(dateKey);
  const scheduled = data.habits.reduce((sum, habit) => sum + (habit.frequency || []).filter(day => weekKeys.some(date => new Date(`${date}T12:00:00`).getDay() === day)).length, 0);
  const logged = data.habits.reduce((sum, habit) => sum + weekKeys.filter(day => habit.logs?.[day]).length, 0);
  const weeklyRate = scheduled ? Math.round(logged / scheduled * 100) : 0;
  return `<section class="page-intro"><div><p class="eyebrow">習慣追蹤</p><h1>習慣</h1><p class="muted">今天 ${done}/${todayHabits.length} 項完成 · 本週完成率 ${weeklyRate}%</p></div><div class="page-intro-actions"><button class="button" data-action="ai-open" data-ai-route="habits">✳ AI 分析</button><button class="button button-primary" data-action="habit-add">${icon('plus')}新增習慣</button></div></section>${data.habits.length ? `<div class="habit-grid">${data.habits.map(habit => renderHabit(habit, key)).join('')}</div><section class="panel habit-history"><div class="panel-heading"><div><p class="eyebrow">最近 28 天</p><h2>每日紀錄</h2></div></div><div class="habit-heatmap">${data.habits.map(habit => `<div class="heatmap-row"><span>${escapeHTML(habit.name)}</span><div>${datesInRange(addDays(key, -27), 28).map(day => `<i class="heat-cell ${habit.logs?.[dateKey(day)] ? 'is-done' : ''}" title="${escapeHTML(formatDate(day))}" style="--habit-color:${escapeHTML(habit.color || '#777')}" aria-label="${escapeHTML(formatDate(day))}${habit.logs?.[dateKey(day)] ? ' 已完成' : ' 未完成'}"></i>`).join('')}</div></div>`).join('')}</div></section>` : emptyState('開始建立一個習慣', '選擇一件想持續做的小事，完成後每天留下紀錄。', '新增習慣', 'habit-add')}`;
}

function renderHabit(habit, key) {
  const frequency = habit.frequency || [];
  const logs = Object.keys(habit.logs || {}).filter(day => habit.logs[day]).sort();
  const logged = new Set(logs);
  let streak = 0;
  let cursor = logged.has(key) ? key : dateKey(addDays(key, -1));
  for (let guard = 0; guard < 400; guard++) {
    const weekday = new Date(`${cursor}T12:00:00`).getDay();
    if (frequency.includes(weekday)) {
      if (!logged.has(cursor)) break;
      streak++;
    }
    cursor = dateKey(addDays(cursor, -1));
  }
  let completed = 0;
  let expected = 0;
  for (const day of datesInRange(addDays(key, -27), 28)) {
    const dayKey = dateKey(day);
    if (frequency.includes(day.getDay())) { expected++; if (logged.has(dayKey)) completed++; }
  }
  const rate = expected ? Math.round(completed / expected * 100) : 0;
  const frequencyLabel = frequency.length === 7 ? '每天' : frequency.length ? `每週${frequency.map(day => weekdayNames[day]).join('、')}` : '未安排頻率';
  return `<article class="habit-card" style="--habit-color:${escapeHTML(habit.color || '#777')}"><div class="habit-card-head"><span class="habit-symbol">${escapeHTML((habit.name || '習').slice(0, 1))}</span><div class="habit-card-actions"><button class="icon-button" aria-label="編輯習慣" data-action="habit-edit" data-id="${escapeHTML(habit.id)}">${icon('edit')}</button><button class="icon-button" aria-label="刪除習慣" data-action="habit-delete" data-id="${escapeHTML(habit.id)}">×</button></div></div><h2>${escapeHTML(habit.name)}</h2><p class="muted">${escapeHTML(habit.description || frequencyLabel)}</p><div class="habit-stats"><span><strong>${streak}</strong>連續完成</span><span><strong>${rate}%</strong>28 日完成率</span><span><strong>${logs.length}</strong>次完成</span></div><div class="habit-ai-actions"><button class="text-button" data-action="ai-open" data-ai-route="habit" data-id="${escapeHTML(habit.id)}">✳ AI 協助這個習慣</button><button class="button ${habit.logs?.[key] ? 'button-done' : 'button-primary'} habit-today" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}" ${frequency.includes(new Date(`${key}T12:00:00`).getDay()) ? '' : 'disabled'}>${habit.logs?.[key] ? '今天已完成' : frequency.includes(new Date(`${key}T12:00:00`).getDay()) ? '完成今天習慣' : '今天休息'}</button></div></article>`;
}

function renderFocus(data, context) {
  const focus = context.focus;
  const task = data.tasks.find(item => item.id === focus.taskId);
  const remaining = Math.max(0, focus.remainingMs);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor(remaining % 60000 / 1000);
  const todaySessions = data.focusSessions.filter(item => item.date === today());
  const focusMinutes = todaySessions.reduce((sum, item) => sum + Number(item.minutes), 0);
  const selectedMinutes = Number(focus.durations[focus.mode] || 25);
  const wheelHours = Math.floor(selectedMinutes / 60);
  const wheelMinutes = selectedMinutes % 60;
  const wheelDisabled = focus.started || focus.running;
  const maxWheelHour = focus.mode === 'focus' ? 2 : 1;
  const wheel = (unit, selected, values, label) => `<div class="focus-wheel-column"><span>${label}</span><div class="focus-wheel" role="listbox" aria-label="${label}" data-no-day-swipe><span class="focus-wheel-spacer" aria-hidden="true"></span>${values.map(value => `<button role="option" aria-selected="${value === selected}" class="focus-wheel-value ${value === selected ? 'is-selected' : ''}" data-action="focus-duration-wheel" data-wheel="${unit}" data-value="${value}" ${wheelDisabled ? 'disabled' : ''}>${String(value).padStart(2, '0')}</button>`).join('')}<span class="focus-wheel-spacer" aria-hidden="true"></span></div></div>`;
  const history = data.focusSessions.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10);
  return `<section class="page-intro"><div><p class="eyebrow">專注計時</p><h1>專注時間</h1><p class="muted">設定一段時間，留給眼前的一件事。</p></div><button class="button" data-action="ai-open" data-ai-route="focus">✳ AI 建議</button></section><div class="focus-layout"><section class="panel focus-panel"><div class="focus-mode-switch">${['focus', 'short', 'long'].map(mode => `<button data-action="focus-mode" data-mode="${mode}" class="${focus.mode === mode ? 'is-active' : ''}" ${wheelDisabled ? 'disabled' : ''}>${{ focus: '專注', short: '短休息', long: '長休息' }[mode]}</button>`).join('')}</div><div class="focus-ring ${focus.running ? 'is-running' : ''}" style="--focus-progress:${Math.max(0, Math.min(100, (1 - remaining / (Number(focus.durations[focus.mode] || 25) * 60000)) * 100))}%"><div><span class="focus-clock" id="focus-clock">${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</span><span class="muted">${{ focus: '專注中', short: '短暫休息', long: '長休息' }[focus.mode]}</span></div></div><label class="focus-task-label">目前專注任務<select data-setting="focus-task"><option value="">不連結任務</option>${activeTasks(data).map(item => `<option value="${escapeHTML(item.id)}" ${focus.taskId === item.id ? 'selected' : ''}>${escapeHTML(item.title)}</option>`).join('')}</select></label>${focus.focusGoal ? `<p class="focus-goal">本次目標：${escapeHTML(focus.focusGoal)}</p>` : ''}<div class="focus-controls">${focus.running ? `<button class="button button-primary" data-action="focus-pause">暫停</button>` : `<button class="button button-primary" data-action="focus-start">${focus.started ? '繼續' : '開始'}</button>`}<button class="button" data-action="focus-end" ${focus.started ? '' : 'disabled'}>結束並記錄</button><button class="button" data-action="focus-reset">重設</button></div><div class="focus-duration-picker"><p>設定${{focus:'專注',short:'短休息',long:'長休息'}[focus.mode]}時間 <span>${focus.started ? '計時期間無法修改' : '上下滑動選擇'}</span></p><div class="focus-wheel-pair">${wheel('hours', wheelHours, Array.from({length:maxWheelHour + 1}, (_, i) => i), '小時')}${wheel('minutes', wheelMinutes, Array.from({length:60}, (_, i) => i), '分鐘')}</div><div class="focus-wheel-selection" aria-live="polite">${String(wheelHours).padStart(2, '0')} 小時 ${String(wheelMinutes).padStart(2, '0')} 分鐘</div></div></section><aside class="focus-side"><section class="panel focus-summary"><p class="eyebrow">今天</p><h2>${formatMinutes(focusMinutes)}</h2><p class="muted">${todaySessions.length} 個完成時段</p>${task ? `<p class="focus-current-task">目前任務：${escapeHTML(task.title)}</p>` : ''}</section><section class="panel focus-history"><div class="panel-heading"><div><p class="eyebrow">專注紀錄</p><h2>最近時段</h2></div></div>${history.map(item => `<div class="history-row"><span>${escapeHTML(formatDate(item.date))}</span><strong>${item.minutes} 分鐘</strong><span class="muted">${escapeHTML(data.tasks.find(entry => entry.id === item.taskId)?.title || '自由專注')}</span></div>`).join('') || '<p class="empty-inline">完成一段專注後，紀錄會顯示在這裡。</p>'}</section></aside></div>`;
}

function renderSettings(data) {
  const settings = data.settings;
  return `<section class="page-intro"><div><p class="eyebrow">DAYFLOW</p><h1>設定</h1><p class="muted">依照你的習慣調整介面。</p></div></section><div class="settings-layout"><section class="panel settings-panel"><div class="settings-section"><p class="eyebrow">外觀</p><h2>顯示方式</h2><label class="setting-row"><span><strong>色彩模式</strong><small>選擇淺色、深色或跟隨系統</small></span><select data-setting="theme"><option value="light" ${settings.theme === 'light' ? 'selected' : ''}>淺色</option><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>深色</option><option value="system" ${settings.theme === 'system' ? 'selected' : ''}>跟隨系統</option></select></label><label class="setting-row"><span><strong>強調色</strong><small>按鈕和進度顏色</small></span><input type="color" data-setting="accent" value="${escapeHTML(settings.accent || '#6674b8')}"></label><label class="setting-row"><span><strong>介面密度</strong></span><select data-setting="compact"><option value="false" ${!settings.compact ? 'selected' : ''}>舒適</option><option value="true" ${settings.compact ? 'selected' : ''}>精簡</option></select></label></div><div class="settings-section"><p class="eyebrow">偏好</p><h2>日期與時間</h2><label class="setting-row"><span><strong>一週起始日</strong></span><select data-setting="weekStartsMonday"><option value="true" ${settings.weekStartsMonday ? 'selected' : ''}>星期一</option><option value="false" ${!settings.weekStartsMonday ? 'selected' : ''}>星期日</option></select></label><label class="setting-row"><span><strong>時間格式</strong></span><select data-setting="hour24"><option value="true" ${settings.hour24 !== false ? 'selected' : ''}>24 小時制</option><option value="false" ${settings.hour24 === false ? 'selected' : ''}>12 小時制</option></select></label><label class="setting-row"><span><strong>預設優先程度</strong></span><select data-setting="defaultPriority">${[['', '無'], ['p4', '低'], ['p3', '中'], ['p2', '高']].map(([value, label]) => `<option value="${value}" ${settings.defaultPriority === value || value === '' && settings.defaultPriority === 'none' ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="settings-section"><p class="eyebrow">資料</p><h2>備份與移轉</h2><p class="muted">匯出檔案包含待辦、習慣、專注紀錄與偏好設定。</p><div class="settings-actions"><button class="button" data-action="export-data">${icon('download')}匯出 JSON</button><label class="button file-button">匯入 JSON<input type="file" accept="application/json,.json" data-action="import-data" hidden></label></div></div></section><aside class="settings-aside"><div class="settings-mark">D</div><h2>DAYFLOW</h2><p class="muted">你的日常整理，從一件待辦開始。</p><span class="version-note">資料版本 ${data.version}</span></aside></div>`;
}

function renderSearch(data, context) {
  const query = String(context.query || '').trim().toLocaleLowerCase();
  const results = query ? data.tasks.filter(task => [task.title, task.description, task.notes].join(' ').toLocaleLowerCase().includes(query)) : [];
  return `<section class="page-intro"><div><p class="eyebrow">搜尋待辦</p><h1>搜尋</h1></div></section><section class="panel task-panel"><label class="search-large">${icon('search')}<input id="search-page-input" type="search" value="${escapeHTML(context.query || '')}" placeholder="搜尋任務名稱或備註…" autofocus><kbd>Esc</kbd></label>${query ? results.length ? `<p class="muted search-results-count">找到 ${results.length} 項</p><div class="task-list">${results.map(task => renderTask(task, data)).join('')}</div>` : emptyInline('沒有符合條件的待辦。') : emptyInline('輸入關鍵字開始搜尋。')}</section>`;
}

function priorityTone(priority) { return priority === 'p4' ? 'low' : priority === 'p3' ? 'medium' : priority === 'p1' || priority === 'p2' ? 'high' : 'none'; }
function byDate(a, b) { return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || Number(a.sortOrder || 0) - Number(b.sortOrder || 0); }
function formatMinutes(minutes) { const n = Number(minutes) || 0; return n < 60 ? `${n} 分鐘` : `${Math.floor(n / 60)} 小時${n % 60 ? ` ${n % 60} 分` : ''}`; }
function emptyState(title, copy, button, action) { return `<section class="panel empty-state"><span class="empty-mark">${icon('habits')}</span><h2>${escapeHTML(title)}</h2><p class="muted">${escapeHTML(copy)}</p>${button ? `<button class="button button-primary" data-action="${escapeHTML(action)}">${escapeHTML(button)}</button>` : ''}</section>`; }
function emptyInline(copy) { return `<p class="empty-inline">${escapeHTML(copy)}</p>`; }
