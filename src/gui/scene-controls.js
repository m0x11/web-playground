// Scene controls — editable name + save / load buttons. Lives at the top of
// the left rail.

import { saveSceneToFile, loadSceneFromFile } from '../scene/persistence.js';
import { openExportModal } from './export-modal.js';

const CANVAS_PRESETS = [
  { label: '16:9 landscape',       aspectW: 16, aspectH: 9 },
  { label: '9:16 vertical / reel', aspectW: 9,  aspectH: 16 },
  { label: '1:1 square',           aspectW: 1,  aspectH: 1 },
  { label: '4:3 landscape',        aspectW: 4,  aspectH: 3 },
  { label: '3:4 vertical',         aspectW: 3,  aspectH: 4 },
  { label: '21:9 ultrawide',       aspectW: 21, aspectH: 9 },
  { label: 'custom',               aspectW: null, aspectH: null },
];

export function mountSceneControls(host, scene) {
  host.innerHTML = `
    <section class="panel-section scene-controls">
      <div class="panel-label">scene</div>
      <input type="text" class="scene-name-input" id="scene-name" spellcheck="false" autocomplete="off">

      <div class="canvas-row">
        <label class="canvas-row__label">canvas</label>
        <select class="canvas-preset" id="canvas-preset"></select>
      </div>
      <div class="canvas-custom" id="canvas-custom" hidden>
        <input type="number" id="canvas-w" min="1" step="1">
        <span>:</span>
        <input type="number" id="canvas-h" min="1" step="1">
      </div>
      <div class="canvas-row">
        <label class="canvas-row__label">background</label>
        <input type="color" class="scene-bg-input" id="scene-bg">
      </div>

      <div class="scene-controls__buttons">
        <button class="picker-btn" id="scene-save">save</button>
        <button class="picker-btn" id="scene-load">load</button>
      </div>
      <button class="picker-btn scene-export-btn" id="scene-export">⤓ export video…</button>
    </section>
  `;

  const nameInput = host.querySelector('#scene-name');
  nameInput.value = scene.getName();
  nameInput.addEventListener('input', () => scene.setName(nameInput.value));

  scene.on('scene-loaded', () => { nameInput.value = scene.getName(); refreshCanvas(); });
  scene.on('scene-name-changed', name => {
    if (nameInput.value !== name) nameInput.value = name;
  });
  scene.on('scene-canvas-changed', refreshCanvas);

  // ── background ─────────────────────────────────────────────────────────
  const bgInput = host.querySelector('#scene-bg');
  bgInput.value = scene.getBackground();
  bgInput.addEventListener('input', () => scene.setBackground(bgInput.value));
  scene.on('scene-loaded', () => { bgInput.value = scene.getBackground(); });

  // ── canvas controls ────────────────────────────────────────────────────
  const presetSel = host.querySelector('#canvas-preset');
  const customWrap = host.querySelector('#canvas-custom');
  const wInput = host.querySelector('#canvas-w');
  const hInput = host.querySelector('#canvas-h');

  CANVAS_PRESETS.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = p.label;
    presetSel.appendChild(o);
  });

  // Pick the preset whose ratio matches (within a small epsilon), else custom.
  function findMatchingPresetIdx({ aspectW, aspectH }) {
    const target = aspectW / aspectH;
    for (let i = 0; i < CANVAS_PRESETS.length; i++) {
      const p = CANVAS_PRESETS[i];
      if (p.aspectW == null) continue;
      if (Math.abs(p.aspectW / p.aspectH - target) < 1e-6) return i;
    }
    return CANVAS_PRESETS.length - 1; // custom
  }

  function refreshCanvas() {
    const c = scene.getCanvas();
    const idx = findMatchingPresetIdx(c);
    presetSel.value = String(idx);
    const isCustom = CANVAS_PRESETS[idx].aspectW == null;
    customWrap.hidden = !isCustom;
    if (document.activeElement !== wInput) wInput.value = String(c.aspectW);
    if (document.activeElement !== hInput) hInput.value = String(c.aspectH);
  }

  presetSel.addEventListener('change', () => {
    const p = CANVAS_PRESETS[Number(presetSel.value)];
    if (p.aspectW != null) {
      scene.setCanvas(p.aspectW, p.aspectH);
    } else {
      // custom — switch UI, keep current aspect until user edits.
      customWrap.hidden = false;
    }
  });

  function commitCustom() {
    const w = Math.max(1, Number(wInput.value) || 1);
    const h = Math.max(1, Number(hInput.value) || 1);
    scene.setCanvas(w, h);
  }
  wInput.addEventListener('change', commitCustom);
  hInput.addEventListener('change', commitCustom);

  refreshCanvas();

  host.querySelector('#scene-save').addEventListener('click', async () => {
    try {
      await saveSceneToFile(scene);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  });

  host.querySelector('#scene-load').addEventListener('click', async () => {
    try {
      await loadSceneFromFile(scene);
    } catch (err) {
      alert(`Load failed: ${err.message}`);
    }
  });

  host.querySelector('#scene-export').addEventListener('click', () => {
    openExportModal(scene);
  });
}
