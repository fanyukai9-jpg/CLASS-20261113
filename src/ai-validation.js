import { dateKey, parseDate } from './dates.js';

export function validateAIAction(action, data) {
  const fail = message => ({ valid: false, message });
  const validDate = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = parseDate(date);
    if (!parsed) return false;
    return dateKey(parsed) === date && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= new Date().getFullYear() + 5;
  };
  const validTime = time => !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (action.type === 'create_task') {
    if (!String(action.title || '').trim() || String(action.title).trim().length > 120) return fail('任務名稱需為 1–120 字。');
    if (action.dueDate && !validDate(action.dueDate)) return fail('日期格式不正確。');
    if (!validTime(action.startTime || '')) return fail('時間格式不正確。');
    if (action.priority && !['none', 'p4', 'p3', 'p2'].includes(action.priority)) return fail('優先程度不正確。');
    if (action.estimateMinutes != null && (!Number.isInteger(action.estimateMinutes) || action.estimateMinutes < 1 || action.estimateMinutes > 720)) return fail('預估時間需介於 1–720 分鐘。');
    return { valid: true };
  }
  if (action.type === 'update_task') {
    const task = data.tasks.find(item => item.id === action.taskId);
    if (!task) return fail('找不到這項待辦，請重新整理情境。');
    if (action.title != null && (!String(action.title).trim() || String(action.title).length > 120)) return fail('任務名稱需為 1–120 字。');
    if (action.dueDate != null && action.dueDate && !validDate(action.dueDate)) return fail('日期格式不正確。');
    if (action.startTime != null && !validTime(action.startTime)) return fail('時間格式不正確。');
    if (action.priority != null && !['none', 'p4', 'p3', 'p2'].includes(action.priority)) return fail('優先程度不正確。');
    if (action.estimateMinutes != null && (!Number.isInteger(action.estimateMinutes) || action.estimateMinutes < 1 || action.estimateMinutes > 720)) return fail('預估時間需介於 1–720 分鐘。');
    return { valid: true };
  }
  if (action.type === 'create_habit' || action.type === 'update_habit') {
    if (action.type === 'update_habit' && !data.habits.some(item => item.id === action.habitId)) return fail('找不到這項習慣，請重新整理情境。');
    if (!String(action.name || '').trim() || String(action.name).trim().length > 60) return fail('習慣名稱需為 1–60 字。');
    if (!Array.isArray(action.frequency) || !action.frequency.length || action.frequency.length > 7 || action.frequency.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return fail('習慣頻率需選擇星期日到星期六。');
    if (action.target != null && (!Number.isInteger(action.target) || action.target < 1 || action.target > 20)) return fail('習慣目標需介於 1–20。');
    return { valid: true };
  }
  if (action.type === 'focus_setup') {
    if (!Number.isInteger(action.focusMinutes) || action.focusMinutes < 5 || action.focusMinutes > 120) return fail('專注時間需介於 5–120 分鐘。');
    if (action.taskId && !data.tasks.some(item => item.id === action.taskId && item.status !== 'completed')) return fail('專注任務已不存在或已完成。');
    if (!String(action.focusGoal || '').trim() || String(action.focusGoal).length > 220) return fail('本次專注目標需為 1–220 字。');
    return { valid: true };
  }
  return fail('不支援的操作類型。');
}
