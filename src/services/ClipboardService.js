/* PHOTON — Clipboard & Image Paste Service */
import { loadImageFile, drawBase64 } from './ImageEngine.js';
import { setState, getState } from '../utils/state.js';
import { navigate } from '../utils/router.js';

let isHandlerInitialized = false;

/**
 * Handle a Pasted Image File (File or Blob)
 */
export async function handlePastedImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    setState({ statusMessage: 'Error: Clipboard content is not a valid image' });
    return;
  }

  // Ensure file has a proper name for Photon state
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const namedFile = file.name
    ? file
    : new File([file], `Pasted_Image_${timestamp}.png`, { type: file.type || 'image/png' });

  const currentView = getState().currentView;

  if (currentView !== 'editor') {
    // Navigate to editor view first if on dashboard or login
    navigate('#/editor');
    // Allow view mount delay before loading image
    setTimeout(() => {
      loadImageFile(namedFile);
      setState({ statusMessage: 'Pasted image from clipboard' });
    }, 200);
  } else {
    await loadImageFile(namedFile);
    setState({ statusMessage: 'Pasted image from clipboard' });
  }
}

/**
 * Handle a Pasted Image Data URL or Direct Image URL String
 */
export async function handlePastedImageUrl(urlStr) {
  if (!urlStr) return;

  try {
    if (urlStr.startsWith('data:image/')) {
      await drawBase64(urlStr);
      setState({ statusMessage: 'Pasted image from Data URL' });
      return;
    }

    // Try fetching image URL
    setState({ statusMessage: 'Loading image from URL...' });
    const response = await fetch(urlStr);
    const blob = await response.blob();
    if (blob.type.startsWith('image/')) {
      const file = new File([blob], `Pasted_Url_Image.png`, { type: blob.type });
      await handlePastedImage(file);
    }
  } catch (err) {
    console.warn('Failed to load pasted image URL:', err);
    setState({ statusMessage: 'Error: Unable to load pasted image URL' });
  }
}

/**
 * Manual Paste trigger (e.g. from MenuBar or Ctrl+V shortcut)
 */
export async function pasteFromClipboard() {
  // 1. Try modern async Clipboard API if available
  if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await handlePastedImage(blob);
          return true;
        }
      }
    } catch (err) {
      console.info('Async clipboard API read skipped/blocked:', err.message);
    }
  }

  // 2. Fallback guidance if direct programmatic read is restricted by browser security
  setState({ statusMessage: 'Press Ctrl+V to paste image from clipboard' });
  return false;
}

/**
 * Initialize Global Clipboard Paste Event Listener
 */
export function initClipboardHandler() {
  if (isHandlerInitialized) return;
  isHandlerInitialized = true;

  window.addEventListener('paste', (e) => {
    // Do not intercept paste if user is typing inside an input/textarea element
    const activeEl = document.activeElement;
    const isInput = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );

    const items = e.clipboardData?.items;
    let foundImage = false;

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handlePastedImage(file);
            foundImage = true;
            break;
          }
        }
      }
    }

    // Check files array if items didn't return image
    if (!foundImage && e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file.type && file.type.startsWith('image/')) {
          e.preventDefault();
          handlePastedImage(file);
          foundImage = true;
          break;
        }
      }
    }

    // Check plain text for Data URLs if not typing in input
    if (!foundImage && !isInput && e.clipboardData) {
      const pastedText = e.clipboardData.getData('text/plain')?.trim();
      if (pastedText && (pastedText.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|bmp)(\?.*)?$/i.test(pastedText))) {
        e.preventDefault();
        handlePastedImageUrl(pastedText);
      }
    }
  });
}
