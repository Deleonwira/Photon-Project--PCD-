/* PHOTON — Interactive Page & Feature Guide (Tour) Component */
import { bookOpen, sparkles, check } from '../icons/icons.js';

// Tour steps definition per view
const TOUR_STEPS = {
  login: [
    {
      target: '.login-card',
      title: 'Welcome to Photon Login',
      body: 'Log in to your Photon account to manage your projects, preferences, and cloud image processing storage.',
    },
    {
      target: '#auth-skip',
      title: 'Guest Mode',
      body: 'Want to try without registering? Click "Continue as Guest" to jump straight into the image processing studio.',
    }
  ],
  dashboard: [
    {
      target: '#dashboard-bar',
      title: 'Header & Project Search',
      body: 'Use the top bar to search projects by name, view your active account, and restart this Interactive Tour anytime.',
    },
    {
      target: '#new-project-card',
      title: 'Create New Project',
      body: 'Click this card to create a fresh image processing project with custom canvas dimensions and background options.',
    },
    {
      target: '#project-grid',
      title: 'Recent Projects',
      body: 'Every project you edit is automatically saved in your local browser storage (IndexedDB) and listed here.',
    },
    {
      target: '#btn-dashboard-guide',
      title: 'Help & Interactive Guide',
      body: 'Replay this interactive tour at any time by clicking the "Guide" button in the top right corner.',
    }
  ],
  editor: [
    {
      target: '#menubar',
      title: '1. Main Menu Bar',
      body: 'Access all digital image processing tools: File (open, save, export), Edit, Filters (Canny, Sobel, Gaussian), Transforms, and AI.',
    },
    {
      target: '#toolbar',
      title: '2. Left Toolbar',
      body: 'Use the toolbar to select tools like Pointer/Select, Crop, Rotation, Color Filters, Zoom, and Adjustments.',
    },
    {
      target: '#canvas-workspace',
      title: '3. Canvas Workspace',
      body: 'The main image workspace. Drag & Drop image files here or use the Before/After comparison mode.',
    },
    {
      target: '#panels',
      title: '4. Inspector Panels (Properties, Histogram, Layers)',
      body: 'Fine-tune filter parameters in Properties, view real-time RGB histograms, and manage edit history in Layers.',
    },
    {
      target: '#statusbar',
      title: '5. Status Bar',
      body: 'Displays image dimensions, zoom level, cursor coordinates, and live operation status messages.',
    }
  ]
};

let currentTourView = null;
let currentStepIndex = 0;
let spotlightElem = null;
let tooltipElem = null;
let backdropElem = null;
let retryCount = 0;
let retryTimer = null;

function ensureTourElements() {
  if (backdropElem) return;

  // Backdrop
  backdropElem = document.createElement('div');
  backdropElem.id = 'photon-guide-backdrop';
  backdropElem.className = 'guide-backdrop';

  // Spotlight highlight box
  spotlightElem = document.createElement('div');
  spotlightElem.id = 'photon-guide-spotlight';
  spotlightElem.className = 'guide-spotlight';

  // Tooltip card
  tooltipElem = document.createElement('div');
  tooltipElem.id = 'photon-guide-tooltip';
  tooltipElem.className = 'guide-tooltip';

  document.body.appendChild(backdropElem);
  document.body.appendChild(spotlightElem);
  document.body.appendChild(tooltipElem);

  // Click backdrop to advance to next step (smooth UX)
  backdropElem.addEventListener('click', (e) => {
    if (e.target === backdropElem) {
      nextStep();
    }
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (!backdropElem.classList.contains('active')) return;
    if (e.key === 'Escape') endTour();
    if (e.key === 'ArrowRight') nextStep();
    if (e.key === 'ArrowLeft') prevStep();
  });

  // Smooth position updates on resize and scroll
  const handleUpdate = () => {
    if (backdropElem.classList.contains('active')) {
      updateSpotlightAndTooltip();
    }
  };

  window.addEventListener('resize', handleUpdate, { passive: true });
  window.addEventListener('scroll', handleUpdate, { passive: true, capture: true });
}

export function startTour(view, force = false) {
  const steps = TOUR_STEPS[view];
  if (!steps || steps.length === 0) return;

  // Check if tour was already completed (unless forced by clicking "Guide")
  const key = `photon_tour_completed_${view}`;
  if (!force && localStorage.getItem(key) === 'true') {
    return;
  }

  // End any active tour before starting new view tour
  endTour(false);

  ensureTourElements();

  currentTourView = view;
  currentStepIndex = 0;
  retryCount = 0;

  backdropElem.classList.add('active');
  tooltipElem.classList.add('active');

  renderCurrentStep();
}

export function endTour(saveCompletion = true) {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  if (backdropElem) backdropElem.classList.remove('active');
  if (tooltipElem) tooltipElem.classList.remove('active');
  if (spotlightElem) {
    spotlightElem.style.display = 'none';
  }

  if (saveCompletion && currentTourView) {
    localStorage.setItem(`photon_tour_completed_${currentTourView}`, 'true');
  }

  currentTourView = null;
}

export function nextStep() {
  const steps = TOUR_STEPS[currentTourView];
  if (!steps) return;

  if (currentStepIndex < steps.length - 1) {
    currentStepIndex++;
    retryCount = 0;
    renderCurrentStep();
  } else {
    endTour(true);
  }
}

export function prevStep() {
  if (currentStepIndex > 0) {
    currentStepIndex--;
    retryCount = 0;
    renderCurrentStep();
  }
}

function renderCurrentStep() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  const steps = TOUR_STEPS[currentTourView];
  if (!steps || !steps[currentStepIndex]) return;

  const step = steps[currentStepIndex];
  const targetNode = document.querySelector(step.target);

  // If target node is not found or not rendered yet, retry up to 5 times (async wait)
  if ((!targetNode || targetNode.offsetWidth === 0) && retryCount < 5) {
    retryCount++;
    retryTimer = setTimeout(renderCurrentStep, 120);
    return;
  }

  // Scroll into view if needed
  if (targetNode && typeof targetNode.scrollIntoView === 'function') {
    try {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch { /* ignore scroll errors */ }
  }

  // Calculate Progress percentage
  const total = steps.length;
  const progressPct = ((currentStepIndex + 1) / total) * 100;
  const isLast = currentStepIndex === total - 1;

  // Tooltip HTML
  tooltipElem.innerHTML = `
    <div class="guide-header">
      <span class="guide-step-badge">${bookOpen()} Step ${currentStepIndex + 1} of ${total}</span>
      <button class="guide-skip-btn" id="guide-skip-btn">Skip Tour</button>
    </div>

    <div class="guide-progress-bar">
      <div class="guide-progress-fill" style="width: ${progressPct}%"></div>
    </div>

    <h3 class="guide-title">${step.title}</h3>
    <p class="guide-body">${step.body}</p>

    <div class="guide-footer">
      <button class="guide-btn-prev" id="guide-prev-btn" ${currentStepIndex === 0 ? 'disabled' : ''}>
        &larr; Previous
      </button>
      <button class="guide-btn-next" id="guide-next-btn">
        ${isLast ? 'Finish ' + check() : 'Next &rarr;'}
      </button>
    </div>
  `;

  // Attach button listeners
  tooltipElem.querySelector('#guide-skip-btn').onclick = () => endTour(true);
  tooltipElem.querySelector('#guide-prev-btn').onclick = prevStep;
  tooltipElem.querySelector('#guide-next-btn').onclick = nextStep;

  // Position Spotlight and Tooltip
  updateSpotlightAndTooltip();
}

function updateSpotlightAndTooltip() {
  const steps = TOUR_STEPS[currentTourView];
  if (!steps || !steps[currentStepIndex]) return;

  const step = steps[currentStepIndex];
  const targetNode = document.querySelector(step.target);

  // Position Spotlight
  if (targetNode && targetNode.offsetWidth > 0 && targetNode.offsetHeight > 0) {
    const rect = targetNode.getBoundingClientRect();
    const pad = 6;
    spotlightElem.style.top = `${Math.max(0, rect.top - pad)}px`;
    spotlightElem.style.left = `${Math.max(0, rect.left - pad)}px`;
    spotlightElem.style.width = `${rect.width + pad * 2}px`;
    spotlightElem.style.height = `${rect.height + pad * 2}px`;
    spotlightElem.style.display = 'block';
  } else {
    // Fallback if target element not found or hidden
    spotlightElem.style.display = 'none';
  }

  // Position Tooltip
  positionTooltip(targetNode);
}

function positionTooltip(targetNode) {
  const margin = 16;
  const tooltipWidth = 380;
  const tooltipHeight = tooltipElem.offsetHeight || 220;

  if (targetNode && targetNode.offsetWidth > 0 && targetNode.offsetHeight > 0) {
    const rect = targetNode.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;

    // Try placing below target
    if (rect.bottom + tooltipHeight + margin < vh) {
      top = rect.bottom + margin;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } 
    // Try placing above target
    else if (rect.top - tooltipHeight - margin > 0) {
      top = rect.top - tooltipHeight - margin;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    }
    // Place right or left
    else if (rect.right + tooltipWidth + margin < vw) {
      top = rect.top;
      left = rect.right + margin;
    } else {
      top = rect.top;
      left = Math.max(margin, rect.left - tooltipWidth - margin);
    }

    // Clamp inside window boundaries
    left = Math.max(margin, Math.min(vw - tooltipWidth - margin, left));
    top = Math.max(margin, Math.min(vh - tooltipHeight - margin, top));

    tooltipElem.style.top = `${top}px`;
    tooltipElem.style.left = `${left}px`;
    tooltipElem.style.transform = 'none';
  } else {
    // Default center placement
    tooltipElem.style.top = '50%';
    tooltipElem.style.left = '50%';
    tooltipElem.style.transform = 'translate(-50%, -50%)';
  }
}
