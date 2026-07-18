/* PHOTON — Panel Manager (Tab System) */
import { subscribe, setState, getState } from '../utils/state.js';

export function initPanelManager(container) {
  container.innerHTML = `
    <div class="panel-tabs">
      <button class="panel-tab active" data-panel="properties">Properties</button>
      <button class="panel-tab" data-panel="histogram">Histogram</button>
      <button class="panel-tab" data-panel="layers">Layers</button>
    </div>
    <div class="panel-content">
      <div class="panel-view active" id="panel-properties"></div>
      <div class="panel-view" id="panel-histogram"></div>
      <div class="panel-view" id="panel-layers"></div>
    </div>
  `;

  const tabs = container.querySelectorAll('.panel-tab');
  const views = container.querySelectorAll('.panel-view');

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
}
