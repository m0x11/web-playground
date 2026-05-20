// Renderer.
//
// Turns a scene JSON tree into DOM under #scene-root and keeps it in sync.
// Key contract: node identity is stable across prop edits — every scene tree
// node gets a persistent DOM node + component instance, keyed by `id`.
//
// Components may return `childRoot` from mount() to indicate where child
// scene-nodes should be appended (e.g. Grid points children to its inner
// frame, not the padded outer container). Defaults to `el` if omitted.

import { getComponent, withDefaults } from '../components/index.js';

const root = document.getElementById('scene-root');
const nodes = new Map(); // id → { el, instance, componentName, childRoot, childCount, lastProps }

export const renderer = {
  mount(sceneJson) {
    for (const { instance } of nodes.values()) instance.unmount?.();
    nodes.clear();
    root.innerHTML = '';
    if (!sceneJson?.root) return;
    mountNode(sceneJson.root, root);
  },

  // Apply new props to an existing mounted node. No remount.
  patch(id, fullProps) {
    const entry = nodes.get(id);
    if (!entry) {
      console.warn(`renderer.patch: unknown id "${id}"`);
      return;
    }
    entry.lastProps = fullProps;
    entry.instance.patch(fullProps, { childCount: entry.childCount });
  },

  // Mount a new node (and its subtree) as a child of an existing node, then
  // notify the parent of its new childCount so it can react (e.g. Grid hides
  // placeholders).
  addChild(parentId, node, newChildCount) {
    const parent = nodes.get(parentId);
    if (!parent) {
      console.warn(`renderer.addChild: unknown parent "${parentId}"`);
      return;
    }
    mountNode(node, parent.childRoot);
    parent.childCount = newChildCount;
    parent.instance.patch(parent.lastProps, { childCount: newChildCount });
  },

  // Unmount a node and its descendants. Caller (scene) is responsible for
  // calling refreshCtx on the parent after, with the new child count.
  removeNode(id) {
    const entry = nodes.get(id);
    if (!entry) return;
    // Collect this + all descendant scene-node ids in DOM order.
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

  // Tell a parent to re-evaluate its layout given a new child count, without
  // changing its props. Used after addChild / removeNode.
  refreshCtx(id, newChildCount) {
    const entry = nodes.get(id);
    if (!entry) return;
    entry.childCount = newChildCount;
    entry.instance.patch(entry.lastProps, { childCount: newChildCount });
  },

  update(_t) {
    // Phase 5: animation tick.
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
  const childRoot = instance.childRoot ?? el;

  nodes.set(node.id, {
    el, instance, childRoot, childCount,
    componentName: node.component,
    lastProps: fullProps,
  });

  for (const child of node.children ?? []) {
    mountNode(child, childRoot);
  }
}
