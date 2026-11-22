import { formatDate, formatTime } from './dates.js';
import { escapeHTML } from './ui.js';

export const priorityLabels = { p1: '高', p2: '高', p3: '中', p4: '低', none: '無' };

export function renderTask(task, data, options = {}) {
  const date = !options.home && task.dueDate ? `<span class="task-meta-item">${escapeHTML(formatDate(task.dueDate))}</span>` : '';
  const time = task.startTime ? `<span class="task-meta-item">${escapeHTML(formatTime(task.startTime, data.settings.hour24))}</span>` : '';
  const note = task.notes || task.description || '';
  return `<article class="task-row ${options.home ? 'is-home-task' : ''} ${options.compact ? 'is-compact' : ''} ${task.status === 'completed' ? 'is-complete' : ''} ${task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== 'completed' ? 'is-overdue' : ''}" draggable="true" data-task-id="${escapeHTML(task.id)}">
    <button class="task-check" type="button" aria-label="${task.status === 'completed' ? '標記未完成' : '完成任務'}" data-action="toggle-task" data-id="${escapeHTML(task.id)}" aria-pressed="${task.status === 'completed'}"><span></span></button>
    <div class="task-body"><div class="task-title-line"><button class="task-title" type="button" data-action="task-detail" data-id="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button><span class="priority-dot ${priorityTone(task.priority)}" title="${priorityLabels[task.priority] || '無'}優先程度" aria-label="${priorityLabels[task.priority] || '無'}優先程度"></span></div><div class="task-meta">${date}${time}${task.estimateMinutes ? `<span class="task-meta-item">約 ${Number(task.estimateMinutes)} 分鐘</span>` : ''}${note ? `<span class="task-hint">${escapeHTML(note)}</span>` : ''}</div></div>
    <div class="task-actions"><button class="icon-button" type="button" aria-label="編輯待辦" data-action="task-edit" data-id="${escapeHTML(task.id)}">${icon('edit')}</button><button class="icon-button task-delete-button" type="button" aria-label="刪除待辦" data-action="task-delete" data-id="${escapeHTML(task.id)}">${icon('close')}</button></div>
  </article>`;
}

function priorityTone(priority) { return priority === 'p4' ? 'p4' : priority === 'p3' ? 'p3' : priority === 'p1' || priority === 'p2' ? 'p2' : 'none'; }

export function icon(name) {
  const paths = {
    today: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M4 9h16M8 13h2m4 0h2m-8 4h2"/>',
    calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M4 9h16M8 13h2m4 0h2m-8 4h2"/>',
    habits: '<path d="m5 12 4 4L19 6"/><path d="M20 12a8 8 0 1 1-4.6-7.25"/>',
    focus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="m4 16.5-.8 4.3 4.3-.8L19.7 7.8a2.1 2.1 0 0 0-3-3z"/><path d="m14.8 6.7 3 3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.close}</svg>`;
}

export function renderTaskForm(task, data, options = {}) {
  const storedPriority = task?.priority || options.priority || data.settings.defaultPriority || '';
  // Earlier DAYFLOW versions used p1 for the highest priority. Keep that value
  // intact in the editor so saving an old task does not silently clear it.
  const priority = storedPriority === 'p1' ? 'p2' : storedPriority;
  const date = task ? task.dueDate : options.dueDate || '';
  const time = task?.startTime || options.startTime || '';
  return `<form class="form-grid task-form" data-form="task"><input type="hidden" name="id" value="${escapeHTML(task?.id || '')}"><label class="field full"><span>待辦名稱</span><input name="title" required maxlength="120" autofocus value="${escapeHTML(task?.title || options.title || '')}" placeholder="例如：準備簡報"></label><label class="field"><span>日期</span><input type="date" name="dueDate" value="${escapeHTML(date || '')}"></label><label class="field"><span>時間</span><input type="time" name="startTime" value="${escapeHTML(time)}"></label><label class="field"><span>優先程度</span><select name="priority">${[['', '無'], ['p4', '低'], ['p3', '中'], ['p2', '高']].map(([value, label]) => `<option value="${value}" ${priority === value || value === '' && ['none', ''].includes(priority) ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>預估時間（分鐘）</span><input type="number" name="estimateMinutes" min="1" max="720" step="1" value="${escapeHTML(task?.estimateMinutes || options.estimateMinutes || '')}" placeholder="選填"></label><label class="field full"><span>備註</span><textarea name="notes" rows="3" maxlength="1000" placeholder="選填">${escapeHTML(task?.notes || '')}</textarea></label><div class="form-actions full"><button class="button button-primary" type="submit">${task ? '儲存變更' : '新增待辦'}</button><button class="button" type="button" data-action="close-dialog">取消</button></div></form>`;
}
