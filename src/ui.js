export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function openDialog(title, body, options = {}) {
  const root = document.getElementById('dialog-root');
  root.querySelector('dialog[open]')?.close();
  root.innerHTML = `<dialog class="dialog ${options.wide ? 'dialog-wide' : ''}" aria-labelledby="dialog-title"><div class="dialog-heading"><h2 id="dialog-title">${escapeHTML(title)}</h2><button class="icon-button" type="button" aria-label="關閉" data-action="close-dialog">${iconClose()}</button></div><div class="dialog-content">${body}</div></dialog>`;
  const dialog = root.querySelector('dialog');
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (root.querySelector('dialog') === dialog) root.replaceChildren(); });
  dialog.showModal();
  dialog.querySelector('input:not([type=hidden]),textarea,select')?.focus({ preventScroll: true });
  return dialog;
}

export function toast(message, type = 'success', action = null) {
  const root = document.getElementById('toast-root');
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.innerHTML = `<span>${escapeHTML(message)}</span>${action ? `<button type="button" class="toast-action">${escapeHTML(action.label)}</button>` : ''}`;
  if (action) item.querySelector('button').addEventListener('click', () => { action.run(); item.remove(); });
  root.append(item);
  window.setTimeout(() => item.remove(), 4200);
}

export function confirmDialog(message, confirmText = '刪除') {
  return new Promise(resolve => {
    const dialog = openDialog('請確認', `<p class="confirm-copy">${escapeHTML(message)}</p><div class="form-actions"><button class="button button-danger" type="button" data-confirm="yes">${escapeHTML(confirmText)}</button><button class="button" type="button" data-confirm="no">取消</button></div>`);
    let settled = false;
    const settle = value => { if (!settled) { settled = true; resolve(value); } };
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-confirm]');
      if (!button) return;
      const yes = button.dataset.confirm === 'yes';
      dialog.close();
      settle(yes);
    });
    dialog.addEventListener('close', () => settle(false), { once: true });
    dialog.addEventListener('cancel', () => settle(false), { once: true });
  });
}

function iconClose() {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
}
