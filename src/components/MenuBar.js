/* PHOTON — MenuBar Component */
import { chevronRight, sparkles, home } from '../icons/icons.js';
import { getLabel } from '../utils/shortcuts.js';
import { setState, getState, subscribe } from '../utils/state.js';
import { navigate } from '../utils/router.js';
import { openExportModal } from './ExportModal.js';
import { openNewProjectModal } from './NewProjectModal.js';
import { openFileDialog, saveImage } from '../services/ImageEngine.js';
import { undo, redo, resetImage, pushState } from '../services/HistoryStack.js';
import { flipH, flipV, rotate90CW, rotate90CCW, rotate180 } from '../services/TransformService.js';
import { equalizeHistogram } from '../services/EnhanceService.js';
import { toGrayscale, channelRed, channelGreen, channelBlue } from '../services/ColorService.js';

import { startTour } from './PageGuide.js';
import { openSplashScreen } from './SplashScreen.js';

// ── Menu Data (maps every DOCX spec feature) ──────────────
const MENUS = [
  { id: 'file', label: 'File', items: [
    { id: 'new-project', label: 'New Project' },
    { id: 'open', label: 'Open Image', shortcut: 'ctrl+o' },
    'sep',
    { id: 'save', label: 'Save Project', shortcut: 'ctrl+s' },
    { id: 'export', label: 'Export As...', shortcut: 'ctrl+e' },
    'sep',
    { id: 'reset', label: 'Reset Image' },
    'sep',
    { id: 'exit', label: 'Back to Dashboard' },
  ]},
  { id: 'edit', label: 'Edit', items: [
    { id: 'undo', label: 'Undo', shortcut: 'ctrl+z' },
    { id: 'redo', label: 'Redo', shortcut: 'ctrl+y' },
    'sep',
    { id: 'crop-edit', label: 'Crop' },
    { id: 'resize-edit', label: 'Resize' },
  ]},
  { id: 'image', label: 'Image', items: [
    { id: 'brightness', label: 'Brightness / Contrast' },
    { id: 'hist-eq', label: 'Histogram Equalization' },
    'sep',
    { id: 'grayscale', label: 'Grayscale' },
    { id: 'channel', label: 'Channel Split', children: [
      { id: 'ch-r', label: 'Red Channel' },
      { id: 'ch-g', label: 'Green Channel' },
      { id: 'ch-b', label: 'Blue Channel' },
    ]},
    { id: 'color-adj', label: 'Color Adjust (Hue/Sat)' },
  ]},
  { id: 'filter', label: 'Filter', items: [
    { id: 'sharpen', label: 'Sharpen' },
    { id: 'smooth', label: 'Smooth (Blur)' },
    'sep',
    { id: 'gauss', label: 'Gaussian Blur' },
    { id: 'median', label: 'Median Filter' },
    { id: 'noise', label: 'Noise Removal' },
    'sep',
    { id: 'edge', label: 'Edge Detection', children: [
      { id: 'canny', label: 'Canny' },
      { id: 'sobel', label: 'Sobel' },
      { id: 'prewitt', label: 'Prewitt' },
      { id: 'robert', label: 'Robert' },
      { id: 'laplacian', label: 'Laplacian' },
      { id: 'log', label: 'Laplacian of Gaussian' },
    ]},
    'sep',
    { id: 'morph', label: 'Morphology', children: [
      { id: 'erosion', label: 'Erosion' },
      { id: 'dilation', label: 'Dilation' },
    ]},
    'sep',
    { id: 'seg', label: 'Segmentation', children: [
      { id: 'seg-thresh', label: 'Threshold-based' },
      { id: 'seg-edge', label: 'Edge-based' },
      { id: 'seg-region', label: 'Region-based' },
    ]},
  ]},
  { id: 'transform', label: 'Transform', items: [
    { id: 'rotate-free', label: 'Rotate (Free)' },
    { id: 'rotate-90cw', label: 'Rotate 90° CW' },
    { id: 'rotate-90ccw', label: 'Rotate 90° CCW' },
    { id: 'rotate-180', label: 'Rotate 180°' },
    'sep',
    { id: 'flip-h', label: 'Flip Horizontal' },
    { id: 'flip-v', label: 'Flip Vertical' },
    'sep',
    { id: 'translate', label: 'Translation (Shift)' },
    { id: 'resize-t', label: 'Resize' },
  ]},
  { id: 'view', label: 'View', items: [
    { id: 'zoom-in', label: 'Zoom In', shortcut: 'ctrl+=' },
    { id: 'zoom-out', label: 'Zoom Out', shortcut: 'ctrl+-' },
    { id: 'fit', label: 'Fit to Screen', shortcut: 'ctrl+0' },
    { id: 'actual', label: 'Actual Size', shortcut: 'ctrl+1' },
    'sep',
    { id: 'split-toggle', label: 'Before / After Compare' },
    'sep',
    { id: 'hist-panel', label: 'Histogram Panel' },
    { id: 'layers-panel', label: 'Layers Panel' },
  ]},
  { id: 'ai', label: 'AI', className: 'ai-menu', items: [
    { id: 'cnn', label: 'Object Recognition (CNN)' },
  ]},
  { id: 'help', label: 'Help', items: [
    { id: 'tour-guide', label: 'Panduan Fitur (Interactive Tour)' },
    'sep',
    { id: 'splash-about', label: 'Tentang Photon (Splash Screen)' },
  ]},
];

// ── Render Functions ──────────────────────────────────────
function renderItems(items) {
  return items.map(item => {
    if (item === 'sep') return '<div class="dropdown-separator"></div>';
    const shortcutHtml = item.shortcut
      ? `<span class="item-shortcut">${getLabel(item.shortcut)}</span>` : '';
    const arrowHtml = item.children
      ? `<span class="item-arrow">${chevronRight()}</span>` : '';
    const submenuHtml = item.children
      ? `<div class="submenu hidden">${renderItems(item.children)}</div>` : '';
    const cls = item.children ? 'dropdown-item has-submenu' : 'dropdown-item';
    return `<div class="${cls}" data-action="${item.id}">
      <span class="item-label">${item.label}</span>
      ${shortcutHtml}${arrowHtml}${submenuHtml}
    </div>`;
  }).join('');
}

let openMenu = null;

function closeAll() {
  openMenu = null;
  document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
}

function openDropdown(menuItem, dropdown) {
  closeAll();
  openMenu = menuItem;
  dropdown.classList.remove('hidden');
  menuItem.classList.add('active');
}

export function initMenuBar(container) {
  // Home button + Logo + title
  let html = `<button class="menubar-home-btn" id="menubar-home" title="Back to Dashboard">${home()}</button>`;
  html += `<img src="/logo.png" alt="Photon" class="menubar-logo" />`;
  html += `<span class="menubar-title" id="menubar-title">Photon</span>`;

  // Menu items with dropdowns
  MENUS.forEach(menu => {
    const extraCls = menu.className ? ` ${menu.className}` : '';
    html += `<div class="menu-item${extraCls}" data-menu="${menu.id}">
      ${menu.id === 'ai' ? sparkles({ size: 14 }) + '&nbsp;' : ''}${menu.label}
      <div class="menu-dropdown hidden">${renderItems(menu.items)}</div>
    </div>`;
  });

  container.innerHTML = html;

  // ── Event: open/close menus ──────────────────────────────
  container.querySelectorAll('.menu-item').forEach(mi => {
    const dd = mi.querySelector('.menu-dropdown');
    mi.addEventListener('click', (e) => {
      if (e.target.closest('.dropdown-item')) return;
      if (openMenu === mi) { closeAll(); }
      else { openDropdown(mi, dd); }
    });
    mi.addEventListener('mouseenter', () => {
      if (openMenu && openMenu !== mi) openDropdown(mi, dd);
    });
  });

  // ── Event: submenus on hover ─────────────────────────────
  container.querySelectorAll('.has-submenu').forEach(item => {
    const sub = item.querySelector('.submenu');
    let timer;
    item.addEventListener('mouseenter', () => {
      clearTimeout(timer);
      item.closest('.menu-dropdown').querySelectorAll('.submenu').forEach(s => s.classList.add('hidden'));
      sub.classList.remove('hidden');
    });
    item.addEventListener('mouseleave', () => {
      timer = setTimeout(() => sub.classList.add('hidden'), 200);
    });
    sub.addEventListener('mouseenter', () => clearTimeout(timer));
    sub.addEventListener('mouseleave', () => {
      timer = setTimeout(() => sub.classList.add('hidden'), 200);
    });
  });

  // ── Event: action clicks ────────────────────────────────
  container.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (item.classList.contains('has-submenu')) return;
      const action = item.dataset.action;
      handleMenuAction(action);
      closeAll();
    });
  });

  // ── Home button ─────────────────────────────────────────
  container.querySelector('#menubar-home').addEventListener('click', () => {
    navigate('#/dashboard');
  });

  // ── Close on outside click / Escape ─────────────────────
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menubar')) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  // ── Dynamic project title (VS Code style) ───────────────
  const titleEl = container.querySelector('#menubar-title');
  subscribe('imageInfo', (info) => {
    if (info && info.name) {
      titleEl.textContent = `Photon — ${info.name}`;
    } else {
      titleEl.textContent = 'Photon';
    }
  });
}

function handleMenuAction(action) {
  // Map menu actions to state/tool changes
  const toolMap = {
    'brightness': 'brightness',
    'crop-edit': 'crop',
    'resize-edit': 'resize',
    'resize-t': 'resize',
    'rotate-free': 'rotate',
    'sharpen': 'sharpen',
    'smooth': 'blur',
    'gauss': 'blur',
    'median': 'blur',
    'noise': 'blur',
    'color-adj': 'color',
    'grayscale': 'color',
    'canny': 'edge', 'sobel': 'edge', 'prewitt': 'edge',
    'robert': 'edge', 'laplacian': 'edge', 'log': 'edge',
    'erosion': 'edge', 'dilation': 'edge',
    'seg-thresh': 'segment', 'seg-edge': 'segment', 'seg-region': 'segment',
    'cnn': 'ai',
  };
  const panelMap = {
    'hist-panel': 'histogram',
    'layers-panel': 'layers',
  };

  if (toolMap[action]) {
    setState({ activeTool: toolMap[action] });
  }
  if (panelMap[action]) {
    setState({ activePanel: panelMap[action] });
  }
  if (action === 'split-toggle') {
    // Open the Before/After comparison modal
    const btn = document.querySelector('#btn-compare');
    if (btn) btn.click();
  }
  if (action === 'tour-guide') {
    startTour('editor', true);
    return;
  }
  if (action === 'splash-about') {
    openSplashScreen();
    return;
  }
  if (action === 'export') {
    openExportModal();
    return;
  }
  if (action === 'open') {
    openFileDialog();
    return;
  }
  if (action === 'save') {
    // Save project to IndexedDB (not a file download)
    window.dispatchEvent(new CustomEvent('photon-save-project'));
    return;
  }
  if (action === 'new-project') {
    openNewProjectModal();
    return;
  }
  if (action === 'exit') {
    navigate('#/dashboard');
    return;
  }
  if (action === 'undo') {
    undo();
    return;
  }
  if (action === 'redo') {
    redo();
    return;
  }
  if (action === 'reset') {
    resetImage();
    return;
  }
  // ── Transform actions (C3) ──────────────────────────────
  if (action === 'flip-h') { flipH(); return; }
  if (action === 'flip-v') { flipV(); return; }
  if (action === 'rotate-90cw') { rotate90CW(); return; }
  if (action === 'rotate-90ccw') { rotate90CCW(); return; }
  if (action === 'rotate-180') { rotate180(); return; }
  if (action === 'rotate-free') {
    setState({ activeTool: 'rotate' });
    return;
  }
  if (action === 'translate') {
    setState({ activeTool: 'resize' });
    return;
  }
  // ── View actions (zoom) ─────────────────────────────────
  if (action === 'zoom-in') {
    setState({ zoomLevel: Math.min(500, (getState().zoomLevel || 100) + 25) });
    return;
  }
  if (action === 'zoom-out') {
    setState({ zoomLevel: Math.max(25, (getState().zoomLevel || 100) - 25) });
    return;
  }
  if (action === 'fit') {
    setState({ zoomLevel: 100 });
    return;
  }
  if (action === 'actual') {
    setState({ zoomLevel: 100 });
    return;
  }
  // ── Enhancement actions (C4) ───────────────────────────
  if (action === 'hist-eq') { equalizeHistogram(); return; }
  if (action === 'grayscale') { pushState('Grayscale'); toGrayscale(); return; }
  if (action === 'ch-r') { pushState('Channel: Red'); channelRed(); return; }
  if (action === 'ch-g') { pushState('Channel: Green'); channelGreen(); return; }
  if (action === 'ch-b') { pushState('Channel: Blue'); channelBlue(); return; }

  setState({ statusMessage: `Menu: ${action}` });
}
