/* PHOTON — Local Project Store */

const DB_NAME = 'photon_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

let dbInstance = null;

// ── Open / Initialize Database ─────────────────────────────
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error('IndexedDB open failed:', e.target.error);
      reject(e.target.error);
    };
  });
}

// ── Generic transaction helper ─────────────────────────────
async function withStore(mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);

    if (result && typeof result.onsuccess !== 'undefined') {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }
  });
}

// ── Save Project (upsert — insert or update) ───────────────
export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  if (!project.createdAt) {
    project.createdAt = project.updatedAt;
  }
  return withStore('readwrite', (store) => store.put(project));
}

// ── Get One Project by ID ──────────────────────────────────
export async function getProject(id) {
  return withStore('readonly', (store) => store.get(id));
}

// ── List All Projects (sorted by updatedAt descending) ─────
export async function listAllProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const projects = request.result || [];
      // Sort by updatedAt descending (most recent first)
      projects.sort((a, b) => {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      resolve(projects);
    };

    request.onerror = () => reject(request.error);
  });
}

// ── Delete One Project ─────────────────────────────────────
export async function deleteProject(id) {
  return withStore('readwrite', (store) => store.delete(id));
}

// ── Generate Thumbnail (200px wide JPEG) ───────────────────
export function generateThumbnail(sourceCanvas, maxWidth = 200) {
  const scale = maxWidth / sourceCanvas.width;
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = maxWidth;
  thumbCanvas.height = Math.round(sourceCanvas.height * scale);
  const ctx = thumbCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  return thumbCanvas.toDataURL('image/jpeg', 0.7);
}
