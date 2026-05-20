// Scene runtime.
//
// The single source of truth for "what time it is in the scene" and "what's
// in the scene." Drives the renderer; same code path is used by the GUI
// (live editing) and by the Playwright export driver (frame-by-frame at 4K30).
//
// See ARCHITECTURE.md → "Scene/GUI separation contract" and RECORDING.md.
//
// Invariants:
//   - setTime(t) is synchronous and deterministic.
//   - No setTimeout / setInterval / performance.now() in animation paths.
//   - All animated values derive from the timeline's current `t`.

import { getComponent, withDefaults } from '../components/index.js';

const EVENTS = [
  'scene-loaded',
  'time-changed',
  'play-state-changed',
  'selection-changed',
  'node-updated',
  'scene-tree-changed',
];

export function createScene({ renderer }) {
  const listeners = Object.fromEntries(EVENTS.map(name => [name, new Set()]));

  const state = {
    sceneJson: null,
    time: 0,
    playing: false,
    duration: 0,
    size: { w: null, h: null },
    guiHidden: false,
    selectedId: null,
  };

  function emit(name, payload) {
    for (const fn of listeners[name]) fn(payload);
  }

  // ── tree helpers ────────────────────────────────────────────────────────

  function findNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return null;
  }

  function findParent(root, childId) {
    if (!root) return null;
    for (const child of root.children ?? []) {
      if (child.id === childId) return root;
      const found = findParent(child, childId);
      if (found) return found;
    }
    return null;
  }

  function fullPropsFor(node) {
    return withDefaults(getComponent(node.component).schema, node.props);
  }

  function collectIds(node, out = []) {
    if (!node) return out;
    out.push(node.id);
    for (const child of node.children ?? []) collectIds(child, out);
    return out;
  }

  function generateId(componentName) {
    const slug = componentName.toLowerCase();
    let n = 1;
    while (findNode(state.sceneJson?.root, `${slug}-${n}`)) n += 1;
    return `${slug}-${n}`;
  }

  // ── public API ──────────────────────────────────────────────────────────

  function loadScene(json) {
    state.sceneJson = json;
    state.duration = json?.duration ?? 0;
    renderer.mount(json);
    emit('scene-loaded', json);
    setTime(0);
    if (json?.root?.id) select(json.root.id);
  }

  function setTime(t) {
    state.time = t;
    // TODO Phase 5: evaluate animations and patch animated props.
    renderer.update(t);
    emit('time-changed', t);
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    emit('play-state-changed', true);
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    emit('play-state-changed', false);
  }

  function duration() {
    return state.duration;
  }

  function ready() {
    return Promise.resolve();
  }

  function framePainted() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function setSize(w, h) {
    state.size = { w, h };
    renderer.setSize(w, h);
  }

  function hideGUI() {
    state.guiHidden = true;
    document.body.classList.add('gui-hidden');
  }

  function on(event, fn) {
    if (!listeners[event]) throw new Error(`Unknown event: ${event}`);
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  }

  // ── selection + tree access ─────────────────────────────────────────────

  function select(id) {
    if (state.selectedId === id) return;
    state.selectedId = id;
    emit('selection-changed', id);
  }

  function selectedId() { return state.selectedId; }
  function getNode(id) { return findNode(state.sceneJson?.root, id); }
  function getRootNode() { return state.sceneJson?.root ?? null; }
  function getFullProps(id) {
    const node = getNode(id);
    return node ? fullPropsFor(node) : null;
  }

  // ── prop mutation ───────────────────────────────────────────────────────

  function updateProps(id, partialProps) {
    const node = getNode(id);
    if (!node) {
      console.warn(`scene.updateProps: unknown id "${id}"`);
      return;
    }
    node.props = { ...(node.props ?? {}), ...partialProps };
    renderer.patch(id, fullPropsFor(node));
    emit('node-updated', { id, props: node.props });
  }

  // ── tree mutation ───────────────────────────────────────────────────────

  function addNode(parentId, componentName, propsOverride = {}) {
    const parent = getNode(parentId);
    if (!parent) {
      console.warn(`scene.addNode: unknown parent "${parentId}"`);
      return null;
    }
    const ParentComp = getComponent(parent.component);
    if (ParentComp.schema.children === 'none') {
      console.warn(`scene.addNode: parent "${parent.component}" does not accept children`);
      return null;
    }
    // Ensure the new component exists.
    getComponent(componentName);
    const newNode = {
      id: generateId(componentName),
      component: componentName,
      props: propsOverride,
      children: [],
    };
    parent.children = parent.children ?? [];
    parent.children.push(newNode);
    renderer.addChild(parentId, newNode, parent.children.length);
    select(newNode.id);
    emit('scene-tree-changed');
    return newNode.id;
  }

  function removeNode(id) {
    if (!state.sceneJson?.root || state.sceneJson.root.id === id) {
      console.warn('scene.removeNode: refusing to remove root');
      return;
    }
    const parent = findParent(state.sceneJson.root, id);
    if (!parent) return;
    const idx = parent.children.findIndex(c => c.id === id);
    if (idx < 0) return;

    const removedIds = new Set(collectIds(parent.children[idx]));
    parent.children.splice(idx, 1);

    renderer.removeNode(id);
    renderer.refreshCtx(parent.id, parent.children.length);

    if (removedIds.has(state.selectedId)) {
      state.selectedId = null;
      select(parent.id);
    }
    emit('scene-tree-changed');
  }

  function _state() { return state; }

  return {
    loadScene, setTime, play, pause, duration,
    ready, framePainted, setSize, hideGUI, on,
    select, selectedId, getNode, getRootNode, getFullProps,
    updateProps, addNode, removeNode,
    _state,
  };
}
