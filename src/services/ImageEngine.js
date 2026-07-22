/* PHOTON — Image Engine */


import { setState, getState } from '../utils/state.js';
import { apiPost } from '../utils/api.js';

// ── Internal State ──────────────────────────────────────────
let mainCanvas = null;
let mainCtx = null;
let originalImageData = null;   // Stored on first load for "Reset" (C2)
let originalLoadedImage = null; // Stored copy of loadedImageElement on first load
let originalImageTransform = null;
let originalImageInfo = null;
let currentFileName = '';
let loadedImageElement = null;  // The raw Image object for interaction layer
const imageLoadCallbacks = [];  // Hooks for other services (e.g. HistoryStack)

function cloneImageToCanvas(img) {
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  copy.getContext('2d').drawImage(img, 0, 0, w, h);
  return copy;
}

export function getLoadedImage() { return loadedImageElement; }
export function setLoadedImage(img) { loadedImageElement = img; }

export function onImageLoad(fn) {
  imageLoadCallbacks.push(fn);
}

// ── Canvas Binding ──────────────────────────────────────────
export function setCanvas(canvas) {
  mainCanvas = canvas;
  mainCtx = canvas.getContext('2d');
}

export function getCanvas() {
  return mainCanvas;
}

export function getCtx() {
  return mainCtx;
}

// ── Format Helpers ──────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Initialize Project Canvas (blank from New Project modal) ─
export function initProjectCanvas(settings) {
  const { name, width, height, background } = settings;

  // Clear previous project's image
  loadedImageElement = null;

  // Size the canvas to project dimensions
  mainCanvas.width = width;
  mainCanvas.height = height;

  // Fill background
  if (background === 'transparent') {
    mainCtx.clearRect(0, 0, width, height);
  } else {
    mainCtx.fillStyle = background;
    mainCtx.fillRect(0, 0, width, height);
  }

  // Store original for reset
  originalImageData = mainCtx.getImageData(0, 0, width, height);
  currentFileName = name;

  setState({
    imageLoaded: true,
    projectBackground: background,
    imageInfo: { name, width, height, format: 'project', size: '—' },
    imageTransform: null,
    statusMessage: `New project: ${name} (${width}×${height})`,
  });

  imageLoadCallbacks.forEach(fn => fn());
}

// ── Load Project from IndexedDB record ──────────────────────
export function loadProjectFromStore(project) {
  return new Promise((resolve) => {
    const canvasW = project.width || 1920;
    const canvasH = project.height || 1080;
    const bg = project.background || '#FFFFFF';

    // Always set canvas to project dimensions and fill background
    mainCanvas.width = canvasW;
    mainCanvas.height = canvasH;
    if (bg === 'transparent') {
      mainCtx.clearRect(0, 0, canvasW, canvasH);
    } else {
      mainCtx.fillStyle = bg;
      mainCtx.fillRect(0, 0, canvasW, canvasH);
    }
    currentFileName = project.name;

    // ── NEW FORMAT: rawImageSrc exists (raw uploaded image stored separately)
    if (project.rawImageSrc) {
      const img = new Image();
      img.onload = () => {
        loadedImageElement = img;

        // Restore saved transform or calculate fit
        const transform = project.imageTransform || {
          x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight,
        };

        // Draw image at saved position/size on top of background
        mainCtx.drawImage(img, transform.x, transform.y, transform.width, transform.height);
        originalImageData = mainCtx.getImageData(0, 0, canvasW, canvasH);

        setState({
          imageLoaded: true,
          projectBackground: bg,
          imageInfo: {
            name: project.name,
            width: img.naturalWidth,
            height: img.naturalHeight,
            format: 'project',
            size: '—',
          },
          imageTransform: { ...transform },
          statusMessage: `Opened: ${project.name}`,
        });

        imageLoadCallbacks.forEach(fn => fn());
        resolve();
      };
      img.onerror = () => {
        console.error('Failed to load raw image from project');
        originalImageData = mainCtx.getImageData(0, 0, canvasW, canvasH);
        setState({
          imageLoaded: true,
          projectBackground: bg,
          imageInfo: { name: project.name, width: canvasW, height: canvasH, format: 'project', size: '—' },
          statusMessage: `Opened: ${project.name} (image missing)`,
        });
        imageLoadCallbacks.forEach(fn => fn());
        resolve();
      };
      img.src = project.rawImageSrc;
      return;
    }

    // ── LEGACY FORMAT: only imageDataUrl (flat composite — no layer info)
    if (project.imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        // Draw composite at 0,0 — this IS the full canvas already
        mainCanvas.width = img.width;
        mainCanvas.height = img.height;
        mainCtx.drawImage(img, 0, 0);
        originalImageData = mainCtx.getImageData(0, 0, img.width, img.height);
        // Do NOT set loadedImageElement — interaction layer won't activate for legacy saves
        loadedImageElement = null;

        setState({
          imageLoaded: true,
          projectBackground: bg,
          imageInfo: {
            name: project.name,
            width: img.width,
            height: img.height,
            format: 'project',
            size: '—',
          },
          imageTransform: null, // No transform for legacy — disable interaction
          statusMessage: `Opened: ${project.name} (legacy format)`,
        });

        imageLoadCallbacks.forEach(fn => fn());
        resolve();
      };
      img.onerror = () => {
        console.error('Failed to load legacy project image');
        setState({ imageLoaded: true, projectBackground: bg, statusMessage: 'Error loading project image' });
        resolve();
      };
      img.src = project.imageDataUrl;
      return;
    }

    // ── No image data at all — blank project
    originalImageData = mainCtx.getImageData(0, 0, canvasW, canvasH);
    setState({
      imageLoaded: true,
      projectBackground: bg,
      imageInfo: { name: project.name, width: canvasW, height: canvasH, format: 'project', size: '—' },
      statusMessage: `Opened: ${project.name}`,
    });
    imageLoadCallbacks.forEach(fn => fn());
    resolve();
  });
}

// ── Load Image File (client-side via FileReader) ────────────
export async function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    setState({ statusMessage: 'Error: Not a valid image file' });
    return;
  }

  // Guard: if an image is already loaded, ask to replace
  if (loadedImageElement) {
    const { showConfirmDialog } = await import('../components/ConfirmDialog.js');
    const replace = await showConfirmDialog({
      title: 'Replace Image',
      message: 'Only one image can be open at a time. Replace the current image with the new one?',
      confirmText: 'Replace',
      cancelText: 'Cancel',
      danger: false,
    });
    if (!replace) {
      setState({ statusMessage: 'Upload cancelled' });
      return;
    }
  }

  setState({ statusMessage: `Loading ${file.name}...` });

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const projectId = getState().currentProjectId;

      if (projectId && mainCanvas.width > 0 && mainCanvas.height > 0) {
        // Fit image to existing canvas dimensions (contain behavior)
        const cw = mainCanvas.width;
        const ch = mainCanvas.height;
        const iw = img.width;
        const ih = img.height;
        const scale = Math.min(cw / iw, ch / ih);
        const dw = Math.round(iw * scale);
        const dh = Math.round(ih * scale);
        const dx = Math.round((cw - dw) / 2);
        const dy = Math.round((ch - dh) / 2);

        // Redraw background then place image centered
        const bgData = mainCtx.getImageData(0, 0, cw, ch);
        mainCtx.putImageData(bgData, 0, 0);
        mainCtx.drawImage(img, dx, dy, dw, dh);
      } else {
        // No project context — resize canvas to image
        mainCanvas.width = img.width;
        mainCanvas.height = img.height;
        mainCtx.drawImage(img, 0, 0);
      }

      // Store original for reset
      originalImageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
      originalLoadedImage = cloneImageToCanvas(img);
      currentFileName = file.name;
      loadedImageElement = img;

      // Calculate image position/size for interaction layer
      let imgX = 0, imgY = 0, imgW = img.width, imgH = img.height;
      if (projectId && mainCanvas.width > 0 && mainCanvas.height > 0) {
        const cw = mainCanvas.width, ch = mainCanvas.height;
        const scale = Math.min(cw / img.width, ch / img.height);
        imgW = Math.round(img.width * scale);
        imgH = Math.round(img.height * scale);
        imgX = Math.round((cw - imgW) / 2);
        imgY = Math.round((ch - imgH) / 2);
      }

      const initialTransform = { x: imgX, y: imgY, width: imgW, height: imgH, rotation: 0 };
      const initialInfo = {
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        format: file.type,
        size: formatFileSize(file.size),
      };
      originalImageTransform = { ...initialTransform };
      originalImageInfo = { ...initialInfo };

      setState({
        imageLoaded: true,
        imageInfo: initialInfo,
        imageTransform: initialTransform,
        statusMessage: `Loaded: ${file.name} (${img.width}×${img.height})`,
      });

      imageLoadCallbacks.forEach(fn => fn());
    };
    img.onerror = () => {
      setState({ statusMessage: 'Error: Failed to decode image' });
    };
    img.src = e.target.result;
  };
  reader.onerror = () => {
    setState({ statusMessage: 'Error: Failed to read file' });
  };
  reader.readAsDataURL(file);
}

// ── Load from Base64 (used by processing routes) ────────────
export function drawBase64(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Update the image layer — canvas dimensions stay FIXED
      loadedImageElement = img;

      // Fit the result image within the existing canvas
      const cw = mainCanvas.width, ch = mainCanvas.height;
      const iw = img.width, ih = img.height;
      const scale = Math.min(cw / iw, ch / ih, 1);
      const w = Math.round(iw * scale);
      const h = Math.round(ih * scale);
      const x = Math.round((cw - w) / 2);
      const y = Math.round((ch - h) / 2);

      const currentRot = getState().imageTransform?.rotation || 0;
      setState({
        imageInfo: {
          ...getImageInfo(),
          width: iw,
          height: ih,
        },
        imageTransform: { x, y, width: w, height: h, rotation: currentRot },
      });
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ── Canvas Data Accessors ───────────────────────────────────
export function getCanvasBase64(format = 'image/png', quality = 1.0) {
  if (!mainCanvas) return null;
  return mainCanvas.toDataURL(format, quality);
}

export function getImageData() {
  if (!mainCanvas || mainCanvas.width === 0) return null;
  return mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
}

export function putImageData(imageData) {
  mainCanvas.width = imageData.width;
  mainCanvas.height = imageData.height;
  mainCtx.putImageData(imageData, 0, 0);
}

export function getOriginalImageData() {
  return originalImageData;
}

export function resetToOriginalImage() {
  if (!originalImageData && !originalLoadedImage) {
    setState({ statusMessage: 'No original image to reset to' });
    return false;
  }

  if (originalLoadedImage) {
    loadedImageElement = cloneImageToCanvas(originalLoadedImage);
  }

  if (originalImageData && mainCanvas && mainCtx) {
    mainCanvas.width = originalImageData.width;
    mainCanvas.height = originalImageData.height;
    mainCtx.putImageData(originalImageData, 0, 0);
  }

  const transform = originalImageTransform ? { ...originalImageTransform } : null;
  const info = originalImageInfo ? { ...originalImageInfo } : getState().imageInfo;

  setState({
    imageLoaded: true,
    imageTransform: transform,
    imageInfo: info,
    filterPreview: { brightness: 0, contrast: 0 },
    sharpenPreview: { amount: 0 },
    cropRegion: null,
    statusMessage: 'Reset to original image',
  });

  imageLoadCallbacks.forEach(fn => fn());
  return true;
}

export async function deleteLoadedImage(confirm = true) {
  if (!getState().imageLoaded && !loadedImageElement) {
    setState({ statusMessage: 'No image to delete' });
    return false;
  }

  if (confirm) {
    const { showConfirmDialog } = await import('../components/ConfirmDialog.js');
    const ok = await showConfirmDialog({
      title: 'Delete Image',
      message: 'Are you sure you want to delete the current image from canvas?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return false;
  }

  loadedImageElement = null;
  originalLoadedImage = null;
  originalImageData = null;
  originalImageTransform = null;
  originalImageInfo = null;

  if (mainCanvas && mainCtx) {
    const bg = getState().projectBackground;
    if (bg && bg !== 'transparent') {
      mainCtx.fillStyle = bg;
      mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
    } else {
      mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    }
  }

  setState({
    imageLoaded: false,
    imageTransform: null,
    imageInfo: { name: '', width: 0, height: 0, format: '', size: '' },
    cropRegion: null,
    filterPreview: { brightness: 0, contrast: 0 },
    sharpenPreview: { amount: 0 },
    statusMessage: 'Image deleted',
  });

  return true;
}

export function getCurrentFileName() {
  return currentFileName;
}

function getImageInfo() {
  // Pull current info from state or build from canvas
  return {
    name: currentFileName,
    width: mainCanvas?.width || 0,
    height: mainCanvas?.height || 0,
    format: '',
    size: '',
  };
}

// ── Open File Dialog ────────────────────────────────────────
export function openFileDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/bmp';
  input.onchange = () => {
    if (input.files[0]) loadImageFile(input.files[0]);
  };
  input.click();
}

// ── Save / Download (client-side) ──────────────────────────
export function saveImage(format = 'png', quality = 95, filename = '') {
  if (!mainCanvas) return;

  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp' };
  const mime = mimeMap[format] || 'image/png';
  const q = mime === 'image/jpeg' ? quality / 100 : undefined;
  const dataUrl = mainCanvas.toDataURL(mime, q);
  const name = filename || currentFileName || `photon-export.${format}`;

  downloadBase64(dataUrl, name);
  setState({ statusMessage: `Saved: ${name}` });
}

function downloadBase64(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Custom Compression Export (backend-driven) ─────────────
export async function exportCustom(method, format, quality, filename) {
  if (!mainCanvas) throw new Error('No canvas to export');

  // Always send lossless PNG to backend for processing
  const b64 = mainCanvas.toDataURL('image/png', 1.0);

  const res = await apiPost('/image/export_custom', {
    image_b64: b64,
    method,
    format,
    quality,
  });

  if (res.error) throw new Error(res.error);

  const mime = res.mime || 'application/octet-stream';

  if (mime.startsWith('image/')) {
    // Standard image format — download as data URI
    const dataUrl = `data:${mime};base64,${res.file_b64}`;
    downloadBase64(dataUrl, filename);
  } else {
    // Custom binary format — download as Blob
    const binaryStr = atob(res.file_b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  setState({ statusMessage: `Exported: ${filename} (${formatFileSize(res.size)})` });
}

// ── JS-Only Transforms (operate on IMAGE LAYER only, not canvas) ────

/**
 * Helper: transform loadedImageElement on a temp canvas, then sync state.
 * Canvas dimensions NEVER change — only the image layer is affected.
 * FULLY SYNCHRONOUS — no async Image loading.
 */
function _applyImageTransform(transformFn) {
  const img = loadedImageElement;
  if (!img) return;

  // Create temp canvas with the current image at FULL resolution
  // Use actual pixel data dimensions, not display size — prevents shrinking
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0, srcW, srcH);

  // Apply the transform — returns { canvas } with the result
  const result = transformFn(srcCanvas, srcCtx, img);
  const resultCanvas = result.canvas;

  // Use the result canvas directly as a drawable source (synchronous)
  // Canvas elements work with ctx.drawImage(canvas, ...) — no need for Image
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = resultCanvas.width;
  finalCanvas.height = resultCanvas.height;
  finalCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);

  // Store as loadedImageElement (canvas is valid for drawImage)
  loadedImageElement = finalCanvas;

  const currentT = getState().imageTransform;
  const currentRot = currentT?.rotation || 0;
  const iw = finalCanvas.width, ih = finalCanvas.height;

  // If dimensions didn't change (flip/180°), keep current position/size
  // Only recalculate contain-fit if dimensions changed (90° baked rotation)
  const dimsChanged = iw !== srcW || ih !== srcH;

  let x, y, w, h;
  if (dimsChanged || !currentT) {
    // Recalculate contain-fit for new dimensions
    const cw = mainCanvas.width, ch = mainCanvas.height;
    const scale = Math.min(cw / iw, ch / ih, 1);
    w = Math.round(iw * scale);
    h = Math.round(ih * scale);
    x = Math.round((cw - w) / 2);
    y = Math.round((ch - h) / 2);
  } else {
    // Preserve current position/size
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

export function jsFlipH() {
  _applyImageTransform((srcCanvas) => {
    const w = srcCanvas.width, h = srcCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.translate(w, 0);
    tCtx.scale(-1, 1);
    tCtx.drawImage(srcCanvas, 0, 0);
    return { canvas: tmp };
  });
}

export function jsFlipV() {
  _applyImageTransform((srcCanvas) => {
    const w = srcCanvas.width, h = srcCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.translate(0, h);
    tCtx.scale(1, -1);
    tCtx.drawImage(srcCanvas, 0, 0);
    return { canvas: tmp };
  });
}

export function jsRotate90CW() {
  _applyImageTransform((srcCanvas) => {
    const w = srcCanvas.width, h = srcCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = h; tmp.height = w; // swap
    const tCtx = tmp.getContext('2d');
    tCtx.translate(h, 0);
    tCtx.rotate(Math.PI / 2);
    tCtx.drawImage(srcCanvas, 0, 0);
    return { canvas: tmp };
  });
}

export function jsRotate90CCW() {
  _applyImageTransform((srcCanvas) => {
    const w = srcCanvas.width, h = srcCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = h; tmp.height = w; // swap
    const tCtx = tmp.getContext('2d');
    tCtx.translate(0, w);
    tCtx.rotate(-Math.PI / 2);
    tCtx.drawImage(srcCanvas, 0, 0);
    return { canvas: tmp };
  });
}

export function jsRotate180() {
  _applyImageTransform((srcCanvas) => {
    const w = srcCanvas.width, h = srcCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.translate(w, h);
    tCtx.rotate(Math.PI);
    tCtx.drawImage(srcCanvas, 0, 0);
    return { canvas: tmp };
  });
}

export function jsRotateFree(angleDeg) {
  // Don't bake rotation into pixels — use CSS/canvas rotation for quality
  const t = getState().imageTransform;
  if (!t) return;
  setState({
    imageTransform: { ...t, rotation: angleDeg % 360 },
  });
}
