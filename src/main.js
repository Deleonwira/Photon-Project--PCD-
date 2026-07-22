/* PHOTON — Main */

// ── Styles (order matters) ─────────────────────────────────
import './styles/index.css';
import './styles/animations.css';
import './styles/layout.css';
import './styles/menubar.css';
import './styles/toolbar.css';
import './styles/canvas.css';
import './styles/panels.css';
import './styles/statusbar.css';
import './styles/welcome.css';
import './styles/modals.css';
import './styles/dashboard.css';
import './styles/new-project.css';
import './styles/export.css';
import './styles/login.css';
import './styles/interaction.css';
import './styles/splash.css';
import './styles/guide.css';

// ── Onboarding & Guide Components ──────────────────────────
import { openSplashScreen, shouldShowSplashOnBoot } from './components/SplashScreen.js';
import { startTour } from './components/PageGuide.js';

// ── Router ─────────────────────────────────────────────────
import { initRouter } from './utils/router.js';
import { subscribe, setState, getState } from './utils/state.js';

// ── Editor Components (lazy-init) ──────────────────────────
import { initMenuBar } from './components/MenuBar.js';
import { initToolbar } from './components/Toolbar.js';
import { initCanvas } from './components/Canvas.js';
import { initPanelManager } from './components/PanelManager.js';
import { initPropertiesPanel } from './components/PropertiesPanel.js';
import { initHistogramPanel } from './components/HistogramPanel.js';
import { initLayersPanel } from './components/LayersPanel.js';
import { initStatusBar } from './components/StatusBar.js';
import { initWelcomeScreen } from './components/WelcomeScreen.js';
import { initShortcuts, register } from './utils/shortcuts.js';
import { openFileDialog, saveImage, initProjectCanvas, loadProjectFromStore, getCanvas, getLoadedImage, deleteLoadedImage } from './services/ImageEngine.js';
import { undo, redo } from './services/HistoryStack.js';
import { initInteractionLayer } from './components/InteractionLayer.js';
import { initClipboardHandler, pasteFromClipboard } from './services/ClipboardService.js';

// ── Dashboard Components ───────────────────────────────────
import { initDashboard } from './components/Dashboard.js';
import { openExportModal } from './components/ExportModal.js';
import { initLoginScreen } from './components/LoginScreen.js';

// ── Unified Project Store ──────────────────────────────────
import { saveProject, getProject, generateThumbnail } from './services/ProjectStore.js';

// ── View Containers ────────────────────────────────────────
const viewDashboard = document.getElementById('view-dashboard');
const viewEditor = document.getElementById('view-editor');

let editorMounted = false;
let dashboardMounted = false;
let loginMounted = false;
let viewLogin = null;

// ── Mount Editor (once — initializes UI components only) ───
function mountEditor() {
  if (editorMounted) return;
  editorMounted = true;

  initClipboardHandler();

  initMenuBar(document.getElementById('menubar'));
  initToolbar(document.getElementById('toolbar'));
  initCanvas(document.getElementById('canvas-workspace'));
  initStatusBar(document.getElementById('statusbar'));

  initPanelManager(document.getElementById('panels'));
  initPropertiesPanel(document.getElementById('panel-properties'));
  initHistogramPanel(document.getElementById('panel-histogram'));
  initLayersPanel(document.getElementById('panel-layers'));

  initWelcomeScreen(document.getElementById('canvas-workspace'));
  initInteractionLayer(document.getElementById('canvas-workspace'));

  // Keyboard shortcuts
  register('ctrl+o', 'Open Image', () => openFileDialog());
  register('ctrl+s', 'Save Project', () => {
    autoSaveCurrentProject().then(() => setState({ statusMessage: 'Project saved' }));
  });
  register('ctrl+e', 'Export', () => openExportModal());
  register('ctrl+v', 'Paste Image', () => pasteFromClipboard());
  register('delete', 'Delete Image', () => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
    deleteLoadedImage();
  });
  register('backspace', 'Delete Image', () => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
    deleteLoadedImage();
  });
  register('ctrl+b', 'Toggle Panels', () => {
    setState({ panelsCollapsed: !getState().panelsCollapsed });
  });
  register('ctrl+z', 'Undo', () => undo());
  register('ctrl+y', 'Redo', () => redo());
  register('ctrl+=', 'Zoom In', () => {
    const z = Math.min(500, (document.querySelector('#zoom-display')?.textContent?.replace('%','') | 0) + 25 || 125);
    setState({ zoomLevel: z });
  });
  register('ctrl+-', 'Zoom Out', () => {
    const z = Math.max(25, (document.querySelector('#zoom-display')?.textContent?.replace('%','') | 0) - 25 || 75);
    setState({ zoomLevel: z });
  });
  initShortcuts();

  // Auto-save every 30 seconds (BOE-087: ensures most work survives refresh)
  setInterval(() => {
    if (getState().imageLoaded && getState().currentProjectId) {
      autoSaveCurrentProject();
    }
  }, 30000);
}

// ── Load Project into Editor ───────────────────────────────
async function loadEditorProject() {
  // ── FULL RESET — wipe all stale state from previous project ──
  setState({
    activeTool: 'pointer',
    imageLoaded: false,
    imageTransform: null,
    imageInfo: { name: '', width: 0, height: 0, format: '', size: '' },
    statusMessage: 'Loading...',
  });

  const settings = getState().newProjectSettings;
  const params = getState().routeParams;

  if (settings) {
    // New project from modal — create blank canvas + save to IndexedDB
    const id = crypto.randomUUID();
    initProjectCanvas(settings);
    setState({ currentProjectId: id, newProjectSettings: null });

    // Save initial project record to IndexedDB
    await saveProject({
      id,
      name: settings.name,
      width: settings.width,
      height: settings.height,
      background: settings.background,
      imageDataUrl: null,  // Will be saved on auto-save
      thumbnailDataUrl: null,
    });

    setState({ statusMessage: `Created: ${settings.name} (${settings.width}×${settings.height})` });
  } else if (params.projectId) {
    // Existing project from dashboard card click
    try {
      const project = await getProject(params.projectId);
      if (project) {
        setState({ currentProjectId: project.id });
        await loadProjectFromStore(project);
      } else {
        setState({ statusMessage: 'Project not found' });
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      setState({ statusMessage: `Error loading project: ${err.message}` });
    }
  } else {
    // BOE-087: No project context — check localStorage for last-edited project (refresh recovery)
    const lastPid = localStorage.getItem('photon_last_project');
    if (lastPid) {
      try {
        const project = await getProject(lastPid);
        if (project) {
          setState({ currentProjectId: project.id });
          await loadProjectFromStore(project);
          setState({ statusMessage: `Restored: ${project.name}` });
        }
      } catch (err) {
        console.error('Failed to restore last project:', err);
      }
    }
    // else: editor opened without a project context — shows welcome screen
  }
}

// ── Auto-Save Current Project ──────────────────────────────
async function autoSaveCurrentProject() {
  const projectId = getState().currentProjectId;
  if (!projectId || !getState().imageLoaded) return;

  try {
    const canvas = getCanvas();
    if (!canvas || canvas.width === 0) return;

    const imageDataUrl = canvas.toDataURL('image/png');
    const thumbnailDataUrl = generateThumbnail(canvas);

    // Save raw image source separately for proper reload
    const loadedImg = getLoadedImage();
    const rawImageSrc = loadedImg
      ? (loadedImg.src || loadedImg.toDataURL?.('image/png') || null)
      : null;
    const imageTransform = getState().imageTransform || null;

    // Merge with existing project data (preserve name, background, etc.)
    const existing = await getProject(projectId);
    await saveProject({
      ...(existing || {}),
      id: projectId,
      name: existing?.name || getState().imageInfo?.name || 'Untitled',
      width: canvas.width,
      height: canvas.height,
      background: existing?.background || getState().projectBackground || '#FFFFFF',
      rawImageSrc,
      imageTransform,
      imageDataUrl,
      thumbnailDataUrl,
    });

    console.log(`[Photon] Auto-saved project: ${projectId}`);
  } catch (err) {
    console.error('Auto-save failed:', err);
  }
}

// ── Mount Dashboard (once) ─────────────────────────────────
function mountDashboard() {
  if (dashboardMounted) return;
  dashboardMounted = true;
  initDashboard(viewDashboard);
}

// ── Mount Login ────────────────────────────────────────────
function mountLogin() {
  if (!viewLogin) {
    viewLogin = document.createElement('div');
    viewLogin.id = 'view-login';
    viewLogin.className = 'view';
    document.getElementById('app').appendChild(viewLogin);
  }
  // Re-render login each time (reset form)
  loginMounted = true;
  initLoginScreen(viewLogin);
}

// ── View Switching ─────────────────────────────────────────
async function switchView(view) {
  // Auto-save before leaving editor
  if (getState().currentProjectId && view !== 'editor') {
    await autoSaveCurrentProject();
  }

  // Hide all views
  viewDashboard.classList.add('hidden');
  viewEditor.classList.add('hidden');
  if (viewLogin) viewLogin.classList.add('hidden');

  if (view === 'editor') {
    mountEditor();
    viewEditor.classList.remove('hidden');
    // Load project data after editor is mounted
    await loadEditorProject();
  } else if (view === 'login') {
    mountLogin();
    viewLogin.classList.remove('hidden');
  } else {
    // Remount dashboard to refresh project list
    dashboardMounted = false;
    mountDashboard();
    viewDashboard.classList.remove('hidden');
  }

  // Auto-start interactive page guide for new visits to this view
  setTimeout(() => {
    startTour(view, false);
  }, 400);
}

// ── Navigation Events ──────────────────────────────────────
window.addEventListener('photon-navigate', (e) => {
  const target = e.detail;
  setState({ currentView: target });
});

// ── Auto-save on browser close / refresh ───────────────
window.addEventListener('beforeunload', () => {
  // BOE-088: Save project ID to localStorage for refresh recovery
  const pid = getState().currentProjectId;
  if (pid) localStorage.setItem('photon_last_project', pid);
  autoSaveCurrentProject(); // best-effort async
});

// ── Manual save from File menu ───────────────────────
window.addEventListener('photon-save-project', () => {
  autoSaveCurrentProject().then(() => setState({ statusMessage: 'Project saved' }));
});

// ── Boot ───────────────────────────────────────────────────
subscribe('currentView', switchView);
subscribe('panelsCollapsed', (collapsed) => {
  const panelsEl = document.getElementById('panels');
  const viewEditorEl = document.getElementById('view-editor');
  if (panelsEl) panelsEl.classList.toggle('collapsed', !!collapsed);
  if (viewEditorEl) viewEditorEl.classList.toggle('panels-collapsed', !!collapsed);
});
initRouter();

// Auto-show Splash Screen on initial application load (unless disabled by user)
if (shouldShowSplashOnBoot()) {
  setTimeout(() => {
    openSplashScreen();
  }, 200);
}

console.log('%cPhoton loaded', 'color:#4C8BF5;font-weight:bold;font-size:14px');
