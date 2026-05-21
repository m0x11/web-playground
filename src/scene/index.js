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
import { createTimeline } from '../animation/timeline.js';
import { allLoaded, allSeeked } from '../media/readiness.js';

const EVENTS = [
  'scene-loaded',
  'time-changed',
  'play-state-changed',
  'selection-changed',
  'node-updated',
  'scene-tree-changed',
  'scene-name-changed',
  'animations-changed',
  'scene-canvas-changed',
];

const DEFAULT_CANVAS_ASPECT = { aspectW: 16, aspectH: 9 };
const CANVAS_LONGEST_SIDE = 1920;

// Internal pixel dimensions are deterministic from the aspect ratio so a
// "200px font" means a consistent fraction of the canvas across users.
// Longest side is fixed at 1920 CSS px; the other dimension follows.
function pixelsFromAspect(aspect) {
  const { aspectW, aspectH } = aspect;
  if (aspectW >= aspectH) {
    return { width: CANVAS_LONGEST_SIDE, height: Math.round(CANVAS_LONGEST_SIDE * aspectH / aspectW) };
  }
  return { width: Math.round(CANVAS_LONGEST_SIDE * aspectW / aspectH), height: CANVAS_LONGEST_SIDE };
}

// Accept legacy { width, height } and convert to aspect at load time.
function normalizeCanvas(c) {
  if (!c || typeof c !== 'object') return { ...DEFAULT_CANVAS_ASPECT };
  if (Number.isFinite(c.aspectW) && Number.isFinite(c.aspectH) && c.aspectW > 0 && c.aspectH > 0) {
    return { aspectW: c.aspectW, aspectH: c.aspectH };
  }
  if (Number.isFinite(c.width) && Number.isFinite(c.height) && c.width > 0 && c.height > 0) {
    return { aspectW: c.width, aspectH: c.height };
  }
  return { ...DEFAULT_CANVAS_ASPECT };
}

export function createScene({ renderer }) {
  const listeners = Object.fromEntries(EVENTS.map(name => [name, new Set()]));
  const timeline = createTimeline({ getEl: id => renderer.getEl(id) });

  const state = {
    sceneJson: null,
    time: 0,
    playing: false,
    duration: 0, // explicit (from sceneJson); effective duration = duration() includes animations.
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

  function generateAnimationId() {
    const existing = new Set((state.sceneJson?.animations ?? []).map(a => a.id));
    let n = 1;
    while (existing.has(`tween-${n}`)) n += 1;
    return `tween-${n}`;
  }

  // ── public API ──────────────────────────────────────────────────────────

  function loadScene(json) {
    state.sceneJson = json;
    state.duration = json?.duration ?? 0;
    // Normalize canvas to aspect form (handles legacy {width,height} too).
    state.sceneJson.canvas = normalizeCanvas(state.sceneJson.canvas);
    renderer.mount(json);
    const px = pixelsFromAspect(state.sceneJson.canvas);
    renderer.setCanvasSize(px.width, px.height);
    timeline.setAnimations(json?.animations ?? []);
    emit('scene-loaded', json);
    setTime(0);
    if (json?.root?.id) select(json.root.id);
  }

  function setTime(t) {
    state.time = t;
    timeline.setTime(t);       // animation tweens
    renderer.update(t);        // time-driven components (Media cycle/video)
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

  function playing() { return state.playing; }
  function time() { return state.time; }

  function duration() {
    return Math.max(state.duration, timeline.computeDuration());
  }

  // Resolves once every media asset declared by the current scene has loaded
  // (images decoded, video metadata available). Awaited by the export driver
  // before frame 0.
  function ready() {
    return allLoaded();
  }

  // Resolves after the next paint, AND after any in-flight video seeks have
  // settled. The export driver awaits this between setTime() and screenshot().
  function framePainted() {
    return allSeeked().then(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  }

  function setSize(w, h) {
    state.size = { w, h };
    renderer.setSize(w, h);
  }

  function hideGUI() {
    state.guiHidden = true;
    document.body.classList.add('gui-hidden');
    // Re-fit the canvas after the layout switch — ResizeObserver fires too,
    // but a synchronous nudge avoids a one-frame stale-size in the first
    // exported PNG.
    renderer.refit?.();
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

  // Per-node layout (cell width / aspect within a freeform parent). Stored on
  // node.layout; the layout-owning parent reads it. Re-patch the parent so it
  // re-applies child cell styling.
  function updateLayout(id, partialLayout) {
    const node = getNode(id);
    if (!node) {
      console.warn(`scene.updateLayout: unknown id "${id}"`);
      return;
    }
    node.layout = { ...(node.layout ?? {}), ...partialLayout };
    const parent = findParent(state.sceneJson?.root, id);
    if (parent) renderer.patch(parent.id, fullPropsFor(parent));
    emit('node-updated', { id });
  }

  function getParentNode(id) {
    return findParent(state.sceneJson?.root, id);
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

    // Also remove any animations targeting this node or its descendants.
    state.sceneJson.animations = (state.sceneJson.animations ?? [])
      .filter(a => !removedIds.has(a.target));
    timeline.setAnimations(state.sceneJson.animations);

    renderer.removeNode(id);
    renderer.refreshCtx(parent.id, parent.children.length);

    if (removedIds.has(state.selectedId)) {
      state.selectedId = null;
      select(parent.id);
    }
    emit('scene-tree-changed');
    emit('animations-changed');
  }

  // ── animation mutation ──────────────────────────────────────────────────

  function addAnimation(spec) {
    if (!state.sceneJson) return null;
    if (!state.sceneJson.animations) state.sceneJson.animations = [];
    const full = { id: generateAnimationId(), ...spec };
    state.sceneJson.animations.push(full);
    timeline.add(full);
    setTime(state.time); // re-evaluate at current time so the change is visible.
    emit('animations-changed');
    return full.id;
  }

  function removeAnimation(id) {
    if (!state.sceneJson?.animations) return;
    state.sceneJson.animations = state.sceneJson.animations.filter(a => a.id !== id);
    timeline.remove(id);
    setTime(state.time);
    emit('animations-changed');
  }

  function updateAnimation(id, partial) {
    if (!state.sceneJson?.animations) return;
    const anim = state.sceneJson.animations.find(a => a.id === id);
    if (!anim) return;
    Object.assign(anim, partial);
    timeline.update(id, partial);
    setTime(state.time);
    emit('animations-changed');
  }

  function listAnimations() {
    return [...(state.sceneJson?.animations ?? [])];
  }

  function listAnimationsForTarget(targetId) {
    return (state.sceneJson?.animations ?? []).filter(a => a.target === targetId);
  }

  // ── persistence helpers ─────────────────────────────────────────────────

  function serialize() {
    if (!state.sceneJson) return null;
    return JSON.parse(JSON.stringify(state.sceneJson));
  }

  function setName(name) {
    if (!state.sceneJson) return;
    if (state.sceneJson.name === name) return;
    state.sceneJson.name = name;
    emit('scene-name-changed', name);
  }

  function getName() {
    return state.sceneJson?.name ?? '';
  }

  function getCanvas() {
    return { ...(state.sceneJson?.canvas ?? DEFAULT_CANVAS_ASPECT) };
  }

  function getCanvasPixels() {
    return pixelsFromAspect(getCanvas());
  }

  function setCanvas(aspectW, aspectH) {
    if (!state.sceneJson) return;
    const w = Math.max(1, aspectW);
    const h = Math.max(1, aspectH);
    state.sceneJson.canvas = { aspectW: w, aspectH: h };
    const px = pixelsFromAspect(state.sceneJson.canvas);
    renderer.setCanvasSize(px.width, px.height);
    emit('scene-canvas-changed', { aspectW: w, aspectH: h });
  }

  function _state() { return state; }

  return {
    loadScene, setTime, play, pause, playing, time, duration,
    ready, framePainted, setSize, hideGUI, on,
    select, selectedId, getNode, getRootNode, getFullProps, getParentNode,
    updateProps, updateLayout, addNode, removeNode,
    addAnimation, removeAnimation, updateAnimation,
    listAnimations, listAnimationsForTarget,
    serialize, setName, getName,
    getCanvas, setCanvas, getCanvasPixels,
    _state,
  };
}
