// Colour grading shared between the Media component (which renders it) and
// the colour-match tool (which searches over it).
//
// exposure / contrast / saturation / hue / blur / invert map onto CSS filter
// functions. Temperature and tint (colour balance) have no CSS function, so
// they go through an SVG feColorMatrix that scales the R/G/B channels; the
// owner creates one via createBalanceFilter() and buildGradingFilter()
// updates its values and references it by id when non-zero.

export const GRADING_DEFAULTS = {
  exposure: 1, contrast: 1, saturation: 1, hue: 0,
  temperature: 0, tint: 0, blur: 0, invert: false,
};

// Channel gain at |temperature| = |tint| = 1 — strong enough to be a look,
// not a wreck.
export const BALANCE_GAIN = 0.35;

// feColorMatrix values for colour balance. `t` (temperature) and `g` (tint)
// are in [-1, 1]. Warm = more red / less blue; cool = the reverse. Positive
// tint pushes green, negative pushes magenta (less green, a touch more R+B).
export function balanceMatrix(t, g) {
  const K = BALANCE_GAIN;
  const r = 1 + K * t - K * 0.5 * g;
  const gg = 1 + K * g;
  const b = 1 - K * t - K * 0.5 * g;
  return [
    r, 0, 0, 0, 0,
    0, gg, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ].map(v => +v.toFixed(4)).join(' ');
}

// A zero-size inline <svg> holding one <filter id><feColorMatrix>. Append
// the returned `svg` anywhere in the document; pass the object to
// buildGradingFilter().
export function createBalanceFilter(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
  const filter = document.createElementNS(ns, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const matrixEl = document.createElementNS(ns, 'feColorMatrix');
  matrixEl.setAttribute('type', 'matrix');
  filter.appendChild(matrixEl);
  svg.appendChild(filter);
  return { svg, id, matrixEl };
}

// CSS `filter` value for grading props `p`. Temperature / tint are written
// into `balance.matrixEl` and referenced only when non-zero, so the common
// case stays a pure CSS filter (or none at all). Order matters: exposure →
// contrast → saturation → hue → balance → blur → invert.
export function buildGradingFilter(p, balance) {
  const parts = [];
  const exposure = p.exposure ?? 1, contrast = p.contrast ?? 1;
  const saturation = p.saturation ?? 1, hue = p.hue ?? 0, blur = p.blur ?? 0;
  const temperature = p.temperature ?? 0, tint = p.tint ?? 0;
  if (exposure !== 1) parts.push(`brightness(${exposure})`);
  if (contrast !== 1) parts.push(`contrast(${contrast})`);
  if (saturation !== 1) parts.push(`saturate(${saturation})`);
  if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
  if (temperature !== 0 || tint !== 0) {
    balance.matrixEl.setAttribute('values', balanceMatrix(temperature / 100, tint / 100));
    parts.push(`url(#${balance.id})`);
  }
  if (blur > 0) parts.push(`blur(${blur}px)`);
  // Last, so it negates the graded result (what you'd expect from an
  // "invert" toggle on top of a look).
  if (p.invert) parts.push('invert(1)');
  return parts.length ? parts.join(' ') : '';
}
