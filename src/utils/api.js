/* PHOTON — Centralized API Service */

export const API_BASE = 'http://localhost:5000/api';

/**
 * GET request to the backend.
 * @param {string} path - API path (e.g. '/health')
 * @returns {Promise<object>} JSON response
 */
export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

/**
 * POST request with JSON body.
 * @param {string} path - API path
 * @param {object} body - JSON payload
 * @returns {Promise<object>} JSON response
 */
export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

/**
 * POST request with FormData (file upload).
 * @param {string} path - API path
 * @param {FormData} formData - Form data with file
 * @returns {Promise<object>} JSON response
 */
export async function apiUpload(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData,  // No Content-Type header — browser sets multipart boundary
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}
