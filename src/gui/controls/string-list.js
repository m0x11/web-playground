// String-list control — a list of editable text lines with add / remove.
// Used for Text cycle "lines".

export function createStringListControl({ label, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--string-list';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const list = document.createElement('div');
  list.className = 'string-list';

  const addBtn = document.createElement('button');
  addBtn.className = 'asset-btn asset-btn--add';
  addBtn.textContent = '+ add line';

  let lines = Array.isArray(value) ? [...value] : [];

  const commit = () => onChange([...lines]);

  function renderList() {
    list.innerHTML = '';
    if (lines.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'asset-list__empty';
      empty.textContent = 'no lines';
      list.appendChild(empty);
    }
    lines.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'string-list__row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'control__input string-list__input';
      input.value = line;
      // Live edits don't re-render the list, so the input keeps focus.
      input.addEventListener('input', () => { lines[i] = input.value; commit(); });

      const remove = document.createElement('button');
      remove.className = 'asset-btn asset-btn--clear';
      remove.textContent = '×';
      remove.addEventListener('click', () => { lines.splice(i, 1); commit(); renderList(); });

      row.append(input, remove);
      list.appendChild(row);
    });
  }

  addBtn.addEventListener('click', () => {
    lines.push('');
    commit();
    renderList();
    const inputs = list.querySelectorAll('input');
    inputs[inputs.length - 1]?.focus();
  });

  renderList();
  wrap.append(labelEl, list, addBtn);
  return wrap;
}
