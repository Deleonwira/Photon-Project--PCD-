/* PHOTON — Splash Screen Component */
import { sparkles, x, droplet, barChart, crop, bookOpen, helpCircle } from '../icons/icons.js';
import { startTour } from './PageGuide.js';
import { getState } from '../utils/state.js';

let splashBackdrop = null;

export function initSplashScreen() {
  if (splashBackdrop) return;

  splashBackdrop = document.createElement('div');
  splashBackdrop.id = 'photon-splash-modal';
  splashBackdrop.className = 'splash-backdrop';

  splashBackdrop.innerHTML = `
    <div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="splash-title">
      <button class="splash-close-btn" id="splash-close-btn" aria-label="Close">
        ${x()}
      </button>

      <div class="splash-header">
        <div class="splash-badge">
          ${sparkles()} Digital Image Processing Studio
        </div>
        <h2 class="splash-title" id="splash-title">Welcome to Photon</h2>
        <p class="splash-description">
          Photon is a powerful and intuitive web-based Digital Image Processing (DIP) studio platform. 
          Designed for real-time analysis, manipulation, histogram visualization, and transformations directly in your browser.
        </p>
      </div>

      <div class="splash-grid">
        <div class="splash-card">
          <div class="splash-card-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
          </div>
          <div class="splash-card-content">
            <h4>Filters & Enhancement</h4>
            <p>Smoothing (Blur), Sharpening, Edge Detection (Canny, Sobel, Laplacian), Segmentation, Morphology, and Brightness/Contrast controls.</p>
          </div>
        </div>

        <div class="splash-card">
          <div class="splash-card-icon">
            ${barChart()}
          </div>
          <div class="splash-card-content">
            <h4>Analysis & Histogram</h4>
            <p>Real-time RGB & Grayscale histogram visualization, contrast adjustments, and automated Histogram Equalization.</p>
          </div>
        </div>

        <div class="splash-card">
          <div class="splash-card-icon">
            ${crop()}
          </div>
          <div class="splash-card-content">
            <h4>Transformations & Visualization</h4>
            <p>Free and preset rotation, Crop, Scaling, Flip, and a split Before/After comparison mode.</p>
          </div>
        </div>

        <div class="splash-card">
          <div class="splash-card-icon">
            ${sparkles()}
          </div>
          <div class="splash-card-content">
            <h4>AI Object Recognition</h4>
            <p>Convolutional Neural Network (CNN) integration for smart object detection and identification on images.</p>
          </div>
        </div>
      </div>

      <div class="splash-footer">
        <label class="splash-remember-label">
          <input type="checkbox" id="splash-show-checkbox" />
          <span>Show this screen on every boot</span>
        </label>

        <div class="splash-actions">
          <button class="btn-splash-guide" id="splash-guide-btn">
            ${bookOpen()} Feature Guide
          </button>
          <button class="btn-splash-start" id="splash-start-btn">
            Get Started &rarr;
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(splashBackdrop);

  // Read saved preference: default is to show splash (store false if disabled)
  const isShowOnBoot = localStorage.getItem('photon_show_splash') !== 'false';
  const checkbox = splashBackdrop.querySelector('#splash-show-checkbox');
  checkbox.checked = isShowOnBoot;

  checkbox.addEventListener('change', (e) => {
    localStorage.setItem('photon_show_splash', e.target.checked ? 'true' : 'false');
  });

  // Close handlers
  splashBackdrop.querySelector('#splash-close-btn').addEventListener('click', closeSplashScreen);
  splashBackdrop.querySelector('#splash-start-btn').addEventListener('click', closeSplashScreen);
  
  splashBackdrop.addEventListener('click', (e) => {
    if (e.target === splashBackdrop) closeSplashScreen();
  });

  // Launch guide handler
  splashBackdrop.querySelector('#splash-guide-btn').addEventListener('click', () => {
    closeSplashScreen();
    const currentView = getState().currentView || 'dashboard';
    startTour(currentView, true);
  });
}

export function openSplashScreen() {
  if (!splashBackdrop) initSplashScreen();
  splashBackdrop.classList.add('active');
}

export function closeSplashScreen() {
  if (splashBackdrop) splashBackdrop.classList.remove('active');
}

export function shouldShowSplashOnBoot() {
  return localStorage.getItem('photon_show_splash') !== 'false';
}
