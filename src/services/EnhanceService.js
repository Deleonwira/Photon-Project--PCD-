/* PHOTON — Enhance Service */

import { getLoadedImage, setLoadedImage, getCanvas } from './ImageEngine.js';
import { getState, setState } from '../utils/state.js';
import { apiPost } from '../utils/api.js';

// ── Internal: reusable "apply transform to loadedImageElement" ──
// Same pattern as ImageEngine._applyImageTransform but local to this module.
// Prevents import cycle.
function _applyToImage(transformFn) {
  const img = getLoadedImage();
  if (!img) return;

  // Source at full pixel resolution (BOE-008, BOE-012)
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  srcCanvas.getContext('2d').drawImage(img, 0, 0, srcW, srcH);

  // Run the transform
  const resultCanvas = transformFn(srcCanvas);

  // Persist as loadedImageElement (BOE-001: synchronous, no new Image().onload)
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = resultCanvas.width;
  finalCanvas.height = resultCanvas.height;
  finalCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);

  setLoadedImage(finalCanvas);

  // Preserve position/size/rotation (BOE-003, BOE-015)
  const currentT = getState().imageTransform;
  const currentRot = currentT?.rotation || 0;
  const iw = finalCanvas.width, ih = finalCanvas.height;
  const dimsChanged = iw !== srcW || ih !== srcH;

  let x, y, w, h;
  if (dimsChanged || !currentT) {
    const canvas = getCanvas();
    const cw = canvas.width, ch = canvas.height;
    const scale = Math.min(cw / iw, ch / ih, 1);
    w = Math.round(iw * scale);
    h = Math.round(ih * scale);
    x = Math.round((cw - w) / 2);
    y = Math.round((ch - h) / 2);
  } else {
    x = currentT.x;
    y = currentT.y;
    w = currentT.width;
    h = currentT.height;
  }

  setState({
    imageInfo: { ...getState().imageInfo, width: iw, height: ih },
    imageTransform: { x, y, width: w, height: h, rotation: currentRot },
  });
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

  apiPost('/enhance/apply', {
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
    console.info(`Python enhance skipped (${operation}): backend offline`);
  });
}

// ══════════════════════════════════════════════════════════════
// ── Brightness & Contrast (bake via ctx.filter) ──────────────
// ══════════════════════════════════════════════════════════════

/**
 * Bake brightness + contrast into loadedImageElement.
 * @param {number} brightness  -100 to 100 (0 = no change)
 * @param {number} contrast    -100 to 100 (0 = no change)
 */
export function adjustBrightnessContrast(brightness, contrast) {
  if (brightness === 0 && contrast === 0) return; // Nothing to do

  // Map slider values to CSS filter multipliers (commercial-standard range)
  // -100 → 0.6 (dim, not black), 0 → 1.0 (normal), 100 → 1.4 (bright, not blown)
  const bMult = 1 + brightness * 0.004;   // ±40% range
  const cMult = 1 + contrast * 0.004;     // ±40% range

  _applyToImage((srcCanvas) => {
    const tmp = document.createElement('canvas');
    tmp.width = srcCanvas.width;
    tmp.height = srcCanvas.height;
    const ctx = tmp.getContext('2d');
    ctx.filter = `brightness(${bMult}) contrast(${cMult})`;
    ctx.drawImage(srcCanvas, 0, 0);
    return tmp;
  });

  setState({ statusMessage: `Brightness ${brightness > 0 ? '+' : ''}${brightness}, Contrast ${contrast > 0 ? '+' : ''}${contrast}` });
  _tryPython('brightness_contrast', { brightness, contrast: 1 + contrast * 0.004 });
}

// ══════════════════════════════════════════════════════════════
// ── Histogram Equalization (per-channel CDF) ─────────────────
// ══════════════════════════════════════════════════════════════

/**
 * Apply per-channel histogram equalization to loadedImageElement.
 * Algorithm:
 *   1. Build histogram[3][256] for R, G, B
 *   2. Compute CDF per channel
 *   3. Normalize to [0, 255]
 *   4. Map every pixel through the LUT
 */
export function equalizeHistogram() {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;
    const totalPixels = srcCanvas.width * srcCanvas.height;

    // 1. Build histograms
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < data.length; i += 4) {
      hist[0][data[i]]++;
      hist[1][data[i + 1]]++;
      hist[2][data[i + 2]]++;
    }

    // 2. Build CDF and LUT per channel
    const lut = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
    for (let c = 0; c < 3; c++) {
      const cdf = new Uint32Array(256);
      cdf[0] = hist[c][0];
      for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i - 1] + hist[c][i];
      }
      // Find CDF_min (first non-zero)
      let cdfMin = 0;
      for (let i = 0; i < 256; i++) {
        if (cdf[i] > 0) { cdfMin = cdf[i]; break; }
      }
      // Normalize
      const denom = totalPixels - cdfMin;
      if (denom <= 0) continue; // All same value, skip
      for (let i = 0; i < 256; i++) {
        lut[c][i] = Math.round((cdf[i] - cdfMin) / denom * 255);
      }
    }

    // 3. Map pixels through LUT
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = lut[0][data[i]];
      data[i + 1] = lut[1][data[i + 1]];
      data[i + 2] = lut[2][data[i + 2]];
      // Alpha unchanged
    }

    // Write back
    const result = document.createElement('canvas');
    result.width = srcCanvas.width;
    result.height = srcCanvas.height;
    result.getContext('2d').putImageData(imgData, 0, 0);
    return result;
  });

  setState({ statusMessage: 'Applied Histogram Equalization' });
  _tryPython('histogram_eq', {});
}

// ══════════════════════════════════════════════════════════════
// ── Sharpen (unsharp mask via convolution) ────────────────────
// ══════════════════════════════════════════════════════════════

export function sharpen(amount = 1.0, type = 'standard') {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const src = imgData.data;
    const w = srcCanvas.width, h = srcCanvas.height;
    const out = new Uint8ClampedArray(src);

    // Sharpen kernel: center = 1 + 4*amount, edges = -amount
    const a = amount;
    const kernel = [
       0, -a,  0,
      -a, 1 + 4 * a, -a,
       0, -a,  0,
    ];

    if (type === 'strong') {
      // Stronger kernel for "strong" mode
      kernel[0] = -a; kernel[2] = -a;
      kernel[6] = -a; kernel[8] = -a;
      kernel[4] = 1 + 8 * a;
    }

    // Apply 3×3 convolution
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * w + (x + kx)) * 4 + c;
              sum += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          out[(y * w + x) * 4 + c] = sum;
        }
      }
    }

    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    const outData = new ImageData(out, w, h);
    result.getContext('2d').putImageData(outData, 0, 0);
    return result;
  });

  setState({ statusMessage: `Applied Sharpen` });
  _tryPython('sharpen', { amount, type });
}

// ══════════════════════════════════════════════════════════════
// ── Blur (Gaussian approximation via box blur) ───────────────
// ══════════════════════════════════════════════════════════════

export function blur(method = 'gaussian', kernelSize = 5) {
  _applyToImage((srcCanvas) => {
    const tmp = document.createElement('canvas');
    tmp.width = srcCanvas.width;
    tmp.height = srcCanvas.height;
    const ctx = tmp.getContext('2d');
    ctx.filter = `blur(${Math.round(kernelSize / 2)}px)`;
    ctx.drawImage(srcCanvas, 0, 0);
    return tmp;
  });

  setState({ statusMessage: `Applied ${method} blur (k=${kernelSize})` });
}
