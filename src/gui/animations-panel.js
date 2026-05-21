// Right-rail Animations panel.
//
// For the selected node, lists its tweens and lets you add / edit / delete
// them. The property dropdown offers transform properties (applied to the
// scene-node) plus the component's own numeric/colour props — animating those
// patches the component each frame (e.g. Media zoom). "to all" copies a tween
// onto every sibling cell in the same grid.

import { PROPERTIES, PROPERTY_NAMES } from '../animation/property-registry.js';
import { EASING_NAMES } from '../animation/easing.js';
import { getComponent } from '../components/index.js';

const DEFAULTS_BY_PROPERTY = {
  opacity:  { from: 0,        to: 1,    start: 0, duration: 1.0, easing: 'easeOutCubic' },
  scale:    { from: 0,        to: 1,    start: 0, duration: 1.0, easing: 'easeOutBack'  },
  rotation: { from: 0,        to: 360,  start: 0, duration: 1.0, easing: 'easeInOutCubic' },
  x:        { from: -200,     to: 0,    start: 0, duration: 1.0, easing: 'easeOutCubic' },
  y:        { from: -200,     to: 0,    start: 0, duration: 1.0, easing: 'easeOutCubic' },
  width:    { from: 0,        to: 200,  start: 0, duration: 1.0, easing: 'easeOutCubic' },
  height:   { from: 0,        to: 200,  start: 0, duration: 1.0, easing: 'easeOutCubic' },
  color:    { from: '#ff0000', to: '#000000', start: 0, duration: 1.0, easing: 'linear' },
};

export function mountAnimationsPanel(host, scene) {
  function render() {
    const selectedId = scene.selectedId();
    host.innerHTML = '';

    if (!selectedId) {
      const ph = document.createElement('div');
      ph.className = 'panel-placeholder';
      ph.textContent = 'select something to animate';
      host.appendChild(ph);
      return;
    }

    host.appendChild(renderAddRow(selectedId));
    const tweens = scene.listAnimationsForTarget(selectedId);
    if (tweens.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'panel-placeholder';
      ph.style.marginTop = '10px';
      ph.textContent = 'no tweens yet';
      host.appendChild(ph);
    } else {
      for (const tween of tweens) host.appendChild(renderTweenRow(tween));
    }
  }

  // Numeric / colour component props that don't shadow a transform property.
  function componentProps(node) {
    const schemaProps = getComponent(node.component).schema.props ?? {};
    return Object.entries(schemaProps)
      .filter(([name, p]) => (p.type === 'number' || p.type === 'color') && !(name in PROPERTIES))
      .map(([name]) => name);
  }

  function option(name) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    return o;
  }

  function renderAddRow(selectedId) {
    const row = document.createElement('div');
    row.className = 'anim-add-row';
    const node = scene.getNode(selectedId);

    const select = document.createElement('select');
    select.className = 'control__input';

    const tg = document.createElement('optgroup');
    tg.label = 'transform';
    for (const name of PROPERTY_NAMES) tg.appendChild(option(name));
    select.appendChild(tg);

    const compProps = node ? componentProps(node) : [];
    if (compProps.length) {
      const cg = document.createElement('optgroup');
      cg.label = `${getComponent(node.component).schema.name.toLowerCase()} props`;
      for (const name of compProps) cg.appendChild(option(name));
      select.appendChild(cg);
    }

    const btn = document.createElement('button');
    btn.className = 'picker-btn anim-add-btn';
    btn.textContent = '+ add tween';
    btn.addEventListener('click', () => {
      const prop = select.value;
      if (prop in DEFAULTS_BY_PROPERTY) {
        scene.addAnimation({ target: selectedId, property: prop, ...DEFAULTS_BY_PROPERTY[prop] });
      } else {
        // Component prop — seed from/to with its current value (a no-op tween
        // the user then edits) so adding it doesn't jump the scene.
        const cur = scene.getFullProps(selectedId)?.[prop] ?? 0;
        scene.addAnimation({
          target: selectedId, property: prop,
          from: cur, to: cur, start: 0, duration: 1.0, easing: 'easeOutCubic',
        });
      }
    });

    row.append(select, btn);
    return row;
  }

  // Editor hints for a tween's value fields — from the registry, or the
  // target component's schema for component props.
  function editorMetaFor(tween) {
    if (PROPERTIES[tween.property]) return PROPERTIES[tween.property].editor;
    const node = scene.getNode(tween.target);
    const sp = node && getComponent(node.component).schema.props?.[tween.property];
    if (sp?.type === 'color') return { kind: 'color' };
    if (sp) return { kind: 'number', min: sp.min, max: sp.max, step: sp.step, unit: sp.unit };
    return { kind: 'number' };
  }

  function renderTweenRow(tween) {
    const meta = { editor: editorMetaFor(tween) };
    const row = document.createElement('div');
    row.className = 'anim-row';

    // Header: property name + "to all" + delete
    const head = document.createElement('div');
    head.className = 'anim-row__head';
    const title = document.createElement('span');
    title.className = 'anim-row__title';
    title.textContent = tween.property;

    const all = document.createElement('button');
    all.className = 'anim-row__all';
    all.textContent = 'to all';
    all.title = 'copy this tween to every other cell in the same grid';
    all.addEventListener('click', () => scene.applyAnimationToSiblings(tween.id));

    const del = document.createElement('button');
    del.className = 'anim-row__delete';
    del.textContent = '×';
    del.title = 'delete tween';
    del.addEventListener('click', () => scene.removeAnimation(tween.id));

    head.append(title, all, del);
    row.appendChild(head);

    // From / To
    const fromTo = document.createElement('div');
    fromTo.className = 'anim-row__line';
    fromTo.appendChild(makeValueField('from', tween.from, meta, v => {
      scene.updateAnimation(tween.id, { from: v });
    }));
    fromTo.appendChild(makeValueField('to', tween.to, meta, v => {
      scene.updateAnimation(tween.id, { to: v });
    }));
    row.appendChild(fromTo);

    // Start / Duration
    const timing = document.createElement('div');
    timing.className = 'anim-row__line';
    timing.appendChild(makeNumberField('start', tween.start ?? 0, 's', { min: 0, step: 0.05 }, v => {
      scene.updateAnimation(tween.id, { start: v });
    }));
    timing.appendChild(makeNumberField('dur', tween.duration ?? 0, 's', { min: 0, step: 0.05 }, v => {
      scene.updateAnimation(tween.id, { duration: v });
    }));
    row.appendChild(timing);

    // Easing
    const ease = document.createElement('div');
    ease.className = 'anim-row__line';
    const easeLabel = document.createElement('span');
    easeLabel.className = 'anim-field__label';
    easeLabel.textContent = 'ease';
    const easeSelect = document.createElement('select');
    easeSelect.className = 'control__input';
    for (const name of EASING_NAMES) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      if (name === tween.easing) o.selected = true;
      easeSelect.appendChild(o);
    }
    easeSelect.addEventListener('change', () => {
      scene.updateAnimation(tween.id, { easing: easeSelect.value });
    });
    ease.append(easeLabel, easeSelect);
    row.appendChild(ease);

    return row;
  }

  function makeValueField(label, value, meta, onChange) {
    if (meta?.editor?.kind === 'color') {
      return makeColorField(label, value, onChange);
    }
    return makeNumberField(label, value, meta?.editor?.unit ?? '', {
      min: meta?.editor?.min, max: meta?.editor?.max, step: meta?.editor?.step ?? 0.01,
    }, onChange);
  }

  function makeNumberField(label, value, unit, opts, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'anim-field';
    const lbl = document.createElement('span');
    lbl.className = 'anim-field__label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'control__input anim-field__input';
    input.value = String(value);
    if (opts.min != null) input.min = String(opts.min);
    if (opts.max != null) input.max = String(opts.max);
    if (opts.step != null) input.step = String(opts.step);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    wrap.append(lbl, input);
    if (unit) {
      const u = document.createElement('span');
      u.className = 'anim-field__unit';
      u.textContent = unit;
      wrap.appendChild(u);
    }
    return wrap;
  }

  function makeColorField(label, value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'anim-field';
    const lbl = document.createElement('span');
    lbl.className = 'anim-field__label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'control__input control__input--color';
    input.value = value || '#000000';
    input.addEventListener('input', () => onChange(input.value));
    wrap.append(lbl, input);
    return wrap;
  }

  scene.on('selection-changed', render);
  scene.on('scene-loaded', render);
  scene.on('animations-changed', render);
  render();
}
