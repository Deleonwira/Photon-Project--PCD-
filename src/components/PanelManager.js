/* PHOTON — Panel Manager (Tab System) */
import { subscribe, setState, getState } from '../utils/state.js';

export function initPanelManager(container) {
  container.innerHTML = `
    <div class="panel-tabs">
      <button class="panel-tab active" data-panel="properties">Properties</button>
      <button class="panel-tab" data-panel="histogram">Histogram</button>
      <button class="panel-tab" data-panel="layers">Layers</button>
      <button class="panel-collapse-btn" id="btn-collapse-panels" title="Minimize Panel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
      </button>
    </div>
    <div class="panel-content">
      <div class="panel-view active" id="panel-properties"></div>
      <div class="panel-view" id="panel-histogram"></div>
      <div class="panel-view" id="panel-layers"></div>
    </div>
  `;

  const tabs = container.querySelectorAll('.panel-tab');
  const views = container.querySelectorAll('.panel-view');
  const collapseBtn = container.querySelector('#btn-collapse-panels');

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      setState({ panelsCollapsed: !getState().panelsCollapsed });
    });
  }

  function switchPanel(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    views.forEach(v => v.classList.toggle('active', v.id === `panel-${name}`));
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      setState({ activePanel: tab.dataset.panel });
    });
  });

  subscribe('activePanel', switchPanel);
  subscribe('panelsCollapsed', (collapsed) => {
    if (collapseBtn) {
      collapseBtn.title = collapsed ? 'Expand Panel (Ctrl+B)' : 'Minimize Panel (Ctrl+B)';
      collapseBtn.classList.toggle('collapsed', !!collapsed);
    }
  });
}
