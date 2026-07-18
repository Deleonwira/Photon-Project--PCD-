import { isLoggedIn } from './auth.js';
import { setState } from './state.js';

/**
 * Routes:
 *   #/login       → Authentication screen
 *   #/dashboard   → Dashboard home screen
 *   #/editor      → Editor (new project)
 *   #/editor/:id  → Editor (existing project)
 *
 * Default: #/login (or #/dashboard if authenticated/guest)
 */

// ── Parse hash into route object ──────────────────────────
function parseHash(hash) {
  const clean = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  
  const authenticated = isLoggedIn();
  const isGuest = sessionStorage.getItem('photon_guest') === 'true';

  if (!authenticated && !isGuest && clean !== 'login') {
    // Force redirect to login
    setTimeout(() => {
      window.location.hash = '#/login';
    }, 0);
    return { view: 'login', params: {} };
  }

  if (clean === 'login') {
    return { view: 'login', params: {} };
  }
  if (!clean || clean === 'dashboard') {
    return { view: 'dashboard', params: {} };
  }
  if (clean === 'editor') {
    return { view: 'editor', params: {} };
  }
  if (clean.startsWith('editor/')) {
    const projectId = clean.slice('editor/'.length);
    return { view: 'editor', params: { projectId } };
  }
  // Fallback
  return { view: 'dashboard', params: {} };
}

// ── Navigate to a path ────────────────────────────────────
export function navigate(path) {
  const target = path.startsWith('#') ? path : `#/${path}`;
  window.location.hash = target;
}

// ── Initialize router ────────────────────────────────────
export function initRouter() {
  function handleRoute() {
    const route = parseHash(window.location.hash);
    setState({
      currentView: route.view,
      routeParams: route.params,
    });
  }

  window.addEventListener('hashchange', handleRoute);

  // Set initial route
  if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
    window.location.hash = '#/dashboard';
  } else {
    handleRoute();
  }
}
