// Single-line text input.

export function createTextInput({ label, value, onChange, placeholder }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--text';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  if (placeholder) input.placeholder = placeholder;
  input.className = 'control__input';
  input.addEventListener('input', () => onChange(input.value));

  wrap.append(labelEl, input);
  return wrap;
}
