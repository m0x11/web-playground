// Multi-asset control — thumbnail list + add (multi-select) + per-item remove.

import { pickAndImport, assetUrl } from '../../scene/assets.js';

export function createAssetListControl({ label, value, accept, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--asset-list';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const list = document.createElement('div');
  list.className = 'asset-list';

  const addBtn = document.createElement('button');
  addBtn.className = 'asset-btn asset-btn--add';
  addBtn.textContent = '+ add images…';

  let paths = Array.isArray(value) ? [...value] : [];

  function commit() {
    onChange([...paths]);
    renderList();
  }

  function renderList() {
    list.innerHTML = '';
    if (paths.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'asset-list__empty';
      empty.textContent = 'no images';
      list.appendChild(empty);
    }
    paths.forEach((path, i) => {
      const row = document.createElement('div');
      row.className = 'asset-list__row';

      const thumb = document.createElement('img');
      thumb.className = 'asset-list__thumb';
      thumb.src = assetUrl(path);

      const name = document.createElement('span');
      name.className = 'asset-list__name';
      name.textContent = path.split('/').pop();

      const remove = document.createElement('button');
      remove.className = 'asset-btn asset-btn--clear';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        paths.splice(i, 1);
        commit();
      });

      row.append(thumb, name, remove);
      list.appendChild(row);
    });
  }

  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    addBtn.textContent = 'importing…';
    try {
      const added = await pickAndImport({ accept, multiple: true });
      if (added.length > 0) {
        paths = paths.concat(added);
        commit();
      }
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = '+ add images…';
    }
  });

  renderList();
  wrap.append(labelEl, list, addBtn);
  return wrap;
}
