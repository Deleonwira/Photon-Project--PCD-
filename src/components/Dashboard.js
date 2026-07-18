/* PHOTON — Dashboard */
import { initDashboardBar } from './DashboardBar.js';
import { renderProjectCard, renderNewProjectCard, wireProjectCards } from './ProjectCard.js';
import { listAllProjects, deleteProject, getProject } from '../services/ProjectStore.js';
import { showConfirmDialog } from './ConfirmDialog.js';

export async function initDashboard(container) {
  // Build structure
  container.innerHTML = `
    <div class="dashboard">
      <header class="dashboard-bar" id="dashboard-bar"></header>
      <div class="dashboard-content">
        <div class="dashboard-inner">
          <h2 class="dashboard-section-title">Recent Projects</h2>
          <div class="project-grid" id="project-grid">
            <div style="color:var(--text-muted);padding:var(--sp-4)">Loading projects...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Mount sub-components
  initDashboardBar(container.querySelector('#dashboard-bar'));

  // Load real projects from IndexedDB
  const grid = container.querySelector('#project-grid');

  try {
    const projects = await listAllProjects();

    let cardsHtml = renderNewProjectCard();
    projects.forEach(p => {
      cardsHtml += renderProjectCard({
        id: p.id,
        name: p.name,
        thumbnail: p.thumbnailDataUrl || null,
        lastModified: formatDate(p.updatedAt),
        dimensions: `${p.width} × ${p.height}`,
      });
    });
    grid.innerHTML = cardsHtml;
    wireProjectCards(grid, handleDelete);
  } catch (err) {
    console.warn('Failed to load projects:', err.message);
    let cardsHtml = renderNewProjectCard();
    grid.innerHTML = cardsHtml;
    wireProjectCards(grid, handleDelete);
  }

  // ── Delete handler ─────────────────────────────────────
  async function handleDelete(projectId) {
    // Get project name for the dialog message
    let projectName = 'this project';
    try {
      const p = await getProject(projectId);
      if (p) {
        const display = p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name;
        projectName = `"${display}"`;
      }
    } catch { /* use default */ }

    const confirmed = await showConfirmDialog({
      title: 'Delete Project',
      message: `Are you sure you want to delete ${projectName}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteProject(projectId);
      // Re-render dashboard
      initDashboard(container);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
