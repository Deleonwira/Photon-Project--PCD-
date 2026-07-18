/* PHOTON — Export Modal (Compression-Driven) */
import { x } from '../icons/icons.js';
import { getState, setState } from '../utils/state.js';
import { getCanvasBase64, exportCustom, getCurrentFileName } from '../services/ImageEngine.js';

// ═══════════════════════════════════════════════════════════════
// ── Compression Methods + Compatible Formats ────────────────
// ═══════════════════════════════════════════════════════════════
const METHODS = [
  {
    id: 'quantization',
    name: 'Quantization',
    type: 'lossy',
    desc: 'Reduces precision of pixel values by mapping ranges to single representative values. This is the core of JPEG compression — the quality slider directly controls the quantization table, trading visual fidelity for smaller file size.',
    best: 'Best for photographs with gradual tonal changes.',
    formats: [
      { id: 'jpeg', name: 'JPEG', ext: '.jpg', hasQuality: true },
      { id: 'png',  name: 'PNG',  ext: '.png', hasQuality: true },
      { id: 'bmp',  name: 'BMP',  ext: '.bmp', hasQuality: true },
    ],
  },
  {
    id: 'huffman',
    name: 'Huffman Coding',
    type: 'lossless',
    desc: 'A variable-length coding algorithm that assigns shorter binary codes to more frequently occurring pixel values. Builds a binary tree based on symbol frequency, ensuring optimal prefix-free encoding.',
    best: 'Best as a final encoding step after quantization (used in JPEG).',
    formats: [
      { id: 'tiff_huffman', name: 'TIFF',   ext: '.tiff', hasQuality: false },
      { id: 'custom',       name: 'Custom', ext: '.huff', hasQuality: false, isCustom: true },
    ],
  },
  {
    id: 'arithmetic',
    name: 'Arithmetic Coding',
    type: 'lossless',
    desc: 'Encodes an entire message as a single fractional number between 0 and 1. Achieves higher compression ratios than Huffman because it can represent fractional bit lengths per symbol.',
    best: 'Best for data with skewed probability distributions.',
    formats: [
      { id: 'custom', name: 'Custom', ext: '.arith', hasQuality: false, isCustom: true },
    ],
  },
  {
    id: 'lzw',
    name: 'LZW (Lempel-Ziv-Welch)',
    type: 'lossless',
    desc: 'A dictionary-based algorithm that builds a table of recurring byte patterns during encoding. Each new pattern is assigned a code. Widely used in GIF and TIFF formats.',
    best: 'Best for images with repeating patterns or limited color palettes.',
    formats: [
      { id: 'gif',      name: 'GIF',    ext: '.gif',  hasQuality: false },
      { id: 'tiff_lzw', name: 'TIFF',   ext: '.tiff', hasQuality: false },
      { id: 'custom',   name: 'Custom', ext: '.lzw',  hasQuality: false, isCustom: true },
    ],
  },
  {
    id: 'rle',
    name: 'RLE (Run-Length Encoding)',
    type: 'lossless',
    desc: 'Replaces consecutive runs of identical pixel values with a single value and a count. For example, "AAABBB" becomes "3A3B". Simple but effective for images with large uniform regions.',
    best: 'Best for binary images, diagrams, and icons with solid areas.',
    formats: [
      { id: 'bmp_rle',  name: 'BMP',    ext: '.bmp',  hasQuality: false },
      { id: 'tiff_rle', name: 'TIFF',   ext: '.tiff', hasQuality: false },
      { id: 'custom',   name: 'Custom', ext: '.rle',  hasQuality: false, isCustom: true },
    ],
  },
];


// ── Size Estimation ──────────────────────────────────────────
function estimateSize(w, h, method, format, quality) {
  const raw = w * h * 3;
  if (method === 'quantization') {
    if (format === 'jpeg') return Math.max(1, Math.round(raw * (quality / 100) * 0.08));
    if (format === 'png')  return Math.max(1, Math.round(raw * 0.35));
    return raw; // BMP
  }
  if (format.startsWith('tiff'))  return Math.max(1, Math.round(raw * 0.55));
  if (format === 'gif')           return Math.max(1, Math.round(raw * 0.15));
  if (format === 'bmp_rle')       return Math.max(1, Math.round(raw * 0.4));
  // Custom binary formats
  if (method === 'rle')           return Math.max(1, Math.round(raw * 0.7));
  if (method === 'huffman')       return Math.max(1, Math.round(raw * 0.65));
  if (method === 'lzw')           return Math.max(1, Math.round(raw * 0.5));
  if (method === 'arithmetic')    return Math.max(1, Math.round(raw * 0.6));
  return raw;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}


// ═══════════════════════════════════════════════════════════════
// ── Build HTML ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
function buildHTML() {
  const filename = 'untitled';
  const firstMethod = METHODS[0];

  // Method dropdown options
  const methodOpts = METHODS.map((m, i) => `
    <option value="${m.id}"${i === 0 ? ' selected' : ''}>${m.name}</option>`).join('');

  // Initial format buttons (from first method)
  const formatBtns = firstMethod.formats.map((f, i) => `
    <button class="ex-format-btn${i === 0 ? ' active' : ''}${f.isCustom ? ' custom-format' : ''}"
            data-format="${f.id}" data-ext="${f.ext}">
      <span class="ex-format-name">${f.name}</span>
      <span class="ex-format-ext">${f.ext}</span>
    </button>`).join('');

  const m = firstMethod;

  return `
    <div class="modal-header">
      <span class="modal-title">Export Image</span>
      <button class="modal-close" id="ex-close">${x()}</button>
    </div>

    <div class="export-layout">
      <!-- Left: Controls -->
      <div class="export-left">

        <!-- 1. Compression Method (primary control) -->
        <div class="ex-section" id="ex-method-section">
          <label class="ex-section-label">Compression Method</label>
          <select class="ex-method-select" id="ex-method">${methodOpts}</select>
          <div class="ex-method-info" id="ex-method-info">
            <div class="ex-method-header">
              <span class="ex-method-name" id="ex-mi-name">${m.name}</span>
              <span class="ex-method-badge ${m.type}" id="ex-mi-badge">${m.type}</span>
            </div>
            <p class="ex-method-desc" id="ex-mi-desc">${m.desc}</p>
            <p class="ex-method-best" id="ex-mi-best">${m.best}</p>
          </div>
        </div>

        <!-- 2. Format (dynamic — rebuilt when method changes) -->
        <div class="ex-section">
          <label class="ex-section-label">Format</label>
          <div class="ex-formats" id="ex-formats">${formatBtns}</div>
          <div class="ex-custom-warning ex-hidden" id="ex-custom-warning">
            ⚠ Custom files cannot be opened in standard image viewers.
          </div>
        </div>

        <!-- 3. Quality Slider -->
        <div class="ex-section" id="ex-quality-section">
          <label class="ex-section-label">Quality</label>
          <div class="ex-quality-row">
            <input type="range" class="ex-quality-slider" id="ex-quality" min="1" max="100" value="75" />
            <span class="ex-quality-value" id="ex-quality-val">75%</span>
          </div>
          <div class="ex-quality-labels">
            <span>Low (small file)</span>
            <span>High (large file)</span>
          </div>
        </div>

        <!-- 4. Filename -->
        <div class="ex-section">
          <label class="ex-section-label">Filename</label>
          <input type="text" class="ex-filename-input" id="ex-filename" value="${filename}" />
          <div class="ex-output-line" id="ex-output">${filename}${firstMethod.formats[0].ext}</div>
        </div>
      </div>

      <!-- Right: Preview -->
      <div class="export-right">
        <div class="ex-preview-box" id="ex-preview">
          <canvas id="ex-preview-canvas" width="280" height="175"></canvas>
        </div>
        <div class="ex-stats" id="ex-stats">
          <div class="ex-stat">
            <div class="ex-stat-label">Estimated Size</div>
            <div class="ex-stat-value" id="ex-stat-size">245 KB</div>
          </div>
          <div class="ex-stat">
            <div class="ex-stat-label">Compression</div>
            <div class="ex-stat-value" id="ex-stat-ratio">8.2:1</div>
          </div>
          <div class="ex-stat">
            <div class="ex-stat-label">Original</div>
            <div class="ex-stat-value" id="ex-stat-original">6.2 MB</div>
          </div>
          <div class="ex-stat">
            <div class="ex-stat-label">Savings</div>
            <div class="ex-stat-value" id="ex-stat-savings">87.8%</div>
          </div>
        </div>
      </div>
    </div>

    <div class="ex-footer">
      <button class="ex-btn-cancel" id="ex-cancel">Cancel</button>
      <button class="ex-btn-export" id="ex-export">Export Image</button>
    </div>
  `;
}

// ── Draw real image preview ───────────────────────────────
function drawPreview(canvas) {
  const b64 = getCanvasBase64();
  if (!b64) {
    // No image loaded — draw placeholder gradient
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#4C8BF5');
    grad.addColorStop(0.5, '#7C5BF0');
    grad.addColorStop(1, '#F5576C');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (canvas.width - dw) / 2;
    const dy = (canvas.height - dh) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, dx, dy, dw, dh);
  };
  img.src = b64;
}


// ═══════════════════════════════════════════════════════════════
// ── Open the modal ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
export function openExportModal() {
  const root = document.getElementById('modal-root');
  const state = getState();
  const projectName = getCurrentFileName()?.replace(/\.[^.]+$/, '') || state.newProjectSettings?.name || 'Untitled';
  const imgInfo = state.imageInfo || {};
  const imgW = imgInfo.width || state.newProjectSettings?.width || 1920;
  const imgH = imgInfo.height || state.newProjectSettings?.height || 1080;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop export-modal';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.innerHTML = buildHTML();
  backdrop.appendChild(dialog);
  root.appendChild(backdrop);

  // ── Refs ──────────────────────────────────────────────────
  const qualitySlider    = dialog.querySelector('#ex-quality');
  const qualityVal       = dialog.querySelector('#ex-quality-val');
  const qualitySection   = dialog.querySelector('#ex-quality-section');
  const methodSelect     = dialog.querySelector('#ex-method');
  const filenameInput    = dialog.querySelector('#ex-filename');
  const outputLine       = dialog.querySelector('#ex-output');
  const previewCanvas    = dialog.querySelector('#ex-preview-canvas');
  const customWarning    = dialog.querySelector('#ex-custom-warning');
  const formatsContainer = dialog.querySelector('#ex-formats');

  // ── State ─────────────────────────────────────────────────
  let currentMethod  = 'quantization';
  let currentFormat  = 'jpeg';
  let currentExt     = '.jpg';
  let currentQuality = 75;

  // ── Initial render ────────────────────────────────────────
  drawPreview(previewCanvas);
  updateStats();

  // ── Close ─────────────────────────────────────────────────
  function close() {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 200);
  }

  dialog.querySelector('#ex-close').addEventListener('click', close);
  dialog.querySelector('#ex-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });


  // ═════════════════════════════════════════════════════════
  // ── Method Selection (drives everything) ────────────────
  // ═════════════════════════════════════════════════════════

  methodSelect.addEventListener('change', () => {
    currentMethod = methodSelect.value;
    updateMethodInfo(currentMethod);
    rebuildFormats(currentMethod);
  });

  function updateMethodInfo(methodId) {
    const m = METHODS.find(me => me.id === methodId);
    if (!m) return;
    dialog.querySelector('#ex-mi-name').textContent = m.name;
    const badge = dialog.querySelector('#ex-mi-badge');
    badge.textContent = m.type;
    badge.className = `ex-method-badge ${m.type}`;
    dialog.querySelector('#ex-mi-desc').textContent = m.desc;
    dialog.querySelector('#ex-mi-best').textContent = m.best;
  }


  // ═════════════════════════════════════════════════════════
  // ── Dynamic Format Rebuild ──────────────────────────────
  // ═════════════════════════════════════════════════════════

  function rebuildFormats(methodId) {
    const method = METHODS.find(m => m.id === methodId);
    if (!method) return;

    // Build new format buttons
    formatsContainer.innerHTML = method.formats.map((f, i) => `
      <button class="ex-format-btn${i === 0 ? ' active' : ''}${f.isCustom ? ' custom-format' : ''}"
              data-format="${f.id}" data-ext="${f.ext}">
        <span class="ex-format-name">${f.name}</span>
        <span class="ex-format-ext">${f.ext}</span>
      </button>`).join('');

    // Attach click handlers to new buttons
    attachFormatListeners(method);

    // Reset to first format
    currentFormat = method.formats[0].id;
    currentExt    = method.formats[0].ext;

    // Show/hide quality slider
    qualitySection.classList.toggle('ex-hidden', !method.formats[0].hasQuality);

    // Show/hide custom-format warning
    const hasCustom = method.formats.some(f => f.isCustom);
    customWarning.classList.toggle('ex-hidden', !hasCustom);

    // Update filename
    outputLine.textContent = filenameInput.value + currentExt;

    // Update stats
    updateStats();
  }


  // ═════════════════════════════════════════════════════════
  // ── Format Button Click Handling ────────────────────────
  // ═════════════════════════════════════════════════════════

  function attachFormatListeners(method) {
    formatsContainer.querySelectorAll('.ex-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        formatsContainer.querySelectorAll('.ex-format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentFormat = btn.dataset.format;
        currentExt    = btn.dataset.ext;

        const fmt = method.formats.find(f => f.id === currentFormat);
        qualitySection.classList.toggle('ex-hidden', !(fmt && fmt.hasQuality));

        outputLine.textContent = filenameInput.value + currentExt;
        updateStats();
      });
    });
  }

  // Attach listeners for the initial format buttons
  attachFormatListeners(METHODS[0]);


  // ═════════════════════════════════════════════════════════
  // ── Quality Slider ──────────────────────────────────────
  // ═════════════════════════════════════════════════════════

  qualitySlider.addEventListener('input', () => {
    currentQuality = parseInt(qualitySlider.value);
    qualityVal.textContent = currentQuality + '%';
    updateStats();
  });


  // ═════════════════════════════════════════════════════════
  // ── Filename ────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════

  filenameInput.addEventListener('input', () => {
    outputLine.textContent = filenameInput.value + currentExt;
  });


  // ═════════════════════════════════════════════════════════
  // ── Stats Update ────────────────────────────────────────
  // ═════════════════════════════════════════════════════════

  function updateStats() {
    const raw = imgW * imgH * 3;
    const compressed = estimateSize(imgW, imgH, currentMethod, currentFormat, currentQuality);
    const ratio = compressed > 0 ? (raw / compressed) : 0;
    const savings = compressed > 0 ? ((1 - compressed / raw) * 100) : 0;

    dialog.querySelector('#ex-stat-size').textContent = formatBytes(compressed);
    dialog.querySelector('#ex-stat-ratio').textContent = isFinite(ratio) ? ratio.toFixed(1) + ':1' : '—';
    dialog.querySelector('#ex-stat-original').textContent = formatBytes(raw);
    dialog.querySelector('#ex-stat-savings').textContent = isFinite(savings) ? savings.toFixed(1) + '%' : '—';
  }


  // ═════════════════════════════════════════════════════════
  // ── Export Action (all routes go through backend) ───────
  // ═════════════════════════════════════════════════════════

  dialog.querySelector('#ex-export').addEventListener('click', async () => {
    const method = METHODS.find(m => m.id === currentMethod);
    if (!method) return;

    const fmt = method.formats.find(f => f.id === currentFormat);
    if (!fmt) return;

    const fname = (filenameInput.value || 'untitled') + currentExt;

    // Show loading state
    const btn = dialog.querySelector('#ex-export');
    const originalText = btn.textContent;
    btn.textContent = 'Exporting...';
    btn.disabled = true;

    console.log('[PHOTON Export]', { method: currentMethod, format: currentFormat, quality: currentQuality, filename: fname });

    try {
      await exportCustom(currentMethod, currentFormat, currentQuality, fname);

      // Only close if modal still exists (user may have dismissed it)
      if (backdrop.parentNode) close();
    } catch (err) {
      console.error('[PHOTON Export] Failed:', err);

      // Re-enable button if modal still exists
      if (backdrop.parentNode) {
        btn.textContent = originalText;
        btn.disabled = false;
      }

      // User-friendly error message
      let msg = err.message;
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        msg = 'Backend server is not running. Start it with: python app.py';
      }
      setState({ statusMessage: `Export failed: ${msg}` });
      alert(`Export failed: ${msg}`);
    }
  });
}
