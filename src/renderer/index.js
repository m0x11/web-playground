// Renderer.
//
// Turns a scene JSON tree into DOM under #scene-root and keeps it in sync.
// Key contract: node identity is stable across prop edits — every scene tree
// node gets a persistent DOM node + component instance, keyed by `id`. Prop
// updates patch in place. Never tear down + recreate.

import { getComponent, withDefaults } from '../components/index.js';

const root = document.getElementById('scene-root');
const nodes = new Map(); // id → { el, instance, componentName, childCount }

export const renderer = {
  mount(sceneJson) {
    // Tear down what's there.
    for (const { instance } of nodes.values()) instance.unmount?.();
    nodes.clear();
    root.innerHTML = '';
    if (!sceneJson?.root) return;
    mountNode(sceneJson.root, root);
  },

  // Apply new props to an existing mounted node. No remount; preserves
  // animations, focus, scroll, child DOM, etc.
  patch(id, fullProps) {
    const entry = nodes.get(id);
    if (!entry) {
      console.warn(`renderer.patch: unknown id "${id}"`);
      return;
    }
    entry.instance.patch(fullProps, { childCount: entry.childCount });
  },

  update(_t) {
    // Phase 5: timeline will call this and we'll apply animated property values.
  },

  setSize(w, h) {
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

  nodes.set(node.id, { el, instance, componentName: node.component, childCount });

  // Children mount inside the parent component's element. Components are
  // responsible for any nested layout container of their own.
  for (const child of node.children ?? []) {
    mountNode(child, el);
  }
}
