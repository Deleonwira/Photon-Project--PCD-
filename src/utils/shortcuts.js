/* PHOTON — Keyboard Shortcuts Registry */

const registry = [];

export function register(combo, label, callback) {
  registry.push({ combo: combo.toLowerCase(), label, callback });
}

export function getLabel(combo) {
  const parts = combo.split('+').map(p => {
    const k = p.trim().toLowerCase();
    if (k === 'ctrl') return 'Ctrl';
    if (k === 'shift') return 'Shift';
    if (k === 'alt') return 'Alt';
    if (k === '=') return '+';
    return k.charAt(0).toUpperCase() + k.slice(1);
  });
  return parts.join('+');
}

export function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    // BOE-122: Block shortcuts when comparison modal is open
    if (document.querySelector('#compare-modal:not(.hidden)')) return;

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());
    const pressed = parts.join('+');

    for (const entry of registry) {
      if (entry.combo === pressed) {
        e.preventDefault();
        entry.callback();
        return;
      }
    }
  });
}
