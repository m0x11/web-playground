// Renderer.
//
// Turns a scene JSON tree into DOM under #scene-root and keeps it in sync.
// Key contract (ARCHITECTURE.md): node identity is stable across prop edits —
// every scene tree node gets a persistent DOM node keyed by its `id`. Prop
// updates patch in place. Never tear down + recreate.
//
// Phase 0: just mount one hardcoded element type. Component registry +
// stable-identity patching land in Phase 1.

const root = document.getElementById('scene-root');

const nodes = new Map(); // id → DOM element

export const renderer = {
  mount(sceneJson) {
    root.innerHTML = '';
    nodes.clear();
    if (!sceneJson?.root) return;
    mountNode(sceneJson.root, root);
  },

  update(_t) {
    // Phase 0: nothing animated yet. Phase 5 will apply property registry.
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

  // Lookup hook used by the animation layer to find a DOM node by scene id.
  getEl(id) {
    return nodes.get(id) ?? null;
  },
};

function mountNode(node, parentEl) {
  const el = document.createElement('div');
  el.dataset.sceneId = node.id;
  el.className = 'scene-node';

  // Phase 0: hardcoded "Hello" component for the only registered type.
  if (node.component === 'Placeholder') {
    el.textContent = node.props?.text ?? '(placeholder)';
    Object.assign(el.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: 'var(--accent)',
      fontSize: '20px',
      letterSpacing: '0.04em',
      opacity: '0.7',
    });
  }

  parentEl.appendChild(el);
  nodes.set(node.id, el);

  for (const child of node.children ?? []) {
    mountNode(child, el);
  }
}
