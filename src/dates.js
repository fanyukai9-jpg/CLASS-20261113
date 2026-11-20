export const DAY = 24 * 60 * 60 * 1000;

export function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : parseDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfWeek(value, weekStartsMonday = true) {
  const date = value instanceof Date ? new Date(value) : parseDate(value);
  const offset = weekStartsMonday ? (date.getDay() + 6) % 7 : date.getDay();
  date.setDate(date.getDate() - offset);
  return date;
}

export function formatDate(value, options = {}) {
  const date = typeof value === 'string' ? parseDate(value.slice(0, 10)) : value;
  if (!date) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'long', day: 'numeric', weekday: options.weekday ? 'long' : undefined,
    year: options.year ? 'numeric' : undefined,
  }).format(date);
}

export function formatMonth(value) {
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(value);
}

export function formatTime(value, hour24 = true) {
  if (!value) return '';
  const [hour, minute] = String(value).split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return String(value);
  return new Intl.DateTimeFormat('zh-TW', { hour: 'numeric', minute: '2-digit', hourCycle: hour24 ? 'h23' : 'h12' }).format(new Date(2000, 0, 1, hour, minute));
}

export function dayLabel(value) {
  const key = typeof value === 'string' ? value : dateKey(value);
  const today = dateKey();
  const tomorrow = dateKey(addDays(today, 1));
  if (key === today) return '今天';
  if (key === tomorrow) return '明天';
  return formatDate(key, { weekday: true });
}

export function datesInRange(start, count) {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function getGreeting(hour = new Date().getHours()) {
  if (hour < 12) return '早安';
  if (hour < 18) return '午安';
  return '晚安';
}

export function parseQuickDate(text, now = new Date()) {
  const source = String(text || '').trim();
  if (!source) return { date: '', time: '', title: source, recurrence: 'none' };
  let date = '';
  let time = '';
  let recurrence = 'none';
  let title = source;
  const timeMatch = title.match(/(?:上午|下午|晚上)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:點|時)?/);
  if (timeMatch && (timeMatch[0].includes('點') || timeMatch[0].includes('時') || /上午|下午|晚上/.test(timeMatch[0]))) {
    let hour = Number(timeMatch[1]);
    const period = timeMatch[0];
    if (/下午|晚上/.test(period) && hour < 12) hour += 12;
    if (/上午/.test(period) && hour === 12) hour = 0;
    if (hour <= 23) time = `${String(hour).padStart(2, '0')}:${timeMatch[2] || '00'}`;
    title = title.replace(timeMatch[0], '').trim();
  }
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const repeatingWeekday = title.match(/每週([一二三四五六日天])/);
  const repeatingDaily = title.match(/每天/);
  const relative = title.match(/(今天|明天|後天)/);
  if (repeatingWeekday) {
    recurrence = 'weekly';
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    let delta = (map[repeatingWeekday[1]] - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    date = dateKey(addDays(base, delta));
    title = title.replace(repeatingWeekday[0], '').trim();
  } else if (repeatingDaily) {
    recurrence = 'daily';
    date = dateKey(base);
    title = title.replace(repeatingDaily[0], '').trim();
  } else if (relative) {
    const amount = { 今天: 0, 明天: 1, 後天: 2 }[relative[1]];
    date = dateKey(addDays(base, amount));
    title = title.replace(relative[1], '').trim();
  } else {
    const weekday = title.match(/週([一二三四五六日天])/);
    if (weekday) {
      const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
      let delta = (map[weekday[1]] - base.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      date = dateKey(addDays(base, delta));
      title = title.replace(weekday[0], '').trim();
    }
  }
  return { date, time, title: title || source, recurrence };
}
