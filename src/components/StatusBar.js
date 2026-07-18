/* PHOTON — Status Bar Component */
import { subscribe } from '../utils/state.js';

export function initStatusBar(container) {
  container.innerHTML = `
    <div class="statusbar-left">
      <span class="status-msg" id="status-msg">Ready</span>
    </div>
    <div class="statusbar-right">
      <div class="status-item" id="status-zoom">100%</div>
      <div class="status-item" id="status-dims">1920 × 1080</div>
      <div class="status-item" id="status-cursor">X: 0 &nbsp;Y: 0</div>
      <div class="status-item">
        <span class="status-swatch" id="status-swatch" style="background:#5A3E8C"></span>
        <span id="status-color">RGB(90, 62, 140)</span>
      </div>
    </div>
  `;

  const msgEl = container.querySelector('#status-msg');
  const zoomEl = container.querySelector('#status-zoom');
  const dimsEl = container.querySelector('#status-dims');
  const cursorEl = container.querySelector('#status-cursor');

  subscribe('statusMessage', (msg) => { msgEl.textContent = msg; });
  subscribe('zoomLevel', (z) => { zoomEl.textContent = `${z}%`; });

  subscribe('imageInfo', (info) => {
    if (info && info.width) {
      dimsEl.textContent = `${info.width} × ${info.height}`;
    }
  });

  subscribe('cursorPos', (pos) => {
    if (pos) {
      cursorEl.textContent = `X: ${pos.x}  Y: ${pos.y}`;
    } else {
      cursorEl.textContent = 'X: –  Y: –';
    }
  });

  // Tool-specific status hints
  const toolHints = {
    pointer: 'Ready',
    crop: 'Click and drag to define crop region',
    rotate: 'Adjust rotation angle in the Properties panel',
    brightness: 'Adjust brightness and contrast sliders',
    blur: 'Select filter type and kernel size',
    edge: 'Select edge detection algorithm',
    segment: 'Choose segmentation method',
    color: 'Adjust hue, saturation, and lightness',
    threshold: 'Set binary threshold value (0–255)',
    sharpen: 'Adjust sharpening amount and radius',
    ai: 'Select object type and run CNN recognition',
    resize: 'Enter new dimensions or scale percentage',
    flipH: 'Click to flip the image',
  };

  subscribe('activeTool', (tool) => {
    msgEl.textContent = toolHints[tool] || 'Ready';
  });
}
