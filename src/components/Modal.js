/* PHOTON — Modal Component */
import { x } from '../icons/icons.js';

const root = document.getElementById('modal-root');

export function openModal({ title, content }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close">${x()}</button>
      </div>
      <div class="modal-body">${content}</div>
    </div>
  `;

  root.appendChild(backdrop);

  const close = () => {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

export function aboutDialog() {
  openModal({
    title: 'About Photon',
    content: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:var(--sp-3);text-align:center;padding:var(--sp-2) 0">
        <img src="/logo.png" alt="Photon" style="width:48px;height:48px;border-radius:var(--radius-lg)" />
        <div>
          <div style="font-size:var(--text-xl);font-weight:var(--weight-bold)" class="gradient-text">Photon</div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--sp-1)">Version 1.0.0</div>
        </div>
        <div style="font-size:var(--text-sm);color:var(--text-secondary)">
          Digital Image Processing Studio<br/>
          Pengolahan Citra Digital — Course Project
        </div>
        <div style="display:flex;gap:var(--sp-1);flex-wrap:wrap;justify-content:center">
          <span class="btn-sm">Python</span>
          <span class="btn-sm">OpenCV</span>
          <span class="btn-sm">JavaScript</span>
          <span class="btn-sm">Flask</span>
        </div>
      </div>
    `,
  });
}
