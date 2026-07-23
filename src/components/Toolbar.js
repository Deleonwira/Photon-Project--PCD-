/* PHOTON — Toolbar Component */
import * as icons from '../icons/icons.js';
import { setState, subscribe } from '../utils/state.js';

const TOOLS = [
  // group: Navigation
  [
    { id: 'pointer', label: 'Select / Move', icon: 'pointer', shortcut: 'V' },
  ],
  // group: Transform
  [
    { id: 'crop', label: 'Crop Image', icon: 'crop', shortcut: 'C' },
    { id: 'rotate', label: 'Rotate Image', icon: 'rotateCw', shortcut: 'R' },
    { id: 'flipH', label: 'Flip Image', icon: 'flipH' },
    { id: 'resize', label: 'Resize & Scale', icon: 'resize' },
  ],
  // group: Enhancement
  [
    { id: 'brightness', label: 'Brightness & Contrast', icon: 'sun', shortcut: 'B' },
    { id: 'sharpen', label: 'Sharpen Image', icon: 'zap' },
    { id: 'blur', label: 'Blur & Smooth', icon: 'droplet' },
  ],
  // group: Color
  [
    { id: 'color', label: 'Color Adjustments', icon: 'palette' },
    { id: 'threshold', label: 'Threshold & Binary', icon: 'grid' },
  ],
  // group: Analysis
  [
    { id: 'edge', label: 'Edge Detection', icon: 'layers' },
    { id: 'segment', label: 'Segmentation', icon: 'segment' },
  ],
  // group: AI
  [
    { id: 'ai', label: 'AI Object Recognition', icon: 'sparkles', className: 'ai-tool' },
  ],
];

export function initToolbar(container) {
  let html = '';

  TOOLS.forEach((group, gi) => {
    if (gi > 0) html += '<div class="toolbar-divider"></div>';
    html += '<div class="toolbar-group">';
    group.forEach(tool => {
      const iconFn = icons[tool.icon];
      const iconSvg = iconFn ? iconFn() : '';
      const extraCls = tool.className ? ` ${tool.className}` : '';
      const shortcutHtml = tool.shortcut
        ? `<span class="tt-shortcut">${tool.shortcut}</span>` : '';
      html += `
        <button class="tool-btn${extraCls}" data-tool="${tool.id}">
          ${iconSvg}
          <span class="tool-tooltip">${tool.label}${shortcutHtml}</span>
        </button>`;
    });
    html += '</div>';
  });

  container.innerHTML = html;

  // ── Event: tool selection ────────────────────────────────
  container.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ activeTool: btn.dataset.tool });
    });
  });

  // ── State: active tool highlight ─────────────────────────
  subscribe('activeTool', (tool) => {
    container.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  });
}
