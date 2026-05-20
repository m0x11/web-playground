// Component registry.
//
// Each component is a module exporting:
//   - schema: { name, category, children, props: { [key]: PropSchema } }
//   - mount(el, props, ctx) → { patch(nextProps), unmount() }
//
// PropSchema shape (extends per type):
//   { type: 'number', label?, min?, max?, step?, unit?, default?, visibleWhen? }
//   { type: 'enum', label?, options: [...], default?, visibleWhen? }
//
// visibleWhen: { otherPropKey: requiredValue } — control is hidden in the GUI
// when sibling prop !== requiredValue. The component itself still receives the
// full prop set; visibleWhen only affects what the GUI shows.
//
// Adding a new component:
//   1. Create src/components/generics/<name>.js (or lifts/<project>/<name>.js)
//   2. Import + register here. That's it.

import * as Grid from './generics/grid.js';
import * as Text from './generics/text.js';
import * as Image from './generics/image.js';

export const COMPONENT_REGISTRY = {
  Grid,
  Text,
  Image,
};

export function getComponent(name) {
  const c = COMPONENT_REGISTRY[name];
  if (!c) throw new Error(`Unknown component: ${name}`);
  return c;
}

export function getDefaultProps(schema) {
  const out = {};
  for (const [key, p] of Object.entries(schema.props ?? {})) {
    if ('default' in p) out[key] = p.default;
  }
  return out;
}

export function withDefaults(schema, props) {
  return { ...getDefaultProps(schema), ...(props ?? {}) };
}
