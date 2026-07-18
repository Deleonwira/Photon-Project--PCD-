/* PHOTON — Confirm Dialog */

/**
 * Show a styled confirmation dialog.
 * @param {{ title: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>} true if confirmed, false if cancelled
 */
export function showConfirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop confirm-dialog-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <div class="confirm-dialog-icon ${danger ? 'danger' : ''}">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${danger
            ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
            : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
          }
        </svg>
      </div>
      <h3 class="confirm-dialog-title">${title}</h3>
      <p class="confirm-dialog-message">${message}</p>
      <div class="confirm-dialog-actions">
        <button class="confirm-dialog-btn cancel" id="confirm-cancel">${cancelText}</button>
        <button class="confirm-dialog-btn ${danger ? 'danger' : 'primary'}" id="confirm-ok">${confirmText}</button>
      </div>
    `;

    backdrop.appendChild(dialog);
    root.appendChild(backdrop);

    // Animate in
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
    });

    function close(result) {
      backdrop.classList.remove('visible');
      backdrop.classList.add('closing');
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    }

    dialog.querySelector('#confirm-ok').addEventListener('click', () => close(true));
    dialog.querySelector('#confirm-cancel').addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); }
    });

    // Focus the cancel button by default (safe action)
    setTimeout(() => dialog.querySelector('#confirm-cancel').focus(), 50);
  });
}
