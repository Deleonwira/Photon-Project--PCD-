/* PHOTON — Color Service */

import { getLoadedImage, setLoadedImage, getCanvas } from './ImageEngine.js';
import { getState, setState } from '../utils/state.js';
import { apiPost } from '../utils/api.js';

// ── Shared: apply pixel transform to loadedImageElement ─────
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

  apiPost('/color/apply', {
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
    console.info(`Python color skipped (${operation}): backend offline`);
  });
}

// ── RGB ↔ HSL Conversion ────────────────────────────────────
function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100]; // H in degrees, S/L in %
}

function _hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

// ══════════════════════════════════════════════════════════════
// ── HSL Color Adjustment (JS) ───────────────────────────────
// ══════════════════════════════════════════════════════════════

function _jsAdjustColor(hueShift, satFactor, lightShift) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      let [h, s, l] = _rgbToHsl(data[i], data[i + 1], data[i + 2]);

      // Apply adjustments
      h = (h + hueShift + 360) % 360;
      s = Math.min(100, Math.max(0, s * satFactor));
      l = Math.min(100, Math.max(0, l + lightShift));

      const [r, g, b] = _hslToRgb(h, s, l);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    const result = document.createElement('canvas');
    result.width = srcCanvas.width;
    result.height = srcCanvas.height;
    result.getContext('2d').putImageData(imgData, 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Grayscale (JS: luminance formula) ───────────────────────
// ══════════════════════════════════════════════════════════════

function _jsGrayscale() {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    const result = document.createElement('canvas');
    result.width = srcCanvas.width;
    result.height = srcCanvas.height;
    result.getContext('2d').putImageData(imgData, 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Channel Split (JS: isolate single channel) ──────────────
// ══════════════════════════════════════════════════════════════

function _jsChannelSplit(channel) {
  _applyToImage((srcCanvas) => {
    const ctx = srcCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (channel !== 'r') data[i] = 0;
      if (channel !== 'g') data[i + 1] = 0;
      if (channel !== 'b') data[i + 2] = 0;
    }

    const result = document.createElement('canvas');
    result.width = srcCanvas.width;
    result.height = srcCanvas.height;
    result.getContext('2d').putImageData(imgData, 0, 0);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// ── Public API ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export function adjustColor(hueShift, satFactor, lightShift) {
  _jsAdjustColor(hueShift, satFactor, lightShift);
  setState({ statusMessage: `Color: H${hueShift > 0 ? '+' : ''}${hueShift}° S×${satFactor.toFixed(1)} L${lightShift > 0 ? '+' : ''}${lightShift}` });
  _tryPython('color_adjust', { hue_shift: hueShift, saturation_factor: satFactor, lightness_shift: lightShift });
}

export function toGrayscale() {
  _jsGrayscale();
  setState({ statusMessage: 'Applied Grayscale' });
  _tryPython('grayscale', {});
}

export function channelRed() {
  _jsChannelSplit('r');
  setState({ statusMessage: 'Channel: Red only' });
  _tryPython('channel_split', { channel: 'r' });
}

export function channelGreen() {
  _jsChannelSplit('g');
  setState({ statusMessage: 'Channel: Green only' });
  _tryPython('channel_split', { channel: 'g' });
}

export function channelBlue() {
  _jsChannelSplit('b');
  setState({ statusMessage: 'Channel: Blue only' });
  _tryPython('channel_split', { channel: 'b' });
}
