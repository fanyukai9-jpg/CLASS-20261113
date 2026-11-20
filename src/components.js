import { formatDate, formatTime } from './dates.js';
import { escapeHTML } from './ui.js';

export const priorityLabels = { p1: '緊急', p2: '高', p3: '一般', p4: '低' };
export const statusLabels = { todo: '待辦', 'in-progress': '進行中', completed: '已完成' };

export function renderTask(task, data, options = {}) {
  const project = data.projects.find(item => item.id === task.projectId);
  const tags = (task.tags || []).slice(0, 3).map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join('');
  const date = task.dueDate ? `<span class="task-meta-item">${escapeHTML(formatDate(task.dueDate))}</span>` : '';
  const time = task.startTime ? `<span class="task-meta-item">${escapeHTML(formatTime(task.startTime, data.settings.hour24))}</span>` : '';
  const subtaskCount = (task.subtasks || []).length;
  const doneCount = (task.subtasks || []).filter(item => item.done).length;
  return `<article class="task-row ${options.compact ? 'is-compact' : ''} ${task.status === 'completed' ? 'is-complete' : ''} ${task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== 'completed' ? 'is-overdue' : ''}" draggable="true" data-task-id="${escapeHTML(task.id)}">
    <input class="task-select" type="checkbox" aria-label="選取${escapeHTML(task.title)}" data-select-task="${escapeHTML(task.id)}">
    <button class="task-check" type="button" aria-label="${task.status === 'completed' ? '標記未完成' : '完成任務'}" data-action="toggle-task" data-id="${escapeHTML(task.id)}" aria-pressed="${task.status === 'completed'}"><span></span></button>
    <div class="task-body"><div class="task-title-line"><button class="task-title" type="button" data-action="task-detail" data-id="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button><span class="priority-dot ${task.priority}" title="${priorityLabels[task.priority] || '一般'}"></span>${task.status === 'in-progress' ? '<span class="status-pill">進行中</span>' : ''}</div>
      <div class="task-meta">${date}${time}${project ? `<span class="project-chip"><i style="--project-color:${escapeHTML(project.color || '#6674b8')}"></i>${escapeHTML(project.name)}</span>` : ''}${subtaskCount ? `<span class="task-meta-item">子任務 ${doneCount}/${subtaskCount}</span>` : ''}${tags}</div>
    </div>
    <div class="task-actions"><button class="icon-button" type="button" aria-label="編輯任務" data-action="task-edit" data-id="${escapeHTML(task.id)}">${icon('edit')}</button><button class="icon-button" type="button" aria-label="更多操作" data-action="task-menu" data-id="${escapeHTML(task.id)}">${icon('more')}</button></div>
  </article>`;
}

export function icon(name) {
  const paths = {
    today: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M4 9h16M8 13h2m4 0h2m-8 4h2"/>',
    inbox: '<path d="M4 4.5h16v15H4z"/><path d="M4 14h4l1.5 2h5L16 14h4"/>',
    calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M4 9h16M8 13h2m4 0h2m-8 4h2"/>',
    projects: '<path d="M3.5 7.5h7l2 2h8v9h-17z"/><path d="M3.5 7.5v-2h7l2 2"/>',
    habits: '<path d="m5 12 4 4L19 6"/><path d="M20 12a8 8 0 1 1-4.6-7.25"/>',
    focus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    stats: '<path d="M4 19.5h16"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="7" width="3" height="11" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.3 1-1.4 2.4-1.6-.5a8 8 0 0 1-1.7 1l-.3 1.7h-2.8l-.3-1.7a8 8 0 0 1-1.7-1l-1.6.5L6 16.1l1.3-1a7 7 0 0 1 0-2l-1.3-1L7.4 9.7l1.6.5a8 8 0 0 1 1.7-1l.3-1.7h2.8l.3 1.7a8 8 0 0 1 1.7 1l1.6-.5 1.4 2.4-1.3 1a7 7 0 0 1-.1 1.9Z"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="m4 16.5-.8 4.3 4.3-.8L19.7 7.8a2.1 2.1 0 0 0-3-3z"/><path d="m14.8 6.7 3 3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', chevronLeft: '<path d="m15 18-6-6 6-6"/>', chevronRight: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
}

export function renderTaskForm(task, data, options = {}) {
  const projectOptions = data.projects.map(project => `<option value="${escapeHTML(project.id)}" ${(task?.projectId || options.projectId) === project.id ? 'selected' : ''}>${escapeHTML(project.name)}</option>`).join('');
  const subtasks = (task?.subtasks || []).map(item => item.title).join('\n');
  return `<form class="form-grid task-form" data-form="task">
    <input type="hidden" name="id" value="${escapeHTML(task?.id || '')}">
    <label class="field full"><span>任務名稱</span><input name="title" required maxlength="120" autofocus value="${escapeHTML(task?.title || options.title || '')}" placeholder="例如：準備週會簡報"></label>
    <label class="field full"><span>描述</span><textarea name="description" rows="2" placeholder="補充細節">${escapeHTML(task?.description || '')}</textarea></label>
    <label class="field"><span>截止日期</span><input type="date" name="dueDate" value="${escapeHTML(task?.dueDate || options.dueDate || '')}"></label>
    <label class="field"><span>開始時間</span><input type="time" name="startTime" value="${escapeHTML(task?.startTime || options.startTime || '')}"></label>
    <label class="field"><span>結束時間</span><input type="time" name="endTime" value="${escapeHTML(task?.endTime || '')}"></label>
    <label class="field"><span>優先級</span><select name="priority">${Object.entries(priorityLabels).map(([key, label]) => `<option value="${key}" ${(task?.priority || options.priority || data.settings.defaultPriority) === key ? 'selected' : ''}>${key.toUpperCase()} · ${label}</option>`).join('')}</select></label>
    <label class="field"><span>專案</span><select name="projectId"><option value="">收集箱／未分類</option>${projectOptions}</select></label>
    <label class="field"><span>預估分鐘</span><input type="number" name="estimatedDuration" min="5" max="600" step="5" value="${Number(task?.estimatedDuration || 25)}"></label>
    <label class="field"><span>重複</span><select name="recurrence"><option value="none">不重複</option><option value="daily" ${task?.recurrence === 'daily' ? 'selected' : ''}>每天</option><option value="weekly" ${task?.recurrence === 'weekly' ? 'selected' : ''}>每週</option><option value="monthly" ${task?.recurrence === 'monthly' ? 'selected' : ''}>每月</option></select></label>
    <label class="field full"><span>標籤（以逗號分隔）</span><input name="tags" value="${escapeHTML((task?.tags || []).join(', '))}" placeholder="工作, 設計"></label>
    <label class="field full"><span>子任務（每行一項）</span><textarea name="subtasks" rows="3" placeholder="整理資料\n完成初稿">${escapeHTML(subtasks)}</textarea></label>
    <label class="field full"><span>備註</span><textarea name="notes" rows="2">${escapeHTML(task?.notes || '')}</textarea></label>
    <div class="form-actions full"><button class="button button-primary" type="submit">${task ? '儲存任務' : '建立任務'}</button><button class="button" type="button" data-action="close-dialog">取消</button>${task ? `<button class="button button-danger" type="button" data-action="duplicate-task" data-id="${escapeHTML(task.id)}">複製</button>` : ''}</div>
  </form>`;
}

export function renderTaskGroup(title, tasks, data, options = {}) {
  return `<section class="task-group"><div class="group-heading"><h3>${escapeHTML(title)}</h3><span>${tasks.length}</span></div>${tasks.length ? `<div class="task-list">${tasks.map(task => renderTask(task, data, options)).join('')}</div>` : '<p class="empty-inline">目前沒有任務</p>'}</section>`;
}
