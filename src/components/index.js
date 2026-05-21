// Component registry.
//
// Each component is a module exporting:
//   - schema: { name, category, children, props: { [key]: PropSchema } }
//   - mount(el, props, ctx) → { patch(nextProps), unmount(), onTime?(t), childRoot? }
//
// PropSchema shape (extends per type):
//   { type: 'number', label?, min?, max?, step?, unit?, default?, visibleWhen? }
//   { type: 'enum',   label?, options: [...], default?, visibleWhen? }
//   { type: 'text',   label?, default?, placeholder?, visibleWhen? }
//   { type: 'color',  label?, default?, visibleWhen? }
//   { type: 'asset',      label?, accept?, default?, visibleWhen? }
//   { type: 'asset-list', label?, accept?, default?, visibleWhen? }
//
// visibleWhen: { otherPropKey: requiredValue } — control hidden in the GUI
// when sibling prop !== requiredValue. The component still receives all props.
//
// onTime(t): optional. Renderer calls it every setTime for time-driven
// components (e.g. Media cycle/video).
//
// Adding a new component:
//   1. Create src/components/generics/<name>.js (or lifts/<project>/<name>.js)
//   2. Import + register here. That's it.

import * as Grid from './generics/grid.js';
import * as Text from './generics/text.js';
import * as Media from './generics/media.js';

export const COMPONENT_REGISTRY = {
  Grid,
  Text,
  Media,
};

// Legacy component-name aliases for scenes saved under an old name. Resolved
// by getComponent but NOT surfaced in the add-component picker.
const ALIASES = {
  Image: 'Media',
};

export function getComponent(name) {
  const resolved = ALIASES[name] ?? name;
  const c = COMPONENT_REGISTRY[resolved];
  if (!c) throw new Error(`Unknown component: ${name}`);
  return c;
}

export function isKnownComponent(name) {
  return (ALIASES[name] ?? name) in COMPONENT_REGISTRY;
}

export function getDefaultProps(schema) {
  const out = {};
  for (const [key, p] of Object.entries(schema.props ?? {})) {
    if ('default' in p) {
      // Clone array/object defaults so instances don't share references.
      out[key] = Array.isArray(p.default) ? [...p.default] : p.default;
    }
  }
  return out;
}

export function withDefaults(schema, props) {
  return { ...getDefaultProps(schema), ...(props ?? {}) };
}
