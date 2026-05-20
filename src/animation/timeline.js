// Timeline — the time-driven animation engine.
//
// Holds the list of tween specs and evaluates them at any time `t`. No
// internal RAF; no `performance.now()`; no scheduling. setTime(t) is
// synchronous and deterministic. The GUI drives playback with one RAF loop
// (see src/gui/timeline-bar.js); the export driver drives setTime() directly
// at frame indices (Phase 8).

import { tweenValueAt } from './tween.js';
import { applyProperties, resetTransformState } from './property-registry.js';

export function createTimeline({ getEl }) {
  let animations = [];

  function setAnimations(list) {
    animations = Array.isArray(list) ? [...list] : [];
    // New scene = stale per-element transform state from the old one.
    resetTransformState();
  }

  function add(spec) {
    animations.push(spec);
  }

  function remove(id) {
    animations = animations.filter(a => a.id !== id);
  }

  function update(id, partial) {
    animations = animations.map(a => a.id === id ? { ...a, ...partial } : a);
  }

  function list() {
    return [...animations];
  }

  function listForTarget(targetId) {
    return animations.filter(a => a.target === targetId);
  }

  function computeDuration() {
    let max = 0;
    for (const a of animations) {
      const end = (a.start ?? 0) + (a.duration ?? 0);
      if (end > max) max = end;
    }
    return max;
  }

  // Apply every animation at time `t`. Group by target so each element sees
  // all of its property changes in one batch (essential for the transform
  // composer: scale + rotation + x must merge into one `transform` string).
  function setTime(t) {
    const byTarget = new Map();
    for (const spec of animations) {
      const list = byTarget.get(spec.target) ?? [];
      list.push(spec);
      byTarget.set(spec.target, list);
    }

    for (const [targetId, specs] of byTarget) {
      const el = getEl(targetId);
      if (!el) continue;
      const values = {};
      for (const spec of specs) {
        values[spec.property] = tweenValueAt(spec, t);
      }
      applyProperties(el, values);
    }
  }

  return {
    setAnimations, add, remove, update,
    list, listForTarget, computeDuration,
    setTime,
  };
}
