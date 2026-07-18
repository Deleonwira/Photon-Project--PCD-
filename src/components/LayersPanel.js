/* PHOTON — Layers Panel */
import { image } from '../icons/icons.js';
import { subscribe } from '../utils/state.js';
import { getHistoryLabels, getUndoCount, undo } from '../services/HistoryStack.js';

let _container = null;

export function initLayersPanel(container) {
  _container = container;
  _render();

  // Re-render whenever history changes (BOE-092)
  subscribe('historyCount', () => _render());
  subscribe('canUndo', () => _render());
  subscribe('canRedo', () => _render());
}

function _render() {
  if (!_container) return;

  const labels = getHistoryLabels();
  const count = getUndoCount();

  let html = `<div style="padding-bottom:var(--sp-2)">
    <span class="panel-section-title">Edit History</span>
    <span style="float:right;font-size:10px;color:var(--text-muted)">${count} step${count !== 1 ? 's' : ''}</span>
  </div>`;

  if (labels.length === 0) {
    html += `
      <div style="text-align:center;padding:var(--sp-4) 0;color:var(--text-muted);font-size:var(--text-xs)">
        <p>No edit history yet</p>
        <p style="margin-top:var(--sp-1);font-size:10px">Operations will appear here as you edit</p>
      </div>`;
  } else {
    // Show entries in reverse order (newest at top)
    // Current state (not in history) marked as active
    html += `
      <div class="history-item current">
        <span class="hi-icon">${image()}</span>
        <span class="hi-name">Current State</span>
        <span class="hi-time">now</span>
      </div>`;

    // Show history entries (most recent first)
    for (let i = labels.length - 1; i >= 0; i--) {
      const entry = labels[i];
      const stepsBack = labels.length - i;
      html += `
        <div class="history-item" data-steps="${stepsBack}" title="Click to undo ${stepsBack} step${stepsBack > 1 ? 's' : ''}">
          <span class="hi-icon">${image()}</span>
          <span class="hi-name">${_escapeHtml(entry.label)}</span>
          <span class="hi-time">${entry.time}</span>
        </div>`;
    }
  }

  html += `
    <div style="margin-top:var(--sp-3);padding-top:var(--sp-2);border-top:1px solid var(--border-subtle)">
      <p style="font-size:10px;color:var(--text-muted);text-align:center">
        Click an entry to revert to that state
      </p>
    </div>`;

  _container.innerHTML = html;
  _container.style.overflowY = 'auto';
  _container.style.maxHeight = '100%';

  // Wire click-to-undo (BOE-093)
  _container.querySelectorAll('.history-item[data-steps]').forEach(item => {
    item.addEventListener('click', () => {
      const steps = parseInt(item.dataset.steps);
      if (steps > 0) {
        for (let i = 0; i < steps; i++) undo();
      }
    });
    // Hover cursor
    item.style.cursor = 'pointer';
  });
}

function _escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || 'Edit';
  return div.innerHTML;
}
