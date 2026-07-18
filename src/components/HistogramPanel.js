/* PHOTON — Histogram Panel */

import { subscribe, getState } from '../utils/state.js';
import { getLoadedImage, onImageLoad } from '../services/ImageEngine.js';

let activeChannels = ['r', 'g', 'b'];
let histImg = null;
let histCanvas = null;
let statsEls = {};
let refreshTimer = null;

export function initHistogramPanel(container) {
  container.innerHTML = `
    <div class="channel-toggles">
      <button class="channel-btn active-r" data-ch="r">R</button>
      <button class="channel-btn active-g" data-ch="g">G</button>
      <button class="channel-btn active-b" data-ch="b">B</button>
      <button class="channel-btn" data-ch="gray">L</button>
    </div>
    <div class="histogram-canvas-wrap">
      <img id="histogram-img" alt="Histogram" style="width:100%;display:none;" />
      <canvas id="histogram-canvas"></canvas>
    </div>
    <div class="panel-section">
      <div class="panel-section-title" style="margin-bottom:var(--sp-2)">Statistics</div>
      <div class="info-row"><span class="info-label">Mean</span><span class="info-value" id="stat-mean">–</span></div>
      <div class="info-row"><span class="info-label">Std Dev</span><span class="info-value" id="stat-std">–</span></div>
      <div class="info-row"><span class="info-label">Min</span><span class="info-value" id="stat-min">–</span></div>
      <div class="info-row"><span class="info-label">Max</span><span class="info-value" id="stat-max">–</span></div>
    </div>
  `;

  histImg = container.querySelector('#histogram-img');
  histCanvas = container.querySelector('#histogram-canvas');

  statsEls = {
    mean: container.querySelector('#stat-mean'),
    std: container.querySelector('#stat-std'),
    min: container.querySelector('#stat-min'),
    max: container.querySelector('#stat-max'),
  };

  // Toggle channel buttons
  container.querySelectorAll('.channel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.ch;
      const idx = activeChannels.indexOf(ch);
      if (idx >= 0) {
        activeChannels.splice(idx, 1);
        btn.classList.remove(`active-${ch}`);
      } else {
        activeChannels.push(ch);
        btn.classList.add(`active-${ch}`);
      }
      refreshHistogram();
    });
  });

  // Draw placeholder
  drawPlaceholder(histCanvas);

  // Refresh on image load
  onImageLoad(() => scheduleRefresh());

  // Refresh after any processing operation (debounced)
  subscribe('statusMessage', (msg) => {
    if (msg && (msg.startsWith('Applied') || msg.startsWith('Undo') ||
        msg.startsWith('Redo') || msg.startsWith('Threshold') ||
        msg.startsWith('Canny') || msg.startsWith('Sobel') ||
        msg.startsWith('K-Means') || msg.startsWith('Color') ||
        msg.startsWith('AI:') || msg.startsWith('Loaded') ||
        msg.startsWith('Opened') || msg.startsWith('Created') ||
        msg.startsWith('Saved') || msg.startsWith('Flip') ||
        msg.startsWith('Rotate') || msg.startsWith('Crop') ||
        msg.startsWith('Resize') || msg.startsWith('Bright') ||
        msg.startsWith('Sharpen') || msg.startsWith('Blur') ||
        msg.startsWith('Noise') || msg.startsWith('Edge') ||
        msg.startsWith('Prewitt') || msg.startsWith('Robert') ||
        msg.startsWith('Laplacian') || msg.startsWith('LoG') ||
        msg.startsWith('Erode') || msg.startsWith('Dilate') ||
        msg.startsWith('Grayscale') || msg.startsWith('Channel') ||
        msg.startsWith('Segment') || msg.startsWith('Reset'))) {
      scheduleRefresh();
    }
  });

  // Refresh when histogram panel becomes visible (BOE-096: zero-dimension fix)
  subscribe('activePanel', (panel) => {
    if (panel === 'histogram') scheduleRefresh();
  });
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshHistogram(), 300);
}

// ── JS Histogram Computation ────────────────────────────────
function _computeHistogramJS() {
  const img = getLoadedImage();
  if (!img) return null;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return null;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w; tmpCanvas.height = h;
  tmpCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const data = tmpCanvas.getContext('2d').getImageData(0, 0, w, h).data;

  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  const histGray = new Uint32Array(256);
  let sumR = 0, sumG = 0, sumB = 0, sumGray = 0;
  let minR = 255, minG = 255, minB = 255, minGray = 255;
  let maxR = 0, maxG = 0, maxB = 0, maxGray = 0;
  const n = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histR[r]++; histG[g]++; histB[b]++; histGray[gray]++;
    sumR += r; sumG += g; sumB += b; sumGray += gray;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minG = Math.min(minG, g); maxG = Math.max(maxG, g);
    minB = Math.min(minB, b); maxB = Math.max(maxB, b);
    minGray = Math.min(minGray, gray); maxGray = Math.max(maxGray, gray);
  }

  const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n, meanGray = sumGray / n;

  // Std dev (second pass)
  let varR = 0, varG = 0, varB = 0, varGray = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    varR += (r - meanR) ** 2;
    varG += (g - meanG) ** 2;
    varB += (b - meanB) ** 2;
    varGray += (gray - meanGray) ** 2;
  }

  return {
    histograms: { r: histR, g: histG, b: histB, gray: histGray },
    stats: {
      r: { mean: meanR.toFixed(1), std: Math.sqrt(varR / n).toFixed(1), min: minR, max: maxR },
      g: { mean: meanG.toFixed(1), std: Math.sqrt(varG / n).toFixed(1), min: minG, max: maxG },
      b: { mean: meanB.toFixed(1), std: Math.sqrt(varB / n).toFixed(1), min: minB, max: maxB },
      gray: { mean: meanGray.toFixed(1), std: Math.sqrt(varGray / n).toFixed(1), min: minGray, max: maxGray },
    },
  };
}

// ── JS Canvas Histogram Rendering ───────────────────────────
function _drawHistogramJS(histData) {
  if (!histCanvas || !histData) return;

  const dpr = window.devicePixelRatio || 1;
  const displayW = histCanvas.offsetWidth || 260;
  const displayH = histCanvas.offsetHeight || 130;
  histCanvas.width = displayW * dpr;
  histCanvas.height = displayH * dpr;
  histCanvas.style.display = 'block';
  if (histImg) histImg.style.display = 'none';

  const ctx = histCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displayW, displayH);

  // Background
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(0, 0, displayW, displayH);

  const padding = { top: 8, right: 8, bottom: 16, left: 8 };
  const chartW = displayW - padding.left - padding.right;
  const chartH = displayH - padding.top - padding.bottom;

  const channels = activeChannels.length > 0 ? activeChannels : ['r', 'g', 'b'];
  const colors = { r: 'rgba(255, 68, 68, 0.6)', g: 'rgba(68, 255, 68, 0.6)', b: 'rgba(68, 136, 255, 0.6)', gray: 'rgba(200, 200, 200, 0.6)' };
  const strokeColors = { r: '#ff4444', g: '#44ff44', b: '#4488ff', gray: '#cccccc' };

  // Find global max for scaling
  let globalMax = 0;
  for (const ch of channels) {
    const hist = histData.histograms[ch];
    if (!hist) continue;
    for (let i = 0; i < 256; i++) {
      if (hist[i] > globalMax) globalMax = hist[i];
    }
  }
  if (globalMax === 0) return;

  // Draw each channel
  for (const ch of channels) {
    const hist = histData.histograms[ch];
    if (!hist) continue;

    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    for (let i = 0; i < 256; i++) {
      const x = padding.left + (i / 255) * chartW;
      const y = padding.top + chartH - (hist[i] / globalMax) * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = colors[ch];
    ctx.fill();
    ctx.strokeStyle = strokeColors[ch];
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Axis labels
  ctx.fillStyle = '#666';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('0', padding.left, displayH - 2);
  ctx.textAlign = 'right';
  ctx.fillText('255', displayW - padding.right, displayH - 2);
}

// ── Refresh: JS-first, Python fallback ──────────────────────
async function refreshHistogram() {
  const jsData = _computeHistogramJS();
  if (jsData) {
    _drawHistogramJS(jsData);
    _updateStats(jsData.stats);
  }
}

function _updateStats(stats) {
  const ch = activeChannels.includes('gray') ? 'gray' : (activeChannels[0] || 'gray');
  const s = stats[ch];
  if (s) {
    statsEls.mean.textContent = s.mean;
    statsEls.std.textContent = s.std;
    statsEls.min.textContent = s.min;
    statsEls.max.textContent = s.max;
  }
}

function drawPlaceholder(canvas) {
  const w = canvas.width = canvas.offsetWidth * 2 || 400;
  const h = canvas.height = canvas.offsetHeight * 2 || 200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#666';
  ctx.font = '12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Load an image to see histogram', w / 2, h / 2);
}
