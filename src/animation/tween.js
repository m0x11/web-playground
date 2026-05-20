// Pure tween evaluation. Given a spec and a time `t`, returns the value.
// No side effects. Trivially testable. Deterministic — same input, same
// output, every call. (See RECORDING.md → "Critical invariants".)

import { sample } from './easing.js';

export function tweenValueAt(spec, t) {
  const start = spec.start ?? 0;
  const dur = spec.duration ?? 0;
  if (dur <= 0) return t < start ? spec.from : spec.to;
  if (t <= start) return spec.from;
  if (t >= start + dur) return spec.to;
  const p = (t - start) / dur;
  const eased = sample(spec.easing ?? 'linear', p);
  return interpolate(spec.from, spec.to, eased);
}

function interpolate(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }
  if (typeof a === 'string' && typeof b === 'string'
      && a.startsWith('#') && b.startsWith('#')) {
    return lerpHex(a, b, t);
  }
  // Fallback: discrete step at half.
  return t < 0.5 ? a : b;
}

function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
  const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return '#' + [rr, rg, rb].map(v => v.toString(16).padStart(2, '0')).join('');
}
