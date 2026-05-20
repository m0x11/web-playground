// Number slider control. Live value display on the right, calls onChange on
// every drag tick (`input` event) so prop updates land continuously.

export function createSlider({ label, min, max, step, value, unit, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--slider';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.className = 'control__input';

  const valEl = document.createElement('span');
  valEl.className = 'control__value';
  const fmt = v => `${v}${unit ?? ''}`;
  valEl.textContent = fmt(value);

  input.addEventListener('input', () => {
    const v = Number(input.value);
    valEl.textContent = fmt(v);
    onChange(v);
  });

  wrap.append(labelEl, input, valEl);
  return wrap;
}
