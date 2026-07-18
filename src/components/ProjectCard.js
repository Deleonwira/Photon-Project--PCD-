/* PHOTON — Project Card Component */
import { navigate } from '../utils/router.js';
import { openNewProjectModal } from './NewProjectModal.js';

// Gradient palette for thumbnail placeholders
const GRADIENTS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
];

function pickGradient(id) {
  let hash = 0;
  const str = String(id);
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

/**
 * Render a project card.
 * @param {{ id: string, name: string, thumbnail?: string, lastModified: string, dimensions: string }} project
 * @returns {string} HTML string
 */
export function renderProjectCard(project) {
  const thumbContent = project.thumbnail
    ? `<img src="${project.thumbnail}" alt="${project.name}" />`
    : `<div class="thumb-placeholder" style="background:${pickGradient(project.id)}"></div>`;

  return `
    <div class="project-card" data-project-id="${project.id}">
      <div class="project-card-thumb">
        ${thumbContent}
        <button class="project-card-delete" data-delete-id="${project.id}" title="Delete project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="project-card-body">
        <div class="project-card-name">${project.name}</div>
        <div class="project-card-meta">
          <span>${project.lastModified}</span>
          <span>${project.dimensions}</span>
        </div>
      </div>
    </div>`;
}

/** Render the "New Project" card. */
export function renderNewProjectCard() {
  return `
    <div class="project-card new-card" id="new-project-card">
      <div class="project-card-thumb">
        <div class="new-card-icon">+</div>
        <span class="new-card-label">New Project</span>
      </div>
      <div class="project-card-body">
        <div class="project-card-name">Create New</div>
        <div class="project-card-meta">
          <span>Start fresh</span>
        </div>
      </div>
    </div>`;
}

/**
 * Wire click handlers on all cards inside a container.
 * @param {HTMLElement} container
 * @param {function} [onDelete] - Optional delete callback(projectId)
 */
export function wireProjectCards(container, onDelete) {
  // New project
  const newCard = container.querySelector('#new-project-card');
  if (newCard) {
    newCard.addEventListener('click', () => {
      openNewProjectModal();
    });
  }

  // Existing projects — click to open
  container.querySelectorAll('.project-card:not(.new-card)').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't navigate if delete button was clicked
      if (e.target.closest('.project-card-delete')) return;
      const id = card.dataset.projectId;
      navigate(`#/editor/${id}`);
    });
  });

  // Delete buttons
  if (onDelete) {
    container.querySelectorAll('.project-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteId;
        onDelete(id);
      });
    });
  }
}
