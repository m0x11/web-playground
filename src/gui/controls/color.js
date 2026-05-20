// Color picker — native <input type="color"> swatch + live hex display.

export function createColorPicker({ label, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--color';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'color';
  input.value = value || '#000000';
  input.className = 'control__input control__input--color';

  const hex = document.createElement('span');
  hex.className = 'control__value';
  hex.textContent = (value || '#000000').toUpperCase();

  input.addEventListener('input', () => {
    hex.textContent = input.value.toUpperCase();
    onChange(input.value);
  });

  wrap.append(labelEl, input, hex);
  return wrap;
}
