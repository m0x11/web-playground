// Easing presets. Each is a pure function: progress 0→1 → eased 0→1.
// Reference shapes match common motion libraries; Phase 6 adds custom curves.

export const EASINGS = {
  linear:        t => t,

  easeInQuad:    t => t * t,
  easeOutQuad:   t => 1 - (1 - t) * (1 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

  easeInCubic:    t => t * t * t,
  easeOutCubic:   t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  easeInQuart:    t => t * t * t * t,
  easeOutQuart:   t => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

  easeInExpo:    t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo:   t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  easeInBack:  t => 2.70158 * t * t * t - 1.70158 * t * t,
  easeOutBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  easeInOutBack: t => {
    const c1 = 1.70158, c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
};

// Friendly aliases.
EASINGS.easeIn = EASINGS.easeInCubic;
EASINGS.easeOut = EASINGS.easeOutCubic;
EASINGS.easeInOut = EASINGS.easeInOutCubic;

export const EASING_NAMES = Object.keys(EASINGS);

export function sample(name, t) {
  return (EASINGS[name] ?? EASINGS.linear)(t);
}
