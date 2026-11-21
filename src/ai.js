import { getAI, getGenerativeModel, GoogleAIBackend } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-ai.js';
import { firebaseApp } from './auth.js';

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
const taskModel = getGenerativeModel(ai, {
  model: 'gemini-4-hydrogen',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueDate: { type: 'string' },
        startTime: { type: 'string' },
        priority: { type: 'string' },
        recurrence: { type: 'string' },
      },
      required: ['title', 'dueDate', 'startTime', 'priority', 'recurrence'],
    },
    temperature: 0.1,
    maxOutputTokens: 512,
  },
});

export async function parseTaskWithAI(text, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
  const prompt = `將使用者輸入整理為 DAYFLOW 待辦。只回傳符合 JSON schema 的資料。\n今天日期（台北）：${today}。日期用 YYYY-MM-DD，時間用 24 小時 HH:mm。未指定日期/時間用空字串。標題需精簡並移除排程語句。優先級只在使用者明確表達重要或急迫時設定：p1 緊急、p2 高、p3 中、p4 低，否則 none。只有清楚表示每天或每週重複才設定 recurrence，否則 none。不要臆測缺少的資訊。\n使用者輸入：${JSON.stringify(text.slice(0, 500))}`;
  const result = await taskModel.generateContent(prompt);
  const data = JSON.parse(result.response.text());
  const title = String(data.title || '').trim().slice(0, 120);
  if (!title) throw new Error('AI 沒有辨識出任務名稱，請改用一般新增。');
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate || '') ? data.dueDate : '';
  const startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime || '') ? data.startTime : '';
  const priorities = ['', 'p1', 'p2', 'p3', 'p4'];
  const recurrences = ['none', 'daily', 'weekly'];
  return {
    title,
    dueDate,
    startTime,
    priority: priorities.includes(data.priority) ? (data.priority === 'none' ? '' : data.priority) : '',
    recurrence: recurrences.includes(data.recurrence) ? data.recurrence : 'none',
  };
}
