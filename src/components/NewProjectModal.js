/* PHOTON — New Project Modal */
import { x, link, unlink } from '../icons/icons.js';
import { setState } from '../utils/state.js';
import { navigate } from '../utils/router.js';
import { listAllProjects } from '../services/ProjectStore.js';

// ── Presets ────────────────────────────────────────────────
const PRESETS = [
  { id: 'hd',    name: 'HD (720p)',   w: 1280, h: 720  },
  { id: 'fhd',   name: 'Full HD',     w: 1920, h: 1080 },
  { id: '2k',    name: '2K (QHD)',    w: 2560, h: 1440 },
  { id: '4k',    name: '4K (UHD)',    w: 3840, h: 2160 },
  { id: 'sq',    name: 'Square',      w: 1080, h: 1080 },
  { id: 'custom',name: 'Custom',      w: null, h: null },
];

// ── Smart auto-naming (finds lowest available number) ──────
async function nextName() {
  try {
    const projects = await listAllProjects();
    const usedNumbers = new Set();
    for (const p of projects) {
      const match = p.name.match(/^Untitled(?:-(\d+))?$/);
      if (match) {
        usedNumbers.add(match[1] ? parseInt(match[1], 10) : 0);
      }
    }
    // Find lowest available: 0 = "Untitled", 1 = "Untitled-1", etc.
    let n = 0;
    while (usedNumbers.has(n)) n++;
    return n === 0 ? 'Untitled' : `Untitled-${n}`;
  } catch {
    return 'Untitled';
  }
}

// ── Build modal HTML ──────────────────────────────────────
function buildHTML(defaultName) {
  const presetsHtml = PRESETS.map((p, i) => {
    const cls = i === 1 ? 'np-preset active' : 'np-preset';
    const dims = p.w ? `${p.w}×${p.h}` : '—';
    return `<button class="${cls}" data-preset="${p.id}" data-w="${p.w || ''}" data-h="${p.h || ''}">
      <span class="np-preset-name">${p.name}</span>
      <span class="np-preset-dims">${dims}</span>
    </button>`;
  }).join('');

  return `
    <div class="modal-header">
      <span class="modal-title">New Project</span>
      <button class="modal-close" id="np-close">${x()}</button>
    </div>

    <!-- Name -->
    <div class="np-section">
      <label class="np-section-label">Project Name</label>
      <input type="text" class="np-name-input" id="np-name" value="${defaultName}" maxlength="64" />
    </div>

    <!-- Canvas Size -->
    <div class="np-section">
      <label class="np-section-label">Canvas Size</label>
      <div class="np-presets" id="np-presets">${presetsHtml}</div>
      <div class="np-dims-row">
        <input type="number" class="np-dim-input" id="np-width" value="1920" min="1" max="8192" />
        <span class="np-dims-x">×</span>
        <input type="number" class="np-dim-input" id="np-height" value="1080" min="1" max="8192" />
        <span class="np-dim-unit">px</span>
        <button class="np-lock-btn locked" id="np-lock" title="Lock Aspect Ratio">${link()}</button>
      </div>
      <div class="np-orientation" id="np-orientation">
        <button class="np-orient-btn active" data-orient="landscape">⊞ Landscape</button>
        <button class="np-orient-btn" data-orient="portrait">▯ Portrait</button>
        <button class="np-orient-btn" data-orient="square">◻ Square</button>
      </div>
    </div>

    <!-- Background -->
    <div class="np-section">
      <label class="np-section-label">Background</label>
      <div class="np-bg-options" id="np-bg-options">
        <button class="np-bg-option active" data-bg="#FFFFFF">
          <span class="np-bg-swatch" style="background:#FFFFFF"></span> White
        </button>
        <button class="np-bg-option" data-bg="#000000">
          <span class="np-bg-swatch" style="background:#000000"></span> Black
        </button>
        <button class="np-bg-option" data-bg="transparent">
          <span class="np-bg-swatch checkerboard"></span> Transparent
        </button>
        <button class="np-bg-option" data-bg="custom">
          <span class="np-bg-swatch" id="np-custom-swatch" style="background:#1A1A1E"></span> Custom
        </button>
      </div>
      <div class="np-custom-color" id="np-custom-color">
        <input type="color" class="np-color-picker" id="np-color-pick" value="#1A1A1E" />
        <input type="text" class="np-color-hex" id="np-color-hex" value="#1A1A1E" maxlength="7" />
      </div>
    </div>

    <!-- Footer -->
    <div class="np-footer">
      <button class="np-btn-cancel" id="np-cancel">Cancel</button>
      <button class="np-btn-create" id="np-create">Create Project</button>
    </div>
  `;
}

// ── Open the modal ────────────────────────────────────────
export async function openNewProjectModal() {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop new-project-modal';

  const defaultName = await nextName();
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.innerHTML = buildHTML(defaultName);
  backdrop.appendChild(dialog);
  root.appendChild(backdrop);

  // ── Refs ──────────────────────────────────────────────
  const nameInput   = dialog.querySelector('#np-name');
  const widthInput  = dialog.querySelector('#np-width');
  const heightInput = dialog.querySelector('#np-height');
  const lockBtn     = dialog.querySelector('#np-lock');
  const presetBtns  = dialog.querySelectorAll('.np-preset');
  const orientBtns  = dialog.querySelectorAll('[data-orient]');
  const bgBtns      = dialog.querySelectorAll('.np-bg-option');
  const customColor = dialog.querySelector('#np-custom-color');
  const colorPick   = dialog.querySelector('#np-color-pick');
  const colorHex    = dialog.querySelector('#np-color-hex');
  const customSwatch = dialog.querySelector('#np-custom-swatch');

  let locked = true;
  let aspectRatio = 1920 / 1080;
  let selectedBg = '#FFFFFF';

  // ── Close logic ───────────────────────────────────────
  function close() {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 200);
  }

  dialog.querySelector('#np-close').addEventListener('click', close);
  dialog.querySelector('#np-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  // ── Name: select all on focus ─────────────────────────
  nameInput.addEventListener('focus', () => nameInput.select());

  // ── Presets ───────────────────────────────────────────
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const w = btn.dataset.w;
      const h = btn.dataset.h;
      if (w && h) {
        widthInput.value = w;
        heightInput.value = h;
        aspectRatio = parseInt(w) / parseInt(h);
        updateOrientation(parseInt(w), parseInt(h));
      }
    });
  });

  // ── Aspect lock ───────────────────────────────────────
  lockBtn.addEventListener('click', () => {
    locked = !locked;
    lockBtn.classList.toggle('locked', locked);
    lockBtn.innerHTML = locked ? link() : unlink();
    if (locked) aspectRatio = parseInt(widthInput.value) / parseInt(heightInput.value);
  });

  // ── Dimension inputs ──────────────────────────────────
  widthInput.addEventListener('input', () => {
    clearPresetHighlight();
    if (locked && aspectRatio) {
      heightInput.value = Math.round(parseInt(widthInput.value) / aspectRatio) || '';
    }
    updateOrientation(parseInt(widthInput.value), parseInt(heightInput.value));
  });

  heightInput.addEventListener('input', () => {
    clearPresetHighlight();
    if (locked && aspectRatio) {
      widthInput.value = Math.round(parseInt(heightInput.value) * aspectRatio) || '';
    }
    updateOrientation(parseInt(widthInput.value), parseInt(heightInput.value));
  });

  function clearPresetHighlight() {
    presetBtns.forEach(b => b.classList.remove('active'));
    dialog.querySelector('[data-preset="custom"]').classList.add('active');
  }

  // ── Orientation ───────────────────────────────────────
  function updateOrientation(w, h) {
    orientBtns.forEach(b => b.classList.remove('active'));
    if (w === h) dialog.querySelector('[data-orient="square"]').classList.add('active');
    else if (w > h) dialog.querySelector('[data-orient="landscape"]').classList.add('active');
    else dialog.querySelector('[data-orient="portrait"]').classList.add('active');
  }

  orientBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const orient = btn.dataset.orient;
      let w = parseInt(widthInput.value) || 1920;
      let h = parseInt(heightInput.value) || 1080;

      if (orient === 'landscape') {
        if (w === h) { w = Math.max(w, Math.round(h * 16 / 9)); } // break square → landscape
        else if (h > w) { [w, h] = [h, w]; }
      }
      if (orient === 'portrait') {
        if (w === h) { h = Math.max(h, Math.round(w * 16 / 9)); } // break square → portrait
        else if (w > h) { [w, h] = [h, w]; }
      }
      if (orient === 'square') { h = w; }

      widthInput.value = w;
      heightInput.value = h;
      aspectRatio = w / h;
      clearPresetHighlight();
      orientBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ── Background ────────────────────────────────────────
  bgBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      bgBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const bg = btn.dataset.bg;
      customColor.classList.toggle('visible', bg === 'custom');
      selectedBg = bg === 'custom' ? colorPick.value : bg;
    });
  });

  colorPick.addEventListener('input', () => {
    colorHex.value = colorPick.value;
    customSwatch.style.background = colorPick.value;
    selectedBg = colorPick.value;
  });

  colorHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(colorHex.value)) {
      colorPick.value = colorHex.value;
      customSwatch.style.background = colorHex.value;
      selectedBg = colorHex.value;
    }
  });

  // ── Create ────────────────────────────────────────────
  dialog.querySelector('#np-create').addEventListener('click', () => {
    const settings = {
      name: nameInput.value.trim() || 'Untitled',
      width: parseInt(widthInput.value) || 1920,
      height: parseInt(heightInput.value) || 1080,
      background: selectedBg,
    };
    setState({ newProjectSettings: settings });
    close();
    navigate('#/editor');
  });
}
