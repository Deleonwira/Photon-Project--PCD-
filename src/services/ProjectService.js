/* PHOTON — Project Service */

import { API_BASE } from '../utils/api.js';

async function apiFetch(url, opts = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function listProjects() {
  const data = await apiFetch('/projects');
  return data.projects || [];
}

export async function createProject(name = 'Untitled', width = 1920, height = 1080) {
  return apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, width, height }),
  });
}

export async function getProject(id) {
  const data = await apiFetch(`/projects/${id}`);
  return data.project;
}

export async function updateProject(id, updates) {
  return apiFetch(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteProject(id) {
  return apiFetch(`/projects/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Auto-save: send current canvas state to server.
 */
export async function autoSave(projectId, imageB64, thumbnailB64, width, height) {
  return updateProject(projectId, {
    image_b64: imageB64,
    thumbnail_b64: thumbnailB64,
    width,
    height,
  });
}
