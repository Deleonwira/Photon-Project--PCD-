/* PHOTON — Welcome Screen */
import { image } from '../icons/icons.js';
import { subscribe } from '../utils/state.js';
import { openFileDialog } from '../services/ImageEngine.js';

export function initWelcomeScreen(container) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay minimal';
  overlay.id = 'welcome-overlay';

  overlay.innerHTML = `
    <div class="welcome-inner-minimal">
      <div class="welcome-drop-icon">${image()}</div>
      <p class="welcome-drop-title">Open an image or create a new project</p>
      <p class="welcome-drop-hint">Drop a file here, use <kbd>Ctrl+O</kbd>, or go back to create a project</p>
      <button class="btn-primary welcome-open-btn" id="welcome-open-btn">Open Image</button>
    </div>
  `;

  container.appendChild(overlay);

  // Click "Open Image" button
  overlay.querySelector('#welcome-open-btn').addEventListener('click', () => {
    openFileDialog();
  });

  // Hide on imageLoaded
  subscribe('imageLoaded', (loaded) => {
    overlay.classList.toggle('hidden', loaded);
  });
}
