// Boolean checkbox control.

export function createCheckbox({ label, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--checkbox';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'control__checkbox';
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));

  wrap.append(labelEl, input);
  return wrap;
}
