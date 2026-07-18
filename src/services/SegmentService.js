/* PHOTON — Segment Service */

import { getLoadedImage, setLoadedImage } from './ImageEngine.js';
import { getState, setState } from '../utils/state.js';
import { apiPost } from '../utils/api.js';

// ── Shared ──────────────────────────────────────────────────
function _applyToImage(transformFn) {
  const img = getLoadedImage();
  if (!img) return;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW; srcCanvas.height = srcH;
  srcCanvas.getContext('2d').drawImage(img, 0, 0, srcW, srcH);
  const resultCanvas = transformFn(srcCanvas);
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = resultCanvas.width; finalCanvas.height = resultCanvas.height;
  finalCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);
  setLoadedImage(finalCanvas);
  const currentT = getState().imageTransform;
  if (currentT) setState({ imageTransform: { ...currentT } });
}

function _toGray(data, w, h) {
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }
  return gray;
}

function _tryPython(operation, params) {
  const img = getLoadedImage();
  if (!img) return;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/png');

  apiPost('/segment/apply', {
    image_b64: b64,
    operation,
    params,
  }).then(r => {
    if (r?.image_b64) {
      const resImg = new Image();
      resImg.onload = () => {
        setLoadedImage(resImg);
        const t = getState().imageTransform;
        if (t) setState({ imageTransform: { ...t } });
      };
      resImg.src = r.image_b64;
    }
  }).catch(() => {});
}

// Random color generator (deterministic from label index)
function _labelColor(label) {
  if (label === 0) return [0, 0, 0]; // Background black
  // Use golden ratio to spread colors evenly
  const hue = ((label * 137.508) % 360);
  const s = 0.7, l = 0.55;
  // HSL to RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (hue < 60)       { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// ══════════════════════════════════════════════════════════════
// ── Threshold-Based Segmentation ────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsSegThreshold(threshold) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);

    // Binary threshold
    const binary = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] > threshold ? 1 : 0;
    }

    // Connected component labeling (simple flood fill)
    const labels = new Int32Array(w * h);
    let nextLabel = 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (binary[idx] === 1 && labels[idx] === 0) {
          // Flood fill
          const stack = [[x, y]];
          labels[idx] = nextLabel;
          while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const neighbors = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const ni = ny * w + nx;
                if (binary[ni] === 1 && labels[ni] === 0) {
                  labels[ni] = nextLabel;
                  stack.push([nx, ny]);
                }
              }
            }
          }
          nextLabel++;
        }
      }
    }

    // Colorize labels
    const resultData = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = _labelColor(labels[i]);
      resultData[i * 4] = r;
      resultData[i * 4 + 1] = g;
      resultData[i * 4 + 2] = b;
      resultData[i * 4 + 3] = 255;
    }

    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(resultData, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Edge-Based Segmentation ─────────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsSegEdge(low, high) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);

    // Simplified Canny → contour fill
    // 1. Sobel gradient
    const Gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const Gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const edges = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sx = 0, sy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const v = gray[(y + ky) * w + (x + kx)];
            const ki = (ky + 1) * 3 + (kx + 1);
            sx += v * Gx[ki]; sy += v * Gy[ki];
          }
        }
        const mag = Math.sqrt(sx * sx + sy * sy);
        edges[y * w + x] = mag > high ? 255 : (mag > low ? 128 : 0);
      }
    }

    // 2. Close edges (dilate to fill gaps)
    const closed = new Uint8Array(edges);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (edges[y * w + x] >= 128) {
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              closed[(y + ky) * w + (x + kx)] = 255;
            }
          }
        }
      }
    }

    // 3. Flood fill non-edge regions
    const labels = new Int32Array(w * h);
    let nextLabel = 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (closed[idx] === 0 && labels[idx] === 0) {
          const stack = [[x, y]];
          labels[idx] = nextLabel;
          while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const ni = ny * w + nx;
                if (closed[ni] === 0 && labels[ni] === 0) {
                  labels[ni] = nextLabel;
                  stack.push([nx, ny]);
                }
              }
            }
          }
          nextLabel++;
        }
      }
    }

    // Colorize
    const resultData = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = closed[i] > 0 ? [255, 255, 255] : _labelColor(labels[i]);
      resultData[i * 4] = r; resultData[i * 4 + 1] = g; resultData[i * 4 + 2] = b; resultData[i * 4 + 3] = 255;
    }
    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(resultData, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── K-Means Clustering Segmentation ─────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsSegRegion(k) {
  k = Math.max(2, Math.min(k, 12));
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const data = imgData.data;
    const n = w * h;

    // Extract pixel RGB values
    const pixels = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pixels[i * 3] = data[i * 4];
      pixels[i * 3 + 1] = data[i * 4 + 1];
      pixels[i * 3 + 2] = data[i * 4 + 2];
    }

    // Initialize centroids (random k pixels)
    const centroids = new Float32Array(k * 3);
    const usedIndices = new Set();
    for (let c = 0; c < k; c++) {
      let idx;
      do { idx = Math.floor(Math.random() * n); } while (usedIndices.has(idx));
      usedIndices.add(idx);
      centroids[c * 3] = pixels[idx * 3];
      centroids[c * 3 + 1] = pixels[idx * 3 + 1];
      centroids[c * 3 + 2] = pixels[idx * 3 + 2];
    }

    const labels = new Uint8Array(n);
    const maxIter = 10; // Limited iterations for performance

    for (let iter = 0; iter < maxIter; iter++) {
      // Assign each pixel to nearest centroid
      for (let i = 0; i < n; i++) {
        let minDist = Infinity, bestC = 0;
        for (let c = 0; c < k; c++) {
          const dr = pixels[i * 3] - centroids[c * 3];
          const dg = pixels[i * 3 + 1] - centroids[c * 3 + 1];
          const db = pixels[i * 3 + 2] - centroids[c * 3 + 2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) { minDist = dist; bestC = c; }
        }
        labels[i] = bestC;
      }

      // Update centroids
      const sums = new Float32Array(k * 3);
      const counts = new Uint32Array(k);
      for (let i = 0; i < n; i++) {
        const c = labels[i];
        sums[c * 3] += pixels[i * 3];
        sums[c * 3 + 1] += pixels[i * 3 + 1];
        sums[c * 3 + 2] += pixels[i * 3 + 2];
        counts[c]++;
      }
      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          centroids[c * 3] = sums[c * 3] / counts[c];
          centroids[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
          centroids[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
        }
      }
    }

    // Apply centroid colors to each pixel
    const resultData = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      resultData[i * 4] = centroids[c * 3];
      resultData[i * 4 + 1] = centroids[c * 3 + 1];
      resultData[i * 4 + 2] = centroids[c * 3 + 2];
      resultData[i * 4 + 3] = 255;
    }
    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(resultData, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Public API ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export function segThreshold(threshold = 128) {
  _jsSegThreshold(threshold);
  setState({ statusMessage: `Threshold Segmentation (t=${threshold})` });
  _tryPython('seg_threshold', { threshold });
}

export function segEdge(low = 50, high = 150) {
  _jsSegEdge(low, high);
  setState({ statusMessage: `Edge Segmentation (${low}–${high})` });
  _tryPython('seg_edge', { low, high });
}

export function segRegion(k = 4) {
  _jsSegRegion(k);
  setState({ statusMessage: `K-Means Clustering (k=${k})` });
  _tryPython('seg_region', { k });
}
