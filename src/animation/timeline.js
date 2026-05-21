// Timeline — the time-driven animation engine.
//
// Holds the list of tween specs and evaluates them at any time `t`. No
// internal RAF; no `performance.now()`; no scheduling. setTime(t) is
// synchronous and deterministic. The GUI drives playback with one RAF loop
// (see src/gui/timeline-bar.js); the export driver drives setTime() directly
// at frame indices (Phase 8).

import { tweenValueAt } from './tween.js';
import { applyProperties, resetTransformState, PROPERTIES } from './property-registry.js';

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

  // Apply CSS-property tweens at time `t`, grouped by target so each element
  // sees all its property changes in one batch (the transform composer needs
  // scale + rotation + x together). Component-prop tweens (anything not in the
  // property registry) are reported by componentValuesAt() instead — the scene
  // patches those onto the component.
  function setTime(t) {
    const byTarget = new Map();
    for (const spec of animations) {
      if (!(spec.property in PROPERTIES)) continue;
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

  // Non-CSS (component) property tweens at `t`, grouped by target →
  // Map<targetId, { prop: value }>.
  function componentValuesAt(t) {
    const byTarget = new Map();
    for (const spec of animations) {
      if (spec.property in PROPERTIES) continue;
      const m = byTarget.get(spec.target) ?? {};
      m[spec.property] = tweenValueAt(spec, t);
      byTarget.set(spec.target, m);
    }
    return byTarget;
  }

  return {
    setAnimations, add, remove, update,
    list, listForTarget, computeDuration,
    setTime, componentValuesAt,
  };
}
