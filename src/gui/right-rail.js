// Right rail — properties + layout + animations of the active selection.

import { getComponent, withDefaults } from '../components/index.js';
import { createControl, isVisible, watchersOf } from './controls/index.js';
import { createSlider } from './controls/slider.js';
import { mountAnimationsPanel } from './animations-panel.js';

export function mountRightRail(el, scene) {
  el.innerHTML = `
    <section class="panel-section" id="props-section">
      <div class="panel-label">properties</div>
      <div class="props-body"></div>
    </section>
    <section class="panel-section" id="layout-section" hidden>
      <div class="panel-label">layout</div>
      <div class="layout-body"></div>
    </section>
    <section class="panel-section">
      <div class="panel-label">animations</div>
      <div class="anim-body"></div>
    </section>
  `;

  const propsBody = el.querySelector('.props-body');
  const layoutSection = el.querySelector('#layout-section');
  const layoutBody = el.querySelector('.layout-body');
  const animBody = el.querySelector('.anim-body');

  function renderProps() {
    const id = scene.selectedId();
    propsBody.innerHTML = '';

    if (!id) {
      const ph = document.createElement('div');
      ph.className = 'panel-placeholder';
      ph.textContent = 'nothing selected';
      propsBody.appendChild(ph);
      return;
    }

    const node = scene.getNode(id);
    if (!node) return;

    const Comp = getComponent(node.component);
    const schemaProps = Comp.schema.props ?? {};
    const fullProps = withDefaults(Comp.schema, node.props);

    const subhead = document.createElement('div');
    subhead.className = 'props-subhead';

    const name = document.createElement('span');
    name.textContent = Comp.schema.name;
    subhead.appendChild(name);

    const idEl = document.createElement('span');
    idEl.className = 'props-subhead__id';
    idEl.textContent = node.id;
    subhead.appendChild(idEl);

    const isRoot = scene.getRootNode()?.id === id;
    if (!isRoot) {
      const dup = document.createElement('button');
      dup.className = 'props-dup';
      dup.textContent = '⧉ dup';
      dup.title = 'duplicate (props + animations)';
      dup.addEventListener('click', () => scene.duplicateNode(id));
      subhead.appendChild(dup);

      const del = document.createElement('button');
      del.className = 'props-delete';
      del.textContent = '× delete';
      del.addEventListener('click', () => scene.removeNode(id));
      subhead.appendChild(del);
    }

    propsBody.appendChild(subhead);

    for (const [propKey, propSchema] of Object.entries(schemaProps)) {
      if (!isVisible(propSchema, fullProps)) continue;

      const willChangeVisibility = watchersOf(propKey, schemaProps);

      const control = createControl(propKey, propSchema, fullProps[propKey], v => {
        scene.updateProps(id, { [propKey]: v });
        if (willChangeVisibility) renderProps();
      });
      propsBody.appendChild(control);
    }
  }

  // Layout section — shown only when the selected node's parent is a
  // freeform Grid. Edits each cell's width + aspect (node.layout).
  function renderLayout() {
    const id = scene.selectedId();
    layoutBody.innerHTML = '';

    const parent = id ? scene.getParentNode(id) : null;
    const freeformParent =
      parent && parent.component === 'Grid' && (parent.props?.mode ?? 'columns') === 'freeform';

    if (!freeformParent) {
      layoutSection.hidden = true;
      return;
    }
    layoutSection.hidden = false;

    const node = scene.getNode(id);
    const gridProps = withDefaults(getComponent('Grid').schema, parent.props);
    const layout = node.layout ?? {};

    const hint = document.createElement('div');
    hint.className = 'panel-placeholder';
    hint.style.marginBottom = '8px';
    hint.textContent = 'cell size within the freeform grid';
    layoutBody.appendChild(hint);

    layoutBody.appendChild(createSlider({
      label: 'Width',
      min: 20, max: 2000, step: 1, unit: 'px',
      value: layout.width ?? gridProps.cellWidth,
      onChange: v => scene.updateLayout(id, { width: v }),
    }));

    // Ratio is moot when the parent grid fills height — hide it then.
    if (!gridProps.fillHeight) {
      layoutBody.appendChild(createSlider({
        label: 'Ratio',
        min: 0.2, max: 5, step: 0.05,
        value: layout.aspect ?? gridProps.cellAspect,
        onChange: v => scene.updateLayout(id, { aspect: v }),
      }));
    }
  }

  scene.on('selection-changed', () => { renderProps(); renderLayout(); });
  scene.on('scene-loaded',      () => { renderProps(); renderLayout(); });
  scene.on('scene-tree-changed',() => { renderProps(); renderLayout(); });
  // Re-evaluate the layout section if the parent Grid's mode changed.
  scene.on('node-updated', ({ id }) => {
    const sel = scene.selectedId();
    if (sel && scene.getParentNode(sel)?.id === id) renderLayout();
  });

  renderProps();
  renderLayout();

  mountAnimationsPanel(animBody, scene);
}
