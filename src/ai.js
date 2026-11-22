import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-ai.js';
import { appCheckDebugEnabled, appCheckReady, firebaseApp } from './auth.js';
import { buildAIContext } from './ai-context.js';
import { validateAIAction } from './ai-validation.js';

export { buildAIContext, validateAIAction };

export const AI_MODEL = 'gemini-3.5-flash-lite';
const MAX_REQUESTS_PER_MINUTE = 5;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 2000;
const requestTimes = [];
let aiPromise;

const proposalSchema = Schema.object({
  properties: {
    type: Schema.enumString({ enum: ['create_task', 'update_task', 'create_habit', 'update_habit', 'focus_setup'] }),
    taskId: Schema.string(),
    habitId: Schema.string(),
    title: Schema.string(),
    dueDate: Schema.string(),
    startTime: Schema.string(),
    priority: Schema.enumString({ enum: ['none', 'p4', 'p3', 'p2'] }),
    estimateMinutes: Schema.number(),
    notes: Schema.string(),
    reason: Schema.string(),
    name: Schema.string(),
    description: Schema.string(),
    frequency: Schema.array({ items: Schema.number() }),
    target: Schema.number(),
    focusMinutes: Schema.number(),
    focusGoal: Schema.string(),
  },
  optionalProperties: ['taskId', 'habitId', 'title', 'dueDate', 'startTime', 'priority', 'estimateMinutes', 'notes', 'reason', 'name', 'description', 'frequency', 'target', 'focusMinutes', 'focusGoal'],
});

const responseSchema = Schema.object({
  properties: {
    reply: Schema.string(),
    actions: Schema.array({ items: proposalSchema }),
  },
});

function systemPrompt(context) {
  return [
    '你是 DAYFLOW 個人待辦助理，回答繁體中文，簡潔、具體、不臆測使用者資料。',
    '依目前功能情境理解問題；只能使用下列摘要中的資料，資料不足要明說。',
    '操作只能提出方案，絕不可直接執行或刪除資料。建立任務/習慣、修改日期、習慣頻率或專注設定時才輸出 actions，否則 actions 為空陣列。',
    '排程要檢查已知任務的時間衝突、期限與休息；不可編造空閒時段。未知的空閒時段先詢問。日期使用 YYYY-MM-DD，時間使用 24 小時 HH:mm。',
    '任務 priority 用 none/p4/p3/p2；習慣 frequency 是 JavaScript 星期數字陣列（0 星期日至 6 星期六）。estimateMinutes 與 focusMinutes 是整數分鐘。',
    '大型任務拆解時，先用 reply 列出步驟，若使用者要求排入 DAYFLOW，再以 create_task 列出合理的任務。最多提出 8 個 actions。',
    '專注建議只以 focus_setup 提出：包括 focusMinutes、focusGoal 和選用的 taskId。',
    '每個 action 都用 reason 說明依據；不要輸出刪除操作。',
    `目前 DAYFLOW 情境摘要：${JSON.stringify(context)}`,
  ].join('\n');
}

export function getAIStatus() {
  if (!appCheckReady) return { ready: false, message: 'AI 尚未啟用。請先設定 Firebase App Check 的 reCAPTCHA Enterprise Site Key。' };
  if (['localhost', '127.0.0.1'].includes(location.hostname) && !appCheckDebugEnabled) return { ready: false, message: 'AI 已設定；本機測試前請在 runtime-config.js 開啟 App Check debug 模式並註冊本機 debug token。' };
  return { ready: true, message: `Firebase AI Logic 已設定 · ${AI_MODEL}` };
}

function getAIClient() {
  if (!appCheckReady) throw new Error(getAIStatus().message);
  if (!aiPromise) {
    aiPromise = Promise.resolve().then(() => getAI(firebaseApp, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true }));
  }
  return aiPromise;
}

function checkRateLimit() {
  const now = Date.now();
  while (requestTimes.length && now - requestTimes[0] > 60_000) requestTimes.shift();
  if (requestTimes.length >= MAX_REQUESTS_PER_MINUTE) throw new Error('AI 使用較頻繁，請稍等一分鐘再試。');
  requestTimes.push(now);
}

function normalizeResponse(value) {
  if (!value || typeof value !== 'object' || typeof value.reply !== 'string' || !Array.isArray(value.actions)) {
    throw new Error('AI 回覆格式不完整，請重試。');
  }
  return {
    reply: value.reply.trim().slice(0, 4000),
    actions: value.actions.slice(0, 8).filter(action => action && typeof action === 'object' && typeof action.type === 'string').map(action => ({
      ...action,
      reason: typeof action.reason === 'string' ? action.reason.slice(0, 300) : '',
    })),
  };
}

export async function askDayflowAI(message, { context, history = [] }) {
  checkRateLimit();
  const ai = await getAIClient();
  const model = getGenerativeModel(ai, {
    model: AI_MODEL,
    systemInstruction: systemPrompt(context),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      candidateCount: 1,
      maxOutputTokens: 1600,
      temperature: 0.35,
    },
  });
  const safeHistory = history.slice(-MAX_HISTORY_ITEMS).flatMap(item => {
    if (!['user', 'model'].includes(item?.role) || !Array.isArray(item.parts)) return [];
    const text = item.parts.filter(part => typeof part?.text === 'string').map(part => part.text).join('\n').trim().slice(0, MAX_HISTORY_MESSAGE_LENGTH);
    return text ? [{ role: item.role, parts: [{ text }] }] : [];
  });
  const chat = model.startChat({ history: safeHistory });
  const userText = String(message || '').trim().slice(0, 2000);
  let timeoutId;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('AI 回覆逾時，請稍後再試。')), 40_000); });
  try {
    const result = await Promise.race([chat.sendMessage(userText), timeout]);
    const raw = result.response.text();
    return normalizeResponse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('AI 回覆格式無法讀取，請重試。');
    const code = String(error?.code || '');
    const detail = String(error?.message || '');
    if (code.includes('app-check') || /App Check/i.test(detail)) throw new Error('Firebase App Check 尚未完成設定，AI 連線被安全保護阻擋。');
    if (code.includes('quota') || code.includes('resource-exhausted') || /\b429\b|quota exceeded|rate limit/i.test(detail)) throw new Error('AI 使用量已達目前上限，請稍後再試。');
    if (/\b500\b|high demand|currently experiencing/i.test(detail)) throw new Error('Gemini 模型目前較忙，請稍後再試。');
    if (/逾時/.test(detail)) throw new Error('AI 回覆逾時，請稍後再試。');
    if (code.includes('permission-denied')) throw new Error('Firebase AI Logic 尚未取得授權，請確認 Firebase 專案服務與 App Check 設定。');
    throw new Error('目前無法連線 AI，DAYFLOW 其他功能仍可正常使用。');
  } finally {
    clearTimeout(timeoutId);
  }
}
