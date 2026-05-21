// Number control — a range slider paired with an editable number field.
//
// The slider is a quick way to scrub the [min, max] range; the number field
// lets you click and type an exact value. Both stay in sync. Typed values are
// clamped to [min, max] on commit (so a stray "0" for a 1-min prop snaps back).

export function createSlider({ label, min, max, step, value, unit, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--slider';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'control__input';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);

  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'control__num';
  num.step = String(step);
  num.value = String(value);

  const clamp = v => Math.min(max, Math.max(min, v));

  range.addEventListener('input', () => {
    const v = Number(range.value);
    num.value = String(v);
    onChange(v);
  });

  // While typing, push live (clamped) values so the preview tracks — but
  // don't rewrite the field, so the user can finish typing freely.
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (!Number.isFinite(v)) return;
    const c = clamp(v);
    range.value = String(c);
    onChange(c);
  });

  // On commit (blur / Enter), normalize the displayed value.
  num.addEventListener('change', () => {
    const v = parseFloat(num.value);
    const c = Number.isFinite(v) ? clamp(v) : Number(value);
    num.value = String(c);
    range.value = String(c);
    onChange(c);
  });

  wrap.append(labelEl, range, num);
  if (unit) {
    const u = document.createElement('span');
    u.className = 'control__unit';
    u.textContent = unit;
    wrap.appendChild(u);
  }
  return wrap;
}
