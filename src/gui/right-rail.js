// Right rail — properties + layout + animations of the active selection.

import { getComponent, withDefaults } from '../components/index.js';
import { createControl, isVisible, watchersOf } from './controls/index.js';
import { createSlider } from './controls/slider.js';
import { mountAnimationsPanel } from './animations-panel.js';
import { matchColor } from '../media/color-match.js';
import { GRADING_DEFAULTS } from '../media/grading.js';

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

      let effSchema = propSchema;
      let value = fullProps[propKey];
      if (Comp.schema.name === 'Media' && (propKey === 'videoStart' || propKey === 'videoStop')) {
        effSchema = videoBoundSchema(id, propSchema);
        // videoStop 0 means "natural end" — show it at the end of the slider.
        if (propKey === 'videoStop' && !(value > 0)) value = effSchema.max;
      }

      const control = createControl(propKey, effSchema, value, v => {
        scene.updateProps(id, { [propKey]: v });
        if (willChangeVisibility) renderProps();
      });
      propsBody.appendChild(control);
    }

    if (Comp.schema.name === 'Media') propsBody.appendChild(renderColorMatch(id));
  }

  // "Match colour" row — pick another Media block, press match, and this
  // block's exposure / contrast / saturation / temperature / tint are set
  // so its overall tone and cast follow the reference. Reset clears all
  // grading back to neutral.
  let lastMatchRef = null;
  function renderColorMatch(id) {
    const row = document.createElement('div');
    row.className = 'control control--match';

    const label = document.createElement('label');
    label.className = 'control__label';
    label.textContent = 'Match';

    const select = document.createElement('select');
    select.className = 'control__input';
    const others = allMediaIds().filter(x => x !== id);
    if (others.length === 0) {
      const o = document.createElement('option');
      o.textContent = '(no other media)';
      select.appendChild(o);
      select.disabled = true;
    } else {
      for (const other of others) {
        const o = document.createElement('option');
        o.value = other;
        o.textContent = other;
        if (other === lastMatchRef) o.selected = true;
        select.appendChild(o);
      }
    }

    const matchBtn = document.createElement('button');
    matchBtn.className = 'asset-btn';
    matchBtn.textContent = 'match';
    matchBtn.disabled = others.length === 0;
    matchBtn.title = 'grade this block to match the chosen one';
    matchBtn.addEventListener('click', () => {
      lastMatchRef = select.value;
      try {
        scene.updateProps(id, matchColor(scene, id, select.value));
        renderProps();
      } catch (err) {
        alert(`Colour match failed: ${err.message}`);
      }
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'asset-btn asset-btn--clear';
    resetBtn.textContent = 'reset';
    resetBtn.title = 'clear all grading';
    resetBtn.addEventListener('click', () => {
      scene.updateProps(id, { ...GRADING_DEFAULTS });
      renderProps();
    });

    const actions = document.createElement('div');
    actions.className = 'match-actions';
    actions.append(select, matchBtn, resetBtn);
    row.append(label, actions);
    return row;
  }

  function allMediaIds() {
    const out = [];
    (function walk(n) {
      if (!n) return;
      if (n.component === 'Media') out.push(n.id);
      for (const c of n.children ?? []) walk(c);
    })(scene.getRootNode());
    return out;
  }

  // Bound the videoStart / videoStop sliders to the actual video's duration.
  // Metadata loads async — if it's not ready, re-render once it is.
  function videoBoundSchema(id, base) {
    const videoEl = scene.getEl(id)?.querySelector('video');
    const dur = videoEl?.duration;
    if (Number.isFinite(dur) && dur > 0) {
      return { ...base, max: Math.max(base.min ?? 0, Math.round(dur * 10) / 10) };
    }
    if (videoEl) {
      videoEl.addEventListener('loadedmetadata', () => renderProps(), { once: true });
    }
    return base;
  }

  // Layout section — shown only when the selected node's parent is a
  // freeform Grid. Edits each cell's width + aspect (node.layout).
  function renderLayout() {
    const id = scene.selectedId();
    layoutBody.innerHTML = '';

    const parent = id ? scene.getParentNode(id) : null;
    if (!parent || parent.component !== 'Grid') {
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
    layoutBody.appendChild(hint);

    if (gridProps.mode === 'columns') {
      hint.textContent = 'grid cells this tile spans';
      layoutBody.appendChild(createSlider({
        label: 'Col span',
        min: 1, max: gridProps.columns, step: 1,
        value: Math.min(layout.colSpan ?? 1, gridProps.columns),
        onChange: v => scene.updateLayout(id, { colSpan: v }),
      }));
      layoutBody.appendChild(createSlider({
        label: 'Row span',
        min: 1, max: 8, step: 1,
        value: layout.rowSpan ?? 1,
        onChange: v => scene.updateLayout(id, { rowSpan: v }),
      }));
    } else {
      hint.textContent = 'cell size within the freeform grid';
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
