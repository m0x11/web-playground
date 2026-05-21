// Bottom-of-preview timeline bar: play/pause, time display, scrubber, and
// a duration override input.
//
// The rAF playback loop lives HERE, not in the scene runtime — see
// ARCHITECTURE.md → "Scene/GUI separation contract". The loop reads
// performance.now() (its only legitimate use in the project) and calls
// scene.setTime() at every frame. The scene runtime itself stays purely
// deterministic so the export driver (Phase 8) can drive setTime() from
// a fixed frame index instead.

export function mountTimelineBar(host, scene) {
  host.innerHTML = `
    <button class="timeline-play" id="tl-play" type="button" title="Play/pause (space)">▶</button>
    <div class="timeline-time" id="tl-time">0.00 / 0.00</div>
    <input class="timeline-scrubber" id="tl-scrub" type="range" min="0" max="1" step="0.001" value="0">
    <div class="timeline-duration">
      <span>dur</span>
      <input type="number" id="tl-duration" min="0" step="0.1" value="0">
      <span>s</span>
    </div>
  `;

  const playBtn = host.querySelector('#tl-play');
  const timeEl = host.querySelector('#tl-time');
  const scrub = host.querySelector('#tl-scrub');
  const durInput = host.querySelector('#tl-duration');

  let scrubbing = false;
  let rafId = null;
  let loopStartMs = 0;
  let loopStartT = 0;

  function effectiveDuration() {
    return Math.max(0.001, scene.duration());
  }

  function fmt(t) {
    return t.toFixed(2);
  }

  function refresh() {
    const t = scene.time();
    const dur = effectiveDuration();
    timeEl.textContent = `${fmt(t)} / ${fmt(dur)}`;
    if (!scrubbing) {
      scrub.max = String(dur);
      scrub.value = String(Math.min(t, dur));
    }
    if (document.activeElement !== durInput) {
      durInput.value = String(scene._state().sceneJson?.duration ?? 0);
    }
    playBtn.textContent = scene.playing() ? '❚❚' : '▶';
  }

  // ── play / pause / scrub ────────────────────────────────────────────────

  playBtn.addEventListener('click', () => {
    if (scene.playing()) scene.pause();
    else scene.play();
  });

  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  scrub.addEventListener('pointerup',   () => { scrubbing = false; });
  scrub.addEventListener('input', () => {
    if (scene.playing()) scene.pause();
    scene.setTime(Number(scrub.value));
  });

  durInput.addEventListener('change', () => {
    const v = Math.max(0, Number(durInput.value) || 0);
    const json = scene._state().sceneJson;
    if (json) json.duration = v;
    refresh();
  });

  // ── playback rAF loop ───────────────────────────────────────────────────

  function startLoop() {
    cancelAnimationFrame(rafId);
    loopStartMs = performance.now();
    loopStartT = scene.time();
    // If we're at (or past) the end, restart from 0.
    if (loopStartT >= effectiveDuration()) {
      loopStartT = 0;
      scene.setTime(0);
    }
    tick();
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tick() {
    const dur = effectiveDuration();
    const now = performance.now();
    const t = loopStartT + (now - loopStartMs) / 1000;
    if (t >= dur) {
      scene.setTime(dur);
      scene.pause();
      return;
    }
    scene.setTime(t);
    rafId = requestAnimationFrame(tick);
  }

  // ── keyboard: space toggles play (when not typing in an input) ──────────

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    if (scene.playing()) scene.pause();
    else scene.play();
  });

  // ── wiring ──────────────────────────────────────────────────────────────

  scene.on('play-state-changed', playing => {
    if (playing) startLoop();
    else stopLoop();
    refresh();
  });
  scene.on('time-changed', refresh);
  scene.on('scene-loaded', refresh);
  scene.on('animations-changed', refresh);
  // Tree / prop changes can shift the cycle-derived duration.
  scene.on('scene-tree-changed', refresh);
  scene.on('node-updated', refresh);

  refresh();
}
