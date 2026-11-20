import { addDays, dateKey, dayLabel, datesInRange, formatDate, formatMonth, formatTime, parseDate, startOfWeek } from './dates.js';
import { escapeHTML } from './ui.js';
import { icon, priorityLabels, renderTask, renderTaskGroup, statusLabels } from './components.js';

const today = () => dateKey();
const activeTasks = data => data.tasks.filter(task => task.status !== 'completed');

export function renderPage(route, data, context) {
  if (route.startsWith('project/')) return renderProjectDetail(route.slice(8), data, context);
  switch (route) {
    case 'inbox': return renderInbox(data, context);
    case 'upcoming': return renderUpcoming(data, context);
    case 'calendar': return renderCalendar(data, context);
    case 'projects': return renderProjects(data, context);
    case 'habits': return renderHabits(data);
    case 'focus': return renderFocus(data, context);
    case 'statistics': return renderStatistics(data, context);
    case 'settings': return renderSettings(data);
    case 'search': return renderSearch(data, context);
    default: return renderToday(data, context);
  }
}

function renderToday(data, context) {
  const key = today();
  const allTodayTasks = data.tasks.filter(task => task.dueDate === key);
  const todayTasks = filtered(allTodayTasks, data, context);
  const overdue = filtered(activeTasks(data), data, context).filter(task => task.dueDate && task.dueDate < key);
  const completed = allTodayTasks.filter(task => task.status === 'completed').length;
  const total = allTodayTasks.length;
  const rate = total ? Math.round(completed / total * 100) : 0;
  const orderToday = context.filters.sort === 'manual' ? (a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) : (a, b) => (a.startTime || '').localeCompare(b.startTime || '') || Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  const allDay = todayTasks.filter(task => !task.startTime).sort(orderToday);
  const scheduled = todayTasks.filter(task => task.startTime).sort(orderToday);
  const focusMinutes = data.focusSessions.filter(item => item.date === key).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const todayHabits = data.habits.filter(habit => (habit.frequency || []).includes(new Date().getDay()));
  const habitDone = todayHabits.filter(habit => habit.logs?.[key]).length;
  return `<section class="page-intro"><div><p class="eyebrow">${escapeHTML(new Intl.DateTimeFormat('zh-TW', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()))}</p><h1>${escapeHTML(context.greeting)}，今天先做好一件事。</h1><p class="muted">把注意力放在當下，剩下的交給 DAYFLOW。</p></div><button class="button button-primary" data-action="quick-add">${icon('plus')}新增任務 <kbd>Q</kbd></button></section>
    <div class="summary-grid">
      ${metricCard('今日任務', total, '安排在今天的事項', icon('today'))}
      ${metricCard('已完成', completed, `今日完成 ${rate}%`, icon('habits'))}
      ${metricCard('待處理', total - completed, '保持一個舒服的節奏', icon('inbox'))}
      ${metricCard('逾期提醒', overdue.length, overdue.length ? '安排一點時間處理' : '目前沒有逾期任務', icon('calendar'))}
    </div>
    <div class="dashboard-grid"><div class="dashboard-main">
      <section class="panel progress-panel"><div class="progress-ring" style="--progress:${rate}%"><div><strong>${rate}%</strong><span>今日進度</span></div></div><div class="progress-copy"><p class="eyebrow">DAILY PROGRESS</p><h2>${completed} / ${total} 項完成</h2><p class="muted">${total ? `完成 ${total} 項任務的 ${rate}%。` : '新增今天的第一個任務，開始累積進度。'}</p></div><button class="icon-button" data-action="quick-add" aria-label="新增任務">${icon('plus')}</button></section>
      <section class="panel task-panel"><div class="panel-heading"><div><p class="eyebrow">YOUR PLAN</p><h2>今日安排</h2></div><div class="view-switch"><button data-action="task-view" data-view="list" class="${context.taskView === 'list' ? 'is-active' : ''}">清單</button><button data-action="task-view" data-view="compact" class="${context.taskView === 'compact' ? 'is-active' : ''}">精簡</button></div></div>${renderFilterBar(context, data)}
        ${overdue.length ? renderTaskGroup('逾期', overdue, data, { compact: context.taskView === 'compact' }) : ''}
        ${allDay.length ? renderTaskGroup('全天', allDay, data, { compact: context.taskView === 'compact' }) : '<section class="task-group"><div class="group-heading"><h3>全天</h3><span>0</span></div><p class="empty-inline">今天沒有全天任務</p></section>'}
        ${scheduled.length ? renderTaskGroup('已排時間', scheduled, data, { compact: context.taskView === 'compact' }) : '<section class="task-group"><div class="group-heading"><h3>已排時間</h3><span>0</span></div><p class="empty-inline">新增時間，安排今天的節奏</p></section>'}
        ${renderTaskGroup('其他待辦', filtered(activeTasks(data), data, context).filter(task => !task.dueDate), data, { compact: context.taskView === 'compact' })}
      </section>
    </div><aside class="dashboard-side">
      <section class="panel widget"><div class="panel-heading"><div><p class="eyebrow">FOCUS TIME</p><h2>今日專注</h2></div>${icon('focus')}</div><div class="widget-stat"><strong>${formatMinutes(focusMinutes)}</strong><span>累積專注時間</span></div><button class="text-button" data-navigate="focus">開始專注 ${icon('chevronRight')}</button></section>
      <section class="panel widget"><div class="panel-heading"><div><p class="eyebrow">SMALL STEPS</p><h2>今日習慣</h2></div><span class="widget-count">${habitDone}/${todayHabits.length}</span></div>${todayHabits.length ? todayHabits.slice(0, 5).map(habit => `<button class="habit-check-row ${habit.logs?.[key] ? 'is-checked' : ''}" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}"><span class="task-check"><span></span></span><span>${escapeHTML(habit.name)}</span></button>`).join('') : '<p class="empty-inline">新增一個想養成的習慣</p>'}<button class="text-button" data-navigate="habits">查看習慣 ${icon('chevronRight')}</button></section>
      <section class="panel widget"><div class="panel-heading"><div><p class="eyebrow">NEXT UP</p><h2>接下來</h2></div>${icon('calendar')}</div>${activeTasks(data).filter(task => task.dueDate > key).sort(byDate).slice(0, 3).map(task => `<button class="upcoming-mini" data-action="task-detail" data-id="${escapeHTML(task.id)}"><span class="mini-date">${escapeHTML(dayLabel(task.dueDate))}</span><span>${escapeHTML(task.title)}</span></button>`).join('') || '<p class="empty-inline">近期沒有安排</p>'}</section>
      ${renderMiniCalendar(data)}
    </aside></div>`;
}

function renderInbox(data, context) {
  const inbox = data.tasks.filter(task => !task.dueDate && !task.projectId);
  const tasks = filtered(context.filters.status ? inbox : inbox.filter(task => task.status !== 'completed'), data, context);
  return `<section class="page-intro"><div><p class="eyebrow">CAPTURE FIRST, ORGANIZE LATER</p><h1>收集箱</h1><p class="muted">先記下突然想到的事，之後再決定時間和專案。</p></div><button class="button button-primary" data-action="quick-add" data-inbox="true">${icon('plus')}快速收集 <kbd>Q</kbd></button></section>
    <section class="panel task-panel"><div class="panel-heading"><div><h2>尚未整理</h2><p class="muted">${tasks.length} 個事項</p></div><button class="button" data-action="open-task-form" data-inbox="true">新增事項</button></div>${renderFilterBar(context, data)}${tasks.length ? `<div class="task-list">${tasks.map(task => renderTask(task, data, { compact: context.taskView === 'compact' })).join('')}</div>` : emptyState('收集箱已清空', '把腦中的想法先放進來，稍後再整理。', '新增事項', 'quick-add')}</section>`;
}

function renderUpcoming(data, context) {
  const upcoming = data.tasks.filter(task => task.dueDate && task.dueDate >= today());
  const tasks = filtered(context.filters.status ? upcoming : upcoming.filter(task => task.status !== 'completed'), data, context).sort(byDate);
  const noDateTasks = data.tasks.filter(task => !task.dueDate);
  const noDate = filtered(context.filters.status ? noDateTasks : noDateTasks.filter(task => task.status !== 'completed'), data, context);
  const groups = new Map();
  for (const task of tasks) { if (!groups.has(task.dueDate)) groups.set(task.dueDate, []); groups.get(task.dueDate).push(task); }
  return `<section class="page-intro"><div><p class="eyebrow">LOOK AHEAD</p><h1>即將到來</h1><p class="muted">先看見下一步，安排好再出發。</p></div><button class="button button-primary" data-action="quick-add">${icon('plus')}新增任務</button></section>
    <section class="panel task-panel"><div class="panel-heading"><div><h2>日期安排</h2><p class="muted">今天、接下來七天與更遠的計畫</p></div></div>${renderFilterBar(context, data)}${groups.size ? [...groups].map(([day, items]) => renderTaskGroup(`${dayLabel(day)} · ${formatDate(day)}`, items, data, { compact: context.taskView === 'compact' })).join('') : '<p class="empty-inline">這段期間沒有排定任務</p>'}${renderTaskGroup('未排日期', noDate, data, { compact: context.taskView === 'compact' })}</section>`;
}

function renderCalendar(data, context) {
  const date = parseDate(context.calendarDate || today());
  const mode = context.calendarMode || 'month';
  const monday = data.settings.weekStartsMonday;
  const start = mode === 'month' ? startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1, 12), monday) : mode === 'day' ? date : startOfWeek(date, monday);
  const count = mode === 'month' ? 42 : mode === 'week' ? 7 : 1;
  const days = datesInRange(start, count);
  const weekdays = monday ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'];
  const headers = mode === 'day' ? '' : weekdays.map(day => `<span>${day}</span>`).join('');
  const cells = days.map(day => {
    const key = dateKey(day);
    const tasks = data.tasks.filter(task => task.dueDate === key).sort(byDate);
    const muted = mode === 'month' && day.getMonth() !== date.getMonth();
    return `<div class="calendar-day ${key === today() ? 'is-today' : ''} ${muted ? 'is-muted' : ''}" data-drop-date="${key}"><button class="calendar-day-number" data-action="calendar-add" data-date="${key}">${mode === 'day' ? escapeHTML(formatDate(key, { weekday: true, year: true })) : day.getDate()}</button><div class="calendar-events">${tasks.slice(0, mode === 'month' ? 3 : 8).map(task => { const projectColor = data.projects.find(project => project.id === task.projectId)?.color || ''; return `<button class="calendar-event ${task.status === 'completed' ? 'is-complete' : ''}" style="${projectColor ? `--event-color:${escapeHTML(projectColor)}` : ''}" draggable="true" data-task-id="${escapeHTML(task.id)}" data-action="task-detail" data-id="${escapeHTML(task.id)}" title="${escapeHTML(task.title)}">${task.startTime ? `${escapeHTML(formatTime(task.startTime, data.settings.hour24))} ` : ''}${escapeHTML(task.title)}</button>`; }).join('')}${tasks.length > (mode === 'month' ? 3 : 8) ? `<span class="calendar-more">+${tasks.length - (mode === 'month' ? 3 : 8)} 項</span>` : ''}</div></div>`;
  }).join('');
  const heading = mode === 'month' ? formatMonth(date) : mode === 'week' ? `${formatDate(days[0], { month: true })} — ${formatDate(days[6])}` : formatDate(date, { weekday: true, year: true });
  return `<section class="page-intro"><div><p class="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h1>行事曆</h1><p class="muted">${escapeHTML(heading)}</p></div><button class="button button-primary" data-action="quick-add">${icon('plus')}新增任務</button></section>
    <section class="panel calendar-panel"><div class="calendar-toolbar"><div class="calendar-controls"><button class="icon-button" aria-label="上一個期間" data-action="calendar-shift" data-step="-1">${icon('chevronLeft')}</button><button class="button button-small" data-action="calendar-today">今天</button><button class="icon-button" aria-label="下一個期間" data-action="calendar-shift" data-step="1">${icon('chevronRight')}</button><h2>${escapeHTML(heading)}</h2></div><div class="view-switch">${['month', 'week', 'day'].map(item => `<button data-action="calendar-mode" data-mode="${item}" class="${mode === item ? 'is-active' : ''}">${{ month: '月', week: '週', day: '日' }[item]}</button>`).join('')}</div></div>
    <div class="calendar-grid ${mode === 'day' ? 'calendar-day-view' : ''}" style="--calendar-cols:${mode === 'day' ? 1 : 7}">${headers ? `<div class="calendar-weekdays">${headers}</div>` : ''}${cells}</div><p class="calendar-hint">點日期新增任務；把任務拖到日期可調整截止日。</p></section>`;
}

function renderProjects(data, context) {
  const total = data.projects.length;
  return `<section class="page-intro"><div><p class="eyebrow">PROJECTS, IN PROGRESS</p><h1>專案</h1><p class="muted">把相關任務放在一起，循序推進。</p></div><button class="button button-primary" data-action="project-add">${icon('plus')}新增專案</button></section>
    ${total ? `<div class="project-grid">${data.projects.map(project => projectCard(project, data)).join('')}</div>` : emptyState('建立第一個專案', '用專案整理有共同目標的任務。', '新增專案', 'project-add')}`;
}

function projectCard(project, data) {
  const tasks = data.tasks.filter(task => task.projectId === project.id);
  const completed = tasks.filter(task => task.status === 'completed').length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  return `<button class="project-card" data-navigate="project/${escapeHTML(project.id)}" style="--project-color:${escapeHTML(project.color || '#6674b8')}"><span class="project-card-top"><span class="project-icon">${icon(project.icon || 'projects')}</span><span class="icon-button">${icon('chevronRight')}</span></span><strong>${escapeHTML(project.name)}</strong><span class="muted project-description">${escapeHTML(project.description || '尚未新增描述')}</span><span class="project-progress"><i style="width:${progress}%"></i></span><span class="project-card-meta"><span>${completed}/${tasks.length} 個任務完成</span>${project.deadline ? `<span>${escapeHTML(formatDate(project.deadline))}</span>` : ''}</span></button>`;
}

function renderProjectDetail(id, data, context) {
  const project = data.projects.find(item => item.id === id);
  if (!project) return emptyState('找不到這個專案', '它可能已經被刪除。', '回到專案', 'navigate-projects');
  const tasks = filtered(data.tasks.filter(task => task.projectId === id), data, context);
  const view = context.projectView || 'list';
  const progress = tasks.length ? Math.round(tasks.filter(task => task.status === 'completed').length / tasks.length * 100) : 0;
  const body = view === 'board' ? `<div class="kanban-board">${['todo', 'in-progress', 'completed'].map(status => `<section class="kanban-column" data-status-column="${status}"><div class="kanban-heading"><h3>${statusLabels[status]}</h3><span>${tasks.filter(task => task.status === status).length}</span></div>${tasks.filter(task => task.status === status).map(task => `<div class="kanban-card" draggable="true" data-task-id="${escapeHTML(task.id)}">${renderTask(task, data)}</div>`).join('') || '<p class="empty-inline">拖放任務到這裡</p>'}</section>`).join('')}</div>` : `<div class="task-list">${tasks.map(task => renderTask(task, data)).join('')}</div>`;
  return `<section class="project-hero" style="--project-color:${escapeHTML(project.color || '#6674b8')}"><button class="back-link" data-navigate="projects">${icon('chevronLeft')}所有專案</button><div class="project-hero-main"><div><p class="eyebrow">PROJECT OVERVIEW</p><h1>${escapeHTML(project.name)}</h1><p class="muted">${escapeHTML(project.description || '尚未新增描述')}</p></div><div class="project-hero-actions"><button class="button" data-action="project-edit" data-id="${escapeHTML(project.id)}">編輯專案</button><button class="icon-button" aria-label="刪除專案" data-action="project-delete" data-id="${escapeHTML(project.id)}">${icon('more')}</button></div></div><div class="project-hero-meta"><span>${tasks.length} 個任務</span><span>${progress}% 完成</span>${project.deadline ? `<span>期限 ${escapeHTML(formatDate(project.deadline))}</span>` : ''}</div><div class="project-progress"><i style="width:${progress}%"></i></div></section>
    <section class="panel task-panel"><div class="panel-heading"><div><h2>任務</h2><p class="muted">可以拖曳卡片切換看板狀態</p></div><div class="panel-actions"><div class="view-switch"><button data-action="project-view" data-view="list" class="${view === 'list' ? 'is-active' : ''}">清單</button><button data-action="project-view" data-view="board" class="${view === 'board' ? 'is-active' : ''}">看板</button></div><button class="button button-primary button-small" data-action="quick-add" data-project="${escapeHTML(project.id)}">${icon('plus')}新增任務</button></div></div>${renderFilterBar(context, data)}${body}</section>`;
}

function renderHabits(data) {
  const key = today();
  const active = data.habits.filter(habit => (habit.frequency || []).includes(new Date().getDay()));
  const done = active.filter(habit => habit.logs?.[key]).length;
  const weekKeys = datesInRange(addDays(key, -6), 7).map(dateKey);
  const weeklyRate = data.habits.length ? Math.round(data.habits.reduce((sum, habit) => sum + weekKeys.filter(day => habit.logs?.[day]).length, 0) / Math.max(data.habits.reduce((sum, habit) => sum + (habit.frequency || []).filter(day => weekKeys.some(key => new Date(`${key}T12:00:00`).getDay() === day)).length, 0), 1) * 100) : 0;
  return `<section class="page-intro"><div><p class="eyebrow">SMALL STEPS, EVERY DAY</p><h1>習慣</h1><p class="muted">${done}/${active.length} 個今日習慣完成 · 本週完成率 ${weeklyRate}%</p></div><button class="button button-primary" data-action="habit-add">${icon('plus')}新增習慣</button></section>
    ${data.habits.length ? `<div class="habit-grid">${data.habits.map(habit => renderHabit(habit, key)).join('')}</div>` : emptyState('開始建立一個小習慣', '每天一點點，時間會幫你累積。', '新增習慣', 'habit-add')}
    <section class="panel habit-history"><div class="panel-heading"><div><p class="eyebrow">LAST 28 DAYS</p><h2>習慣紀錄</h2></div></div>${data.habits.length ? `<div class="habit-heatmap">${data.habits.map(habit => `<div class="heatmap-row"><span>${escapeHTML(habit.name)}</span><div>${datesInRange(addDays(key, -27), 28).map(day => `<i class="heat-cell ${habit.logs?.[dateKey(day)] ? 'is-done' : ''}" title="${escapeHTML(formatDate(day))}" style="--habit-color:${escapeHTML(habit.color || '#6674b8')}"></i>`).join('')}</div></div>`).join('')}</div>` : '<p class="empty-inline">新增習慣後，這裡會出現每日紀錄。</p>'}</section>`;
}

function renderHabit(habit, key) {
  const logs = Object.keys(habit.logs || {}).filter(day => habit.logs[day]).sort();
  const loggedDays = new Set(logs);
  let streak = 0;
  let cursor = loggedDays.has(key) ? key : dateKey(addDays(key, -1));
  while (loggedDays.has(cursor)) { streak++; cursor = dateKey(addDays(cursor, -1)); }
  let best = 0;
  let run = 0;
  let previous = '';
  for (const day of logs) {
    run = previous && dateKey(addDays(previous, 1)) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  best = Math.max(best, Number(habit.bestStreak || 0));
  return `<article class="habit-card" style="--habit-color:${escapeHTML(habit.color || '#6674b8')}"><div class="habit-card-head"><span class="habit-symbol">${escapeHTML((habit.name || '習').slice(0, 1))}</span><div class="habit-card-actions"><button class="icon-button" aria-label="編輯習慣" data-action="habit-edit" data-id="${escapeHTML(habit.id)}">${icon('edit')}</button><button class="icon-button" aria-label="刪除習慣" data-action="habit-delete" data-id="${escapeHTML(habit.id)}">${icon('more')}</button></div></div><h2>${escapeHTML(habit.name)}</h2><p class="muted">${escapeHTML(habit.description || '穩定累積，慢慢前進。')}</p><div class="habit-stats"><span><strong>${streak}</strong>連續天數</span><span><strong>${best}</strong>最佳紀錄</span><span><strong>${logs.length}</strong>次完成</span></div><button class="button ${habit.logs?.[key] ? 'button-done' : 'button-primary'} habit-today" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}">${habit.logs?.[key] ? '今天已完成' : '完成今天習慣'}</button></article>`;
}

function renderMiniCalendar(data) {
  const days = datesInRange(startOfWeek(new Date(), data.settings.weekStartsMonday), 7);
  return `<section class="panel widget mini-calendar-widget"><div class="panel-heading"><div><p class="eyebrow">THIS WEEK</p><h2>本週日曆</h2></div><button class="text-button" data-navigate="calendar">查看</button></div><div class="mini-calendar">${days.map(day => { const key = dateKey(day); const count = data.tasks.filter(task => task.dueDate === key && task.status !== 'completed').length; return `<button class="mini-calendar-day ${key === today() ? 'is-today' : ''}" data-action="calendar-jump" data-date="${key}"><span>${new Intl.DateTimeFormat('zh-TW', { weekday: 'narrow' }).format(day)}</span><strong>${day.getDate()}</strong><i class="mini-day-dots">${count ? '•'.repeat(Math.min(count, 3)) : ''}</i></button>`; }).join('')}</div></section>`;
}

function renderFocus(data, context) {
  const focus = context.focus;
  const task = data.tasks.find(item => item.id === focus.taskId);
  const remaining = Math.max(0, focus.remainingMs);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor(remaining % 60000 / 1000);
  const todaySessions = data.focusSessions.filter(item => item.date === today());
  const focusMinutes = todaySessions.reduce((sum, item) => sum + Number(item.minutes), 0);
  return `<section class="page-intro"><div><p class="eyebrow">MAKE SPACE FOR DEEP WORK</p><h1>專注時間</h1><p class="muted">一次專心一件事，休息也算進計畫。</p></div></section>
    <div class="focus-layout"><section class="panel focus-panel"><div class="focus-mode-switch">${['focus', 'short', 'long'].map(mode => `<button data-action="focus-mode" data-mode="${mode}" class="${focus.mode === mode ? 'is-active' : ''}">${{ focus: '專注', short: '短休息', long: '長休息' }[mode]}</button>`).join('')}</div>
      <div class="focus-ring ${focus.running ? 'is-running' : ''}" style="--focus-progress:${Math.max(0, Math.min(100, (1 - remaining / (focus.duration * 60000)) * 100))}%"><div><span class="focus-clock" id="focus-clock">${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</span><span class="muted">${{ focus: '專注中', short: '短暫休息', long: '長休息' }[focus.mode]}</span></div></div>
      <label class="focus-task-label">目前專注任務<select data-setting="focus-task"><option value="">不連結任務</option>${activeTasks(data).map(item => `<option value="${escapeHTML(item.id)}" ${focus.taskId === item.id ? 'selected' : ''}>${escapeHTML(item.title)}</option>`).join('')}</select></label>
      <div class="focus-controls">${focus.running ? `<button class="button button-primary" data-action="focus-pause">暫停</button>` : `<button class="button button-primary" data-action="focus-start">${focus.started ? '繼續' : '開始專注'}</button>`}<button class="button" data-action="focus-reset">重設</button><button class="button" data-action="focus-skip">跳過</button></div>
      <div class="focus-duration"><label>專注分鐘<input type="number" min="1" max="120" value="${focus.durations.focus}" data-duration="focus"></label><label>短休息<input type="number" min="1" max="60" value="${focus.durations.short}" data-duration="short"></label><label>長休息<input type="number" min="1" max="90" value="${focus.durations.long}" data-duration="long"></label></div>
    </section><aside class="focus-side"><section class="panel widget"><p class="eyebrow">TODAY</p><h2>${formatMinutes(focusMinutes)}</h2><p class="muted">今日專注時間 · ${todaySessions.length} 個時段</p></section><section class="panel widget"><p class="eyebrow">SESSION HISTORY</p><h2>最近紀錄</h2>${data.focusSessions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(item => `<div class="history-row"><span>${escapeHTML(formatDate(item.date))}</span><strong>${item.minutes} 分鐘</strong><span class="muted">${escapeHTML(data.tasks.find(task => task.id === item.taskId)?.title || '自由專注')}</span></div>`).join('') || '<p class="empty-inline">完成第一個專注時段後，這裡會有紀錄。</p>'}</section></aside></div>`;
}

function renderStatistics(data, context) {
  const range = context.statsRange || 7;
  const days = datesInRange(addDays(today(), -range + 1), range);
  const completeByDay = days.map(day => data.tasks.filter(task => task.completedAt?.slice(0, 10) === dateKey(day)).length);
  const max = Math.max(1, ...completeByDay);
  const completed = data.tasks.filter(task => task.status === 'completed').length;
  const dated = data.tasks.filter(task => task.dueDate);
  const focusMinutes = data.focusSessions.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const priorities = Object.keys(priorityLabels).map(key => ({ key, count: data.tasks.filter(task => task.priority === key).length }));
  const habitTotal = data.habits.reduce((sum, habit) => sum + Object.values(habit.logs || {}).filter(Boolean).length, 0);
  const bars = days.map((day, index) => `<div class="chart-col"><div class="chart-track"><i style="height:${completeByDay[index] / max * 100}%"></i></div><span>${new Intl.DateTimeFormat('zh-TW', { weekday: 'narrow' }).format(day)}</span></div>`).join('');
  return `<section class="page-intro"><div><p class="eyebrow">YOUR RHYTHM, IN NUMBERS</p><h1>統計</h1><p class="muted">用實際紀錄回顧自己的節奏。</p></div><div class="view-switch">${[7, 30, 90].map(n => `<button data-action="stats-range" data-range="${n}" class="${range === n ? 'is-active' : ''}">${n} 天</button>`).join('')}</div></section>
    <div class="summary-grid stats-summary">${metricCard('完成任務', completed, '所有紀錄', icon('habits'))}${metricCard('完成率', `${data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0}%`, `${completed}/${data.tasks.length} 項任務`, icon('stats'))}${metricCard('專注時間', formatMinutes(focusMinutes), `${data.focusSessions.length} 個時段`, icon('focus'))}${metricCard('習慣打卡', habitTotal, `${data.habits.length} 個習慣`, icon('today'))}</div>
    <div class="stats-grid"><section class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">DAILY COMPLETION</p><h2>每日完成任務</h2></div><span class="muted">最近 ${range} 天</span></div>${completed ? `<div class="bar-chart">${bars}</div>` : emptyInline('完成任務後，這裡會顯示趨勢。')}</section><section class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">PRIORITY</p><h2>優先級分佈</h2></div></div>${data.tasks.length ? priorities.map(item => `<div class="distribution-row"><span class="priority-label ${item.key}">${item.key.toUpperCase()} · ${priorityLabels[item.key]}</span><div class="distribution-track"><i style="width:${item.count / data.tasks.length * 100}%"></i></div><strong>${item.count}</strong></div>`).join('') : emptyInline('新增任務後會自動統計。')}</section><section class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">PROJECT PROGRESS</p><h2>專案進度</h2></div></div>${data.projects.length ? data.projects.map(project => { const tasks = data.tasks.filter(task => task.projectId === project.id); const done = tasks.filter(task => task.status === 'completed').length; return `<div class="project-stat"><span>${escapeHTML(project.name)}</span><div class="project-progress"><i style="width:${tasks.length ? done / tasks.length * 100 : 0}%;--project-color:${escapeHTML(project.color || '#6674b8')}"></i></div><small>${done}/${tasks.length}</small></div>`; }).join('') : emptyInline('建立專案後會顯示進度。')}</section><section class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">HABIT LOGS</p><h2>習慣紀錄</h2></div></div>${data.habits.length ? data.habits.map(habit => `<div class="distribution-row"><span>${escapeHTML(habit.name)}</span><div class="distribution-track habit-track"><i style="width:${Math.min(100, Object.values(habit.logs || {}).filter(Boolean).length / Math.max(1, range) * 100)}%;--bar-color:${escapeHTML(habit.color || '#6674b8')}"></i></div><strong>${Object.values(habit.logs || {}).filter(Boolean).length}</strong></div>`).join('') : emptyInline('新增習慣後會顯示實際紀錄。')}</section></div>`;
}

function renderSettings(data) {
  const settings = data.settings;
  return `<section class="page-intro"><div><p class="eyebrow">MAKE IT YOURS</p><h1>設定</h1><p class="muted">偏好只儲存在這個瀏覽器。</p></div></section><div class="settings-layout"><section class="panel settings-panel"><div class="settings-section"><p class="eyebrow">APPEARANCE</p><h2>外觀</h2><label class="setting-row"><span><strong>顯示模式</strong><small>選擇淺色、深色或跟隨系統</small></span><select data-setting="theme"><option value="light" ${settings.theme === 'light' ? 'selected' : ''}>淺色</option><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>深色</option><option value="system" ${settings.theme === 'system' ? 'selected' : ''}>跟隨系統</option></select></label><label class="setting-row"><span><strong>強調色</strong><small>更新按鈕與進度色彩</small></span><input type="color" data-setting="accent" value="${escapeHTML(settings.accent || '#6674b8')}"></label><label class="setting-row"><span><strong>介面密度</strong><small>精簡模式顯示較多任務</small></span><select data-setting="compact"><option value="false" ${!settings.compact ? 'selected' : ''}>舒適</option><option value="true" ${settings.compact ? 'selected' : ''}>精簡</option></select></label></div><div class="settings-section"><p class="eyebrow">PREFERENCES</p><h2>偏好</h2><label class="setting-row"><span><strong>一週從哪天開始</strong></span><select data-setting="weekStartsMonday"><option value="true" ${settings.weekStartsMonday ? 'selected' : ''}>星期一</option><option value="false" ${!settings.weekStartsMonday ? 'selected' : ''}>星期日</option></select></label><label class="setting-row"><span><strong>時間格式</strong></span><select data-setting="hour24"><option value="true" ${settings.hour24 !== false ? 'selected' : ''}>24 小時制</option><option value="false" ${settings.hour24 === false ? 'selected' : ''}>12 小時制</option></select></label><label class="setting-row"><span><strong>預設任務優先級</strong></span><select data-setting="defaultPriority">${Object.entries(priorityLabels).map(([key, label]) => `<option value="${key}" ${settings.defaultPriority === key ? 'selected' : ''}>${key.toUpperCase()} · ${label}</option>`).join('')}</select></label></div><div class="settings-section"><p class="eyebrow">YOUR DATA</p><h2>資料管理</h2><p class="muted">資料儲存在這個瀏覽器的 LocalStorage。匯出 JSON 可備份或移轉資料。</p><div class="settings-actions"><button class="button" data-action="export-data">${icon('download')}匯出 JSON</button><label class="button file-button">匯入 JSON<input type="file" accept="application/json,.json" data-action="import-data" hidden></label><button class="button" data-action="clear-demo">清除範例資料</button><button class="button button-danger" data-action="reset-data">清除所有資料</button><button class="button" data-action="restore-demo">重新載入範例資料</button></div></div></section><aside class="settings-aside"><div class="settings-mark">D</div><h2>DAYFLOW</h2><p class="muted">你的資料留在裝置裡。清除瀏覽器資料前，記得先匯出備份。</p><span class="version-note">資料版本 ${data.version} · Local-first</span></aside></div>`;
}

function renderSearch(data, context) {
  const query = String(context.query || '').trim().toLocaleLowerCase();
  const results = query ? data.tasks.filter(task => [task.title, task.description, task.notes, ...(task.tags || []), data.projects.find(project => project.id === task.projectId)?.name || ''].join(' ').toLocaleLowerCase().includes(query)) : [];
  return `<section class="page-intro"><div><p class="eyebrow">FIND WHAT YOU NEED</p><h1>搜尋</h1><p class="muted">搜尋任務、描述、專案與標籤。</p></div></section><section class="panel task-panel"><label class="search-large">${icon('search')}<input id="search-page-input" type="search" value="${escapeHTML(context.query || '')}" placeholder="輸入關鍵字…" autofocus><kbd>Esc</kbd></label>${query ? results.length ? `<p class="muted search-results-count">找到 ${results.length} 項</p><div class="task-list">${results.map(task => renderTask(task, data)).join('')}</div>` : emptyInline('沒有符合條件的任務。') : emptyInline('輸入關鍵字開始搜尋。')}</section>`;
}

function renderFilterBar(context, data) {
  const tags = [...new Set(data.tasks.flatMap(task => task.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-TW'));
  return `<div class="filter-bar"><label>${icon('search')}<input type="search" data-filter="query" value="${escapeHTML(context.filters.query || '')}" placeholder="篩選任務"></label><select data-filter="priority"><option value="">所有優先級</option>${Object.entries(priorityLabels).map(([key, label]) => `<option value="${key}" ${context.filters.priority === key ? 'selected' : ''}>${key.toUpperCase()} · ${label}</option>`).join('')}</select><select data-filter="status"><option value="">所有狀態</option><option value="todo" ${context.filters.status === 'todo' ? 'selected' : ''}>待辦</option><option value="in-progress" ${context.filters.status === 'in-progress' ? 'selected' : ''}>進行中</option><option value="completed" ${context.filters.status === 'completed' ? 'selected' : ''}>已完成</option></select><select data-filter="date"><option value="">所有日期</option><option value="today" ${context.filters.date === 'today' ? 'selected' : ''}>今天</option><option value="overdue" ${context.filters.date === 'overdue' ? 'selected' : ''}>已逾期</option><option value="next7" ${context.filters.date === 'next7' ? 'selected' : ''}>未來 7 天</option><option value="no-date" ${context.filters.date === 'no-date' ? 'selected' : ''}>沒有日期</option></select><select data-filter="project"><option value="">所有專案</option>${data.projects.map(project => `<option value="${escapeHTML(project.id)}" ${context.filters.project === project.id ? 'selected' : ''}>${escapeHTML(project.name)}</option>`).join('')}</select><select data-filter="tag"><option value="">所有標籤</option>${tags.map(tag => `<option value="${escapeHTML(tag)}" ${context.filters.tag === tag ? 'selected' : ''}>${escapeHTML(tag)}</option>`).join('')}</select><select data-filter="sort"><option value="date" ${context.filters.sort === 'date' ? 'selected' : ''}>依日期排序</option><option value="priority" ${context.filters.sort === 'priority' ? 'selected' : ''}>依優先級排序</option><option value="title" ${context.filters.sort === 'title' ? 'selected' : ''}>依名稱排序</option><option value="created" ${context.filters.sort === 'created' ? 'selected' : ''}>依建立時間排序</option><option value="manual" ${context.filters.sort === 'manual' ? 'selected' : ''}>自訂排序</option></select></div>`;
}

function filtered(tasks, data, context) {
  const filter = context.filters;
  let result = tasks.filter(task => {
    const query = String(filter.query || '').toLocaleLowerCase();
    const searchable = [task.title, task.description, task.notes, ...(task.tags || []), data.projects.find(project => project.id === task.projectId)?.name || ''].join(' ').toLocaleLowerCase();
    const today = dateKey();
    const dateMatch = !filter.date || filter.date === 'today' && task.dueDate === today || filter.date === 'overdue' && task.dueDate && task.dueDate < today && task.status !== 'completed' || filter.date === 'next7' && task.dueDate >= today && task.dueDate <= dateKey(addDays(today, 7)) || filter.date === 'no-date' && !task.dueDate;
    return (!query || searchable.includes(query)) && (!filter.priority || task.priority === filter.priority) && (!filter.status || task.status === filter.status) && dateMatch && (!filter.project || task.projectId === filter.project) && (!filter.tag || (task.tags || []).includes(filter.tag));
  });
  if (filter.sort === 'priority') result.sort((a, b) => a.priority.localeCompare(b.priority));
  else if (filter.sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title, 'zh-TW'));
  else if (filter.sort === 'created') result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (filter.sort === 'manual') result.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  else result.sort(byDate);
  return result;
}

function metricCard(label, value, note, symbol) {
  return `<article class="metric-card"><span class="metric-icon">${symbol}</span><span class="metric-label">${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(note)}</small></article>`;
}

function emptyState(title, copy, button, action) {
  return `<section class="panel empty-state"><span class="empty-mark">${icon('today')}</span><h2>${escapeHTML(title)}</h2><p class="muted">${escapeHTML(copy)}</p>${button ? `<button class="button button-primary" data-action="${escapeHTML(action)}">${escapeHTML(button)}</button>` : ''}</section>`;
}

function emptyInline(copy) { return `<p class="empty-inline">${escapeHTML(copy)}</p>`; }
function byDate(a, b) { return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || (a.startTime || '').localeCompare(b.startTime || '') || Number(a.sortOrder || 0) - Number(b.sortOrder || 0); }
function formatMinutes(minutes) { const n = Number(minutes) || 0; return n < 60 ? `${n} 分鐘` : `${Math.floor(n / 60)} 小時${n % 60 ? ` ${n % 60} 分` : ''}`; }
