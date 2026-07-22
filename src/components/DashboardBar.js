import { search, bookOpen, info } from '../icons/icons.js';
import { getUser, logout } from '../utils/auth.js';
import { startTour } from './PageGuide.js';
import { openSplashScreen } from './SplashScreen.js';

export function initDashboardBar(container) {
  const user = getUser();

  container.innerHTML = `
    <div class="dashboard-bar-left">
      <img src="/logo.png" alt="Photon" class="dashboard-bar-logo" />
      <span class="dashboard-bar-title">Photon</span>
    </div>
    <div class="dashboard-bar-center">
      <div class="dashboard-search">
        ${search({ size: 14 })}
        <input type="text" placeholder="Search projects..." id="dashboard-search-input" />
      </div>
    </div>
    <div class="dashboard-bar-right" style="display:flex;align-items:center;gap:10px;margin-right:16px">
      <button id="btn-dashboard-splash" class="btn-sm" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border-default);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.2s" title="Buka Layar Sambutan & Informasi Studio">
        ${info()} Tentang
      </button>

      <button id="btn-dashboard-guide" class="btn-sm" style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-subtle);color:var(--accent-hover);border:1px solid rgba(76,139,245,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s" title="Putar Tur Panduan Interaktif">
        ${bookOpen()} Panduan
      </button>

      ${user ? `
        <span class="user-greeting" style="color:var(--text-secondary);font-size:13px;font-weight:500;margin-left:4px">Hi, <b>${user.username}</b></span>
        <button id="auth-logout-btn" class="btn-sm" style="background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border-default);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;transition:all 0.2s">
          Logout
        </button>
      ` : `
        <button id="auth-login-btn" class="btn-sm" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer">
          Sign In
        </button>
      `}
    </div>
  `;

  // Attach event listeners
  container.querySelector('#btn-dashboard-splash').addEventListener('click', () => {
    openSplashScreen();
  });

  container.querySelector('#btn-dashboard-guide').addEventListener('click', () => {
    startTour('dashboard', true);
  });

  if (user) {
    container.querySelector('#auth-logout-btn').addEventListener('click', async () => {
      try {
        await logout();
        sessionStorage.removeItem('photon_guest');
        window.location.hash = '#/login';
      } catch (err) {
        console.error('Logout failed:', err);
      }
    });
  } else {
    container.querySelector('#auth-login-btn').addEventListener('click', () => {
      sessionStorage.removeItem('photon_guest');
      window.location.hash = '#/login';
    });
  }
}
