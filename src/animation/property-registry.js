// Animatable property registry.
//
// Each entry declares:
//   - default: identity value (used when no tween touches the property)
//   - editor: { kind, min?, max?, step?, type? } describing the from/to control
//
// applyProperties(el, values, transformState) is what the timeline calls per
// frame. Transform-touching properties funnel through a single composer so
// multiple tweens on scale/rotation/x/y combine into one `transform` string.
//
// New animatable property = add a row here + handle it in applyOne (or in
// the transform composer).

export const PROPERTIES = {
  opacity:  { default: 1,         editor: { kind: 'number', min: 0,    max: 1,    step: 0.01 } },
  scale:    { default: 1,         editor: { kind: 'number', min: 0,    max: 5,    step: 0.01 } },
  rotation: { default: 0,         editor: { kind: 'number', min: -720, max: 720,  step: 1, unit: 'deg' } },
  x:        { default: 0,         editor: { kind: 'number', min: -2000, max: 2000, step: 1, unit: 'px' } },
  y:        { default: 0,         editor: { kind: 'number', min: -2000, max: 2000, step: 1, unit: 'px' } },
  width:    { default: null,      editor: { kind: 'number', min: 0,    max: 4000, step: 1, unit: 'px' } },
  height:   { default: null,      editor: { kind: 'number', min: 0,    max: 4000, step: 1, unit: 'px' } },
  color:    { default: '#000000', editor: { kind: 'color' } },
};

export const PROPERTY_NAMES = Object.keys(PROPERTIES);

const TRANSFORM_PROPS = new Set(['scale', 'rotation', 'x', 'y']);

// Per-element transform state. Map (not WeakMap) so we can reset cleanly.
const transformState = new Map();

export function resetTransformState() {
  transformState.clear();
}

export function applyProperties(el, values) {
  // Pull or initialize transform state for this element.
  let state = transformState.get(el);
  if (!state) {
    state = { scale: 1, rotation: 0, x: 0, y: 0 };
    transformState.set(el, state);
  }

  // Pass 1: update transform state from any transform-touching values.
  let transformChanged = false;
  for (const prop of TRANSFORM_PROPS) {
    if (prop in values) {
      state[prop] = values[prop];
      transformChanged = true;
    }
  }

  // Pass 2: apply non-transform properties directly.
  for (const [prop, val] of Object.entries(values)) {
    if (TRANSFORM_PROPS.has(prop)) continue;
    applyOne(el, prop, val);
  }

  if (transformChanged) {
    el.style.transform =
      `translate(${state.x}px, ${state.y}px) ` +
      `scale(${state.scale}) ` +
      `rotate(${state.rotation}deg)`;
    el.style.transformOrigin = 'center center';
  }
}

// Reset an element's animated styles to their natural state (called when no
// tween touches a property anymore, so the element doesn't stay stuck).
export function clearProperties(el, props) {
  for (const prop of props) {
    if (TRANSFORM_PROPS.has(prop)) {
      const state = transformState.get(el);
      if (state) {
        if (prop === 'scale') state.scale = 1;
        else if (prop === 'rotation') state.rotation = 0;
        else if (prop === 'x') state.x = 0;
        else if (prop === 'y') state.y = 0;
        el.style.transform =
          `translate(${state.x}px, ${state.y}px) ` +
          `scale(${state.scale}) ` +
          `rotate(${state.rotation}deg)`;
      }
    } else {
      switch (prop) {
        case 'opacity': el.style.opacity = ''; break;
        case 'width':   el.style.width = ''; break;
        case 'height':  el.style.height = ''; break;
        case 'color':   el.style.color = ''; break;
      }
    }
  }
}

function applyOne(el, prop, value) {
  switch (prop) {
    case 'opacity': el.style.opacity = String(value); break;
    case 'width':   el.style.width  = `${value}px`; break;
    case 'height':  el.style.height = `${value}px`; break;
    case 'color':   el.style.color  = value; break;
    default:
      // Property not recognized — ignore quietly. Adding new property =
      // extend this switch + PROPERTIES table.
      break;
  }
}
