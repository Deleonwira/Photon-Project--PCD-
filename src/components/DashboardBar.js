import { search } from '../icons/icons.js';
import { getUser, logout } from '../utils/auth.js';

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
    <div class="dashboard-bar-right" style="display:flex;align-items:center;gap:12px;margin-right:16px">
      ${user ? `
        <span class="user-greeting" style="color:var(--text-secondary);font-size:13px;font-weight:500">Hi, <b>${user.username}</b></span>
        <button id="auth-logout-btn" class="btn-sm" style="background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border);border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;transition:all 0.2s">
          Logout
        </button>
      ` : `
        <button id="auth-login-btn" class="btn-sm" style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">
          Sign In
        </button>
      `}
    </div>
  `;

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
