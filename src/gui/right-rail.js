// Right rail — properties + animations of the active selection.

import { getComponent, withDefaults } from '../components/index.js';
import { createControl, isVisible, watchersOf } from './controls/index.js';
import { mountAnimationsPanel } from './animations-panel.js';

export function mountRightRail(el, scene) {
  el.innerHTML = `
    <section class="panel-section" id="props-section">
      <div class="panel-label">properties</div>
      <div class="props-body"></div>
    </section>
    <section class="panel-section">
      <div class="panel-label">animations</div>
      <div class="anim-body"></div>
    </section>
  `;

  const propsBody = el.querySelector('.props-body');
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

  scene.on('selection-changed', renderProps);
  scene.on('scene-loaded', renderProps);
  scene.on('scene-tree-changed', renderProps);
  renderProps();

  mountAnimationsPanel(animBody, scene);
}
