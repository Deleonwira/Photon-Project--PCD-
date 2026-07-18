/* PHOTON — Filter Service */

import { getLoadedImage, setLoadedImage, getCanvas } from './ImageEngine.js';
import { getState, setState } from '../utils/state.js';
import { apiPost } from '../utils/api.js';

// ── Shared: apply pixel transform to loadedImageElement ─────
// Same pattern as EnhanceService._applyToImage (BOE-023)
function _applyToImage(transformFn) {
  const img = getLoadedImage();
  if (!img) return;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  srcCanvas.getContext('2d').drawImage(img, 0, 0, srcW, srcH);

  const resultCanvas = transformFn(srcCanvas);

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = resultCanvas.width;
  finalCanvas.height = resultCanvas.height;
  finalCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);
  setLoadedImage(finalCanvas);

  // Preserve position/size/rotation (BOE-003, BOE-015)
  const currentT = getState().imageTransform;
  if (currentT) {
    setState({ imageTransform: { ...currentT } });
  }
}

// ── Try Python backend (async, after JS instant preview) ────
function _tryPython(operation, params) {
  const img = getLoadedImage();
  if (!img) return;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/png');

  apiPost('/filter/apply', {
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
  }).catch(() => {
    console.info(`Python filter skipped (${operation}): backend offline`);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Gaussian Blur (JS: separable 1D convolution) ─────────────
// ══════════════════════════════════════════════════════════════

function _gaussianKernel1D(size) {
  const sigma = size / 6;
  const half = Math.floor(size / 2);
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  // Normalize
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function _jsGaussianBlur(kernelSize) {
  const k = Math.max(3, kernelSize | 1); // Ensure odd, min 3
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const src = imgData.data;
    const kernel = _gaussianKernel1D(k);
    const half = Math.floor(k / 2);

    // Separable: horizontal pass → vertical pass
    const temp = new Uint8ClampedArray(src.length);
    const out = new Uint8ClampedArray(src.length);

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let ki = 0; ki < k; ki++) {
          const sx = Math.min(w - 1, Math.max(0, x + ki - half));
          const idx = (y * w + sx) * 4;
          r += src[idx] * kernel[ki];
          g += src[idx + 1] * kernel[ki];
          b += src[idx + 2] * kernel[ki];
        }
        const oidx = (y * w + x) * 4;
        temp[oidx] = r;
        temp[oidx + 1] = g;
        temp[oidx + 2] = b;
        temp[oidx + 3] = src[oidx + 3]; // Alpha unchanged
      }
    }

    // Vertical pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let ki = 0; ki < k; ki++) {
          const sy = Math.min(h - 1, Math.max(0, y + ki - half));
          const idx = (sy * w + x) * 4;
          r += temp[idx] * kernel[ki];
          g += temp[idx + 1] * kernel[ki];
          b += temp[idx + 2] * kernel[ki];
        }
        const oidx = (y * w + x) * 4;
        out[oidx] = r;
        out[oidx + 1] = g;
        out[oidx + 2] = b;
        out[oidx + 3] = temp[oidx + 3];
      }
    }

    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Box Blur (JS: mean filter) ───────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsBoxBlur(kernelSize) {
  const k = Math.max(3, kernelSize | 1);
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);
    const half = Math.floor(k / 2);
    const area = k * k;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const sy = Math.min(h - 1, Math.max(0, y + ky));
            const sx = Math.min(w - 1, Math.max(0, x + kx));
            const idx = (sy * w + sx) * 4;
            r += src[idx];
            g += src[idx + 1];
            b += src[idx + 2];
          }
        }
        const oidx = (y * w + x) * 4;
        out[oidx] = r / area;
        out[oidx + 1] = g / area;
        out[oidx + 2] = b / area;
        out[oidx + 3] = src[oidx + 3];
      }
    }

    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Median Filter (JS: sort-based) ──────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsMedianFilter(kernelSize) {
  const k = Math.max(3, kernelSize | 1);
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);
    const half = Math.floor(k / 2);
    const medIdx = Math.floor((k * k) / 2);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rVals = [], gVals = [], bVals = [];
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const sy = Math.min(h - 1, Math.max(0, y + ky));
            const sx = Math.min(w - 1, Math.max(0, x + kx));
            const idx = (sy * w + sx) * 4;
            rVals.push(src[idx]);
            gVals.push(src[idx + 1]);
            bVals.push(src[idx + 2]);
          }
        }
        rVals.sort((a, b) => a - b);
        gVals.sort((a, b) => a - b);
        bVals.sort((a, b) => a - b);
        const oidx = (y * w + x) * 4;
        out[oidx] = rVals[medIdx];
        out[oidx + 1] = gVals[medIdx];
        out[oidx + 2] = bVals[medIdx];
        out[oidx + 3] = src[oidx + 3];
      }
    }

    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Bilateral Filter (JS: edge-preserving smoothing) ─────────
// ══════════════════════════════════════════════════════════════

function _jsBilateralFilter(d) {
  const radius = Math.max(1, Math.floor(d / 2));
  const sigmaColor = 75;
  const sigmaSpace = 75;
  const colorCoeff = -0.5 / (sigmaColor * sigmaColor);
  const spaceCoeff = -0.5 / (sigmaSpace * sigmaSpace);

  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const w = srcCanvas.width, h = srcCanvas.height;
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cidx = (y * w + x) * 4;
        let sumR = 0, sumG = 0, sumB = 0, wSum = 0;

        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const sy = Math.min(h - 1, Math.max(0, y + ky));
            const sx = Math.min(w - 1, Math.max(0, x + kx));
            const idx = (sy * w + sx) * 4;

            const dr = src[idx] - src[cidx];
            const dg = src[idx + 1] - src[cidx + 1];
            const db = src[idx + 2] - src[cidx + 2];
            const colorDist = dr * dr + dg * dg + db * db;
            const spaceDist = kx * kx + ky * ky;

            const weight = Math.exp(colorDist * colorCoeff + spaceDist * spaceCoeff);
            sumR += src[idx] * weight;
            sumG += src[idx + 1] * weight;
            sumB += src[idx + 2] * weight;
            wSum += weight;
          }
        }

        out[cidx] = sumR / wSum;
        out[cidx + 1] = sumG / wSum;
        out[cidx + 2] = sumB / wSum;
        out[cidx + 3] = src[cidx + 3];
      }
    }

    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    result.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Salt & Pepper Noise (JS) ────────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsNoiseSP(amount) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;
    const totalPixels = srcCanvas.width * srcCanvas.height;
    const numNoise = Math.floor(amount * totalPixels);

    // Salt (white)
    for (let i = 0; i < numNoise; i++) {
      const idx = Math.floor(Math.random() * totalPixels) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
    }
    // Pepper (black)
    for (let i = 0; i < numNoise; i++) {
      const idx = Math.floor(Math.random() * totalPixels) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    }

    const result = document.createElement('canvas');
    result.width = srcCanvas.width;
    result.height = srcCanvas.height;
    result.getContext('2d').putImageData(imgData, 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Gaussian Noise (JS) ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsNoiseGaussian(sigma) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;

    // Box-Muller transform for gaussian random numbers
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const u1 = Math.random();
        const u2 = Math.random();
        const noise = sigma * Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
        data[i + c] = Math.min(255, Math.max(0, data[i + c] + noise));
      }
    }

    const result = document.createElement('canvas');
    result.width = srcCanvas.width;
    result.height = srcCanvas.height;
    result.getContext('2d').putImageData(imgData, 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Public API (JS-first, Python-fallback) ──────────────────
// ══════════════════════════════════════════════════════════════

export function gaussianBlur(k = 5) {
  _jsGaussianBlur(k);
  setState({ statusMessage: `Applied Gaussian Blur (k=${k})` });
  _tryPython('gaussian', { kernel_size: k });
}

export function boxBlur(k = 5) {
  _jsBoxBlur(k);
  setState({ statusMessage: `Applied Box Blur (k=${k})` });
  _tryPython('box', { kernel_size: k });
}

export function medianFilter(k = 5) {
  _jsMedianFilter(k);
  setState({ statusMessage: `Applied Median Filter (k=${k})` });
  _tryPython('median', { kernel_size: k });
}

export function bilateralFilter(d = 9) {
  _jsBilateralFilter(d);
  setState({ statusMessage: `Applied Bilateral Filter (d=${d})` });
  _tryPython('bilateral', { d });
}

export function addNoiseSP(amount = 0.05) {
  _jsNoiseSP(amount);
  setState({ statusMessage: `Added Salt & Pepper Noise (${Math.round(amount * 100)}%)` });
  _tryPython('noise_sp', { amount });
}

export function addNoiseGaussian(sigma = 25) {
  _jsNoiseGaussian(sigma);
  setState({ statusMessage: `Added Gaussian Noise (σ=${sigma})` });
  _tryPython('noise_gaussian', { sigma });
}
