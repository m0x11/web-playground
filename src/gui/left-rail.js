// Left rail — scene tree + add-component picker.
// Phase 1: tree is rendered + clickable for selection. Picker remains a
// placeholder until Phase 2.

import { getComponent } from '../components/index.js';

export function mountLeftRail(el, scene) {
  el.innerHTML = `
    <section class="panel-section">
      <div class="panel-label">scene tree</div>
      <div class="tree" id="tree"></div>
    </section>
    <section class="panel-section">
      <div class="panel-label">add component</div>
      <div class="panel-placeholder">picker arrives in phase 2</div>
    </section>
  `;

  const tree = el.querySelector('#tree');

  function render() {
    tree.innerHTML = '';
    const root = scene.getRootNode();
    if (!root) {
      const ph = document.createElement('div');
      ph.className = 'panel-placeholder';
      ph.textContent = 'empty scene';
      tree.appendChild(ph);
      return;
    }
    renderNode(tree, root, 0);
  }

  function renderNode(parent, node, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    if (scene.selectedId() === node.id) row.classList.add('tree-row--selected');
    row.style.paddingLeft = `${12 + depth * 14}px`;

    const Comp = getComponent(node.component);
    const name = document.createElement('span');
    name.className = 'tree-row__name';
    name.textContent = Comp.schema.name;

    const id = document.createElement('span');
    id.className = 'tree-row__id';
    id.textContent = node.id;

    row.append(name, id);
    row.addEventListener('click', () => scene.select(node.id));
    parent.appendChild(row);

    for (const child of node.children ?? []) {
      renderNode(parent, child, depth + 1);
    }
  }

  scene.on('scene-loaded', render);
  scene.on('selection-changed', render);
  render();
}
