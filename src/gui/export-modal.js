// Export modal — three states: configure → exporting → done.
//
// Calls the local Vite plugin /__export endpoint (see
// scripts/vite-plugin-export.js). Streams NDJSON progress events back from
// the server and updates the UI accordingly.

const PRESETS = [
  { label: 'match canvas',  canvasFactor: 1 },
  { label: '2× canvas',     canvasFactor: 2 },
  { label: '4× canvas',     canvasFactor: 4 },
  { label: '4K landscape',  width: 3840, height: 2160 },
  { label: '4K vertical',   width: 2160, height: 3840 },
  { label: '1080p',         width: 1920, height: 1080 },
  { label: 'reel / story',  width: 1080, height: 1920 },
  { label: 'square',        width: 1080, height: 1080 },
  { label: 'custom',        width: null, height: null },
];

const FPS_OPTIONS = [24, 30, 60];

export function openExportModal(scene) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  overlay.appendChild(panel);

  document.body.appendChild(overlay);

  let abortController = null;
  let phase = 'configure';

  // ── form state, seeded from the current scene ───────────────────────────
  const canvasPx = scene.getCanvasPixels();
  const state = {
    filename: `${(scene.getName() || 'scene').replace(/[^a-z0-9_-]+/gi, '-')}.mp4`,
    presetIdx: 0,                       // default: match canvas
    customW: canvasPx.width,
    customH: canvasPx.height,
    fps: 30,
    duration: Math.max(scene.duration(), 1),
    progress: { n: 0, total: 0, fps: 0, elapsed: 0 },
    note: '',
    outputPath: null,
    totalMs: 0,
  };

  function close() {
    if (abortController) abortController.abort();
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', e => {
    if (e.target === overlay && phase !== 'exporting') close();
  });

  // ── views ───────────────────────────────────────────────────────────────

  function render() {
    panel.innerHTML = '';
    if      (phase === 'configure') renderConfigure();
    else if (phase === 'exporting') renderExporting();
    else if (phase === 'done')      renderDone();
    else if (phase === 'error')     renderError();
  }

  function renderConfigure() {
    panel.appendChild(makeHead('export scene'));

    const aspect = scene.getCanvas();
    const canvasNow = scene.getCanvasPixels();
    const caption = document.createElement('div');
    caption.className = 'modal-caption';
    caption.textContent = `aspect ${aspect.aspectW}:${aspect.aspectH} · internal ${canvasNow.width}×${canvasNow.height}`;
    panel.appendChild(caption);

    panel.appendChild(makeField('filename', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'modal-input';
      input.value = state.filename;
      input.addEventListener('input', () => { state.filename = input.value; });
      return input;
    }));

    panel.appendChild(makeField('resolution', () => {
      const select = document.createElement('select');
      select.className = 'modal-input';
      PRESETS.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        let suffix = '';
        if (p.canvasFactor) {
          suffix = `  (${canvasNow.width * p.canvasFactor}×${canvasNow.height * p.canvasFactor})`;
        } else if (p.width) {
          suffix = `  (${p.width}×${p.height})`;
        }
        o.textContent = p.label + suffix;
        if (i === state.presetIdx) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', () => { state.presetIdx = Number(select.value); render(); });
      return select;
    }));

    // Warn if aspect ratio doesn't match canvas (preset will letterbox).
    const sized = resolveSize();
    if (Math.abs(sized.width / sized.height - canvasNow.width / canvasNow.height) > 0.01) {
      const warn = document.createElement('div');
      warn.className = 'modal-caption modal-caption--warn';
      warn.textContent = 'output aspect differs from canvas — content will letterbox/pillarbox';
      panel.appendChild(warn);
    }

    if (PRESETS[state.presetIdx].width == null) {
      const row = document.createElement('div');
      row.className = 'modal-field modal-field--inline';
      row.append(numberInput('w', state.customW, v => state.customW = v),
                 numberInput('h', state.customH, v => state.customH = v));
      panel.appendChild(row);
    }

    panel.appendChild(makeField('fps', () => {
      const select = document.createElement('select');
      select.className = 'modal-input';
      FPS_OPTIONS.forEach(v => {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = String(v);
        if (v === state.fps) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', () => { state.fps = Number(select.value); });
      return select;
    }));

    panel.appendChild(makeField('duration (s)', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'modal-input';
      input.min = '0';
      input.step = '0.1';
      input.value = String(state.duration);
      input.addEventListener('input', () => { state.duration = Math.max(0, Number(input.value) || 0); });
      return input;
    }));

    panel.appendChild(makeButtons([
      { label: 'cancel', onClick: close },
      { label: '▶ export', primary: true, onClick: startExport },
    ]));
  }

  function renderExporting() {
    panel.appendChild(makeHead('exporting…'));

    const meta = document.createElement('div');
    meta.className = 'modal-meta';
    const { width, height } = resolveSize();
    meta.textContent = `${state.filename} · ${width}×${height} · ${state.fps} fps`;
    panel.appendChild(meta);

    const bar = document.createElement('div');
    bar.className = 'modal-progress';
    const fill = document.createElement('div');
    fill.className = 'modal-progress__fill';
    bar.appendChild(fill);
    panel.appendChild(bar);

    const status = document.createElement('div');
    status.className = 'modal-status';
    panel.appendChild(status);

    const p = state.progress;
    const pct = p.total > 0 ? (p.n / p.total * 100) : 0;
    fill.style.width = `${pct.toFixed(1)}%`;
    if (p.total > 0) {
      const remaining = p.fps > 0 ? (p.total - p.n) / p.fps : 0;
      status.innerHTML =
        `<span>frame ${p.n} / ${p.total}</span>` +
        `<span>${p.fps.toFixed(1)} fps · ${p.elapsed.toFixed(1)}s · ~${remaining.toFixed(1)}s left</span>`;
    } else {
      status.textContent = state.note || 'starting…';
    }

    panel.appendChild(makeButtons([
      { label: 'cancel', onClick: () => { if (abortController) abortController.abort(); } },
    ]));
  }

  function renderDone() {
    panel.appendChild(makeHead('export complete'));

    const meta = document.createElement('div');
    meta.className = 'modal-meta modal-meta--success';
    meta.textContent = `✓ ${state.outputPath}`;
    panel.appendChild(meta);

    const stats = document.createElement('div');
    stats.className = 'modal-status';
    stats.textContent = `${state.progress.total} frames in ${(state.totalMs / 1000).toFixed(1)}s`;
    panel.appendChild(stats);

    panel.appendChild(makeButtons([
      { label: 'reveal', onClick: () => reveal(state.outputPath, 'reveal') },
      { label: 'open',   onClick: () => reveal(state.outputPath, 'open') },
      { label: 'close', primary: true, onClick: close },
    ]));
  }

  function renderError(msg) {
    panel.appendChild(makeHead('export failed'));
    const meta = document.createElement('div');
    meta.className = 'modal-meta modal-meta--error';
    meta.textContent = state.errorMessage ?? 'unknown error';
    panel.appendChild(meta);
    panel.appendChild(makeButtons([
      { label: 'back',  onClick: () => { phase = 'configure'; render(); } },
      { label: 'close', primary: true, onClick: close },
    ]));
  }

  // ── small UI builders ───────────────────────────────────────────────────

  function makeHead(text) {
    const h = document.createElement('div');
    h.className = 'modal-head';
    h.textContent = text;
    return h;
  }

  function makeField(label, makeInput) {
    const row = document.createElement('div');
    row.className = 'modal-field';
    const lbl = document.createElement('label');
    lbl.className = 'modal-field__label';
    lbl.textContent = label;
    row.append(lbl, makeInput());
    return row;
  }

  function numberInput(label, value, onChange) {
    const w = document.createElement('div');
    w.className = 'modal-numpair';
    const lbl = document.createElement('span');
    lbl.className = 'modal-numpair__label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'modal-input';
    input.min = '1';
    input.step = '1';
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Math.max(1, Math.round(Number(input.value)) || 1);
      onChange(v);
    });
    w.append(lbl, input);
    return w;
  }

  function makeButtons(buttons) {
    const row = document.createElement('div');
    row.className = 'modal-buttons';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'modal-btn' + (b.primary ? ' modal-btn--primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      row.appendChild(btn);
    }
    return row;
  }

  // ── flow ────────────────────────────────────────────────────────────────

  function resolveSize() {
    const p = PRESETS[state.presetIdx];
    if (p.canvasFactor) {
      const c = scene.getCanvasPixels();
      return {
        width:  Math.round(c.width  * p.canvasFactor),
        height: Math.round(c.height * p.canvasFactor),
      };
    }
    return p.width ? { width: p.width, height: p.height }
                   : { width: state.customW, height: state.customH };
  }

  async function startExport() {
    if (state.duration <= 0) {
      state.errorMessage = 'duration must be greater than 0';
      phase = 'error';
      render();
      return;
    }

    abortController = new AbortController();
    phase = 'exporting';
    state.progress = { n: 0, total: 0, fps: 0, elapsed: 0 };
    state.totalMs = 0;
    render();

    const { width, height } = resolveSize();

    let res;
    try {
      res = await fetch('/__export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: scene.serialize(),
          options: {
            width, height,
            fps: state.fps,
            duration: state.duration,
            output: `exports/${state.filename}`,
          },
        }),
        signal: abortController.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') { close(); return; }
      state.errorMessage = err.message;
      phase = 'error';
      render();
      return;
    }

    if (!res.ok || !res.body) {
      state.errorMessage = `server error ${res.status}`;
      phase = 'error';
      render();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (!line.trim()) continue;
          handleEvent(JSON.parse(line));
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        state.errorMessage = err.message;
        phase = 'error';
        render();
      } else {
        close();
      }
    }
  }

  function handleEvent(e) {
    if (e.type === 'transcoding') {
      state.note = `transcoding ${e.file}…`;
      render();
    } else if (e.type === 'start') {
      state.note = '';
      state.progress = { n: 0, total: e.totalFrames, fps: 0, elapsed: 0 };
      render();
    } else if (e.type === 'frame') {
      state.progress = { n: e.n, total: e.total, fps: e.fps, elapsed: e.elapsed };
      render();
    } else if (e.type === 'encoding') {
      // fall-through; bar already at ~100%
    } else if (e.type === 'done') {
      state.outputPath = e.output;
      state.totalMs = e.totalMs;
      state.progress.n = state.progress.total;
      phase = 'done';
      render();
    } else if (e.type === 'aborted') {
      close();
    } else if (e.type === 'error') {
      state.errorMessage = e.message;
      phase = 'error';
      render();
    }
  }

  async function reveal(path, action) {
    if (!path) return;
    // Strip leading project-root prefix if the server returned absolute path.
    const rel = path.replace(/^.*\/web-playground\//, '');
    try {
      await fetch('/__reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: rel, action }),
      });
    } catch { /* best effort */ }
  }

  render();
}
