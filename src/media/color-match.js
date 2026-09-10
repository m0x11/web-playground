// Colour match — grade one Media block so its overall colour statistics
// match another's.
//
// Both pictures are sampled through their *current* look (the reference as
// it appears in the grid; the target through each candidate grade) into a
// small canvas via ctx.filter, and summarised as: mean luminance, luminance
// spread (std), mean chroma, and per-channel means relative to luminance.
// Then exposure / contrast / saturation / temperature / tint are adjusted
// multiplicatively until the target's stats meet the reference's — a few
// iterations of a measured feedback loop, so the CSS filters' exact
// (non-linear, sRGB-space) behaviour is accounted for rather than modelled.
//
// This matches global tone + cast, which is what "make these two clips look
// like they belong together" usually means. It is not a per-pixel transfer.

import { getComponent, withDefaults } from '../components/index.js';
import { buildGradingFilter, createBalanceFilter, BALANCE_GAIN } from './grading.js';

const SAMPLE = 48;        // sample canvas side (px)
const ITERATIONS = 6;
const ALPHA_MIN = 128;    // ignore mostly-transparent pixels

// Returns the grading props to set on `targetId`, or throws with a
// human-readable reason.
export function matchColor(scene, targetId, refId) {
  const target = pickMedia(scene, targetId, 'target');
  const ref = pickMedia(scene, refId, 'reference');

  const scratch = document.createElement('div');
  scratch.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  const refBalance = createBalanceFilter('color-match-ref');
  const candBalance = createBalanceFilter('color-match-cand');
  scratch.append(refBalance.svg, candBalance.svg);
  document.body.appendChild(scratch);

  try {
    const refStats = sample(ref.el, buildGradingFilter(ref.props, refBalance));
    if (!refStats) throw new Error('reference has no visible pixels yet (still loading?)');

    // Start from the target's non-matched props (hue / blur / invert are
    // kept as-is; the five matched props start neutral).
    const cand = {
      ...target.props,
      exposure: 1, contrast: 1, saturation: 1, temperature: 0, tint: 0,
    };

    for (let i = 0; i < ITERATIONS; i++) {
      const s = sample(target.el, buildGradingFilter(cand, candBalance));
      if (!s) throw new Error('target has no visible pixels yet (still loading?)');
      step(cand, s, refStats);
    }

    return {
      exposure: round(cand.exposure, 2),
      contrast: round(cand.contrast, 2),
      saturation: round(cand.saturation, 2),
      temperature: Math.round(cand.temperature),
      tint: Math.round(cand.tint),
    };
  } finally {
    scratch.remove();
  }
}

// One multiplicative correction of the candidate grade toward `ref`.
function step(cand, cur, ref) {
  const damp = 0.85;

  // Exposure: mean luminance.
  if (cur.L > 0.005) cand.exposure = clamp(cand.exposure * ease(ref.L / cur.L, damp), 0.1, 3);

  // Contrast: luminance spread. A flat target can't be un-flattened
  // meaningfully — leave contrast alone below a floor.
  if (cur.sdL > 0.01) cand.contrast = clamp(cand.contrast * ease(ref.sdL / cur.sdL, damp), 0.2, 3);

  // Saturation: mean chroma. A grey target has nothing to boost.
  if (cur.C > 0.004) cand.saturation = clamp(cand.saturation * ease(ref.C / cur.C, damp), 0, 3);

  // Balance: per-channel mean relative to luminance. Gains needed on R/G/B
  // map onto temperature (R vs B) and tint (G vs R+B), see balanceMatrix.
  const eR = ratio(ref.rR, cur.rR), eG = ratio(ref.rG, cur.rG), eB = ratio(ref.rB, cur.rB);
  const K = BALANCE_GAIN;
  cand.temperature = clamp(cand.temperature + damp * 100 * ((eR - eB) / (2 * K)), -100, 100);
  cand.tint = clamp(cand.tint + damp * 100 * ((eG - 1) / K), -100, 100);
}

// Damped multiplicative factor, bounded so one step can't overshoot wildly.
function ease(f, damp) {
  const b = clamp(f, 0.4, 2.5);
  return 1 + (b - 1) * damp;
}
function ratio(a, b) { return b > 1e-4 ? clamp(a / b, 0.5, 2) : 1; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function round(v, d) { const m = 10 ** d; return Math.round(v * m) / m; }

// The visible <img>/<video> inside a Media node, plus its full props.
function pickMedia(scene, id, role) {
  const node = scene.getNode(id);
  if (!node || node.component !== 'Media') throw new Error(`${role} is not a Media block`);
  const host = scene.getEl(id);
  const el = [...(host?.querySelectorAll('img, video') ?? [])]
    .find(m => m.style.display !== 'none' && m.offsetParent !== null);
  if (!el) throw new Error(`${role} has no image or video`);
  if (el.tagName === 'VIDEO' && el.readyState < 2) throw new Error(`${role} video has no frame yet`);
  const props = withDefaults(getComponent('Media').schema, node.props);
  return { node, el, props };
}

// Draw `el` through `filter` into a small canvas and summarise it.
function sample(el, filter) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE; canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.filter = filter || 'none';
  ctx.drawImage(el, 0, 0, SAMPLE, SAMPLE);
  let data;
  try { data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data; }
  catch { throw new Error('cannot read pixels (cross-origin media)'); }
  return stats(data);
}

function stats(d) {
  let n = 0, sR = 0, sG = 0, sB = 0, sL = 0, sL2 = 0, sC = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < ALPHA_MIN) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    n++; sR += r; sG += g; sB += b; sL += L; sL2 += L * L;
    sC += Math.max(r, g, b) - Math.min(r, g, b);
  }
  if (n === 0) return null;
  const L = sL / n;
  const varL = Math.max(0, sL2 / n - L * L);
  const Ld = Math.max(L, 1e-4);
  return {
    L, sdL: Math.sqrt(varL), C: sC / n,
    rR: (sR / n) / Ld, rG: (sG / n) / Ld, rB: (sB / n) / Ld,
  };
}
