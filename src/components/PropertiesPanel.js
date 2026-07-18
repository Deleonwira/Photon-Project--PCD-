/* PHOTON — Properties Panel (context-sensitive per tool) */
import { chevronDown } from '../icons/icons.js';
import { subscribe, getState, setState } from '../utils/state.js';
import { resize, crop, translate, flipH, flipV } from '../services/TransformService.js';
import { applyCrop, cancelCrop, getOverlayEl, getAIBoxesEl, getCanvasMapping } from './InteractionLayer.js';
import { jsRotateFree as _jsRotateFree, getLoadedImage, setLoadedImage } from '../services/ImageEngine.js';
import { pushState, onHistoryRestore } from '../services/HistoryStack.js';
import { adjustBrightnessContrast, equalizeHistogram, sharpen as applySharpen } from '../services/EnhanceService.js';
import { adjustColor } from '../services/ColorService.js';
import { gaussianBlur, boxBlur, medianFilter, bilateralFilter, addNoiseSP, addNoiseGaussian } from '../services/FilterService.js';
import { cannyEdge, sobelEdge, prewittEdge, robertEdge, laplacianEdge, logEdge, threshold as applyThreshold, erode as applyErode, dilate as applyDilate } from '../services/EdgeService.js';
import { segThreshold, segEdge, segRegion } from '../services/SegmentService.js';
import { recognizeOnly } from '../services/AIService.js';

// ── Module state for live preview snapshots ────────────────
let _eqSnapshot = null;          // Before histogram equalization
let _sharpSnapshot = null;       // Before sharpen for live re-convolution
let _colorSnapshot = null;       // Before color adjust preview
let _filterTabSnapshot = null;   // Blur/Noise tab — single tab-level snapshot
let _threshTabSnapshot = null;   // Threshold/Morphology tab — single tab-level snapshot
let _edgeSnapshot = null;        // Edge detection tab snapshot
let _segSnapshot = null;         // Segmentation tab snapshot

// Export snapshot cleanup for undo/redo (Phase 0D)
export function clearEnhancementSnapshots() {
  _eqSnapshot = null; _sharpSnapshot = null; _colorSnapshot = null;
  _filterTabSnapshot = null; _threshTabSnapshot = null;
  _edgeSnapshot = null; _segSnapshot = null;
}

// Register with HistoryStack so undo/redo clears stale snapshots
onHistoryRestore(clearEnhancementSnapshots);

// Helper: clone loadedImageElement as a canvas (for snapshot)
function _cloneLoadedImage() {
  const img = getLoadedImage();
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return null;
  const copy = document.createElement('canvas');
  copy.width = w; copy.height = h;
  copy.getContext('2d').drawImage(img, 0, 0, w, h);
  return copy;
}

// Helper: restore loadedImageElement from snapshot — WITH re-render
function _restoreFromSnapshot(snapshot) {
  if (!snapshot) return;
  const copy = document.createElement('canvas');
  copy.width = snapshot.width; copy.height = snapshot.height;
  copy.getContext('2d').drawImage(snapshot, 0, 0);
  setLoadedImage(copy);
  const t = getState().imageTransform;
  if (t) setState({ imageTransform: { ...t } });
}

// Helper: restore loadedImageElement — NO re-render (BOE-069)
// Used inside compose pipelines where another op will trigger render
function _restoreQuiet(snapshot) {
  if (!snapshot) return;
  const copy = document.createElement('canvas');
  copy.width = snapshot.width; copy.height = snapshot.height;
  copy.getContext('2d').drawImage(snapshot, 0, 0);
  setLoadedImage(copy);
}

// Null all snapshots after any destructive operation (BOE-036)
function _nullAllSnapshots() {
  _eqSnapshot = null; _sharpSnapshot = null; _colorSnapshot = null;
  _filterTabSnapshot = null; _threshTabSnapshot = null;
  _edgeSnapshot = null; _segSnapshot = null;
}

// ── Slider helper ──────────────────────────────────────────
function slider(label, id, min, max, value, unit = '') {
  return `
    <div class="slider-group">
      <div class="slider-header">
        <span class="slider-label">${label}</span>
        <span class="slider-value" id="val-${id}">${value}${unit}</span>
      </div>
      <input type="range" class="photon-slider" id="sl-${id}"
        min="${min}" max="${max}" value="${value}" />
    </div>`;
}

function section(title, body, open = true) {
  return `
    <div class="panel-section${open ? '' : ' collapsed'}">
      <div class="panel-section-header">
        <span class="panel-section-title">${title}</span>
        <span class="panel-section-toggle">${chevronDown()}</span>
      </div>
      <div class="panel-section-body" style="max-height:500px">${body}</div>
    </div>`;
}

// ── Button feedback flash (BOE-049: per-button timeout to prevent flicker) ──
const _flashTimers = new Map();
function _flashApplied(btn) {
  if (!btn) return;
  // Clear any existing timer for this button
  const existing = _flashTimers.get(btn);
  if (existing) { clearTimeout(existing); btn.classList.remove('btn-applied', 'btn-fading'); }
  // Flash ON
  btn.classList.add('btn-applied');
  // Start fade after 400ms
  const t = setTimeout(() => {
    btn.classList.add('btn-fading');
    // Remove classes after fade completes
    const t2 = setTimeout(() => {
      btn.classList.remove('btn-applied', 'btn-fading');
      _flashTimers.delete(btn);
    }, 500);
    _flashTimers.set(btn, t2);
  }, 400);
  _flashTimers.set(btn, t);
}

// ── Context views per tool ─────────────────────────────────
const views = {
  pointer: () => section('Image Info', `
    <div class="info-row"><span class="info-label">Filename</span><span class="info-value">untitled.png</span></div>
    <div class="info-row"><span class="info-label">Dimensions</span><span class="info-value">1920 × 1080</span></div>
    <div class="info-row"><span class="info-label">Format</span><span class="info-value">PNG</span></div>
    <div class="info-row"><span class="info-label">File Size</span><span class="info-value">2.4 MB</span></div>
    <div class="info-row"><span class="info-label">Color Mode</span><span class="info-value">RGB</span></div>
    <div class="info-row"><span class="info-label">Bit Depth</span><span class="info-value">8-bit</span></div>
  `),

  brightness: () =>
    section('Brightness & Contrast',
      slider('Brightness', 'bright', -100, 100, 0) +
      slider('Contrast', 'contrast', -100, 100, 0) +
      `<p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--sp-2)">Drag sliders — changes are live</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-bc-reset" style="flex:1">Reset</button>
        <button class="btn-sm" id="btn-hist-eq" style="flex:1;background:var(--accent-subtle);color:var(--accent)">Histogram Equalization</button>
      </div>
      <button class="btn-sm" id="btn-bc-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>`
    ),

  crop: () => section('Crop', `
    <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--sp-2)">Drag handles on the overlay to define the crop area.</p>
    <div style="margin-bottom:var(--sp-2)">
      <label style="font-size:var(--text-xs);color:var(--text-secondary)">Aspect Ratio</label>
      <select id="crop-aspect" class="photon-select" style="width:100%;margin-top:2px">
        <option value="free">Free</option>
        <option value="1:1">1 : 1 (Square)</option>
        <option value="4:3">4 : 3</option>
        <option value="16:9">16 : 9</option>
        <option value="3:2">3 : 2</option>
        <option value="2:3">2 : 3 (Portrait)</option>
      </select>
    </div>
    <label class="lock-row" style="display:flex;align-items:center;gap:6px;margin-bottom:var(--sp-2);font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer">
      <input type="checkbox" id="crop-lock-aspect" /> Lock Ratio
    </label>
    <div class="input-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:var(--sp-2)">
      <div><label style="font-size:10px;color:var(--text-muted)">X</label><input type="number" id="inp-crop-x" class="photon-input" style="width:100%" /></div>
      <div><label style="font-size:10px;color:var(--text-muted)">Y</label><input type="number" id="inp-crop-y" class="photon-input" style="width:100%" /></div>
      <div><label style="font-size:10px;color:var(--text-muted)">W</label><input type="number" id="inp-crop-w" class="photon-input" style="width:100%" /></div>
      <div><label style="font-size:10px;color:var(--text-muted)">H</label><input type="number" id="inp-crop-h" class="photon-input" style="width:100%" /></div>
    </div>
    <div class="btn-row" style="gap:6px">
      <button class="btn-sm" id="btn-crop-apply" style="flex:1;background:var(--accent-subtle);color:var(--accent)">Apply Crop</button>
      <button class="btn-sm" id="btn-crop-cancel" style="flex:1">Cancel</button>
    </div>
  `),

  rotate: () =>
    section('Rotation',
      slider('Angle', 'angle', 0, 360, 0, '°') +
      `<p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--sp-2)">Drag slider to rotate live</p>
      <div class="btn-row">
        <button class="btn-sm" id="btn-rot90">90°</button>
        <button class="btn-sm" id="btn-rot180">180°</button>
        <button class="btn-sm" id="btn-rot270">270°</button>
      </div>`
    ),

  flipH: () => section('Flip', `
    <div class="btn-row">
      <button class="btn-sm" id="btn-flip-h" style="flex:1">Horizontal</button>
      <button class="btn-sm" id="btn-flip-v" style="flex:1">Vertical</button>
    </div>
  `),

  resize: () =>
    section('Position', `
      <div class="dual-input-row">
        <div class="slider-group">
          <div class="slider-header"><span class="slider-label">X</span></div>
          <input class="photon-input" type="number" id="inp-rx" value="0" />
        </div>
        <div class="slider-group">
          <div class="slider-header"><span class="slider-label">Y</span></div>
          <input class="photon-input" type="number" id="inp-ry" value="0" />
        </div>
      </div>
    `) +
    section('Size', `
      <div class="dual-input-row">
        <div class="slider-group">
          <div class="slider-header"><span class="slider-label">W</span></div>
          <input class="photon-input" type="number" id="inp-rw" value="1920" />
        </div>
        <div class="slider-group">
          <div class="slider-header"><span class="slider-label">H</span></div>
          <input class="photon-input" type="number" id="inp-rh" value="1080" />
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-2)">
        <input type="checkbox" checked id="lock-aspect" />
        <label for="lock-aspect" style="font-size:var(--text-xs);color:var(--text-secondary)">Lock Aspect Ratio</label>
      </div>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-reset-pos" style="flex:1">Reset Position</button>
        <button class="btn-sm" id="btn-reset-size" style="flex:1">Reset Size</button>
      </div>
    `),

  sharpen: () =>
    section('Sharpen',
      slider('Amount', 'sharp-amt', 0, 100, 0, '%') +
      `<p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--sp-2)">Drag slider — changes are live</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-sharp-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-sharp-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>`
    ),

  blur: () =>
    section('Blur / Smooth', `
      <select class="photon-select" id="sel-blur-method">
        <option value="gaussian">Gaussian Blur</option>
        <option value="box">Box (Mean) Filter</option>
        <option value="median">Median Filter</option>
        <option value="bilateral">Bilateral (Edge-preserving)</option>
      </select>
      ${slider('Kernel Size', 'kern', 1, 21, 1)}
      <p style="font-size:10px;color:var(--text-muted)">Drag slider — changes are live preview</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-blur-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-blur-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>
    `) +
    section('Noise', `
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--sp-2)">Add noise to test filter effectiveness.</p>
      <select class="photon-select" id="sel-noise-type">
        <option value="none">(None)</option>
        <option value="sp">Salt & Pepper</option>
        <option value="gaussian">Gaussian</option>
      </select>
      ${slider('Amount', 'noise-amt', 1, 20, 5, '%')}
      <p style="font-size:10px;color:var(--text-muted)">Select type for live preview</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-noise-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-noise-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>
    `, true),

  color: () =>
    section('Color Mode', `
      <select class="photon-select" id="sel-color-mode">
        <option value="normal">(Normal)</option>
        <option value="grayscale">Grayscale</option>
        <option value="red">Red Channel</option>
        <option value="green">Green Channel</option>
        <option value="blue">Blue Channel</option>
      </select>
      <p style="font-size:10px;color:var(--text-muted);margin-top:var(--sp-1)">Select mode for live preview</p>
    `) +
    section('Color Adjust',
      slider('Hue', 'hue', 0, 360, 180, '°') +
      slider('Saturation', 'sat', 0, 200, 100, '%') +
      slider('Lightness', 'light', -100, 100, 0) +
      `<p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--sp-2)">Drag sliders — changes are live preview</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-color-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-color-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>`
    ),

  threshold: () =>
    section('Threshold',
      `<select class="photon-select" id="sel-thresh-method">
        <option value="none">(None)</option>
        <option value="global">Global</option>
        <option value="otsu">Otsu (Auto)</option>
        <option value="adaptive">Adaptive</option>
      </select>` +
      slider('Value', 'thresh', 0, 255, 128) +
      `<p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--sp-2)">Select method for live preview</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-thresh-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-thresh-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>`
    ) +
    section('Morphology', `
      ${slider('Kernel', 'morph-k', 0, 15, 0)}
      <select class="photon-select" id="sel-morph-shape">
        <option value="rect">Rectangle</option>
        <option value="cross">Cross</option>
        <option value="ellipse">Ellipse</option>
      </select>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-erode" style="flex:1" data-morph="erode">Erode</button>
        <button class="btn-sm" id="btn-dilate" style="flex:1" data-morph="dilate">Dilate</button>
      </div>
      <p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--sp-2)">Toggle one, drag slider — live preview</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-morph-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-morph-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>
    `, true),

  edge: () =>
    section('Edge Detection', `
      <select class="photon-select" id="sel-edge-method">
        <option value="none">(None)</option>
        <option value="canny">Canny</option>
        <option value="sobel">Sobel</option>
        <option value="prewitt">Prewitt</option>
        <option value="robert">Robert</option>
        <option value="laplacian">Laplacian</option>
        <option value="log">Laplacian of Gaussian</option>
      </select>
      ${slider('Threshold 1', 'edge-t1', 0, 255, 50)}
      ${slider('Threshold 2', 'edge-t2', 0, 255, 150)}
      <p style="font-size:10px;color:var(--text-muted)">Select method for live preview (sliders for Canny)</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-edge-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-edge-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>
    `),

  segment: () =>
    section('Segmentation', `
      <select class="photon-select" id="sel-seg-method">
        <option value="none">(None)</option>
        <option value="seg_threshold">Threshold-based</option>
        <option value="seg_edge">Edge-based</option>
        <option value="seg_region">Region-based (K-Means)</option>
      </select>
      ${slider('Threshold / Sensitivity', 'seg-sens', 0, 255, 128)}
      ${slider('Clusters (K-Means)', 'seg-k', 2, 8, 4)}
      <p style="font-size:10px;color:var(--text-muted)">Select method for live preview</p>
      <div class="btn-row" style="margin-top:var(--sp-2)">
        <button class="btn-sm" id="btn-seg-reset" style="flex:1">Reset</button>
      </div>
      <button class="btn-sm" id="btn-seg-apply" style="width:100%;margin-top:var(--sp-2);background:var(--accent);color:#fff;font-weight:600">Apply Changes</button>
    `),

  ai: () => section('AI Recognition (CNN)', `
    <select class="photon-select" id="sel-ai-target">
      <option value="all">All Objects (80 classes)</option>
      <option value="people">People</option>
      <option value="vehicles">Vehicles</option>
      <option value="animals">Animals</option>
      <option value="food">Food</option>
      <option value="furniture">Furniture</option>
      <option value="electronics">Electronics</option>
      <option value="kitchen">Kitchen Items</option>
      <option value="accessories">Accessories</option>
    </select>
    ${slider('Min. Confidence', 'ai-conf', 10, 90, 40, '%')}
    <button class="btn-sm" id="btn-ai-run" style="width:100%;background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted)">
      Run Recognition
    </button>
    <button class="btn-sm" id="btn-ai-clear" style="width:100%;margin-top:var(--sp-1);display:none">
      Clear Results
    </button>
    <div id="ai-results" style="margin-top:var(--sp-2);max-height:200px;overflow-y:auto;font-size:var(--text-xs);color:var(--text-secondary)"></div>
    <p style="font-size:10px;color:var(--text-muted);margin-top:var(--sp-2)">YOLOv4-tiny / COCO</p>
  `),
};

/**
 * Bake any pending CSS filter preview (B/C) into loadedImageElement.
 * Call this BEFORE any destructive operation (crop, flip, save, export).
 * Clears the CSS filter and resets state to 0.
 */
export function bakePendingFilter() {
  const fp = getState().filterPreview;
  if (!fp || (fp.brightness === 0 && fp.contrast === 0)) return;

  // Clear CSS filter from overlay first
  const overlay = getOverlayEl();
  if (overlay) overlay.style.filter = '';

  // Bake into loadedImageElement
  adjustBrightnessContrast(fp.brightness, fp.contrast);

  // Reset state
  setState({ filterPreview: { brightness: 0, contrast: 0 } });
}

/**
 * Bake ALL pending enhancements into loadedImageElement.
 * Call before entering any new enhancement feature or destructive op.
 * BOE-031: No feature may hold a snapshot that spans another feature's edits.
 */
export function bakeAllPending() {
  bakePendingFilter();       // Bake B/C CSS filter
  _eqSnapshot = null;        // Discard EQ snapshot (EQ is permanent now)
  if (_sharpSnapshot) {
    // Sharpen is already applied to loadedImageElement — just discard snapshot
    _sharpSnapshot = null;
  }
  setState({ sharpenPreview: { amount: 0 } });
}

export function initPropertiesPanel(container) {
  function render(tool) {
    // BOE-044: restore from live-preview snapshots when switching away
    if (_colorSnapshot) { _restoreFromSnapshot(_colorSnapshot); _colorSnapshot = null; }
    if (_filterTabSnapshot) { _restoreFromSnapshot(_filterTabSnapshot); _filterTabSnapshot = null; }
    if (_threshTabSnapshot) { _restoreFromSnapshot(_threshTabSnapshot); _threshTabSnapshot = null; }
    if (_edgeSnapshot) { _restoreFromSnapshot(_edgeSnapshot); _edgeSnapshot = null; }
    if (_segSnapshot) { _restoreFromSnapshot(_segSnapshot); _segSnapshot = null; }
    if (_sharpSnapshot) { _restoreFromSnapshot(_sharpSnapshot); _sharpSnapshot = null; }
    if (_eqSnapshot) { _restoreFromSnapshot(_eqSnapshot); _eqSnapshot = null; }

    if (tool !== 'brightness') {
      const overlay = getOverlayEl();
      if (overlay) overlay.style.filter = '';
      setState({ filterPreview: { brightness: 0, contrast: 0 } });
    }
    if (tool !== 'sharpen') {
      setState({ sharpenPreview: { amount: 0 } });
    }

    const viewFn = views[tool] || views.pointer;
    container.innerHTML = viewFn();
    wireSliders(container);
    wireSections(container);

    // Immediately populate fields from current state
    const t = getState().imageTransform;
    if (t) {
      const rx = container.querySelector('#inp-rx');
      const ry = container.querySelector('#inp-ry');
      const rw = container.querySelector('#inp-rw');
      const rh = container.querySelector('#inp-rh');
      if (rx) rx.value = Math.round(t.x);
      if (ry) ry.value = Math.round(t.y);
      if (rw) rw.value = Math.round(t.width);
      if (rh) rh.value = Math.round(t.height);

      // Sync rotation slider
      const slAngle = container.querySelector('#sl-angle');
      const valAngle = container.querySelector('#val-angle');
      if (slAngle) slAngle.value = t.rotation || 0;
      if (valAngle) valAngle.textContent = `${t.rotation || 0}°`;

      // Sync scale slider
      const info = getState().imageInfo;
      const slScale = container.querySelector('#sl-scale');
      const valScale = container.querySelector('#val-scale');
      if (slScale && info && info.width > 0) {
        const pct = Math.round((t.width / info.width) * 100);
        slScale.value = Math.max(10, Math.min(500, pct));
        if (valScale) valScale.textContent = `${slScale.value}%`;
      }
    }

    // Populate crop fields from current cropRegion
    const cr = getState().cropRegion;
    if (cr && cr.active) {
      const cx = container.querySelector('#inp-crop-x');
      const cy = container.querySelector('#inp-crop-y');
      const cw = container.querySelector('#inp-crop-w');
      const ch = container.querySelector('#inp-crop-h');
      if (cx) cx.value = Math.round(cr.x);
      if (cy) cy.value = Math.round(cr.y);
      if (cw) cw.value = Math.round(cr.width);
      if (ch) ch.value = Math.round(cr.height);
    }
  }

  render(getState().activeTool);
  subscribe('activeTool', render);

  // Populate resize fields with actual image dimensions
  subscribe('imageInfo', (info) => {
    const rw = container.querySelector('#inp-rw');
    const rh = container.querySelector('#inp-rh');
    if (rw && info) rw.value = info.width || 1920;
    if (rh && info) rh.value = info.height || 1080;
  });

  // Live update all resize/position fields from interaction layer
  subscribe('imageTransform', (t) => {
    if (!t) return;
    const focused = document.activeElement;
    const rx = container.querySelector('#inp-rx');
    const ry = container.querySelector('#inp-ry');
    const rw = container.querySelector('#inp-rw');
    const rh = container.querySelector('#inp-rh');
    // Don't overwrite the field the user is currently typing in
    if (rx && rx !== focused) rx.value = Math.round(t.x);
    if (ry && ry !== focused) ry.value = Math.round(t.y);
    if (rw && rw !== focused) rw.value = Math.round(t.width);
    if (rh && rh !== focused) rh.value = Math.round(t.height);

    // Update scale slider based on original dimensions
    const info = getState().imageInfo;
    const slScale = container.querySelector('#sl-scale');
    const valScale = container.querySelector('#val-scale');
    if (slScale && info && info.width > 0) {
      const pct = Math.round((t.width / info.width) * 100);
      slScale.value = Math.max(10, Math.min(500, pct));
      if (valScale) valScale.textContent = `${slScale.value}%`;
    }
  });

  // Live update crop fields from interaction layer
  subscribe('cropRegion', (cr) => {
    if (!cr || !cr.active) return;
    const focused = document.activeElement;
    const cx = container.querySelector('#inp-crop-x');
    const cy = container.querySelector('#inp-crop-y');
    const cw = container.querySelector('#inp-crop-w');
    const ch = container.querySelector('#inp-crop-h');
    if (cx && cx !== focused) cx.value = Math.round(cr.x);
    if (cy && cy !== focused) cy.value = Math.round(cr.y);
    if (cw && cw !== focused) cw.value = Math.round(cr.width);
    if (ch && ch !== focused) ch.value = Math.round(cr.height);
  });
}

function wireSliders(root) {
  root.querySelectorAll('.photon-slider').forEach(sl => {
    const valEl = root.querySelector(`#val-${sl.id.replace('sl-', '')}`);
    if (!valEl) return;
    const unit = valEl.textContent.replace(/[-\d]/g, '');
    sl.addEventListener('input', () => { valEl.textContent = sl.value + unit; });
  });

  // ── Rotate buttons (SET to exact angle, sync slider) ──
  const btn90 = root.querySelector('#btn-rot90');
  const btn180 = root.querySelector('#btn-rot180');
  const btn270 = root.querySelector('#btn-rot270');

  function setRotation(degrees) {
    pushState(); // BOE-041: undo for rotation buttons
    _jsRotateFree(degrees);
    // Sync slider
    const sl = root.querySelector('#sl-angle');
    const vl = root.querySelector('#val-angle');
    if (sl) sl.value = degrees;
    if (vl) vl.textContent = `${degrees}°`;
  }

  if (btn90) btn90.addEventListener('click', () => setRotation(90));
  if (btn180) btn180.addEventListener('click', () => setRotation(180));
  if (btn270) btn270.addEventListener('click', () => setRotation(270));

  // ── Live free rotation slider ──────────────────────────
  const slAngle = root.querySelector('#sl-angle');
  if (slAngle) {
    // Sync slider with current rotation state
    const currentRot = getState().imageTransform?.rotation || 0;
    slAngle.value = currentRot;
    const valAngle = root.querySelector('#val-angle');
    if (valAngle) valAngle.textContent = `${currentRot}°`;

    // BOE-038: push undo ONCE at drag start, not on every input
    let _rotUndoPushed = false;
    slAngle.addEventListener('mousedown', () => {
      if (!_rotUndoPushed) { pushState(); _rotUndoPushed = true; }
    });
    slAngle.addEventListener('touchstart', () => {
      if (!_rotUndoPushed) { pushState(); _rotUndoPushed = true; }
    }, { passive: true });
    slAngle.addEventListener('mouseup', () => { _rotUndoPushed = false; });
    slAngle.addEventListener('touchend', () => { _rotUndoPushed = false; });

    slAngle.addEventListener('input', () => {
      const angle = parseInt(slAngle.value || 0);
      const valAngle = root.querySelector('#val-angle');
      if (valAngle) valAngle.textContent = `${angle}°`;
      _jsRotateFree(angle); // Just sets imageTransform.rotation — instant CSS
    });
  }

  // ── Flip buttons ────────────────────────────────────────
  // Flips modify loadedImageElement directly → must invalidate enhancement snapshots
  const btnFlipH = root.querySelector('#btn-flip-h');
  const btnFlipV = root.querySelector('#btn-flip-v');
  if (btnFlipH) btnFlipH.addEventListener('click', () => {
    flipH();
    _nullAllSnapshots();
  });
  if (btnFlipV) btnFlipV.addEventListener('click', () => {
    flipV();
    _nullAllSnapshots();
  });

  // ── Crop buttons + inputs ─────────────────────────────
  const btnCropApply = root.querySelector('#btn-crop-apply');
  const btnCropCancel = root.querySelector('#btn-crop-cancel');
  if (btnCropApply) btnCropApply.addEventListener('click', () => applyCrop());
  if (btnCropCancel) btnCropCancel.addEventListener('click', () => cancelCrop());

  // Crop manual inputs → push to cropRegion state
  const cropX = root.querySelector('#inp-crop-x');
  const cropY = root.querySelector('#inp-crop-y');
  const cropW = root.querySelector('#inp-crop-w');
  const cropH = root.querySelector('#inp-crop-h');

  function pushCropRegion() {
    const cr = getState().cropRegion;
    if (!cr || !cr.active) return;
    const x = parseInt(cropX?.value ?? cr.x);
    const y = parseInt(cropY?.value ?? cr.y);
    const w = parseInt(cropW?.value ?? cr.width);
    const h = parseInt(cropH?.value ?? cr.height);
    if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      setState({ cropRegion: { x, y, width: w, height: h, active: true } });
    }
  }

  if (cropX) cropX.addEventListener('input', pushCropRegion);
  if (cropY) cropY.addEventListener('input', pushCropRegion);
  if (cropW) cropW.addEventListener('input', pushCropRegion);
  if (cropH) cropH.addEventListener('input', pushCropRegion);

  // ── Aspect ratio presets ─────────────────────────────────
  const cropAspectSel = root.querySelector('#crop-aspect');
  const cropLockCheck = root.querySelector('#crop-lock-aspect');

  if (cropAspectSel) {
    cropAspectSel.addEventListener('change', () => {
      const val = cropAspectSel.value;
      const cr = getState().cropRegion;
      if (!cr || !cr.active || val === 'free') {
        // Uncheck lock when switching to free
        if (cropLockCheck && val === 'free') cropLockCheck.checked = false;
        return;
      }

      // Parse ratio
      const parts = val.split(':');
      const ratioW = parseFloat(parts[0]);
      const ratioH = parseFloat(parts[1]);
      const targetAspect = ratioW / ratioH;

      // Reshape crop region to match ratio, centered in current bounds
      const currentAspect = cr.width / cr.height;
      let newW, newH;
      if (currentAspect > targetAspect) {
        // Current is wider — shrink width
        newH = cr.height;
        newW = Math.round(newH * targetAspect);
      } else {
        // Current is taller — shrink height
        newW = cr.width;
        newH = Math.round(newW / targetAspect);
      }

      // Center within the old crop region
      const newX = Math.round(cr.x + (cr.width - newW) / 2);
      const newY = Math.round(cr.y + (cr.height - newH) / 2);

      // Auto-lock ratio
      if (cropLockCheck) cropLockCheck.checked = true;

      setState({
        cropRegion: { x: newX, y: newY, width: newW, height: newH, active: true }
      });
    });
  }

  // When unchecking lock, reset dropdown to Free
  if (cropLockCheck) {
    cropLockCheck.addEventListener('change', () => {
      if (!cropLockCheck.checked && cropAspectSel) {
        cropAspectSel.value = 'free';
      }
    });
  }

  // ── Live position/size input handlers ───────────────────
  const inpX = root.querySelector('#inp-rx');
  const inpY = root.querySelector('#inp-ry');
  const inpW = root.querySelector('#inp-rw');
  const inpH = root.querySelector('#inp-rh');
  const lockAspect = root.querySelector('#lock-aspect');

  function pushTransform() {
    const t = getState().imageTransform;
    if (!t) return;
    const x = parseInt(inpX?.value ?? t.x);
    const y = parseInt(inpY?.value ?? t.y);
    const w = parseInt(inpW?.value ?? t.width);
    const h = parseInt(inpH?.value ?? t.height);
    if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      setState({ imageTransform: { ...t, x, y, width: w, height: h } });
    }
  }

  if (inpX) inpX.addEventListener('input', pushTransform);
  if (inpY) inpY.addEventListener('input', pushTransform);

  if (inpW) inpW.addEventListener('input', () => {
    if (lockAspect?.checked) {
      const t = getState().imageTransform;
      if (t && t.width > 0) {
        const aspect = t.width / t.height;
        const newW = parseInt(inpW.value);
        if (!isNaN(newW) && newW > 0 && inpH) {
          inpH.value = Math.round(newW / aspect);
        }
      }
    }
    pushTransform();
  });

  if (inpH) inpH.addEventListener('input', () => {
    if (lockAspect?.checked) {
      const t = getState().imageTransform;
      if (t && t.height > 0) {
        const aspect = t.width / t.height;
        const newH = parseInt(inpH.value);
        if (!isNaN(newH) && newH > 0 && inpW) {
          inpW.value = Math.round(newH * aspect);
        }
      }
    }
    pushTransform();
  });

  // ── Reset buttons ──────────────────────────────────────
  const btnResetPos = root.querySelector('#btn-reset-pos');
  if (btnResetPos) {
    btnResetPos.addEventListener('click', () => {
      const t = getState().imageTransform;
      if (t) {
        const canvas = document.querySelector('#main-canvas');
        const cx = canvas ? Math.round((canvas.width - t.width) / 2) : 0;
        const cy = canvas ? Math.round((canvas.height - t.height) / 2) : 0;
        setState({ imageTransform: { ...t, x: cx, y: cy } });
      }
    });
  }

  const btnResetSize = root.querySelector('#btn-reset-size');
  if (btnResetSize) {
    btnResetSize.addEventListener('click', () => {
      const t = getState().imageTransform;
      const info = getState().imageInfo;
      const canvas = document.querySelector('#main-canvas');
      if (t && info && info.width > 0 && canvas) {
        // Fit image within canvas (contain behavior)
        const scale = Math.min(canvas.width / info.width, canvas.height / info.height, 1);
        const w = Math.round(info.width * scale);
        const h = Math.round(info.height * scale);
        const x = Math.round((canvas.width - w) / 2);
        const y = Math.round((canvas.height - h) / 2);
        setState({ imageTransform: { ...t, x, y, width: w, height: h } });
      }
    });
  }

  // ── Brightness & Contrast — LIVE CSS filter preview ─────
  // Values persist across tab switches via state (BOE-029)
  const slBright = root.querySelector('#sl-bright');
  const slContrast = root.querySelector('#sl-contrast');

  // Apply CSS filter to overlay from current state values
  function _bcApplyFilter(b, c) {
    const bMult = 1 + b * 0.004;  // ±40% range (BOE-026)
    const cMult = 1 + c * 0.004;
    const overlay = getOverlayEl();
    if (overlay) {
      overlay.style.filter = (b === 0 && c === 0)
        ? ''
        : `brightness(${bMult}) contrast(${cMult})`;
    }
  }

  // On slider drag: update state + apply CSS preview (BOE-010: no pixel work)
  function _bcOnInput() {
    const b = parseInt(slBright?.value ?? 0);
    const c = parseInt(slContrast?.value ?? 0);
    setState({ filterPreview: { brightness: b, contrast: c } });
    _bcApplyFilter(b, c);
  }

  if (slBright) slBright.addEventListener('input', _bcOnInput);
  if (slContrast) slContrast.addEventListener('input', _bcOnInput);

  // Populate sliders from persisted state on render (BOE-009: populate on render)
  const fp = getState().filterPreview;
  if (fp && slBright && slContrast) {
    slBright.value = fp.brightness || 0;
    slContrast.value = fp.contrast || 0;
    const vb = root.querySelector('#val-bright');
    const vc = root.querySelector('#val-contrast');
    if (vb) vb.textContent = `${fp.brightness || 0}`;
    if (vc) vc.textContent = `${fp.contrast || 0}`;
    // Re-apply CSS filter from persisted state
    _bcApplyFilter(fp.brightness || 0, fp.contrast || 0);
  }

  // Reset button — clear state + clear CSS filter, no bake
  const btnBCReset = root.querySelector('#btn-bc-reset');
  if (btnBCReset) {
    btnBCReset.addEventListener('click', () => {
      setState({ filterPreview: { brightness: 0, contrast: 0 } });
      if (slBright) slBright.value = 0;
      if (slContrast) slContrast.value = 0;
      const vb = root.querySelector('#val-bright');
      const vc = root.querySelector('#val-contrast');
      if (vb) vb.textContent = '0';
      if (vc) vc.textContent = '0';
      const overlay = getOverlayEl();
      if (overlay) overlay.style.filter = '';
    });
  }

  // Equalize histogram — TOGGLE preview (independent of other features)
  // Apply Changes button bakes everything permanently
  const btnHistEq = root.querySelector('#btn-hist-eq');
  if (btnHistEq) {
    // Restore toggle state from previous render
    if (_eqSnapshot) {
      btnHistEq.textContent = '✕ Remove EQ';
      btnHistEq.style.background = '#ef4444';
      btnHistEq.style.color = '#fff';
      btnHistEq.style.fontWeight = '600';
    }
    btnHistEq.addEventListener('click', () => {
      if (!_eqSnapshot) {
        // ON: snapshot current image, equalize
        const img = getLoadedImage();
        if (!img) return;
        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        const snap = document.createElement('canvas');
        snap.width = sw; snap.height = sh;
        snap.getContext('2d').drawImage(img, 0, 0, sw, sh);
        _eqSnapshot = snap;
        equalizeHistogram();
        btnHistEq.textContent = '✕ Remove EQ';
        btnHistEq.style.background = '#ef4444';
        btnHistEq.style.color = '#fff';
        btnHistEq.style.fontWeight = '600';
      } else {
        // OFF: restore pre-EQ snapshot
        setLoadedImage(_eqSnapshot);
        _eqSnapshot = null;
        const t = getState().imageTransform;
        if (t) setState({ imageTransform: { ...t } });
        btnHistEq.textContent = 'Equalize Hist';
        btnHistEq.style.background = 'var(--accent-subtle)';
        btnHistEq.style.color = 'var(--accent)';
        btnHistEq.style.fontWeight = '';
      }
    });
  }

  // ── APPLY CHANGES (B/C + EQ tab) ─────────────────────────
  // Bakes ALL pending effects on this tab into pixels permanently.
  // After apply: sliders reset, EQ toggle reset, snapshots discarded.
  const btnBCApply = root.querySelector('#btn-bc-apply');
  if (btnBCApply) {
    btnBCApply.addEventListener('click', () => {
      const fp = getState().filterPreview;
      const hasBC = fp && (fp.brightness !== 0 || fp.contrast !== 0);
      const hasEQ = !!_eqSnapshot; // EQ is toggled ON (snapshot exists = we can still undo it)

      // No-op guard: nothing to bake
      if (!hasBC && !hasEQ) return;

      // Push undo state BEFORE baking
      pushState();

      // 1. Bake B/C into pixels (if any)
      if (hasBC) {
        adjustBrightnessContrast(fp.brightness, fp.contrast);
      }

      // 2. EQ is already in the pixels (equalize was called on toggle-ON)
      //    Just discard the snapshot so it can't be un-toggled
      _eqSnapshot = null;

      // 3. Reset all UI state
      setState({ filterPreview: { brightness: 0, contrast: 0 } });
      if (slBright) slBright.value = 0;
      if (slContrast) slContrast.value = 0;
      const vb = root.querySelector('#val-bright');
      const vc = root.querySelector('#val-contrast');
      if (vb) vb.textContent = '0';
      if (vc) vc.textContent = '0';
      // Clear CSS filter from overlay (always, covers both B/C and EQ-only cases)
      const overlay = getOverlayEl();
      if (overlay) overlay.style.filter = '';

      // Reset EQ button visual
      if (btnHistEq) {
        btnHistEq.textContent = 'Equalize Hist';
        btnHistEq.style.background = 'var(--accent-subtle)';
        btnHistEq.style.color = 'var(--accent)';
        btnHistEq.style.fontWeight = '';
      }

      // 4. Null ALL enhancement snapshots (BOE-037)
      _sharpSnapshot = null;

      // 5. Trigger re-render
      const t = getState().imageTransform;
      if (t) setState({ imageTransform: { ...t } });
    });
  }

  // ── Sharpen — LIVE via snapshot + re-convolution ────────
  // BOE-031: Snapshot created on entry, discarded on exit
  const slSharpAmt = root.querySelector('#sl-sharp-amt');
  let _sharpDebounce = null;

  // Populate slider from persisted state
  const sp = getState().sharpenPreview;
  if (sp && slSharpAmt) {
    slSharpAmt.value = sp.amount || 0;
    const vs = root.querySelector('#val-sharp-amt');
    if (vs) vs.textContent = `${sp.amount || 0}%`;
  }

  function _sharpApply() {
    const amt = parseInt(slSharpAmt?.value ?? 0);
    setState({ sharpenPreview: { amount: amt } });

    if (amt === 0) {
      // Restore to snapshot (no sharpening)
      if (_sharpSnapshot) {
        setLoadedImage(_sharpSnapshot);
        const t = getState().imageTransform;
        if (t) setState({ imageTransform: { ...t } });
      }
      return;
    }

    // Create snapshot on first use
    if (!_sharpSnapshot) {
      // NOTE: No B/C baking here — B/C is CSS-only, sits on top visually (BOE-029)
      const img = getLoadedImage();
      if (!img) return;
      const sw = img.naturalWidth || img.width;
      const sh = img.naturalHeight || img.height;
      const snap = document.createElement('canvas');
      snap.width = sw; snap.height = sh;
      snap.getContext('2d').drawImage(img, 0, 0, sw, sh);
      _sharpSnapshot = snap;
    }

    // Re-convolve from snapshot at current amount
    const amount = amt * 0.015; // 0→0, 100→1.5 (commercial range)
    const sw = _sharpSnapshot.width, sh = _sharpSnapshot.height;
    const srcCtx = _sharpSnapshot.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, sw, sh).data;
    const out = new Uint8ClampedArray(srcData);

    const a = amount;
    const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];

    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * sw + (x + kx)) * 4 + c;
              sum += srcData[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          out[(y * sw + x) * 4 + c] = sum;
        }
      }
    }

    const result = document.createElement('canvas');
    result.width = sw; result.height = sh;
    result.getContext('2d').putImageData(new ImageData(out, sw, sh), 0, 0);
    setLoadedImage(result);
    const t = getState().imageTransform;
    if (t) setState({ imageTransform: { ...t } });
  }

  if (slSharpAmt) {
    slSharpAmt.addEventListener('input', () => {
      clearTimeout(_sharpDebounce);
      _sharpDebounce = setTimeout(_sharpApply, 80); // Debounce 80ms
    });
  }

  // NOTE: No tab-exit subscriber — snapshot persists across tabs (BOE-029)
  // bakeAllPending() handles snapshot cleanup when a destructive op needs it

   // Reset button — same as manually sliding to 0 (BOE-036)
  const btnSharpReset = root.querySelector('#btn-sharp-reset');
  if (btnSharpReset) {
    btnSharpReset.addEventListener('click', () => {
      if (slSharpAmt) slSharpAmt.value = 0;
      const vs = root.querySelector('#val-sharp-amt');
      if (vs) vs.textContent = '0%';
      setState({ sharpenPreview: { amount: 0 } });
      _sharpApply(); // Same effect as dragging slider to 0
    });
  }

  // ── APPLY CHANGES (Sharpen tab) ──────────────────────────
  // Bakes current sharpen into pixels permanently.
  // After apply: slider resets to 0, snapshot discarded.
  const btnSharpApply = root.querySelector('#btn-sharp-apply');
  if (btnSharpApply) {
    btnSharpApply.addEventListener('click', () => {
      const amt = getState().sharpenPreview?.amount || 0;

      // No-op guard: nothing to bake
      if (amt === 0 && !_sharpSnapshot) return;

      // Push undo state BEFORE baking
      pushState();

      // Sharpen is already applied to loadedImageElement by the live slider.
      // Just discard the snapshot (sharpen is permanent now).
      _sharpSnapshot = null;

      // Reset slider to 0 — "0" now means "no additional sharpen"
      if (slSharpAmt) slSharpAmt.value = 0;
      const vs = root.querySelector('#val-sharp-amt');
      if (vs) vs.textContent = '0%';
      setState({ sharpenPreview: { amount: 0 } });

      // Null EQ snapshot too (BOE-037 — pixel base changed)
      _eqSnapshot = null;

      // Trigger re-render
      const t = getState().imageTransform;
      if (t) setState({ imageTransform: { ...t } });
    });
  }

  // ── Blur + Noise — Unified Compose Pipeline (BOE-064/065) ──
  {
    const selBlurMethod = root.querySelector('#sel-blur-method');
    const slKern = root.querySelector('#sl-kern');
    const btnBlurReset = root.querySelector('#btn-blur-reset');
    const btnBlurApply = root.querySelector('#btn-blur-apply');
    const selNoiseType = root.querySelector('#sel-noise-type');
    const slNoiseAmt = root.querySelector('#sl-noise-amt');
    const btnNoiseReset = root.querySelector('#btn-noise-reset');
    const btnNoiseApply = root.querySelector('#btn-noise-apply');
    let _filterDebounce = null;
    let _filterLastKey = ''; // BOE-119: memoization to skip redundant compute

    // Compose: restore original → blur (if active) → noise (if active)
    function _filterCompose() {
      const blurK = parseInt(slKern?.value || 1);
      const blurMethod = selBlurMethod?.value || 'gaussian';
      const noiseType = selNoiseType?.value || 'none';
      const noiseAmt = parseInt(slNoiseAmt?.value || 5);
      const blurActive = blurK > 1;
      const noiseActive = noiseType !== 'none';

      // BOE-119: Skip if same params as last preview
      const key = `${blurMethod}_${blurK}_${noiseType}_${noiseAmt}`;
      if (key === _filterLastKey && _filterTabSnapshot) return;
      _filterLastKey = key;

      if (!blurActive && !noiseActive) {
        // Both neutral — restore original if snapshot exists
        if (_filterTabSnapshot) { _restoreFromSnapshot(_filterTabSnapshot); _filterTabSnapshot = null; }
        return;
      }

      // Take tab-level snapshot on first interaction
      if (!_filterTabSnapshot) _filterTabSnapshot = _cloneLoadedImage();
      if (!_filterTabSnapshot) return;

      clearTimeout(_filterDebounce);
      _filterDebounce = setTimeout(() => {
        // Step 1: restore clean base (NO re-render — BOE-069)
        _restoreQuiet(_filterTabSnapshot);

        // Step 2: apply blur if active
        if (blurActive) {
          const method = selBlurMethod?.value || 'gaussian';
          const k = blurK | 1; // BOE-053: force odd
          if (method === 'gaussian') gaussianBlur(k);
          else if (method === 'box') boxBlur(k);
          else if (method === 'median') medianFilter(k);
          else if (method === 'bilateral') bilateralFilter(k);
        }

        // Step 3: apply noise on top if active
        if (noiseActive) {
          const amt = parseInt(slNoiseAmt?.value || 5);
          if (noiseType === 'sp') addNoiseSP(amt / 100);
          else if (noiseType === 'gaussian') addNoiseGaussian(amt * 5);
        }

        // If only noise was active (no blur), FilterService already triggered
        // setState via _applyToImage. If nothing applied, trigger render manually.
        if (!blurActive && !noiseActive) {
          const t = getState().imageTransform;
          if (t) setState({ imageTransform: { ...t } });
        }
      }, 200); // BOE-052: debounce for heavy ops
    }

    // Wire blur controls
    if (slKern) slKern.addEventListener('input', _filterCompose);
    if (selBlurMethod) selBlurMethod.addEventListener('change', _filterCompose);

    // Wire noise controls
    if (selNoiseType) selNoiseType.addEventListener('change', _filterCompose);
    if (slNoiseAmt) slNoiseAmt.addEventListener('input', () => {
      if (selNoiseType?.value && selNoiseType.value !== 'none') _filterCompose();
    });

    // Blur Reset — resets blur only, re-composes noise if active
    if (btnBlurReset) btnBlurReset.addEventListener('click', () => {
      if (slKern) slKern.value = 1;
      const vK = root.querySelector('#val-kern');
      if (vK) vK.textContent = '1';
      _filterCompose(); // Re-compose with blur neutralized
    });

    // Noise Reset — resets noise only, re-composes blur if active
    if (btnNoiseReset) btnNoiseReset.addEventListener('click', () => {
      if (selNoiseType) selNoiseType.value = 'none';
      if (slNoiseAmt) slNoiseAmt.value = 5;
      const vA = root.querySelector('#val-noise-amt');
      if (vA) vA.textContent = '5%';
      _filterCompose(); // Re-compose with noise neutralized
    });

    // Blur Apply — bakes everything in the tab
    if (btnBlurApply) btnBlurApply.addEventListener('click', () => {
      if (!_filterTabSnapshot) return; // No-op guard (BOE-032)
      pushState();
      _filterTabSnapshot = null;
      _nullAllSnapshots();
      // Reset both controls
      if (slKern) slKern.value = 1;
      const vK = root.querySelector('#val-kern');
      if (vK) vK.textContent = '1';
      if (selNoiseType) selNoiseType.value = 'none';
      if (slNoiseAmt) slNoiseAmt.value = 5;
      const vA = root.querySelector('#val-noise-amt');
      if (vA) vA.textContent = '5%';
      _flashApplied(btnBlurApply);
      setState({ statusMessage: 'Applied: Blur + Noise' });
    });

    // Noise Apply — also bakes everything (same tab)
    if (btnNoiseApply) btnNoiseApply.addEventListener('click', () => {
      if (!_filterTabSnapshot) return;
      pushState();
      _filterTabSnapshot = null;
      _nullAllSnapshots();
      if (slKern) slKern.value = 1;
      const vK2 = root.querySelector('#val-kern');
      if (vK2) vK2.textContent = '1';
      if (selNoiseType) selNoiseType.value = 'none';
      if (slNoiseAmt) slNoiseAmt.value = 5;
      const vA2 = root.querySelector('#val-noise-amt');
      if (vA2) vA2.textContent = '5%';
      _flashApplied(btnNoiseApply);
      setState({ statusMessage: 'Applied: Blur + Noise' });
    });
  }

  // ── Color Mode + Color Adjust — Unified Compose (BOE-110/113) ──
  {
    const selColorMode = root.querySelector('#sel-color-mode');
    const slHue = root.querySelector('#sl-hue');
    const slSat = root.querySelector('#sl-sat');
    const slLight = root.querySelector('#sl-light');
    const btnColorApply = root.querySelector('#btn-color-apply');
    const btnColorReset = root.querySelector('#btn-color-reset');
    let _colorDebounce = null;
    let _colorLastKey = ''; // BOE-119: memoization

    // Unified compose: snapshot → color mode → HSL
    function _colorCompose() {
      const mode = selColorMode?.value || 'normal';
      const hueShift = parseInt(slHue?.value || 180) - 180;
      const satFactor = parseInt(slSat?.value || 100) / 100;
      const lightShift = parseInt(slLight?.value || 0);
      const modeActive = mode !== 'normal';
      const hslActive = hueShift !== 0 || satFactor !== 1.0 || lightShift !== 0;

      // BOE-119: Memoization
      const key = `${mode}_${hueShift}_${satFactor}_${lightShift}`;
      if (key === _colorLastKey && _colorSnapshot) return;
      _colorLastKey = key;

      if (!modeActive && !hslActive) {
        // Both neutral — restore
        if (_colorSnapshot) { _restoreFromSnapshot(_colorSnapshot); _colorSnapshot = null; }
        _colorLastKey = '';
        return;
      }

      if (!_colorSnapshot) _colorSnapshot = _cloneLoadedImage();
      if (!_colorSnapshot) return;

      clearTimeout(_colorDebounce);
      _colorDebounce = setTimeout(() => {
        const w = _colorSnapshot.width, h = _colorSnapshot.height;
        const src = _colorSnapshot.getContext('2d').getImageData(0, 0, w, h);
        const d = new Uint8ClampedArray(src.data);

        for (let i = 0; i < d.length; i += 4) {
          let r = d[i], g = d[i+1], b = d[i+2];

          // Step 1: Color Mode
          if (mode === 'grayscale') {
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            r = g = b = gray;
          } else if (mode === 'red') {
            g = 0; b = 0;
          } else if (mode === 'green') {
            r = 0; b = 0;
          } else if (mode === 'blue') {
            r = 0; g = 0;
          }

          // Step 2: HSL adjustment (if any)
          if (hslActive) {
            const rn = r/255, gn = g/255, bn = b/255;
            const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn);
            let hh, ss, ll = (max+min)/2;
            if (max === min) { hh = ss = 0; }
            else {
              const dd = max-min;
              ss = ll > 0.5 ? dd/(2-max-min) : dd/(max+min);
              if (max === rn) hh = ((gn-bn)/dd + (gn<bn?6:0))/6;
              else if (max === gn) hh = ((bn-rn)/dd+2)/6;
              else hh = ((rn-gn)/dd+4)/6;
            }
            hh = hh * 360; ss = ss * 100; ll = ll * 100;
            hh = (hh + hueShift + 360) % 360;
            ss = Math.min(100, Math.max(0, ss * satFactor));
            ll = Math.min(100, Math.max(0, ll + lightShift));
            ss /= 100; ll /= 100;
            if (ss === 0) { r = g = b = Math.round(ll * 255); }
            else {
              const q = ll < 0.5 ? ll*(1+ss) : ll+ss-ll*ss;
              const p = 2*ll-q;
              const hk = hh/360;
              const hue2rgb = (pp,qq,tt) => { if(tt<0)tt+=1;if(tt>1)tt-=1;if(tt<1/6)return pp+(qq-pp)*6*tt;if(tt<1/2)return qq;if(tt<2/3)return pp+(qq-pp)*(2/3-tt)*6;return pp; };
              r = Math.round(hue2rgb(p,q,hk+1/3)*255);
              g = Math.round(hue2rgb(p,q,hk)*255);
              b = Math.round(hue2rgb(p,q,hk-1/3)*255);
            }
          }

          d[i] = r; d[i+1] = g; d[i+2] = b;
        }

        const result = document.createElement('canvas');
        result.width = w; result.height = h;
        result.getContext('2d').putImageData(new ImageData(d, w, h), 0, 0);
        setLoadedImage(result);
        const t = getState().imageTransform;
        if (t) setState({ imageTransform: { ...t } });
      }, 100);
    }

    // Wire Color Mode dropdown
    if (selColorMode) selColorMode.addEventListener('change', _colorCompose);

    // Wire HSL sliders
    if (slHue) slHue.addEventListener('input', _colorCompose);
    if (slSat) slSat.addEventListener('input', _colorCompose);
    if (slLight) slLight.addEventListener('input', _colorCompose);

    // Apply Changes — bakes both Color Mode + HSL permanently
    if (btnColorApply) btnColorApply.addEventListener('click', () => {
      const mode = selColorMode?.value || 'normal';
      const hueShift = parseInt(slHue?.value || 180) - 180;
      const satFactor = parseInt(slSat?.value || 100) / 100;
      const lightShift = parseInt(slLight?.value || 0);

      if (mode === 'normal' && hueShift === 0 && satFactor === 1.0 && lightShift === 0 && !_colorSnapshot) return;

      if (!_colorSnapshot) {
        // No preview active — apply directly
        pushState('Color Adjust');
        if (mode === 'grayscale') { toGrayscale(); }
        else if (mode === 'red') { channelRed(); }
        else if (mode === 'green') { channelGreen(); }
        else if (mode === 'blue') { channelBlue(); }
        if (hueShift !== 0 || satFactor !== 1.0 || lightShift !== 0) {
          adjustColor(hueShift, satFactor, lightShift);
        }
      } else {
        pushState('Color Adjust');
        _colorSnapshot = null;
      }
      _nullAllSnapshots();
      _colorLastKey = '';
      // Reset all controls
      if (selColorMode) selColorMode.value = 'normal';
      if (slHue) slHue.value = 180;
      if (slSat) slSat.value = 100;
      if (slLight) slLight.value = 0;
      const vH = root.querySelector('#val-hue'); if (vH) vH.textContent = '180°';
      const vS = root.querySelector('#val-sat'); if (vS) vS.textContent = '100%';
      const vL = root.querySelector('#val-light'); if (vL) vL.textContent = '0';
      _flashApplied(btnColorApply);
      setState({ statusMessage: 'Applied: Color' });
    });

    // Reset — restores snapshot + resets all controls
    if (btnColorReset) btnColorReset.addEventListener('click', () => {
      if (_colorSnapshot) {
        _restoreFromSnapshot(_colorSnapshot);
        _colorSnapshot = null;
      }
      _colorLastKey = '';
      if (selColorMode) selColorMode.value = 'normal';
      if (slHue) slHue.value = 180;
      if (slSat) slSat.value = 100;
      if (slLight) slLight.value = 0;
      const vH = root.querySelector('#val-hue'); if (vH) vH.textContent = '180°';
      const vS = root.querySelector('#val-sat'); if (vS) vS.textContent = '100%';
      const vL = root.querySelector('#val-light'); if (vL) vL.textContent = '0';
    });
  }

  // ── Threshold + Morphology — Unified Compose Pipeline (BOE-067/068) ──
  {
    const selThreshMethod = root.querySelector('#sel-thresh-method');
    const slThresh = root.querySelector('#sl-thresh');
    const btnThreshReset = root.querySelector('#btn-thresh-reset');
    const btnThreshApply = root.querySelector('#btn-thresh-apply');
    const btnErode = root.querySelector('#btn-erode');
    const btnDilate = root.querySelector('#btn-dilate');
    const slMorphK = root.querySelector('#sl-morph-k');
    const selMorphShape = root.querySelector('#sel-morph-shape');
    const btnMorphReset = root.querySelector('#btn-morph-reset');
    const btnMorphApply = root.querySelector('#btn-morph-apply');
    let _threshComposeDebounce = null;
    let _activeMorph = null; // 'erode' | 'dilate' | null
    let _threshLastKey = ''; // BOE-119: memoization

    // Structuring element (inline copy — BOE-059)
    function _makeSE(k, shape) {
      const half = Math.floor(k / 2);
      const se = [];
      for (let y = -half; y <= half; y++) {
        for (let x = -half; x <= half; x++) {
          if (shape === 'cross') { if (x === 0 || y === 0) se.push([y, x]); }
          else if (shape === 'ellipse') {
            if ((x*x)/(half*half+0.01) + (y*y)/(half*half+0.01) <= 1) se.push([y, x]);
          } else { se.push([y, x]); }
        }
      }
      return se;
    }

    // Compose: original → threshold (if active) → morphology (if active)
    function _threshCompose() {
      const threshMethod = selThreshMethod?.value || 'none';
      const morphK = parseInt(slMorphK?.value || 0);
      const threshVal = parseInt(slThresh?.value || 128);
      const morphShape = selMorphShape?.value || 'rect';
      const threshActive = threshMethod !== 'none';
      const morphActive = _activeMorph !== null && morphK > 0;

      // BOE-119: Skip if same params
      const key = `${threshMethod}_${threshVal}_${_activeMorph}_${morphK}_${morphShape}`;
      if (key === _threshLastKey && _threshTabSnapshot) return;
      _threshLastKey = key;

      if (!threshActive && !morphActive) {
        if (_threshTabSnapshot) { _restoreFromSnapshot(_threshTabSnapshot); _threshTabSnapshot = null; }
        return;
      }

      // Take tab-level snapshot on first interaction
      if (!_threshTabSnapshot) _threshTabSnapshot = _cloneLoadedImage();
      if (!_threshTabSnapshot) return;

      clearTimeout(_threshComposeDebounce);
      _threshComposeDebounce = setTimeout(() => {
        const w = _threshTabSnapshot.width, h = _threshTabSnapshot.height;
        const srcData = _threshTabSnapshot.getContext('2d').getImageData(0, 0, w, h);
        // We'll work on a copy of the pixel data through the pipeline
        let currentData = new Uint8ClampedArray(srcData.data);

        // ── Step 1: Threshold (if active) ──
        if (threshActive) {
          const gray = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            const idx = i * 4;
            gray[i] = Math.round(0.299 * currentData[idx] + 0.587 * currentData[idx+1] + 0.114 * currentData[idx+2]);
          }

          let thresh = parseInt(slThresh?.value || 128);
          const threshResult = new Uint8Array(w * h);

          if (threshMethod === 'otsu') {
            const hist = new Uint32Array(256);
            for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
            const total = gray.length;
            let sumAll = 0;
            for (let i = 0; i < 256; i++) sumAll += i * hist[i];
            let sumB = 0, wB = 0, maxVar = 0;
            for (let t = 0; t < 256; t++) {
              wB += hist[t]; if (wB === 0) continue;
              const wF = total - wB; if (wF === 0) break;
              sumB += t * hist[t];
              const mB = sumB / wB, mF = (sumAll - sumB) / wF;
              const variance = wB * wF * (mB - mF) * (mB - mF);
              if (variance > maxVar) { maxVar = variance; thresh = t; }
            }
            if (slThresh) slThresh.value = thresh;
            const vT = root.querySelector('#val-thresh');
            if (vT) vT.textContent = `${thresh}`;
          }

          if (threshMethod === 'adaptive') {
            const blockSize = 11, half = 5, C = 2;
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                let sum = 0, count = 0;
                for (let ky = -half; ky <= half; ky++) {
                  for (let kx = -half; kx <= half; kx++) {
                    const sy = Math.min(h-1, Math.max(0, y+ky));
                    const sx = Math.min(w-1, Math.max(0, x+kx));
                    sum += gray[sy * w + sx]; count++;
                  }
                }
                threshResult[y * w + x] = gray[y * w + x] > (sum / count) - C ? 255 : 0;
              }
            }
          } else {
            for (let i = 0; i < gray.length; i++) {
              threshResult[i] = gray[i] >= thresh ? 255 : 0;
            }
          }

          // Write threshold result into currentData
          for (let i = 0; i < w * h; i++) {
            currentData[i*4] = threshResult[i];
            currentData[i*4+1] = threshResult[i];
            currentData[i*4+2] = threshResult[i];
            currentData[i*4+3] = 255;
          }
        }

        // ── Step 2: Morphology on top (if active) ──
        if (morphActive) {
          const kOdd = morphK | 1;
          const se = _makeSE(kOdd, selMorphShape?.value || 'rect');
          const morphOut = new Uint8ClampedArray(currentData.length);

          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (_activeMorph === 'erode') {
                let minR = 255, minG = 255, minB = 255;
                for (const [dy, dx] of se) {
                  const sy = Math.min(h-1, Math.max(0, y+dy));
                  const sx = Math.min(w-1, Math.max(0, x+dx));
                  const idx = (sy*w+sx)*4;
                  minR = Math.min(minR, currentData[idx]);
                  minG = Math.min(minG, currentData[idx+1]);
                  minB = Math.min(minB, currentData[idx+2]);
                }
                const oidx = (y*w+x)*4;
                morphOut[oidx]=minR; morphOut[oidx+1]=minG; morphOut[oidx+2]=minB; morphOut[oidx+3]=currentData[oidx+3];
              } else {
                let maxR = 0, maxG = 0, maxB = 0;
                for (const [dy, dx] of se) {
                  const sy = Math.min(h-1, Math.max(0, y+dy));
                  const sx = Math.min(w-1, Math.max(0, x+dx));
                  const idx = (sy*w+sx)*4;
                  maxR = Math.max(maxR, currentData[idx]);
                  maxG = Math.max(maxG, currentData[idx+1]);
                  maxB = Math.max(maxB, currentData[idx+2]);
                }
                const oidx = (y*w+x)*4;
                morphOut[oidx]=maxR; morphOut[oidx+1]=maxG; morphOut[oidx+2]=maxB; morphOut[oidx+3]=currentData[oidx+3];
              }
            }
          }
          currentData = morphOut;
        }

        // ── Write final result ──
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').putImageData(new ImageData(currentData, w, h), 0, 0);
        setLoadedImage(canvas);
        const t = getState().imageTransform;
        if (t) setState({ imageTransform: { ...t } });
      }, 150); // BOE-046/070: 150ms debounce
    }

    // Wire threshold controls
    if (selThreshMethod) selThreshMethod.addEventListener('change', _threshCompose);
    if (slThresh) slThresh.addEventListener('input', () => {
      if (selThreshMethod?.value && selThreshMethod.value !== 'none') _threshCompose();
    });

    // Wire morphology toggle (radio-style — one active max)
    function _toggleMorph(which, btn) {
      if (_activeMorph === which) {
        _activeMorph = null;
        btn.classList.remove('active');
      } else {
        _activeMorph = which;
        if (btnErode) btnErode.classList.toggle('active', which === 'erode');
        if (btnDilate) btnDilate.classList.toggle('active', which === 'dilate');
      }
      _threshCompose();
    }
    if (btnErode) btnErode.addEventListener('click', () => _toggleMorph('erode', btnErode));
    if (btnDilate) btnDilate.addEventListener('click', () => _toggleMorph('dilate', btnDilate));

    // Wire morphology slider/shape
    if (slMorphK) slMorphK.addEventListener('input', () => { if (_activeMorph) _threshCompose(); });
    if (selMorphShape) selMorphShape.addEventListener('change', () => { if (_activeMorph) _threshCompose(); });

    // Threshold Reset — resets threshold only, re-composes morph if active
    if (btnThreshReset) btnThreshReset.addEventListener('click', () => {
      if (selThreshMethod) selThreshMethod.value = 'none';
      if (slThresh) slThresh.value = 128;
      const vT = root.querySelector('#val-thresh');
      if (vT) vT.textContent = '128';
      _threshCompose();
    });

    // Morphology Reset — resets morph only, re-composes threshold if active
    if (btnMorphReset) btnMorphReset.addEventListener('click', () => {
      _activeMorph = null;
      if (btnErode) btnErode.classList.remove('active');
      if (btnDilate) btnDilate.classList.remove('active');
      if (slMorphK) slMorphK.value = 0;
      const vK = root.querySelector('#val-morph-k');
      if (vK) vK.textContent = '0';
      _threshCompose();
    });

    // Threshold Apply — bakes everything in the tab
    if (btnThreshApply) btnThreshApply.addEventListener('click', () => {
      if (!_threshTabSnapshot) return;
      pushState();
      _threshTabSnapshot = null;
      _nullAllSnapshots();
      if (selThreshMethod) selThreshMethod.value = 'none';
      if (slThresh) slThresh.value = 128;
      const vT = root.querySelector('#val-thresh');
      if (vT) vT.textContent = '128';
      _activeMorph = null;
      if (btnErode) btnErode.classList.remove('active');
      if (btnDilate) btnDilate.classList.remove('active');
      if (slMorphK) slMorphK.value = 0;
      const vK = root.querySelector('#val-morph-k');
      if (vK) vK.textContent = '0';
      _flashApplied(btnThreshApply);
      setState({ statusMessage: 'Applied: Threshold + Morphology' });
    });

    // Morphology Apply — also bakes everything (same tab)
    if (btnMorphApply) btnMorphApply.addEventListener('click', () => {
      if (!_threshTabSnapshot) return;
      pushState();
      _threshTabSnapshot = null;
      _nullAllSnapshots();
      if (selThreshMethod) selThreshMethod.value = 'none';
      if (slThresh) slThresh.value = 128;
      const vT2 = root.querySelector('#val-thresh');
      if (vT2) vT2.textContent = '128';
      _activeMorph = null;
      if (btnErode) btnErode.classList.remove('active');
      if (btnDilate) btnDilate.classList.remove('active');
      if (slMorphK) slMorphK.value = 0;
      const vK2 = root.querySelector('#val-morph-k');
      if (vK2) vK2.textContent = '0';
      _flashApplied(btnMorphApply);
      setState({ statusMessage: 'Applied: Threshold + Morphology' });
    });
  }

  // ── Edge Detection (C7) — Dropdown + Live Preview ──────
  {
    const selEdgeMethod = root.querySelector('#sel-edge-method');
    const slEdgeT1 = root.querySelector('#sl-edge-t1');
    const slEdgeT2 = root.querySelector('#sl-edge-t2');
    const btnEdgeReset = root.querySelector('#btn-edge-reset');
    const btnEdgeApply = root.querySelector('#btn-edge-apply');
    let _edgeDebounce = null;

    // BOE-106: Grey out sliders for non-Canny methods
    function _updateEdgeSliders(method) {
      const slT1Group = slEdgeT1?.closest('.slider-group');
      const slT2Group = slEdgeT2?.closest('.slider-group');
      const enabled = method === 'canny';
      if (slT1Group) slT1Group.classList.toggle('slider-disabled', !enabled);
      if (slT2Group) slT2Group.classList.toggle('slider-disabled', !enabled);
    }
    // Initialize on render
    _updateEdgeSliders(selEdgeMethod?.value || 'none');

    function _edgePreview() {
      const method = selEdgeMethod?.value || 'none';
      if (method === 'none') {
        if (_edgeSnapshot) { _restoreFromSnapshot(_edgeSnapshot); _edgeSnapshot = null; }
        return;
      }
      if (!_edgeSnapshot) _edgeSnapshot = _cloneLoadedImage();
      if (!_edgeSnapshot) return;

      clearTimeout(_edgeDebounce);
      _edgeDebounce = setTimeout(() => {
        // Restore clean base (no re-render — BOE-069)
        _restoreQuiet(_edgeSnapshot);
        // Apply edge detection (bakes via _applyToImage → setState)
        const t1 = parseInt(slEdgeT1?.value || 50);
        const t2 = parseInt(slEdgeT2?.value || 150);
        if (method === 'canny') cannyEdge(t1, t2);
        else if (method === 'sobel') sobelEdge(3);
        else if (method === 'prewitt') prewittEdge();
        else if (method === 'robert') robertEdge();
        else if (method === 'laplacian') laplacianEdge();
        else if (method === 'log') logEdge(1.0, 5);
      }, 300); // BOE-071: 300ms debounce for Canny (heavy)
    }

    // Live preview on dropdown change
    if (selEdgeMethod) selEdgeMethod.addEventListener('change', () => {
      _updateEdgeSliders(selEdgeMethod.value);
      _edgePreview();
    });
    // Slider live preview only for Canny (BOE-072)
    if (slEdgeT1) slEdgeT1.addEventListener('input', () => {
      if (selEdgeMethod?.value === 'canny') _edgePreview();
    });
    if (slEdgeT2) slEdgeT2.addEventListener('input', () => {
      if (selEdgeMethod?.value === 'canny') _edgePreview();
    });

    // Reset
    if (btnEdgeReset) btnEdgeReset.addEventListener('click', () => {
      if (_edgeSnapshot) { _restoreFromSnapshot(_edgeSnapshot); _edgeSnapshot = null; }
      if (selEdgeMethod) selEdgeMethod.value = 'none';
      if (slEdgeT1) slEdgeT1.value = 50;
      if (slEdgeT2) slEdgeT2.value = 150;
      const vT1 = root.querySelector('#val-edge-t1');
      if (vT1) vT1.textContent = '50';
      const vT2 = root.querySelector('#val-edge-t2');
      if (vT2) vT2.textContent = '150';
    });

    // Apply Changes
    if (btnEdgeApply) btnEdgeApply.addEventListener('click', () => {
      const method = selEdgeMethod?.value || 'none';
      if (method === 'none' && !_edgeSnapshot) return;
      if (_edgeSnapshot) {
        pushState();
        _edgeSnapshot = null;
      } else {
        pushState();
        const t1 = parseInt(slEdgeT1?.value || 50);
        const t2 = parseInt(slEdgeT2?.value || 150);
        if (method === 'canny') cannyEdge(t1, t2);
        else if (method === 'sobel') sobelEdge(3);
        else if (method === 'prewitt') prewittEdge();
        else if (method === 'robert') robertEdge();
        else if (method === 'laplacian') laplacianEdge();
        else if (method === 'log') logEdge(1.0, 5);
      }
      _nullAllSnapshots();
      if (selEdgeMethod) selEdgeMethod.value = 'none';
      if (slEdgeT1) slEdgeT1.value = 50;
      if (slEdgeT2) slEdgeT2.value = 150;
      const vT1 = root.querySelector('#val-edge-t1');
      if (vT1) vT1.textContent = '50';
      const vT2 = root.querySelector('#val-edge-t2');
      if (vT2) vT2.textContent = '150';
      _flashApplied(btnEdgeApply);
      setState({ statusMessage: 'Applied: Edge Detection' });
    });
  }

  // ── Segmentation (C8) — Dropdown + Live Preview ───────
  {
    const selSegMethod = root.querySelector('#sel-seg-method');
    const slSegSens = root.querySelector('#sl-seg-sens');
    const slSegK = root.querySelector('#sl-seg-k');
    const btnSegReset = root.querySelector('#btn-seg-reset');
    const btnSegApply = root.querySelector('#btn-seg-apply');
    let _segDebounce = null;

    // BOE-107: Grey out irrelevant sliders per segmentation method
    function _updateSegSliders(method) {
      const sensGroup = slSegSens?.closest('.slider-group');
      const kGroup = slSegK?.closest('.slider-group');
      if (method === 'none') {
        if (sensGroup) sensGroup.classList.add('slider-disabled');
        if (kGroup) kGroup.classList.add('slider-disabled');
      } else if (method === 'seg_region') {
        if (sensGroup) sensGroup.classList.add('slider-disabled');
        if (kGroup) kGroup.classList.remove('slider-disabled');
      } else {
        // threshold-based or edge-based
        if (sensGroup) sensGroup.classList.remove('slider-disabled');
        if (kGroup) kGroup.classList.add('slider-disabled');
      }
    }
    _updateSegSliders(selSegMethod?.value || 'none');

    function _segPreview() {
      const method = selSegMethod?.value || 'none';
      if (method === 'none') {
        if (_segSnapshot) { _restoreFromSnapshot(_segSnapshot); _segSnapshot = null; }
        return;
      }
      if (!_segSnapshot) _segSnapshot = _cloneLoadedImage();
      if (!_segSnapshot) return;

      clearTimeout(_segDebounce);
      _segDebounce = setTimeout(() => {
        _restoreQuiet(_segSnapshot);
        const sens = parseInt(slSegSens?.value || 128);
        const k = parseInt(slSegK?.value || 4);
        if (method === 'seg_threshold') segThreshold(sens);
        else if (method === 'seg_edge') segEdge(Math.max(20, sens / 2), sens);
        else if (method === 'seg_region') segRegion(k);
      }, 400); // BOE-073: 400ms debounce for K-Means (very heavy)
    }

    // Live preview on dropdown change
    if (selSegMethod) selSegMethod.addEventListener('change', () => {
      _updateSegSliders(selSegMethod.value);
      _segPreview();
    });
    // Slider live preview based on active method
    if (slSegSens) slSegSens.addEventListener('input', () => {
      const m = selSegMethod?.value;
      if (m === 'seg_threshold' || m === 'seg_edge') _segPreview();
    });
    if (slSegK) slSegK.addEventListener('input', () => {
      if (selSegMethod?.value === 'seg_region') _segPreview();
    });

    // Reset
    if (btnSegReset) btnSegReset.addEventListener('click', () => {
      if (_segSnapshot) { _restoreFromSnapshot(_segSnapshot); _segSnapshot = null; }
      if (selSegMethod) selSegMethod.value = 'none';
      if (slSegSens) slSegSens.value = 128;
      if (slSegK) slSegK.value = 4;
      const vS = root.querySelector('#val-seg-sens');
      if (vS) vS.textContent = '128';
      const vK = root.querySelector('#val-seg-k');
      if (vK) vK.textContent = '4';
    });

    // Apply Changes
    if (btnSegApply) btnSegApply.addEventListener('click', () => {
      const method = selSegMethod?.value || 'none';
      if (method === 'none' && !_segSnapshot) return;
      if (_segSnapshot) {
        pushState();
        _segSnapshot = null;
      } else {
        pushState();
        const sens = parseInt(slSegSens?.value || 128);
        const k = parseInt(slSegK?.value || 4);
        if (method === 'seg_threshold') segThreshold(sens);
        else if (method === 'seg_edge') segEdge(Math.max(20, sens / 2), sens);
        else if (method === 'seg_region') segRegion(k);
      }
      _nullAllSnapshots();
      if (selSegMethod) selSegMethod.value = 'none';
      if (slSegSens) slSegSens.value = 128;
      if (slSegK) slSegK.value = 4;
      const vS = root.querySelector('#val-seg-sens');
      if (vS) vS.textContent = '128';
      const vK = root.querySelector('#val-seg-k');
      if (vK) vK.textContent = '4';
      _flashApplied(btnSegApply);
      setState({ statusMessage: 'Applied: Segmentation' });
    });
  }

  // ── AI Recognition (C11 — Interaction Layer Boxes, No Image Mutation) ──
  const btnAI = root.querySelector('#btn-ai-run');
  const btnAIClear = root.querySelector('#btn-ai-clear');
  const resultsEl = root.querySelector('#ai-results');

  // Remove any leftover floating overlay from previous approach
  const _oldOverlay = document.querySelector('#ai-floating-overlay');
  if (_oldOverlay) _oldOverlay.remove();

  // Generate N distinct colors via HSL
  function _aiColor(i, total) {
    const hue = Math.round((i * 360) / Math.max(total, 1));
    return `hsl(${hue}, 90%, 55%)`;
  }

  // Clear all AI bounding box divs
  function _clearAIBoxes() {
    const el = getAIBoxesEl();
    if (el) el.innerHTML = '';
  }

  // Draw bounding boxes inside the interaction layer using getCanvasMapping
  function _drawAIBoxes(detections) {
    _clearAIBoxes();
    const boxContainer = getAIBoxesEl();
    if (!boxContainer) return;

    const mapping = getCanvasMapping();
    if (!mapping) return;

    const img = getLoadedImage();
    const t = mapping.imgState;

    // Image-to-canvas scale
    let imgScaleX, imgScaleY, offX, offY;
    if (t && img) {
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      imgScaleX = t.width / imgW;
      imgScaleY = t.height / imgH;
      offX = t.x;
      offY = t.y;
    } else {
      imgScaleX = 1;
      imgScaleY = 1;
      offX = 0;
      offY = 0;
    }

    detections.forEach((d, i) => {
      const color = _aiColor(i, detections.length);
      const b = d.bbox;

      // Image-space → canvas-space
      const cx = offX + b.x * imgScaleX;
      const cy = offY + b.y * imgScaleY;
      const bw = b.w * imgScaleX;
      const bh = b.h * imgScaleY;

      // Canvas-space → screen-space (relative to interaction layer parent)
      const screenX = mapping.canvasOffX + cx * mapping.scaleX;
      const screenY = mapping.canvasOffY + cy * mapping.scaleY;
      const screenW = bw * mapping.scaleX;
      const screenH = bh * mapping.scaleY;

      const box = document.createElement('div');
      box.className = 'ai-detection-box';
      box.style.cssText = `
        position:absolute;
        left:${screenX}px;
        top:${screenY}px;
        width:${screenW}px;
        height:${screenH}px;
        border:2px solid ${color};
        box-sizing:border-box;
        pointer-events:none;
      `;

      // Label
      const label = document.createElement('span');
      label.className = 'ai-box-label';
      label.style.background = color;
      label.textContent = `${d.label} ${d.confidence}%`;
      box.appendChild(label);

      boxContainer.appendChild(box);
    });
  }

  if (btnAI) {

    btnAI.addEventListener('click', async () => {
      const target = root.querySelector('#sel-ai-target')?.value || 'all';
      const conf = parseInt(root.querySelector('#sl-ai-conf')?.value || 40) / 100;

      // Loading state
      btnAI.innerHTML = '<span class="ai-spinner"></span> Detecting...';
      btnAI.disabled = true;
      btnAI.style.opacity = '0.7';
      if (btnAIClear) btnAIClear.style.display = 'none';
      if (resultsEl) resultsEl.innerHTML = '';
      _clearAIBoxes();

      let detections = [];
      try {
        detections = await recognizeOnly(target, conf);
      } catch (err) {
        if (resultsEl) {
          const msg = err.message?.includes('fetch') || err.message?.includes('Backend')
            ? 'Backend not reachable. Is the Flask server running on port 5000?'
            : err.message || 'Detection failed';
          resultsEl.innerHTML = `<div style="color:var(--error);padding:4px 0">⚠ ${msg}</div>`;
        }
      }

      // Restore button
      btnAI.innerHTML = 'Run Recognition';
      btnAI.disabled = false;
      btnAI.style.opacity = '1';

      // Draw floating boxes
      if (detections.length > 0) {
        _drawAIBoxes(detections);
        if (btnAIClear) btnAIClear.style.display = '';
      }

      // Render results list in panel
      if (resultsEl && detections.length > 0) {
        const header = `<div style="font-weight:600;padding:4px 0;color:var(--text-primary)">Found ${detections.length} object${detections.length !== 1 ? 's' : ''}</div>`;
        const cards = detections.map((d, i) =>
          `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border-subtle)">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${_aiColor(i, detections.length)};flex-shrink:0"></span>
            <span style="font-weight:500;color:var(--text-primary)">${d.label}</span>
            <span style="margin-left:auto;color:var(--accent);font-weight:600">${d.confidence}%</span>
          </div>`
        ).join('');
        resultsEl.innerHTML = header + cards;
      } else if (resultsEl && detections.length === 0 && !resultsEl.innerHTML) {
        resultsEl.innerHTML = '<em style="color:var(--text-muted)">No objects detected. Try lowering confidence.</em>';
      }
    });
  }

  // Clear button
  if (btnAIClear) {
    btnAIClear.addEventListener('click', () => {
      _clearAIBoxes();
      btnAIClear.style.display = 'none';
      if (resultsEl) resultsEl.innerHTML = '';
    });
  }

  // Auto-clear boxes when switching tools (the state key is 'activeTool')
  subscribe('activeTool', () => {
    _clearAIBoxes();
  });
}

function wireSections(root) {
  root.querySelectorAll('.panel-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });
}
