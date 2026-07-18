/* PHOTON — Interaction Layer */
import { setState, getState, subscribe } from '../utils/state.js';
import { getCanvas, getCtx, getLoadedImage, setLoadedImage } from '../services/ImageEngine.js';
import { apiPost } from '../utils/api.js';

// ── Internal state ──────────────────────────────────────────
let imgState = null;      // { x, y, width, height, rotation } in canvas-space px
let isDragging = false;
let isResizing = false;
let activeHandle = null;  // 'nw' | 'ne' | 'sw' | 'se'
let dragStart = { x: 0, y: 0 };
let stateStart = null;    // snapshot of imgState at drag/resize start
let selected = false;
let layerEl = null;
let selectBoxEl = null;
let imgOverlayEl = null;
let canvasBorderEl = null;
let workspace = null;
let initialDims = null; // { width, height } at selection time — to detect if resize happened
let _lastOverlayImg = null; // cache to avoid expensive toDataURL on every imageTransform change

/** Expose overlay img element for CSS filter preview (used by PropertiesPanel) */
export function getOverlayEl() { return imgOverlayEl; }

/** Expose AI boxes container for CNN detection overlays */
export function getAIBoxesEl() { return layerEl ? layerEl.querySelector('#ai-boxes') : null; }

/** Get canvas-to-screen mapping for positioning overlays */
export function getCanvasMapping() {
  if (!layerEl || !imgState) return null;
  const canvas = getCanvas();
  if (!canvas) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = layerEl.parentElement.getBoundingClientRect();
  const canvasOffX = canvasRect.left - containerRect.left;
  const canvasOffY = canvasRect.top - containerRect.top;
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;
  return { canvasOffX, canvasOffY, scaleX, scaleY, imgState: { ...imgState }, cw: canvas.width, ch: canvas.height };
}

// ── Crop state ──────────────────────────────────────────────
let cropOverlayEl = null;   // root crop overlay container
let cropWindowEl = null;    // the clear crop window
let cropDimEls = {};        // { top, bottom, left, right } dim overlays
let isCropMode = false;
let isCropDragging = false;
let isCropResizing = false;
let cropActiveHandle = null;
let cropDragStart = { x: 0, y: 0 };
let cropStateStart = null;  // snapshot of cropRegion at drag start

// ── Export: redraw canvas with image at current imgState ─────
export function commitImageToCanvas() {
  const canvas = getCanvas();
  const ctx = getCtx();
  const img = getLoadedImage();
  if (!canvas || !ctx || !img || !imgState) return;

  // Redraw background
  const bg = getState().projectBackground;
  if (bg === 'transparent') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = bg || '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw image at current position/size WITH rotation
  const rot = imgState.rotation || 0;
  if (rot !== 0) {
    const cx = imgState.x + imgState.width / 2;
    const cy = imgState.y + imgState.height / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -imgState.width / 2, -imgState.height / 2, imgState.width, imgState.height);
    ctx.restore();
  } else {
    ctx.drawImage(img, imgState.x, imgState.y, imgState.width, imgState.height);
  }
}

// ── Initialize ──────────────────────────────────────────────
export function initInteractionLayer(container) {
  workspace = container;

  // Create the layer structure
  layerEl = document.createElement('div');
  layerEl.className = 'interaction-layer';
  layerEl.id = 'interaction-layer';
  layerEl.innerHTML = '<img class="img-overlay" id="img-overlay" draggable="false" />'
    + '<div id="ai-boxes" style="position:absolute;top:0;left:0;pointer-events:none;z-index:7"></div>'
    + '<div class="canvas-border-outline" id="canvas-border-outline"></div>'
    + '<div class="select-box" id="select-box" style="display:none">'
    +   '<div class="select-handle nw" data-handle="nw"></div>'
    +   '<div class="select-handle ne" data-handle="ne"></div>'
    +   '<div class="select-handle sw" data-handle="sw"></div>'
    +   '<div class="select-handle se" data-handle="se"></div>'
    + '</div>'
    + '<div class="crop-overlay" id="crop-overlay" style="display:none">'
    +   '<div class="crop-dim crop-dim-top"></div>'
    +   '<div class="crop-dim crop-dim-bottom"></div>'
    +   '<div class="crop-dim crop-dim-left"></div>'
    +   '<div class="crop-dim crop-dim-right"></div>'
    +   '<div class="crop-window" id="crop-window">'
    +     '<div class="crop-handle" data-crop-handle="nw"></div>'
    +     '<div class="crop-handle" data-crop-handle="n"></div>'
    +     '<div class="crop-handle" data-crop-handle="ne"></div>'
    +     '<div class="crop-handle" data-crop-handle="e"></div>'
    +     '<div class="crop-handle" data-crop-handle="se"></div>'
    +     '<div class="crop-handle" data-crop-handle="s"></div>'
    +     '<div class="crop-handle" data-crop-handle="sw"></div>'
    +     '<div class="crop-handle" data-crop-handle="w"></div>'
    +     '<div class="crop-grid"></div>'
    +   '</div>'
    + '</div>';
  // Insert into canvas container (sibling of #main-canvas)
  const canvasContainer = container.querySelector('.canvas-container');
  if (canvasContainer) {
    canvasContainer.appendChild(layerEl);
  }

  selectBoxEl = layerEl.querySelector('#select-box');
  imgOverlayEl = layerEl.querySelector('#img-overlay');
  canvasBorderEl = layerEl.querySelector('#canvas-border-outline');
  cropOverlayEl = layerEl.querySelector('#crop-overlay');
  cropWindowEl = layerEl.querySelector('#crop-window');
  cropDimEls = {
    top: layerEl.querySelector('.crop-dim-top'),
    bottom: layerEl.querySelector('.crop-dim-bottom'),
    left: layerEl.querySelector('.crop-dim-left'),
    right: layerEl.querySelector('.crop-dim-right'),
  };

  // ── Event Handlers ──────────────────────────────────────
  layerEl.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // ── State Subscriptions ─────────────────────────────────

  subscribe('imageTransform', (t) => {
    if (!t) {
      hideSelection();
      return;
    }
    imgState = { ...t };

    // Only update overlay src when the image DATA changed (flip/bake), not on every drag/rotation
    if (selected) {
      const img = getLoadedImage();
      if (img && imgOverlayEl && img !== _lastOverlayImg) {
        _lastOverlayImg = img;
        imgOverlayEl.src = img.src || img.toDataURL?.('image/png') || '';
      }
    }

    updateOverlayPosition();
    // Always redraw canvas when transform changes (handles manual input, drag, resize)
    if (getLoadedImage()) {
      commitImageToCanvas();
    }
  });

  subscribe('imageLoaded', (loaded) => {
    if (!loaded) {
      // Full reset — prevent stale state from previous project
      imgState = null;
      selected = false;
      isDragging = false;
      isResizing = false;
      activeHandle = null;
      stateStart = null;
      initialDims = null;
      hideSelection();
    }
  });

  // Interaction layer is always active — selection works from any tool tab
  layerEl.classList.add('active');

  // Update canvas border and overlay on zoom changes (debounced with rAF)
  let _zoomRaf = null;
  subscribe('zoomLevel', () => {
    if (_zoomRaf) cancelAnimationFrame(_zoomRaf);
    _zoomRaf = requestAnimationFrame(() => {
      updateOverlayPosition();
      _zoomRaf = null;
    });
  });

  // ── Crop mode: enter/exit on tool change ───────────────
  subscribe('activeTool', (tool) => {
    if (tool === 'crop') {
      enterCropMode();
    } else if (isCropMode) {
      exitCropMode();
    }
  });

  // ── Crop region subscriber: update overlay position ────
  subscribe('cropRegion', (cr) => {
    if (cr && cr.active) {
      updateCropOverlayPosition();
    }
  });
}

// ── Select/Deselect ─────────────────────────────────────────
function selectImage() {
  if (!imgState || selected) return;
  selected = true;

  const img = getLoadedImage();
  if (img) {
    // img can be Image or Canvas — get a displayable src
    const src = img.src || img.toDataURL?.('image/png') || '';
    imgOverlayEl.src = src;
    _lastOverlayImg = img; // cache reference
    imgOverlayEl.style.display = 'block';
  }

  selectBoxEl.style.display = 'block';
  canvasBorderEl.style.display = 'block';
  updateOverlayPosition();

  // Track dimensions at selection time for Python commit check
  initialDims = { width: imgState.width, height: imgState.height };
}

function deselect() {
  if (!selected) return;
  selected = false;
  _lastOverlayImg = null;

  // Commit image to canvas at current position (instant JS)
  commitImageToCanvas();

  // If dimensions changed, commit via Python but send LOADED IMAGE only (not canvas composite)
  if (initialDims && imgState &&
      (imgState.width !== initialDims.width || imgState.height !== initialDims.height)) {
    const _img = getLoadedImage();
    if (_img) {
      // Convert loaded image to base64 (no white canvas background)
      const _c = document.createElement('canvas');
      _c.width = _img.naturalWidth || _img.width;
      _c.height = _img.naturalHeight || _img.height;
      _c.getContext('2d').drawImage(_img, 0, 0, _c.width, _c.height);
      const _b64 = _c.toDataURL('image/png');

      apiPost('/transform/apply', {
        image_b64: _b64,
        operation: 'resize',
        params: { width: Math.round(imgState.width), height: Math.round(imgState.height), interpolation: 'bilinear' },
      }).then(result => {
        if (result?.image_b64) {
          // Set resized image as loaded element (NOT via drawBase64 which bakes canvas bg)
          const resizedImg = new Image();
          resizedImg.onload = () => {
            setLoadedImage(resizedImg);
            commitImageToCanvas();
          };
          resizedImg.src = result.image_b64;
        }
      }).catch(() => {
        console.info('Python resize skipped (server not available)');
      });
    }
  }
  initialDims = null;

  hideSelection();
}

function hideSelection() {
  if (selectBoxEl) selectBoxEl.style.display = 'none';
  if (imgOverlayEl) imgOverlayEl.style.display = 'none';
  if (canvasBorderEl) canvasBorderEl.style.display = 'none';
}

// ── Update Overlay Positions (screen space) ─────────────────
function updateOverlayPosition() {
  if (!imgState || !layerEl) return;

  const canvas = getCanvas();
  if (!canvas) return;

  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = layerEl.parentElement.getBoundingClientRect();

  // Canvas position relative to container
  const canvasOffX = canvasRect.left - containerRect.left;
  const canvasOffY = canvasRect.top - containerRect.top;

  // Scale factor: how many screen pixels per canvas pixel
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;

  // Image position in screen space
  const imgScreenX = canvasOffX + imgState.x * scaleX;
  const imgScreenY = canvasOffY + imgState.y * scaleY;
  const imgScreenW = imgState.width * scaleX;
  const imgScreenH = imgState.height * scaleY;

  // Rotation angle for CSS transforms
  const rot = imgState.rotation || 0;
  const rotCss = rot !== 0 ? `rotate(${rot}deg)` : '';

  // Update image overlay (can overflow canvas bounds)
  if (imgOverlayEl && imgOverlayEl.style.display !== 'none') {
    imgOverlayEl.style.left = `${imgScreenX}px`;
    imgOverlayEl.style.top = `${imgScreenY}px`;
    imgOverlayEl.style.width = `${imgScreenW}px`;
    imgOverlayEl.style.height = `${imgScreenH}px`;
    imgOverlayEl.style.transform = rotCss;
    imgOverlayEl.style.transformOrigin = 'center center';
  }

  // Update canvas border outline (matches canvas element exactly)
  if (canvasBorderEl && canvasBorderEl.style.display !== 'none') {
    canvasBorderEl.style.left = `${canvasOffX}px`;
    canvasBorderEl.style.top = `${canvasOffY}px`;
    canvasBorderEl.style.width = `${canvasRect.width}px`;
    canvasBorderEl.style.height = `${canvasRect.height}px`;
  }

  // Update selection box (rotates with the image)
  if (selectBoxEl && selectBoxEl.style.display !== 'none') {
    selectBoxEl.style.left = `${imgScreenX}px`;
    selectBoxEl.style.top = `${imgScreenY}px`;
    selectBoxEl.style.width = `${imgScreenW}px`;
    selectBoxEl.style.height = `${imgScreenH}px`;
    selectBoxEl.style.transform = rotCss;
    selectBoxEl.style.transformOrigin = 'center center';

    // Update cursor icons on handles based on rotation
    _updateHandleCursors(rot);
  }
}

/** Map handle cursors to match rotation angle */
function _updateHandleCursors(rotDeg) {
  if (!selectBoxEl) return;
  const cursors = ['n-resize', 'ne-resize', 'e-resize', 'se-resize',
                   's-resize', 'sw-resize', 'w-resize', 'nw-resize'];
  const baseAngles = { nw: 315, ne: 45, se: 135, sw: 225 };
  const handles = selectBoxEl.querySelectorAll('.select-handle');
  handles.forEach(h => {
    const dir = h.dataset.handle;
    if (!baseAngles[dir]) return;
    const total = ((baseAngles[dir] + rotDeg) % 360 + 360) % 360;
    const idx = Math.round(total / 45) % 8;
    h.style.cursor = cursors[idx];
  });
}

/** Map CROP handle cursors to match rotation angle (BOE-018 for crop) */
function _updateCropHandleCursors(rotDeg) {
  if (!cropWindowEl) return;
  const cursors = ['n-resize', 'ne-resize', 'e-resize', 'se-resize',
                   's-resize', 'sw-resize', 'w-resize', 'nw-resize'];
  // Base angles for all 8 directions
  const baseAngles = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
  const handles = cropWindowEl.querySelectorAll('.crop-handle');
  handles.forEach(h => {
    const dir = h.dataset.cropHandle;
    if (baseAngles[dir] === undefined) return;
    const total = ((baseAngles[dir] + rotDeg) % 360 + 360) % 360;
    const idx = Math.round(total / 45) % 8;
    h.style.cursor = cursors[idx];
  });
  // Also rotate the crop window's move cursor
  // (at 0° it's 'move', stays 'move' at all angles — no change needed)
}

// ── Convert Screen Coords to Canvas Coords ──────────────────
function screenToCanvas(screenX, screenY) {
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (screenX - rect.left) * scaleX,
    y: (screenY - rect.top) * scaleY,
  };
}

// ── Hit Test: is point inside image bounds? (rotation-aware) ─
function hitTestImage(canvasX, canvasY) {
  if (!imgState) return false;

  const rot = (imgState.rotation || 0) * Math.PI / 180;
  if (rot === 0) {
    // Fast path: no rotation
    return canvasX >= imgState.x && canvasX <= imgState.x + imgState.width
        && canvasY >= imgState.y && canvasY <= imgState.y + imgState.height;
  }

  // Transform click into image-local space (un-rotate around center)
  const cx = imgState.x + imgState.width / 2;
  const cy = imgState.y + imgState.height / 2;
  const dx = canvasX - cx;
  const dy = canvasY - cy;
  const cosR = Math.cos(-rot);
  const sinR = Math.sin(-rot);
  const localX = cosR * dx + sinR * dy;
  const localY = -sinR * dx + cosR * dy;

  return Math.abs(localX) <= imgState.width / 2
      && Math.abs(localY) <= imgState.height / 2;
}

// ── Mouse Events ────────────────────────────────────────────
function onMouseDown(e) {
  // Skip normal interaction when in crop mode
  if (isCropMode) return;
  // Interaction works on ALL tools — no tool gating
  if (!imgState) return;

  // Blur any focused input fields so manual values don't get stuck
  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    document.activeElement.blur();
  }

  // Check if clicking on a resize handle
  const handle = e.target.closest('.select-handle');
  if (handle && selected) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    activeHandle = handle.dataset.handle;
    dragStart = { x: e.clientX, y: e.clientY };
    stateStart = { ...imgState };
    // P-001: Auto-switch to resize/position tab
    if (getState().activeTool !== 'resize') setState({ activeTool: 'resize' });
    return;
  }

  const canvasCoords = screenToCanvas(e.clientX, e.clientY);

  if (hitTestImage(canvasCoords.x, canvasCoords.y)) {
    e.preventDefault();
    e.stopPropagation();

    if (!selected) {
      selectImage();
    }

    // Start drag
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    stateStart = { ...imgState };
    // P-001: Auto-switch to resize/position tab
    if (getState().activeTool !== 'resize') setState({ activeTool: 'resize' });
  } else {
    // Clicked outside image → deselect (but stay on current tool tab)
    if (selected) {
      deselect();
    }
  }
}

function onMouseMove(e) {
  if (!imgState) return;

  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  // Raw mouse delta in canvas space
  const rawDx = (e.clientX - dragStart.x) * scaleX;
  const rawDy = (e.clientY - dragStart.y) * scaleY;

  // Un-rotate delta to image-local space (inverse rotation by θ)
  const rot = (imgState.rotation || 0) * Math.PI / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  if (isDragging && stateStart) {
    // Drag uses RAW deltas (move in screen space, not local space)
    const dx = rawDx;
    const dy = rawDy;

    imgState.x = Math.round(stateStart.x + dx);
    imgState.y = Math.round(stateStart.y + dy);

    updateOverlayPosition();
    commitImageToCanvas();
    setState({ imageTransform: { ...imgState } });
  }

  if (isResizing && stateStart && activeHandle) {
    // Resize uses UN-ROTATED deltas (resize in object-local axes)
    const dx = cosR * rawDx + sinR * rawDy;
    const dy = -sinR * rawDx + cosR * rawDy;
    const aspect = stateStart.width / stateStart.height;
    const locked = document.querySelector('#lock-aspect')?.checked ?? true;

    let newW, newH;

    // Calculate new dimensions based on handle
    if (locked) {
      switch (activeHandle) {
        case 'se': newW = Math.max(10, stateStart.width + dx); newH = newW / aspect; break;
        case 'sw': newW = Math.max(10, stateStart.width - dx); newH = newW / aspect; break;
        case 'ne': newW = Math.max(10, stateStart.width + dx); newH = newW / aspect; break;
        case 'nw': newW = Math.max(10, stateStart.width - dx); newH = newW / aspect; break;
      }
    } else {
      switch (activeHandle) {
        case 'se': newW = Math.max(10, stateStart.width + dx); newH = Math.max(10, stateStart.height + dy); break;
        case 'sw': newW = Math.max(10, stateStart.width - dx); newH = Math.max(10, stateStart.height + dy); break;
        case 'ne': newW = Math.max(10, stateStart.width + dx); newH = Math.max(10, stateStart.height - dy); break;
        case 'nw': newW = Math.max(10, stateStart.width - dx); newH = Math.max(10, stateStart.height - dy); break;
      }
    }

    // ── Rotation-aware anchor: keep opposite corner fixed in rotated space ──
    // Anchor local sign: the opposite corner of the dragged handle
    const anchorSign = {
      se: { ax: -1, ay: -1 }, // drag SE → anchor NW
      sw: { ax: +1, ay: -1 }, // drag SW → anchor NE
      ne: { ax: -1, ay: +1 }, // drag NE → anchor SW
      nw: { ax: +1, ay: +1 }, // drag NW → anchor SE
    }[activeHandle];

    const { ax, ay } = anchorSign;
    const r = (stateStart.rotation || 0) * Math.PI / 180;
    const cr = Math.cos(r), sr = Math.sin(r);

    // Old center
    const oldCx = stateStart.x + stateStart.width / 2;
    const oldCy = stateStart.y + stateStart.height / 2;

    // Size deltas
    const dW = newW - stateStart.width;
    const dH = newH - stateStart.height;

    // New center: shifted so anchor corner stays fixed in rotated space
    const newCx = oldCx - cr * ax * dW / 2 + sr * ay * dH / 2;
    const newCy = oldCy - sr * ax * dW / 2 - cr * ay * dH / 2;

    const newX = newCx - newW / 2;
    const newY = newCy - newH / 2;

    imgState.x = Math.round(newX);
    imgState.y = Math.round(newY);
    imgState.width = Math.round(newW);
    imgState.height = Math.round(newH);

    updateOverlayPosition();
    commitImageToCanvas();
    setState({ imageTransform: { ...imgState } });
  }
}

function onMouseUp() {
  if (isDragging || isResizing) {
    isDragging = false;
    isResizing = false;
    activeHandle = null;
    stateStart = null;
  }
}

// ══════════════════════════════════════════════════════════════
// ── CROP SYSTEM ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function enterCropMode() {
  if (!imgState || !getLoadedImage()) return;
  isCropMode = true;

  // Deselect image selection if active
  if (selected) deselect();

  // Initialize crop region to full image bounds (in image-pixel space)
  const img = getLoadedImage();
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  setState({
    cropRegion: { x: 0, y: 0, width: imgW, height: imgH, active: true }
  });

  // Show crop overlay
  if (cropOverlayEl) cropOverlayEl.style.display = 'block';
  if (canvasBorderEl) canvasBorderEl.style.display = 'block';

  // Wire crop-specific mouse events
  layerEl.addEventListener('mousedown', onCropMouseDown);
  document.addEventListener('mousemove', onCropMouseMove);
  document.addEventListener('mouseup', onCropMouseUp);
  document.addEventListener('keydown', onCropKeyDown);

  updateCropOverlayPosition();
}

function exitCropMode() {
  isCropMode = false;
  isCropDragging = false;
  isCropResizing = false;
  cropActiveHandle = null;
  cropStateStart = null;

  if (cropOverlayEl) cropOverlayEl.style.display = 'none';
  if (canvasBorderEl) canvasBorderEl.style.display = 'none';

  setState({ cropRegion: null });

  // Remove crop events
  layerEl.removeEventListener('mousedown', onCropMouseDown);
  document.removeEventListener('mousemove', onCropMouseMove);
  document.removeEventListener('mouseup', onCropMouseUp);
  document.removeEventListener('keydown', onCropKeyDown);
}

export function applyCrop() {
  // Bake any pending CSS filter (B/C) before crop modifies pixels (BOE-001: sync only)
  const fp = getState().filterPreview;
  if (fp && (fp.brightness !== 0 || fp.contrast !== 0)) {
    if (imgOverlayEl) imgOverlayEl.style.filter = '';
    const bMult = 1 + fp.brightness * 0.004;
    const cMult = 1 + fp.contrast * 0.004;
    const img2 = getLoadedImage();
    if (img2) {
      const sw = img2.naturalWidth || img2.width;
      const sh = img2.naturalHeight || img2.height;
      const tmp = document.createElement('canvas');
      tmp.width = sw; tmp.height = sh;
      const tCtx = tmp.getContext('2d');
      tCtx.filter = `brightness(${bMult}) contrast(${cMult})`;
      tCtx.drawImage(img2, 0, 0, sw, sh);
      setLoadedImage(tmp);
    }
    setState({ filterPreview: { brightness: 0, contrast: 0 } });
  }

  const cr = getState().cropRegion;
  if (!cr || !cr.active) return;

  const img = getLoadedImage();
  if (!img) return;

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;

  // Clamp crop region to image bounds
  const sx = Math.max(0, Math.round(cr.x));
  const sy = Math.max(0, Math.round(cr.y));
  const sw = Math.min(Math.round(cr.width), imgW - sx);
  const sh = Math.min(Math.round(cr.height), imgH - sy);

  if (sw <= 0 || sh <= 0) return;

  // Create cropped canvas (BOE-001: synchronous, BOE-007: from loadedImageElement not canvas)
  const cropped = document.createElement('canvas');
  cropped.width = sw;
  cropped.height = sh;
  cropped.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  // Set cropped image as the new loaded image (BOE-001: synchronous)
  setLoadedImage(cropped);

  // ── Stationary positioning: crop result stays exactly where the crop window was ──
  // Scale from image-pixels to display-pixels
  const scaleX = imgState.width / imgW;
  const scaleY = imgState.height / imgH;
  const dispW = Math.round(sw * scaleX);
  const dispH = Math.round(sh * scaleY);

  // Preserve rotation (BOE-003)
  const currentRot = imgState?.rotation || 0;
  const rotRad = currentRot * Math.PI / 180;

  // Crop center in image-local display space (relative to image top-left, unrotated)
  const cropLocalCx = (sx + sw / 2) * scaleX;
  const cropLocalCy = (sy + sh / 2) * scaleY;

  // Image center in canvas space
  const imgCx = imgState.x + imgState.width / 2;
  const imgCy = imgState.y + imgState.height / 2;

  // Crop center offset from image center (in image-local frame)
  const dxLocal = cropLocalCx - imgState.width / 2;
  const dyLocal = cropLocalCy - imgState.height / 2;

  // Rotate offset to get visual position (Chunk F: rotation compatibility)
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const dxRotated = cosR * dxLocal - sinR * dyLocal;
  const dyRotated = sinR * dxLocal + cosR * dyLocal;

  // New image center = image center + rotated offset
  const newCx = imgCx + dxRotated;
  const newCy = imgCy + dyRotated;

  // Position from center
  const dispX = Math.round(newCx - dispW / 2);
  const dispY = Math.round(newCy - dispH / 2);

  // Reset overlay cache so it refreshes (BOE-009)
  _lastOverlayImg = null;

  setState({
    imageInfo: { ...getState().imageInfo, width: sw, height: sh },
    imageTransform: { x: dispX, y: dispY, width: dispW, height: dispH, rotation: currentRot },
    cropRegion: null,
    statusMessage: `Cropped to ${sw}×${sh}`,
  });

  exitCropMode();
  // Switch to pointer tool after crop
  setState({ activeTool: 'pointer' });
}


export function cancelCrop() {
  exitCropMode();
  setState({ activeTool: 'pointer' });
}

// ── Crop Overlay Position (screen-space rendering) ──────────
function updateCropOverlayPosition() {
  const cr = getState().cropRegion;
  if (!cr || !cr.active || !imgState || !cropOverlayEl) return;

  const canvas = getCanvas();
  if (!canvas) return;

  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = layerEl.parentElement.getBoundingClientRect();

  const canvasOffX = canvasRect.left - containerRect.left;
  const canvasOffY = canvasRect.top - containerRect.top;
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;

  // Image position in screen space
  const imgScreenX = canvasOffX + imgState.x * scaleX;
  const imgScreenY = canvasOffY + imgState.y * scaleY;
  const imgScreenW = imgState.width * scaleX;
  const imgScreenH = imgState.height * scaleY;

  // Crop region: image-pixel space → display-pixel space
  const img = getLoadedImage();
  if (!img) return;
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  const pxToDispX = imgScreenW / imgW;
  const pxToDispY = imgScreenH / imgH;

  const cropScreenX = imgScreenX + cr.x * pxToDispX;
  const cropScreenY = imgScreenY + cr.y * pxToDispY;
  const cropScreenW = cr.width * pxToDispX;
  const cropScreenH = cr.height * pxToDispY;

  // Position the crop overlay container to cover the entire image area
  const rot = imgState.rotation || 0;
  cropOverlayEl.style.left = `${imgScreenX}px`;
  cropOverlayEl.style.top = `${imgScreenY}px`;
  cropOverlayEl.style.width = `${imgScreenW}px`;
  cropOverlayEl.style.height = `${imgScreenH}px`;
  if (rot !== 0) {
    cropOverlayEl.style.transform = `rotate(${rot}deg)`;
    cropOverlayEl.style.transformOrigin = 'center center';
  } else {
    cropOverlayEl.style.transform = '';
  }

  // Position the 4 dim areas (relative to image area)
  const relX = cr.x * pxToDispX;
  const relY = cr.y * pxToDispY;
  const relW = cr.width * pxToDispX;
  const relH = cr.height * pxToDispY;

  // Top dim: full width, from top of image to top of crop
  cropDimEls.top.style.cssText = `left:0;top:0;width:${imgScreenW}px;height:${relY}px;`;
  // Bottom dim: full width, from bottom of crop to bottom of image
  cropDimEls.bottom.style.cssText = `left:0;top:${relY + relH}px;width:${imgScreenW}px;height:${imgScreenH - relY - relH}px;`;
  // Left dim: crop height, from left of image to left of crop
  cropDimEls.left.style.cssText = `left:0;top:${relY}px;width:${relX}px;height:${relH}px;`;
  // Right dim: crop height, from right of crop to right of image
  cropDimEls.right.style.cssText = `left:${relX + relW}px;top:${relY}px;width:${imgScreenW - relX - relW}px;height:${relH}px;`;

  // Position crop window
  cropWindowEl.style.left = `${relX}px`;
  cropWindowEl.style.top = `${relY}px`;
  cropWindowEl.style.width = `${relW}px`;
  cropWindowEl.style.height = `${relH}px`;

  // Update canvas border
  if (canvasBorderEl) {
    canvasBorderEl.style.left = `${canvasOffX}px`;
    canvasBorderEl.style.top = `${canvasOffY}px`;
    canvasBorderEl.style.width = `${canvasRect.width}px`;
    canvasBorderEl.style.height = `${canvasRect.height}px`;
  }

  // Rotate crop handle cursors to match image rotation (BOE-018)
  _updateCropHandleCursors(rot);
}


// ── Crop Keyboard Handler ───────────────────────────────────
function onCropKeyDown(e) {
  if (!isCropMode) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    applyCrop();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelCrop();
  }
}

// ── Crop Mouse Handlers ─────────────────────────────────────
function onCropMouseDown(e) {
  if (!isCropMode) return;

  // Blur inputs (BOE-004)
  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    document.activeElement.blur();
  }

  const cropHandle = e.target.closest('.crop-handle');
  if (cropHandle) {
    e.preventDefault();
    e.stopPropagation();
    isCropResizing = true;
    cropActiveHandle = cropHandle.dataset.cropHandle;
    cropDragStart = { x: e.clientX, y: e.clientY };
    cropStateStart = { ...getState().cropRegion };
    return;
  }

  // Check if clicking inside crop window → drag region
  if (e.target.closest('.crop-window') || e.target.closest('.crop-grid')) {
    e.preventDefault();
    e.stopPropagation();
    isCropDragging = true;
    cropDragStart = { x: e.clientX, y: e.clientY };
    cropStateStart = { ...getState().cropRegion };
    return;
  }
}

function onCropMouseMove(e) {
  if (!isCropMode || !cropStateStart) return;
  if (!isCropDragging && !isCropResizing) return;

  const canvas = getCanvas();
  const canvasRect = canvas.getBoundingClientRect();
  const img = getLoadedImage();
  if (!img || !imgState) return;

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;

  // Screen-space delta → image-pixel-space delta
  const imgScreenW = imgState.width * (canvasRect.width / canvas.width);
  const imgScreenH = imgState.height * (canvasRect.height / canvas.height);
  const dispToPxX = imgW / imgScreenW;
  const dispToPxY = imgH / imgScreenH;

  // Un-rotate mouse delta if image is rotated
  const rot = (imgState.rotation || 0) * Math.PI / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const rawScreenDx = e.clientX - cropDragStart.x;
  const rawScreenDy = e.clientY - cropDragStart.y;
  const screenDx = cosR * rawScreenDx + sinR * rawScreenDy;
  const screenDy = -sinR * rawScreenDx + cosR * rawScreenDy;

  const dx = screenDx * dispToPxX;
  const dy = screenDy * dispToPxY;

  if (isCropDragging) {
    // Move crop region within image bounds
    let newX = cropStateStart.x + dx;
    let newY = cropStateStart.y + dy;
    newX = Math.max(0, Math.min(newX, imgW - cropStateStart.width));
    newY = Math.max(0, Math.min(newY, imgH - cropStateStart.height));
    setState({
      cropRegion: { ...cropStateStart, x: Math.round(newX), y: Math.round(newY) }
    });
  }

  if (isCropResizing) {
    let { x, y, width, height } = cropStateStart;
    const locked = document.querySelector('#crop-lock-aspect')?.checked ?? false;
    const aspect = cropStateStart.width / cropStateStart.height;

    switch (cropActiveHandle) {
      case 'se':
        width = Math.max(10, cropStateStart.width + dx);
        height = locked ? width / aspect : Math.max(10, cropStateStart.height + dy);
        break;
      case 'sw':
        width = Math.max(10, cropStateStart.width - dx);
        x = cropStateStart.x + cropStateStart.width - width;
        height = locked ? width / aspect : Math.max(10, cropStateStart.height + dy);
        break;
      case 'ne':
        width = Math.max(10, cropStateStart.width + dx);
        height = locked ? width / aspect : Math.max(10, cropStateStart.height - dy);
        y = cropStateStart.y + cropStateStart.height - height;
        break;
      case 'nw':
        width = Math.max(10, cropStateStart.width - dx);
        x = cropStateStart.x + cropStateStart.width - width;
        height = locked ? width / aspect : Math.max(10, cropStateStart.height - dy);
        y = cropStateStart.y + cropStateStart.height - height;
        break;
      case 'n':
        height = Math.max(10, cropStateStart.height - dy);
        y = cropStateStart.y + cropStateStart.height - height;
        if (locked) {
          const oldW = width;
          width = height * aspect;
          // Center horizontally relative to original crop center
          x = cropStateStart.x + (oldW - width) / 2;
        }
        break;
      case 's':
        height = Math.max(10, cropStateStart.height + dy);
        if (locked) {
          const oldW = width;
          width = height * aspect;
          x = cropStateStart.x + (oldW - width) / 2;
        }
        break;
      case 'e':
        width = Math.max(10, cropStateStart.width + dx);
        if (locked) {
          const oldH = height;
          height = width / aspect;
          // Center vertically relative to original crop center
          y = cropStateStart.y + (oldH - height) / 2;
        }
        break;
      case 'w':
        width = Math.max(10, cropStateStart.width - dx);
        x = cropStateStart.x + cropStateStart.width - width;
        if (locked) {
          const oldH = height;
          height = width / aspect;
          y = cropStateStart.y + (oldH - height) / 2;
        }
        break;
    }

    // Clamp to image bounds
    x = Math.max(0, x);
    y = Math.max(0, y);
    width = Math.min(width, imgW - x);
    height = Math.min(height, imgH - y);

    setState({
      cropRegion: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), active: true }
    });
  }
}

function onCropMouseUp() {
  isCropDragging = false;
  isCropResizing = false;
  cropActiveHandle = null;
  cropStateStart = null;
}
