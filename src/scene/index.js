// Scene runtime.
//
// The single source of truth for "what time it is in the scene" and "what's in
// the scene." Drives the renderer; same code path is used by the GUI (live
// editing) and by the Playwright export driver (frame-by-frame at 4K30).
//
// See ARCHITECTURE.md → "Scene/GUI separation contract" and RECORDING.md.
//
// Invariants:
//   - setTime(t) is synchronous and deterministic.
//   - No setTimeout / setInterval / performance.now() in animation paths.
//   - All animated values derive from the timeline's current `t`.

const EVENTS = ['scene-loaded', 'time-changed', 'play-state-changed'];

export function createScene({ renderer }) {
  const listeners = Object.fromEntries(EVENTS.map(name => [name, new Set()]));

  const state = {
    sceneJson: null,
    time: 0,
    playing: false,
    duration: 0,
    size: { w: null, h: null }, // null = use container size
    guiHidden: false,
  };

  function emit(name, payload) {
    for (const fn of listeners[name]) fn(payload);
  }

  // ── public API ──────────────────────────────────────────────────────────

  function loadScene(json) {
    state.sceneJson = json;
    state.duration = json?.duration ?? 0;
    renderer.mount(json);
    emit('scene-loaded', json);
    setTime(0);
  }

  function setTime(t) {
    state.time = t;
    // TODO Phase 5: walk animations array, compute per-property values, apply.
    renderer.update(t);
    emit('time-changed', t);
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    emit('play-state-changed', true);
    // TODO Phase 5: drive a single rAF loop that calls setTime().
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    emit('play-state-changed', false);
  }

  function duration() {
    return state.duration;
  }

  // Resolves once every asset declared by the current scene has loaded.
  // Phase 0: nothing to wait for; resolve next tick.
  function ready() {
    return Promise.resolve();
  }

  // Resolves after the next paint completes. Used by the export driver between
  // setTime() and screenshot(). Double-rAF because the browser may schedule
  // paint between the first and second callback.
  function framePainted() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function setSize(w, h) {
    state.size = { w, h };
    renderer.setSize(w, h);
  }

  function hideGUI() {
    state.guiHidden = true;
    document.body.classList.add('gui-hidden');
  }

  function on(event, fn) {
    if (!listeners[event]) throw new Error(`Unknown event: ${event}`);
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  }

  // For debugging / inspection from the console.
  function _state() { return state; }

  return {
    loadScene,
    setTime,
    play,
    pause,
    duration,
    ready,
    framePainted,
    setSize,
    hideGUI,
    on,
    _state,
  };
}
