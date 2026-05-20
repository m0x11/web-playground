// Control factory. Given a prop schema, return the right control element.
// Adding a new prop type = adding a case here + a new control module.

import { createSlider } from './slider.js';
import { createSelect } from './select.js';

export function createControl(propKey, propSchema, currentValue, onChange) {
  const label = propSchema.label ?? propKey;

  switch (propSchema.type) {
    case 'number':
      return createSlider({
        label,
        min: propSchema.min ?? 0,
        max: propSchema.max ?? 100,
        step: propSchema.step ?? 1,
        value: currentValue,
        unit: propSchema.unit,
        onChange,
      });
    case 'enum':
      return createSelect({
        label,
        options: propSchema.options,
        value: currentValue,
        onChange,
      });
    default: {
      const fallback = document.createElement('div');
      fallback.className = 'control control--unknown';
      fallback.textContent = `(no control for type "${propSchema.type}")`;
      return fallback;
    }
  }
}

// Should this prop be shown given the current sibling prop values?
export function isVisible(propSchema, currentProps) {
  if (!propSchema.visibleWhen) return true;
  for (const [key, value] of Object.entries(propSchema.visibleWhen)) {
    if (currentProps[key] !== value) return false;
  }
  return true;
}

// Which other props watch this propKey via their visibleWhen? Used by the
// props panel to decide whether to re-render after a change (re-render only
// when needed; otherwise leave the slider DOM alone so a drag isn't broken).
export function watchersOf(propKey, schemaProps) {
  return Object.entries(schemaProps).some(
    ([, p]) => p.visibleWhen && propKey in p.visibleWhen
  );
}
