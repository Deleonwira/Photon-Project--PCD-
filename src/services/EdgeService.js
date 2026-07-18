/* PHOTON — Edge Service */

import { getLoadedImage, setLoadedImage, getCanvas } from './ImageEngine.js';
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

function _grayToCanvas(gray, w, h) {
  const result = document.createElement('canvas');
  result.width = w; result.height = h;
  const imgData = new ImageData(w, h);
  const d = imgData.data;
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = gray[i];
    d[i * 4 + 1] = gray[i];
    d[i * 4 + 2] = gray[i];
    d[i * 4 + 3] = 255;
  }
  result.getContext('2d').putImageData(imgData, 0, 0);
  return result;
}

function _tryPython(operation, params) {
  const img = getLoadedImage();
  if (!img) return;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/png');

  apiPost('/edge/apply', {
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

// ══════════════════════════════════════════════════════════════
// ── Threshold (Global, Otsu, Adaptive) ──────────────────────
// ══════════════════════════════════════════════════════════════

function _jsThreshold(value, method) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);

    let thresh = value;

    if (method === 'otsu') {
      // Otsu's method: maximize between-class variance
      const hist = new Uint32Array(256);
      for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
      const total = gray.length;
      let sumAll = 0;
      for (let i = 0; i < 256; i++) sumAll += i * hist[i];

      let sumB = 0, wB = 0, maxVar = 0;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sumAll - sumB) / wF;
        const variance = wB * wF * (mB - mF) * (mB - mF);
        if (variance > maxVar) { maxVar = variance; thresh = t; }
      }
    }

    if (method === 'adaptive') {
      // Adaptive threshold: local mean in 11×11 window
      const blockSize = 11;
      const half = Math.floor(blockSize / 2);
      const C = 2; // Constant subtracted from mean
      const result = new Uint8Array(gray.length);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0, count = 0;
          for (let ky = -half; ky <= half; ky++) {
            for (let kx = -half; kx <= half; kx++) {
              const sy = Math.min(h - 1, Math.max(0, y + ky));
              const sx = Math.min(w - 1, Math.max(0, x + kx));
              sum += gray[sy * w + sx];
              count++;
            }
          }
          const localThresh = (sum / count) - C;
          result[y * w + x] = gray[y * w + x] > localThresh ? 255 : 0;
        }
      }
      return _grayToCanvas(result, w, h);
    }

    // Global / Otsu binary threshold
    const result = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
      result[i] = gray[i] > thresh ? 255 : 0;
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Sobel Edge Detection ────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsSobel(ksize) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);
    const result = new Uint8Array(gray.length);

    const Gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const Gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sx = 0, sy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const v = gray[(y + ky) * w + (x + kx)];
            const ki = (ky + 1) * 3 + (kx + 1);
            sx += v * Gx[ki];
            sy += v * Gy[ki];
          }
        }
        result[y * w + x] = Math.min(255, Math.sqrt(sx * sx + sy * sy));
      }
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Prewitt Edge Detection ──────────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsPrewitt() {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);
    const result = new Uint8Array(gray.length);

    const Gx = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
    const Gy = [-1, -1, -1, 0, 0, 0, 1, 1, 1];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sx = 0, sy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const v = gray[(y + ky) * w + (x + kx)];
            const ki = (ky + 1) * 3 + (kx + 1);
            sx += v * Gx[ki];
            sy += v * Gy[ki];
          }
        }
        result[y * w + x] = Math.min(255, Math.sqrt(sx * sx + sy * sy));
      }
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Robert Cross Edge Detection ─────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsRobert() {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);
    const result = new Uint8Array(gray.length);

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const gx = gray[y * w + x] - gray[(y + 1) * w + (x + 1)];
        const gy = gray[y * w + (x + 1)] - gray[(y + 1) * w + x];
        result[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Laplacian Edge Detection ────────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsLaplacian() {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);
    const result = new Uint8Array(gray.length);

    const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += gray[(y + ky) * w + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        result[y * w + x] = Math.min(255, Math.abs(sum));
      }
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Laplacian of Gaussian (LoG) ─────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsLoG(sigma, ksize) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);

    // 1. Gaussian blur
    const k = Math.max(3, ksize | 1);
    const half = Math.floor(k / 2);
    const gKernel = new Float32Array(k);
    let gSum = 0;
    for (let i = 0; i < k; i++) {
      const x = i - half;
      gKernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      gSum += gKernel[i];
    }
    for (let i = 0; i < k; i++) gKernel[i] /= gSum;

    // Horizontal pass
    const temp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let ki = 0; ki < k; ki++) {
          const sx = Math.min(w - 1, Math.max(0, x + ki - half));
          sum += gray[y * w + sx] * gKernel[ki];
        }
        temp[y * w + x] = sum;
      }
    }
    // Vertical pass
    const blurred = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let ki = 0; ki < k; ki++) {
          const sy = Math.min(h - 1, Math.max(0, y + ki - half));
          sum += temp[sy * w + x] * gKernel[ki];
        }
        blurred[y * w + x] = sum;
      }
    }

    // 2. Laplacian
    const lapKernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    const result = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += blurred[(y + ky) * w + (x + kx)] * lapKernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        result[y * w + x] = Math.min(255, Math.abs(sum));
      }
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Canny Edge Detection (multi-step) ───────────────────────
// ══════════════════════════════════════════════════════════════

function _jsCanny(low, high) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const gray = _toGray(imgData.data, w, h);

    // 1. Gaussian blur (5×5, sigma=1.4)
    const gKernel = [2, 4, 5, 4, 2, 4, 9, 12, 9, 4, 5, 12, 15, 12, 5, 4, 9, 12, 9, 4, 2, 4, 5, 4, 2];
    const gSum = 159;
    const blurred = new Float32Array(w * h);
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let sum = 0;
        for (let ky = -2; ky <= 2; ky++) {
          for (let kx = -2; kx <= 2; kx++) {
            sum += gray[(y + ky) * w + (x + kx)] * gKernel[(ky + 2) * 5 + (kx + 2)];
          }
        }
        blurred[y * w + x] = sum / gSum;
      }
    }

    // 2. Sobel gradient (magnitude + direction)
    const Gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const Gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const mag = new Float32Array(w * h);
    const dir = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sx = 0, sy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const v = blurred[(y + ky) * w + (x + kx)];
            const ki = (ky + 1) * 3 + (kx + 1);
            sx += v * Gx[ki];
            sy += v * Gy[ki];
          }
        }
        mag[y * w + x] = Math.sqrt(sx * sx + sy * sy);
        dir[y * w + x] = Math.atan2(sy, sx);
      }
    }

    // 3. Non-maximum suppression
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let angle = dir[y * w + x] * 180 / Math.PI;
        if (angle < 0) angle += 180;
        const m = mag[y * w + x];
        let n1 = 0, n2 = 0;

        if ((angle >= 0 && angle < 22.5) || (angle >= 157.5)) {
          n1 = mag[y * w + (x + 1)]; n2 = mag[y * w + (x - 1)];
        } else if (angle >= 22.5 && angle < 67.5) {
          n1 = mag[(y - 1) * w + (x + 1)]; n2 = mag[(y + 1) * w + (x - 1)];
        } else if (angle >= 67.5 && angle < 112.5) {
          n1 = mag[(y - 1) * w + x]; n2 = mag[(y + 1) * w + x];
        } else {
          n1 = mag[(y - 1) * w + (x - 1)]; n2 = mag[(y + 1) * w + (x + 1)];
        }
        nms[y * w + x] = (m >= n1 && m >= n2) ? m : 0;
      }
    }

    // 4. Double threshold + hysteresis
    const result = new Uint8Array(w * h);
    const STRONG = 255, WEAK = 75;
    for (let i = 0; i < nms.length; i++) {
      if (nms[i] >= high) result[i] = STRONG;
      else if (nms[i] >= low) result[i] = WEAK;
    }

    // Hysteresis: promote weak pixels connected to strong
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (result[y * w + x] === WEAK) {
          let hasStrong = false;
          for (let ky = -1; ky <= 1 && !hasStrong; ky++) {
            for (let kx = -1; kx <= 1 && !hasStrong; kx++) {
              if (result[(y + ky) * w + (x + kx)] === STRONG) hasStrong = true;
            }
          }
          result[y * w + x] = hasStrong ? STRONG : 0;
        }
      }
    }
    return _grayToCanvas(result, w, h);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Morphology (Erode, Dilate) ──────────────────────────────
// ══════════════════════════════════════════════════════════════

function _createStructuringElement(size, shape) {
  const k = Math.max(3, size | 1);
  const half = Math.floor(k / 2);
  const se = [];
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      if (shape === 'cross') {
        if (x === 0 || y === 0) se.push([y, x]);
      } else if (shape === 'ellipse') {
        if ((x * x) / (half * half + 0.01) + (y * y) / (half * half + 0.01) <= 1) se.push([y, x]);
      } else {
        se.push([y, x]); // rect
      }
    }
  }
  return se;
}

function _jsErode(kernelSize, shape) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);
    const se = _createStructuringElement(kernelSize, shape);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let minR = 255, minG = 255, minB = 255;
        for (const [dy, dx] of se) {
          const sy = Math.min(h - 1, Math.max(0, y + dy));
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const idx = (sy * w + sx) * 4;
          minR = Math.min(minR, src[idx]);
          minG = Math.min(minG, src[idx + 1]);
          minB = Math.min(minB, src[idx + 2]);
        }
        const oidx = (y * w + x) * 4;
        out[oidx] = minR; out[oidx + 1] = minG; out[oidx + 2] = minB; out[oidx + 3] = src[oidx + 3];
      }
    }
    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return result;
  });
}

function _jsDilate(kernelSize, shape) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);
    const se = _createStructuringElement(kernelSize, shape);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let maxR = 0, maxG = 0, maxB = 0;
        for (const [dy, dx] of se) {
          const sy = Math.min(h - 1, Math.max(0, y + dy));
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const idx = (sy * w + sx) * 4;
          maxR = Math.max(maxR, src[idx]);
          maxG = Math.max(maxG, src[idx + 1]);
          maxB = Math.max(maxB, src[idx + 2]);
        }
        const oidx = (y * w + x) * 4;
        out[oidx] = maxR; out[oidx + 1] = maxG; out[oidx + 2] = maxB; out[oidx + 3] = src[oidx + 3];
      }
    }
    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Public API ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export function threshold(value = 128, method = 'global') {
  _jsThreshold(value, method);
  setState({ statusMessage: `Threshold (${method}${method === 'global' ? ` = ${value}` : ''})` });
  _tryPython('threshold', { value, method });
}

export function cannyEdge(low = 50, high = 150) {
  _jsCanny(low, high);
  setState({ statusMessage: `Canny Edge (${low}–${high})` });
  _tryPython('canny', { low, high });
}

export function sobelEdge(ksize = 3) {
  _jsSobel(ksize);
  setState({ statusMessage: 'Sobel Edge Detection' });
  _tryPython('sobel', { ksize });
}

export function prewittEdge() {
  _jsPrewitt();
  setState({ statusMessage: 'Prewitt Edge Detection' });
  _tryPython('prewitt', {});
}

export function robertEdge() {
  _jsRobert();
  setState({ statusMessage: 'Robert Edge Detection' });
  _tryPython('robert', {});
}

export function laplacianEdge() {
  _jsLaplacian();
  setState({ statusMessage: 'Laplacian Edge Detection' });
  _tryPython('laplacian', {});
}

export function logEdge(sigma = 1.0, ksize = 5) {
  _jsLoG(sigma, ksize);
  setState({ statusMessage: `LoG Edge (σ=${sigma}, k=${ksize})` });
  _tryPython('log', { sigma, ksize });
}

export function erode(kernelSize = 5, shape = 'rect') {
  _jsErode(kernelSize, shape);
  setState({ statusMessage: `Erode (k=${kernelSize}, ${shape})` });
  _tryPython('erode', { kernel_size: kernelSize, shape });
}

export function dilate(kernelSize = 5, shape = 'rect') {
  _jsDilate(kernelSize, shape);
  setState({ statusMessage: `Dilate (k=${kernelSize}, ${shape})` });
  _tryPython('dilate', { kernel_size: kernelSize, shape });
}
