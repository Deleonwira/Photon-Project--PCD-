/* PHOTON — History Stack */

import { getImageData, putImageData, getOriginalImageData, onImageLoad, getLoadedImage, setLoadedImage } from './ImageEngine.js';
import { setState, getState } from '../utils/state.js';

// Auto-clear history when a new image is loaded
onImageLoad(() => clearHistory());

// ── Internal State ──────────────────────────────────────────
const MAX_DEPTH = 15; // Reduced from 20 — each entry stores 2 snapshots
let undoStack = [];
let redoStack = [];
let historyLabels = []; // parallel label tracking: { label, time }
let redoLabels = [];

// ── Restore hooks (called after undo/redo to clean external state) ──
// Used by PropertiesPanel to clear enhancement snapshots without circular imports
const _restoreHooks = [];
export function onHistoryRestore(fn) { _restoreHooks.push(fn); }

// ── Snapshot helpers ────────────────────────────────────────
// Clone loadedImageElement as a canvas (safe for both Image and Canvas types)
function _cloneLoadedImage() {
  const img = getLoadedImage();
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return null;
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  copy.getContext('2d').drawImage(img, 0, 0, w, h);
  return copy;
}

function _createSnapshot() {
  return {
    canvasData: getImageData(),       // mainCanvas composite
    loadedImage: _cloneLoadedImage(), // raw image layer (full fidelity)
    transform: getState().imageTransform ? { ...getState().imageTransform } : null,
  };
}

function _restoreSnapshot(snapshot) {
  if (snapshot.canvasData) putImageData(snapshot.canvasData);
  if (snapshot.loadedImage) setLoadedImage(snapshot.loadedImage);
  if (snapshot.transform) {
    setState({ imageTransform: { ...snapshot.transform } });
  }
  // Clear ALL enhancement state after undo/redo to prevent stale snapshots
  setState({
    filterPreview: { brightness: 0, contrast: 0 },
    sharpenPreview: { amount: 0 },
  });
  // Fire restore hooks (e.g. clear _eqSnapshot, _sharpSnapshot in PropertiesPanel)
  _restoreHooks.forEach(fn => fn());
}

// ── Push current state before any operation ─────────────────
export function pushState(label) {
  const snapshot = _createSnapshot();
  if (!snapshot.canvasData) return;
  undoStack.push(snapshot);
  historyLabels.push({ label: label || getState().statusMessage || 'Edit', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  if (undoStack.length > MAX_DEPTH) { undoStack.shift(); historyLabels.shift(); }
  redoStack = [];  // Any new action clears redo
  redoLabels = [];
  updateState();
}

// ── Undo ────────────────────────────────────────────────────
export function undo() {
  if (undoStack.length === 0) {
    setState({ statusMessage: 'Nothing to undo' });
    return;
  }
  const current = _createSnapshot();
  if (current.canvasData) {
    redoStack.push(current);
    redoLabels.push(historyLabels.pop() || { label: 'Edit', time: '' });
  }

  const prev = undoStack.pop();
  _restoreSnapshot(prev);
  updateState();
  setState({ statusMessage: `Undo (${undoStack.length} left)` });
}

// ── Redo ────────────────────────────────────────────────────
export function redo() {
  if (redoStack.length === 0) {
    setState({ statusMessage: 'Nothing to redo' });
    return;
  }
  const current = _createSnapshot();
  if (current.canvasData) {
    undoStack.push(current);
    historyLabels.push(redoLabels.pop() || { label: 'Edit', time: '' });
  }

  const next = redoStack.pop();
  _restoreSnapshot(next);
  updateState();
  setState({ statusMessage: `Redo (${redoStack.length} left)` });
}

// ── Reset to Original ───────────────────────────────────────
export function resetImage() {
  const original = getOriginalImageData();
  if (!original) {
    setState({ statusMessage: 'No original image to reset to' });
    return;
  }
  pushState();  // Save current state so reset is undoable
  putImageData(original);
  // Fire restore hooks to clear enhancement state
  _restoreHooks.forEach(fn => fn());
  setState({ statusMessage: 'Reset to original image' });
}

// ── Clear history (on new image load) ───────────────────────
export function clearHistory() {
  undoStack = [];
  redoStack = [];
  historyLabels = [];
  redoLabels = [];
  updateState();
}

// ── Query ───────────────────────────────────────────────────
export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

// ── Update state for UI (menu graying, etc.) ────────────────
function updateState() {
  setState({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    historyCount: undoStack.length,
  });
}

// ── Labels API for LayersPanel ──────────────────────────────
export function getHistoryLabels() { return historyLabels; }
export function getUndoCount() { return undoStack.length; }
