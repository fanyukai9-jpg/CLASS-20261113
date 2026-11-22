import { addDays, dateKey } from './dates.js';

export function buildAIContext({ route, data, focus, currentTaskId = '', currentHabitId = '', calendarDate = '', homeDate = '' }) {
  const today = dateKey();
  const within = (value, start, end) => value && value >= start && value <= end;
  const currentTask = data.tasks.find(item => item.id === currentTaskId);
  const currentHabit = data.habits.find(item => item.id === currentHabitId);
  const activeTasks = data.tasks.filter(item => item.status !== 'completed');
  const priorityRank = { p2: 0, p1: 0, p3: 1, p4: 2, none: 3, '': 3 };
  const prioritySort = (a, b) => (priorityRank[a.priority || ''] ?? 3) - (priorityRank[b.priority || ''] ?? 3);
  const overdueTasks = activeTasks.filter(item => item.dueDate && item.dueDate < today).sort((a, b) => b.dueDate.localeCompare(a.dueDate) || prioritySort(a, b)).slice(0, 8);
  const upcomingTasks = activeTasks.filter(item => within(item.dueDate, today, dateKey(addDays(today, 14)))).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || prioritySort(a, b)).slice(0, 16);
  const unscheduledTasks = activeTasks.filter(item => !item.dueDate).sort(prioritySort).slice(0, 6);
  const relevantTasks = [...new Map([...overdueTasks, ...upcomingTasks, ...unscheduledTasks].map(item => [item.id, item])).values()].slice(0, 24);
  const taskSummary = relevantTasks.map(({ id, title, dueDate, startTime, priority, estimateMinutes, notes }) => ({ id, title, dueDate, startTime, priority, estimateMinutes, notes: String(notes || '').slice(0, 240) }));
  const recentHabits = data.habits.slice(0, 12).map(habit => ({
    id: habit.id, name: habit.name, description: habit.description, frequency: habit.frequency,
    target: habit.target || 1,
    logs: Object.fromEntries(Object.entries(habit.logs || {}).filter(([day, done]) => done && day >= dateKey(addDays(today, -13))).slice(-14)),
  }));
  const recentFocus = data.focusSessions.filter(session => session.date >= dateKey(addDays(today, -6))).slice(-10).map(({ date, minutes, taskId }) => ({ date, minutes, taskId }));
  const base = { today, weekday: new Intl.DateTimeFormat('zh-TW', { weekday: 'long' }).format(new Date()), tasks: taskSummary, overdueCount: activeTasks.filter(item => item.dueDate && item.dueDate < today).length, unscheduledCount: activeTasks.filter(item => !item.dueDate).length, habits: recentHabits, recentFocus };
  const currentFocus = focus ? { mode: focus.mode, running: Boolean(focus.running), started: Boolean(focus.started), remainingMinutes: Math.ceil(Math.max(0, Number(focus.remainingMs) || 0) / 60000), taskId: focus.taskId || '', focusMinutes: Number(focus.durations?.focus) || 25, focusGoal: focus.focusGoal || '' } : null;
  if (route === 'task' && currentTask) return { ...base, feature: '待辦事項', currentTask: { id: currentTask.id, title: currentTask.title, dueDate: currentTask.dueDate, startTime: currentTask.startTime, priority: currentTask.priority, estimateMinutes: currentTask.estimateMinutes, notes: String(currentTask.notes || '').slice(0, 500) } };
  if (route === 'habit' && currentHabit) return { ...base, feature: '習慣追蹤', currentHabit: { id: currentHabit.id, name: currentHabit.name, description: currentHabit.description, frequency: currentHabit.frequency, target: currentHabit.target || 1, recentLogs: Object.fromEntries(Object.entries(currentHabit.logs || {}).filter(([day]) => day >= dateKey(addDays(today, -27))).slice(-28)) } };
  if (route === 'focus') return { ...base, feature: '專注計時', focus: currentFocus };
  if (route === 'calendar') {
    const selected = calendarDate || today;
    const first = `${selected.slice(0, 7)}-01`;
    const monthEnd = dateKey(new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)), 0, 12));
    return { ...base, feature: '行事曆／接下來', selectedDate: selected, month: selected.slice(0, 7), visibleMonthTasks: data.tasks.filter(task => task.dueDate >= first && task.dueDate <= monthEnd).slice(0, 24).map(({ id, title, dueDate, startTime, priority, estimateMinutes }) => ({ id, title, dueDate, startTime, priority, estimateMinutes })) };
  }
  const selected = route === 'today' ? homeDate || today : today;
  return { ...base, feature: route === 'today' ? '今日待辦' : route === 'habits' ? '習慣追蹤' : route === 'search' ? '全域助理（搜尋情境）' : '全域助理', selectedDate: selected, focus: currentFocus };
}
