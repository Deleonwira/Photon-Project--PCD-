/* PHOTON — AI Service */

import { getCanvasBase64 } from './ImageEngine.js';
import { getLoadedImage } from './ImageEngine.js';
import { setState } from '../utils/state.js';

const AI_TIMEOUT = 15000; // 15s timeout (BOE-217)

/**
 * Convert the loaded image element to base64.
 * Falls back to canvas base64 if no loaded image (legacy projects).
 */
function getLoadedImageBase64() {
  const img = getLoadedImage();
  if (!img) return getCanvasBase64(); // BOE-220: fallback for legacy
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/**
 * Run detection only (JSON results, no image modification).
 * @param {'all'|'people'|'vehicles'|'animals'|'food'|'furniture'|'electronics'|'kitchen'|'accessories'} target
 * @param {number} confidence 0.0 – 1.0
 * @returns {Promise<Array>} detections with label, confidence, bbox
 */
export async function recognizeOnly(target = 'all', confidence = 0.4) {
  setState({ statusMessage: 'Running AI detection...' });

  try {
    const b64 = getLoadedImageBase64();
    if (!b64) {
      setState({ statusMessage: 'AI Error: No image loaded' });
      return [];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);

    const res = await fetch('http://localhost:5000/api/ai/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: b64, target, confidence }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error: ${res.status}`);
    }

    const result = await res.json();
    if (result.error) {
      setState({ statusMessage: `AI Error: ${result.error}` });
      return [];
    }

    const count = result.detections?.length || 0;
    setState({ statusMessage: `AI: Found ${count} object${count !== 1 ? 's' : ''}` });
    return result.detections || [];
  } catch (err) {
    console.error('AI failed:', err);
    const msg = err.name === 'AbortError'
      ? 'AI detection timed out (>15s). Try a smaller image.'
      : err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')
        ? 'Backend not reachable. Is Flask running on port 5000?'
        : `AI Error: ${err.message}`;
    setState({ statusMessage: msg });
    throw new Error(msg);
  }
}
