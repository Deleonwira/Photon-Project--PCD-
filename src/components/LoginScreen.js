/* PHOTON — Login Screen */
import { login, register } from '../utils/auth.js';

export function initLoginScreen(container) {
  let isRegister = false;

  function render() {
    container.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">
            <img src="/logo.png" alt="Photon" style="width:48px;height:48px;margin-bottom:12px" />
            <h1 style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin:0">Photon</h1>
            <p style="color:var(--text-muted);font-size:var(--text-sm);margin-top:4px">Image Processing Suite</p>
          </div>
          <form id="auth-form" style="display:flex;flex-direction:column;gap:12px;margin-top:24px">
            <input class="photon-input" type="text" id="auth-username" placeholder="Username" autocomplete="username" required style="padding:10px 12px;font-size:14px" />
            <input class="photon-input" type="password" id="auth-password" placeholder="Password" autocomplete="current-password" required style="padding:10px 12px;font-size:14px" />
            <button type="submit" class="btn-sm" id="auth-submit" style="width:100%;padding:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;border:none;border-radius:6px;cursor:pointer">
              ${isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <div id="auth-error" style="color:#ff6b6b;font-size:12px;margin-top:8px;text-align:center;min-height:18px"></div>
          <div style="text-align:center;margin-top:16px">
            <button id="auth-toggle" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px">
              ${isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
            </button>
          </div>
          <div style="text-align:center;margin-top:12px">
            <button id="auth-skip" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px">
              Continue as Guest
            </button>
          </div>
        </div>
      </div>
    `;

    // Wire form
    const form = container.querySelector('#auth-form');
    const errorEl = container.querySelector('#auth-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = container.querySelector('#auth-username').value.trim();
      const password = container.querySelector('#auth-password').value;
      errorEl.textContent = '';

      try {
        if (isRegister) {
          await register(username, password);
        } else {
          await login(username, password);
        }
        sessionStorage.removeItem('photon_guest');
        // Navigate to dashboard
        window.location.hash = '#/dashboard';
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });

    // Toggle register/login
    container.querySelector('#auth-toggle').addEventListener('click', () => {
      isRegister = !isRegister;
      render();
    });

    // Skip auth (guest mode)
    container.querySelector('#auth-skip').addEventListener('click', () => {
      sessionStorage.setItem('photon_guest', 'true');
      window.location.hash = '#/dashboard';
    });
  }

  render();
}
