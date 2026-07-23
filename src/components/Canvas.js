/* PHOTON — Canvas Workspace Component */
import { zoomIn, zoomOut, maximize2 } from '../icons/icons.js';
import { setState, getState, subscribe } from '../utils/state.js';
import { setCanvas, loadImageFile, getOriginalImageData, getImageData, putImageData } from '../services/ImageEngine.js';

export function initCanvas(container) {
  container.innerHTML = `
    <div class="canvas-container" id="canvas-container">
      <div id="canvas-wrapper" style="position:relative;display:inline-block">
        <canvas id="main-canvas"></canvas>
      </div>
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" id="zoom-out-btn" data-tooltip="Zoom Out (Ctrl+-)">${zoomOut()}</button>
      <span class="zoom-level" id="zoom-display" data-tooltip="Zoom Level">100%</span>
      <button class="zoom-btn" id="zoom-in-btn" data-tooltip="Zoom In (Ctrl+=)">${zoomIn()}</button>
      <div class="zoom-divider"></div>
      <button class="zoom-btn" id="zoom-fit-btn" data-tooltip="Fit to Screen (Ctrl+0)">${maximize2()}</button>
      <div class="zoom-divider"></div>
      <button class="compare-btn" id="btn-compare" data-tooltip="Before / After Comparison">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        <span>Compare</span>
      </button>
    </div>
    <!-- Before/After Comparison Modal -->
    <div class="compare-modal hidden" id="compare-modal">
      <div class="compare-backdrop" id="compare-backdrop"></div>
      <div class="compare-content">
        <button class="compare-close" id="compare-close" title="Close">&times;</button>
        <h2 class="compare-title">Before / After Comparison</h2>
        <div class="compare-panels">
          <div class="compare-panel">
            <span class="compare-label">Original (Before)</span>
            <div class="compare-canvas-wrap"><canvas id="compare-before"></canvas></div>
          </div>
          <div class="compare-divider"></div>
          <div class="compare-panel">
            <span class="compare-label">Current (After)</span>
            <div class="compare-canvas-wrap"><canvas id="compare-after"></canvas></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Register canvas with ImageEngine ─────────────────────
  const canvas = container.querySelector('#main-canvas');
  setCanvas(canvas);

  // Welcome screen gets overlaid here by WelcomeScreen.js
  // Mark as no-image initially
  container.classList.add('no-image');

  // ── Zoom controls ────────────────────────────────────────
  const display = container.querySelector('#zoom-display');
  const canvasContainer = container.querySelector('#canvas-container');
  let panX = 0, panY = 0;

  const canvasWrapper = container.querySelector('#canvas-wrapper');

  function applyTransform(z) {
    const scale = z / 100;
    const t = `translate(${panX}px, ${panY}px) scale(${scale})`;
    canvasWrapper.style.transform = t;
    canvasWrapper.style.transformOrigin = 'center center';
  }

  container.querySelector('#zoom-in-btn').addEventListener('click', () => {
    const z = Math.min(getState().zoomLevel + 25, 500);
    setState({ zoomLevel: z });
  });

  container.querySelector('#zoom-out-btn').addEventListener('click', () => {
    const z = Math.max(getState().zoomLevel - 25, 25);
    setState({ zoomLevel: z });
  });

  container.querySelector('#zoom-fit-btn').addEventListener('click', () => {
    // Smart fit: compute zoom to fit image within viewport
    const cw = canvasContainer.clientWidth;
    const ch = canvasContainer.clientHeight;
    const iw = canvas.width;
    const ih = canvas.height;
    if (iw && ih) {
      const fitZoom = Math.min((cw / iw) * 100, (ch / ih) * 100, 200);
      panX = 0; panY = 0;
      setState({ zoomLevel: Math.round(Math.max(10, fitZoom)) });
    } else {
      panX = 0; panY = 0;
      setState({ zoomLevel: 100 });
    }
  });

  subscribe('zoomLevel', (z) => {
    display.textContent = `${z}%`;
    applyTransform(z);
  });

  // ── Mouse wheel zoom ─────────────────────────────────────
  canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    const newZoom = Math.max(10, Math.min(500, getState().zoomLevel + delta));
    setState({ zoomLevel: newZoom });
  }, { passive: false });

  // ── Space + drag pan ──────────────────────────────────────
  let isPanning = false, panStartX = 0, panStartY = 0;
  let spaceDown = false;

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      spaceDown = true;
      canvasContainer.style.cursor = 'grab';
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      isPanning = false;
      canvasContainer.style.cursor = '';
    }
  });

  canvasContainer.addEventListener('mousedown', (e) => {
    // Space+click or middle-click to pan
    if (spaceDown || e.button === 1) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      canvasContainer.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    applyTransform(getState().zoomLevel);
  });

  document.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      canvasContainer.style.cursor = spaceDown ? 'grab' : '';
    }
  });

  // ── Drag & Drop ──────────────────────────────────────────
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.add('drag-over');
  });

  container.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove('drag-over');
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImageFile(file);
    }
  });

  // ── Mouse position tracking for StatusBar ────────────────
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const zoom = getState().zoomLevel / 100;
    const x = Math.round((e.clientX - rect.left) / zoom);
    const y = Math.round((e.clientY - rect.top) / zoom);
    if (x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height) {
      setState({ cursorPos: { x, y } });
    }
  });

  canvas.addEventListener('mouseleave', () => {
    setState({ cursorPos: null });
  });

  // ── Before/After Comparison Modal (BOE-122/123) ─────────
  const btnCompare = container.querySelector('#btn-compare');
  const compareModal = container.querySelector('#compare-modal');
  const compareClose = container.querySelector('#compare-close');
  const compareBackdrop = container.querySelector('#compare-backdrop');
  const compareBefore = container.querySelector('#compare-before');
  const compareAfter = container.querySelector('#compare-after');

  function _openCompare() {
    const original = getOriginalImageData();
    const current = getImageData();
    if (!original || !current) {
      setState({ statusMessage: 'No image to compare' });
      return;
    }

    // Render original to left canvas
    compareBefore.width = original.width;
    compareBefore.height = original.height;
    compareBefore.getContext('2d').putImageData(original, 0, 0);

    // Render current to right canvas
    compareAfter.width = current.width;
    compareAfter.height = current.height;
    compareAfter.getContext('2d').putImageData(current, 0, 0);

    // Show modal
    compareModal.classList.remove('hidden');
  }

  function _closeCompare() {
    compareModal.classList.add('hidden');
  }

  if (btnCompare) btnCompare.addEventListener('click', _openCompare);
  if (compareClose) compareClose.addEventListener('click', _closeCompare);
  if (compareBackdrop) compareBackdrop.addEventListener('click', _closeCompare);

  // Escape key closes modal (BOE-122)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !compareModal.classList.contains('hidden')) {
      _closeCompare();
      e.stopPropagation();
    }
  });

  // ── Image loaded state ──────────────────────────────────
  subscribe('imageLoaded', (loaded) => {
    container.classList.toggle('no-image', !loaded);
    container.classList.toggle('has-project', loaded);
    if (loaded) {
      // Auto fit-to-view on first load
      panX = 0; panY = 0;
      setTimeout(() => {
        container.querySelector('#zoom-fit-btn').click();
      }, 50);
    } else {
      container.classList.remove('transparent-bg');
    }
  });

  // ── Transparent background detection ────────────────────
  subscribe('projectBackground', (bg) => {
    container.classList.toggle('transparent-bg', bg === 'transparent');
  });
}
