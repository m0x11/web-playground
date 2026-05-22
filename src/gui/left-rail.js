// Left rail — scene controls + scene tree + add-component picker.
//
// The tree supports drag-and-drop: drag a row onto another row's top/bottom
// edge to drop before/after it (reorder or reparent), or onto the middle of
// a container row to drop inside it.

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

  let draggedId = null;

  // ── tree ────────────────────────────────────────────────────────────────

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
    // Keep the selected row visible — e.g. when selection came from a click
    // on the canvas rather than the tree.
    tree.querySelector('.tree-row--selected')?.scrollIntoView({ block: 'nearest' });
  }

  function renderNode(parent, node, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.nodeId = node.id;
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
    wireDnd(row, node);
    parent.appendChild(row);

    for (const child of node.children ?? []) {
      renderNode(parent, child, depth + 1);
    }
  }

  // ── drag and drop ───────────────────────────────────────────────────────

  function clearIndicators() {
    for (const r of tree.querySelectorAll('.tree-row')) {
      r.classList.remove('drop-before', 'drop-after', 'drop-onto');
    }
  }

  // Which drop zone, given the cursor Y within a row.
  function zoneFor(e, row, node) {
    const isRoot = scene.getRootNode()?.id === node.id;
    const accepts = getComponent(node.component).schema.children !== 'none';
    const rect = row.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (isRoot) return 'onto';            // root: only drop-inside
    if (accepts) {
      if (y < 0.3) return 'before';
      if (y > 0.7) return 'after';
      return 'onto';
    }
    return y < 0.5 ? 'before' : 'after';
  }

  function wireDnd(row, node) {
    const isRoot = scene.getRootNode()?.id === node.id;
    if (!isRoot) row.draggable = true;

    row.addEventListener('dragstart', e => {
      draggedId = node.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
      row.classList.add('tree-row--dragging');
    });

    row.addEventListener('dragend', () => {
      draggedId = null;
      clearIndicators();
      row.classList.remove('tree-row--dragging');
    });

    row.addEventListener('dragover', e => {
      if (!draggedId || draggedId === node.id) return;
      // Can't drop a node into its own subtree.
      if (scene.isAncestor(draggedId, node.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearIndicators();
      const zone = zoneFor(e, row, node);
      row.classList.add(`drop-${zone}`);
    });

    row.addEventListener('drop', e => {
      if (!draggedId || draggedId === node.id) return;
      if (scene.isAncestor(draggedId, node.id)) return;
      e.preventDefault();
      const zone = zoneFor(e, row, node);
      applyDrop(draggedId, node, zone);
      clearIndicators();
    });
  }

  function applyDrop(movingId, targetNode, zone) {
    if (zone === 'onto') {
      scene.moveNode(movingId, targetNode.id, null);
      return;
    }
    const parent = scene.getParentNode(targetNode.id);
    if (!parent) return;
    if (zone === 'before') {
      scene.moveNode(movingId, parent.id, targetNode.id);
    } else {
      const sibs = parent.children ?? [];
      const idx = sibs.findIndex(c => c.id === targetNode.id);
      scene.moveNode(movingId, parent.id, sibs[idx + 1]?.id ?? null);
    }
  }

  // ── add-component picker ────────────────────────────────────────────────

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

  function chooseInsertionParent() {
    const root = scene.getRootNode();
    if (!root) return null;
    const selectedId = scene.selectedId() ?? root.id;
    const selected = scene.getNode(selectedId);
    if (!selected) return root.id;
    const accepts = getComponent(selected.component).schema.children !== 'none';
    return accepts ? selectedId : root.id;
  }

  scene.on('scene-loaded', () => { renderTree(); renderPicker(); });
  scene.on('selection-changed', renderTree);
  scene.on('scene-tree-changed', renderTree);

  renderTree();
  renderPicker();
}
