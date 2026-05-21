// Control factory. Given a prop schema, return the right control element.
// Adding a new prop type = a new case here + a new control module.

import { createSlider } from './slider.js';
import { createSelect } from './select.js';
import { createTextInput } from './text-input.js';
import { createColorPicker } from './color.js';
import { createAssetControl } from './asset.js';
import { createAssetListControl } from './asset-list.js';

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
    case 'text':
      return createTextInput({
        label,
        value: currentValue,
        placeholder: propSchema.placeholder,
        onChange,
      });
    case 'color':
      return createColorPicker({
        label,
        value: currentValue,
        onChange,
      });
    case 'asset':
      return createAssetControl({
        label,
        value: currentValue,
        accept: propSchema.accept ?? '',
        onChange,
      });
    case 'asset-list':
      return createAssetListControl({
        label,
        value: currentValue,
        accept: propSchema.accept ?? '',
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

export function isVisible(propSchema, currentProps) {
  if (!propSchema.visibleWhen) return true;
  for (const [key, value] of Object.entries(propSchema.visibleWhen)) {
    if (currentProps[key] !== value) return false;
  }
  return true;
}

export function watchersOf(propKey, schemaProps) {
  return Object.entries(schemaProps).some(
    ([, p]) => p.visibleWhen && propKey in p.visibleWhen
  );
}
