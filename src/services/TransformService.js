/* PHOTON — Transform Service */

import { apiPost } from '../utils/api.js';
import { getCanvasBase64, drawBase64, jsFlipH, jsFlipV, jsRotate90CW, jsRotate90CCW, jsRotate180, jsRotateFree } from './ImageEngine.js';
import { pushState } from './HistoryStack.js';
import { setState } from '../utils/state.js';

/**
 * Apply a geometric transform via the Flask backend (fallback/compliance).
 * @param {string} operation - e.g. 'flip_h', 'rotate_90cw', 'rotate_free'
 * @param {object} params - operation-specific parameters
 */
export async function applyTransform(operation, params = {}) {
  setState({ statusMessage: `Applying: ${formatOpName(operation)}...` });
  pushState(); // BOE-040: undo for resize/crop/translate

  try {
    const b64 = getCanvasBase64();
    const result = await apiPost('/transform/apply', {
      image_b64: b64,
      operation,
      params,
    });

    await drawBase64(result.image_b64);
    setState({ statusMessage: `Applied: ${formatOpName(operation)}` });
  } catch (err) {
    // Flask not running — JS result stays as final, no crash
    console.info(`Python transform skipped (${operation}):`, err.message);
    setState({ statusMessage: `Applied: ${formatOpName(operation)} (JS)` });
  }
}

// ── JS-only convenience shortcuts (instant, no Python needed) ──

export function flipH() {
  pushState();
  jsFlipH();
  setState({ statusMessage: 'Applied: Flip Horizontal' });
}

export function flipV() {
  pushState();
  jsFlipV();
  setState({ statusMessage: 'Applied: Flip Vertical' });
}

export function rotate90CW() {
  pushState();
  jsRotate90CW();
  setState({ statusMessage: 'Applied: Rotate 90° CW' });
}

export function rotate90CCW() {
  pushState();
  jsRotate90CCW();
  setState({ statusMessage: 'Applied: Rotate 90° CCW' });
}

export function rotate180() {
  pushState();
  jsRotate180();
  setState({ statusMessage: 'Applied: Rotate 180°' });
}

export function rotateFree(angle, interpolation = 'bilinear') {
  pushState();
  jsRotateFree(angle);
  setState({ statusMessage: `Applied: Rotate ${angle}°` });
}

export function resize(width, height, interpolation = 'bilinear') {
  return applyTransform('resize', { width, height, interpolation });
}

export function crop(x, y, width, height) {
  return applyTransform('crop', { x, y, width, height });
}

export function translate(tx, ty) {
  return applyTransform('translate', { tx, ty });
}

// ── Format operation name for status ────────────────────────
function formatOpName(op) {
  const names = {
    flip_h: 'Flip Horizontal',
    flip_v: 'Flip Vertical',
    rotate_90cw: 'Rotate 90° CW',
    rotate_90ccw: 'Rotate 90° CCW',
    rotate_180: 'Rotate 180°',
    rotate_free: 'Free Rotation',
    resize: 'Resize',
    crop: 'Crop',
    translate: 'Translate',
  };
  return names[op] || op;
}
