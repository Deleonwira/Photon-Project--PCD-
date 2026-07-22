/* PHOTON — Interactive Page & Feature Guide (Tour) Component */
import { bookOpen, sparkles, check } from '../icons/icons.js';

// Tour steps definition per view
const TOUR_STEPS = {
  login: [
    {
      target: '.login-card',
      title: 'Selamat Datang di Photon Login',
      body: 'Halaman ini memungkinkan Anda untuk masuk ke akun Photon Anda guna mengelola proyek dan preferensi pengolahan citra.',
    },
    {
      target: '#auth-skip',
      title: 'Mode Tamu (Guest Mode)',
      body: 'Ingin mencoba langsung tanpa mendaftar? Klik tombol "Continue as Guest" untuk langsung membuka studio pengolahan citra.',
    }
  ],
  dashboard: [
    {
      target: '#dashboard-bar',
      title: 'Header & Pencarian Proyek',
      body: 'Di bilah atas ini Anda dapat mencari proyek berdasarkan nama, melihat akun aktif, dan mengakses tombol Panduan Interaktif.',
    },
    {
      target: '#new-project-card',
      title: 'Buat Proyek Baru',
      body: 'Klik kartu ini untuk membuat proyek pengolahan citra baru dengan dimensi canvas kustom dan latar belakang pilihan Anda.',
    },
    {
      target: '#project-grid',
      title: 'Daftar Proyek Terbaru',
      body: 'Setiap proyek yang Anda edit akan otomatis tersimpan di penyimpanan browser lokal (IndexedDB) dan ditampilkan di sini.',
    },
    {
      target: '#btn-dashboard-guide',
      title: 'Tombol Bantuan & Panduan',
      body: 'Anda dapat memutar ulang tur interaktif ini kapan saja dengan mengklik tombol "Panduan" di sudut kanan atas.',
    }
  ],
  editor: [
    {
      target: '#menubar',
      title: '1. Bilah Menu Utama (MenuBar)',
      body: 'Akses seluruh fungsi pengolahan citra: File (buka, simpan, ekspor), Edit, Filter PCD (Canny, Sobel, Gaussian), Transformasi, dan AI.',
    },
    {
      target: '#toolbar',
      title: '2. Bilah Alat (Toolbar)',
      body: 'Gunakan toolbar di sisi kiri untuk memilih alat seperti Pointer, Crop, Transformasi, Filter Warna, Zoom, dan Penyesuaian.',
    },
    {
      target: '#canvas-workspace',
      title: '3. Ruang Kerja Canvas',
      body: 'Area utama visualisasi citra. Drag & Drop file gambar ke sini atau manfaatkan fitur perbandingan Sebelum/Sesudah (Before/After).',
    },
    {
      target: '#panels',
      title: '4. Panel Inspektor (Properties, Histogram, Layers)',
      body: 'Atur parameter filter secara presisi di panel Properti, lihat analisis histogram RGB real-time, dan kelola layer gambar.',
    },
    {
      target: '#statusbar',
      title: '5. Bilah Status (StatusBar)',
      body: 'Menampilkan dimensi citra (piksel), persentase zoom, koordinat kursor mouse, dan status operasi pengolahan yang berjalan.',
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

  // Check if tour was already completed (unless forced by clicking "Panduan")
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
      <span class="guide-step-badge">${bookOpen()} Langkah ${currentStepIndex + 1} dari ${total}</span>
      <button class="guide-skip-btn" id="guide-skip-btn">Lewati Tour</button>
    </div>

    <div class="guide-progress-bar">
      <div class="guide-progress-fill" style="width: ${progressPct}%"></div>
    </div>

    <h3 class="guide-title">${step.title}</h3>
    <p class="guide-body">${step.body}</p>

    <div class="guide-footer">
      <button class="guide-btn-prev" id="guide-prev-btn" ${currentStepIndex === 0 ? 'disabled' : ''}>
        &larr; Sebelumnya
      </button>
      <button class="guide-btn-next" id="guide-next-btn">
        ${isLast ? 'Selesai ' + check() : 'Lanjut &rarr;'}
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
