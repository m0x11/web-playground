// Enum dropdown control.

export function createSelect({ label, options, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--select';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const select = document.createElement('select');
  select.className = 'control__input';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = String(opt);
    o.textContent = String(opt);
    if (opt === value) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => onChange(select.value));

  wrap.append(labelEl, select);
  return wrap;
}
