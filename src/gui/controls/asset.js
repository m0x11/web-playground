// Single-asset control — import button + thumbnail + clear.

import { pickAndImport, assetUrl } from '../../scene/assets.js';

export function createAssetControl({ label, value, accept, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'control control--asset';

  const labelEl = document.createElement('label');
  labelEl.className = 'control__label';
  labelEl.textContent = label;

  const body = document.createElement('div');
  body.className = 'asset-body';

  const thumb = document.createElement('div');
  thumb.className = 'asset-thumb';

  const importBtn = document.createElement('button');
  importBtn.className = 'asset-btn';
  importBtn.textContent = 'import…';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'asset-btn asset-btn--clear';
  clearBtn.textContent = '×';
  clearBtn.title = 'clear';

  function renderThumb(path) {
    thumb.innerHTML = '';
    if (!path) {
      thumb.classList.add('asset-thumb--empty');
      thumb.textContent = 'none';
      clearBtn.style.display = 'none';
      return;
    }
    thumb.classList.remove('asset-thumb--empty');
    clearBtn.style.display = '';
    const isVideo = accept.startsWith('video');
    if (isVideo) {
      thumb.textContent = path.split('/').pop();
    } else {
      const img = document.createElement('img');
      img.src = assetUrl(path);
      thumb.appendChild(img);
    }
  }

  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    importBtn.textContent = 'importing…';
    try {
      const [path] = await pickAndImport({ accept, multiple: false });
      if (path) { renderThumb(path); onChange(path); }
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = 'import…';
    }
  });

  clearBtn.addEventListener('click', () => {
    renderThumb('');
    onChange('');
  });

  renderThumb(value);
  body.append(thumb, importBtn, clearBtn);
  wrap.append(labelEl, body);
  return wrap;
}
