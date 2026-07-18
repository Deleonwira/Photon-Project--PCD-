/* PHOTON — Simple Pub/Sub State Manager */

const state = {
  // Router
  currentView: null,
  routeParams: {},
  newProjectSettings: null,
  // Project
  currentProjectId: null,
  projectBackground: null,
  // Editor
  activeTool: 'pointer',
  activePanel: 'properties',
  zoomLevel: 100,
  imageLoaded: false,
  menuOpen: null,
  cursorPos: { x: 0, y: 0 },
  imageInfo: { name: '', width: 0, height: 0, format: '', size: '' },
  imageTransform: null,  // { x, y, width, height, rotation } — set by interaction layer
  cropRegion: null,      // { x, y, width, height, active } — crop tool overlay in image-pixel space
  statusMessage: 'Ready',
};

const listeners = {};

export function getState() {
  return { ...state };
}

export function setState(partial) {
  const changed = [];
  for (const key in partial) {
    if (state[key] !== partial[key]) {
      state[key] = partial[key];
      changed.push(key);
    }
  }
  changed.forEach(key => {
    (listeners[key] || []).forEach(fn => fn(state[key], state));
    (listeners['*'] || []).forEach(fn => fn(state));
  });
}

export function subscribe(key, callback) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(callback);
  return () => {
    listeners[key] = listeners[key].filter(fn => fn !== callback);
  };
}
