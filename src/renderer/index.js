// Renderer.
//
// Turns a scene JSON tree into DOM under #scene-root and keeps it in sync.
// Also owns the design-space canvas: a fixed-CSS-pixel container that wraps
// scene-root and is transform-scaled to fit whatever stage size is available
// (variable in the GUI, full viewport in export). This is what makes a 32px
// font look proportionally identical in the GUI preview and a 4K export.
//
// Key contract: node identity is stable across prop edits — every scene tree
// node gets a persistent DOM node + component instance, keyed by `id`.

import { getComponent, withDefaults } from '../components/index.js';

const root      = document.getElementById('scene-root');
const stage     = document.getElementById('scene-stage');
const canvasEl  = document.getElementById('scene-canvas');

const nodes = new Map(); // id → { el, instance, componentName, childRoot, childCount, lastProps }

let canvasW = 1920;
let canvasH = 1080;

function applyCanvasSize() {
  canvasEl.style.width  = `${canvasW}px`;
  canvasEl.style.height = `${canvasH}px`;
  fitCanvas();
}

function fitCanvas() {
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw <= 0 || sh <= 0) return;
  const scale = Math.min(sw / canvasW, sh / canvasH);
  // translate(-50%, -50%) anchors the element's center to the stage's
  // (left:50%, top:50%) position; scale shrinks/grows around that center via
  // transform-origin: center. Result: canvas always visually centered.
  canvasEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

// Re-fit whenever the stage changes size (window resize, GUI hide/show, etc).
new ResizeObserver(fitCanvas).observe(stage);

// Initial fit using the default canvas dimensions until a scene is loaded.
applyCanvasSize();

export const renderer = {
  mount(sceneJson) {
    for (const { instance } of nodes.values()) instance.unmount?.();
    nodes.clear();
    root.innerHTML = '';
    if (!sceneJson?.root) return;
    mountNode(sceneJson.root, root);
  },

  patch(id, fullProps) {
    const entry = nodes.get(id);
    if (!entry) {
      console.warn(`renderer.patch: unknown id "${id}"`);
      return;
    }
    entry.lastProps = fullProps;
    entry.instance.patch(fullProps, { childCount: entry.childCount, node: entry.node });
  },

  // Mount a new node (and its subtree) under an existing node. If `beforeId`
  // is given, the new DOM is inserted before that sibling; otherwise appended.
  addChild(parentId, node, newChildCount, beforeId = null) {
    const parent = nodes.get(parentId);
    if (!parent) {
      console.warn(`renderer.addChild: unknown parent "${parentId}"`);
      return;
    }
    mountNode(node, parent.childRoot);
    if (beforeId) {
      const ref = nodes.get(beforeId)?.el;
      const justMounted = nodes.get(node.id)?.el;
      if (ref && justMounted && ref.parentElement === parent.childRoot) {
        parent.childRoot.insertBefore(justMounted, ref);
      }
    }
    parent.childCount = newChildCount;
    parent.instance.patch(parent.lastProps, { childCount: newChildCount, node: parent.node });
  },

  // Patch a component with animated prop overrides layered over its base
  // props. Does NOT update entry.lastProps, so the base survives — pass
  // overrides=null to reset the component to its base props.
  patchAnimated(id, overrides) {
    const entry = nodes.get(id);
    if (!entry) return;
    const props = overrides ? { ...entry.lastProps, ...overrides } : entry.lastProps;
    entry.instance.patch(props, { childCount: entry.childCount, node: entry.node });
  },

  removeNode(id) {
    const entry = nodes.get(id);
    if (!entry) return;
    const descendants = [entry.el, ...entry.el.querySelectorAll('[data-scene-id]')];
    for (const descEl of descendants) {
      const descId = descEl.dataset.sceneId;
      const descEntry = nodes.get(descId);
      if (descEntry) {
        descEntry.instance.unmount?.();
        nodes.delete(descId);
      }
    }
    entry.el.remove();
  },

  // Relocate an already-mounted node's DOM (with its whole subtree intact)
  // under a new parent. Component instances + animation state are preserved —
  // it's a pure DOM move, not a remount.
  moveNode(nodeId, newParentId, beforeId = null) {
    const entry = nodes.get(nodeId);
    const newParent = nodes.get(newParentId);
    if (!entry || !newParent) return;
    const ref = beforeId ? (nodes.get(beforeId)?.el ?? null) : null;
    newParent.childRoot.insertBefore(entry.el, ref);
  },

  refreshCtx(id, newChildCount) {
    const entry = nodes.get(id);
    if (!entry) return;
    entry.childCount = newChildCount;
    entry.instance.patch(entry.lastProps, { childCount: newChildCount, node: entry.node });
  },

  // Sets the design-space dimensions and re-fits to the stage. Called by
  // scene.loadScene() (from sceneJson.canvas) and scene.setCanvas().
  setCanvasSize(w, h) {
    canvasW = Math.max(1, Math.round(w));
    canvasH = Math.max(1, Math.round(h));
    applyCanvasSize();
  },

  // Force a re-fit (e.g. after toggling export mode).
  refit() { fitCanvas(); },

  setBackground(color) {
    canvasEl.style.background = color || '#ffffff';
  },

  // Per-frame tick. Animations are applied separately (via the timeline);
  // this notifies any component that declared an onTime(t) hook — time-driven
  // components like Media in cycle/video mode.
  update(t) {
    for (const { instance } of nodes.values()) {
      instance.onTime?.(t);
    }
  },

  setSize(w, h) {
    // Legacy override; canvas handles internal sizing now.
    if (w != null && h != null) {
      root.style.width = `${w}px`;
      root.style.height = `${h}px`;
    } else {
      root.style.width = '';
      root.style.height = '';
    }
  },

  getEl(id) {
    return nodes.get(id)?.el ?? null;
  },

  getCanvasEl() { return canvasEl; },
};

function mountNode(node, parentEl) {
  const Comp = getComponent(node.component);
  const el = document.createElement('div');
  el.dataset.sceneId = node.id;
  el.className = 'scene-node';
  parentEl.appendChild(el);

  const fullProps = withDefaults(Comp.schema, node.props);
  const childCount = (node.children ?? []).length;
  const instance = Comp.mount(el, fullProps, { node, childCount });
  const childRoot = instance.childRoot ?? el;

  nodes.set(node.id, {
    el, instance, childRoot, childCount, node,
    componentName: node.component,
    lastProps: fullProps,
  });

  for (const child of node.children ?? []) {
    mountNode(child, childRoot);
  }

  // Children's DOM now exists — re-patch layout-owning components (e.g. Grid)
  // so they can style child cells. The component's mount() ran before its
  // children were created, so the first styling pass had nothing to find.
  if ((node.children ?? []).length > 0) {
    instance.patch(fullProps, { childCount, node });
  }
}
