// Left rail — scene controls + scene tree + add-component picker.

import { COMPONENT_REGISTRY, getComponent } from '../components/index.js';
import { mountSceneControls } from './scene-controls.js';

export function mountLeftRail(el, scene) {
  el.innerHTML = `
    <div id="scene-controls-host"></div>
    <section class="panel-section">
      <div class="panel-label">scene tree</div>
      <div class="tree" id="tree"></div>
    </section>
    <section class="panel-section">
      <div class="panel-label">add component</div>
      <div class="picker" id="picker"></div>
    </section>
  `;

  mountSceneControls(el.querySelector('#scene-controls-host'), scene);

  const tree = el.querySelector('#tree');
  const picker = el.querySelector('#picker');

  function renderTree() {
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

  function renderPicker() {
    picker.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'panel-placeholder';
    hint.style.marginBottom = '10px';
    hint.textContent = 'adds under selected (or root)';
    picker.appendChild(hint);

    for (const [name, comp] of Object.entries(COMPONENT_REGISTRY)) {
      const btn = document.createElement('button');
      btn.className = 'picker-btn';
      btn.textContent = `+ ${comp.schema.name}`;
      btn.addEventListener('click', () => addComponent(name));
      picker.appendChild(btn);
    }
  }

  function addComponent(componentName) {
    const parentId = chooseInsertionParent();
    if (parentId) scene.addNode(parentId, componentName);
  }

  // Where should a new component land? Under selected if it accepts children;
  // otherwise under selected's parent; otherwise root.
  function chooseInsertionParent() {
    const root = scene.getRootNode();
    if (!root) return null;
    const selectedId = scene.selectedId() ?? root.id;
    const selected = scene.getNode(selectedId);
    if (!selected) return root.id;
    const accepts = getComponent(selected.component).schema.children !== 'none';
    if (accepts) return selectedId;
    // Selected is a leaf — try its parent (Phase 2: fall back to root).
    return root.id;
  }

  scene.on('scene-loaded', () => { renderTree(); renderPicker(); });
  scene.on('selection-changed', renderTree);
  scene.on('scene-tree-changed', renderTree);

  renderTree();
  renderPicker();
}
