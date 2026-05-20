// Right rail — properties of the active selection (Phase 1).
// Animations panel arrives in Phase 5.

import { getComponent, withDefaults } from '../components/index.js';
import { createControl, isVisible, watchersOf } from './controls/index.js';

export function mountRightRail(el, scene) {
  el.innerHTML = `
    <section class="panel-section" id="props-section">
      <div class="panel-label">properties</div>
      <div class="props-body"></div>
    </section>
    <section class="panel-section">
      <div class="panel-label">animations</div>
      <div class="panel-placeholder">phase 5</div>
    </section>
  `;

  const body = el.querySelector('.props-body');

  function renderProps() {
    const id = scene.selectedId();
    body.innerHTML = '';

    if (!id) {
      const ph = document.createElement('div');
      ph.className = 'panel-placeholder';
      ph.textContent = 'nothing selected';
      body.appendChild(ph);
      return;
    }

    const node = scene.getNode(id);
    if (!node) return;

    const Comp = getComponent(node.component);
    const schemaProps = Comp.schema.props ?? {};
    const fullProps = withDefaults(Comp.schema, node.props);

    const subhead = document.createElement('div');
    subhead.className = 'props-subhead';
    subhead.innerHTML = `${Comp.schema.name}<span class="props-subhead__id">${node.id}</span>`;
    body.appendChild(subhead);

    for (const [propKey, propSchema] of Object.entries(schemaProps)) {
      if (!isVisible(propSchema, fullProps)) continue;

      const willChangeVisibility = watchersOf(propKey, schemaProps);

      const control = createControl(propKey, propSchema, fullProps[propKey], v => {
        scene.updateProps(id, { [propKey]: v });
        if (willChangeVisibility) renderProps();
      });
      body.appendChild(control);
    }
  }

  scene.on('selection-changed', renderProps);
  scene.on('scene-loaded', renderProps);
  renderProps();
}
