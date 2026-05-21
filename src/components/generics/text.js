// Text — primitive. Single block of text, monospace by default.
//
// Two modes:
//   static — one fixed string (`content`).
//   cycle  — steps through `lines` every `cycleSpeed` seconds, beginning on
//            `cycleStart`. Time-driven (deterministic), like a Media cycle —
//            same string + different starts = staggered text cycles.

export const schema = {
  name: 'Text',
  category: 'primitives',
  children: 'none',
  props: {
    mode: {
      type: 'enum', label: 'Mode',
      options: ['static', 'cycle'], default: 'static',
    },
    content: {
      type: 'text', label: 'Content', default: 'Text',
      visibleWhen: { mode: 'static' },
    },
    lines: {
      type: 'string-list', label: 'Lines', default: ['One', 'Two', 'Three'],
      visibleWhen: { mode: 'cycle' },
    },
    cycleSpeed: {
      type: 'number', label: 'Cycle', min: 0.05, max: 10, step: 0.05,
      unit: 's', default: 0.5,
      visibleWhen: { mode: 'cycle' },
    },
    cycleStart: {
      type: 'number', label: 'Start on', min: 0, max: 50, step: 1, default: 0,
      visibleWhen: { mode: 'cycle' },
    },
    size: { type: 'number', label: 'Size', min: 8, max: 320, step: 1, unit: 'px', default: 32 },
    color: { type: 'color', label: 'Color', default: '#000000' },
    align: { type: 'enum', label: 'Align', options: ['left', 'center', 'right'], default: 'center' },
    weight: { type: 'enum', label: 'Weight', options: ['normal', 'bold'], default: 'normal' },
  },
};

// A cycling Text needs scene time to run one full pass.
export function intrinsicDuration(props) {
  if (props.mode === 'cycle') {
    const n = (props.lines ?? []).length;
    const speed = Math.max(0.001, props.cycleSpeed ?? 0.5);
    return n * speed;
  }
  return 0;
}

export function mount(el, props, _ctx) {
  el.classList.add('gen-text');
  let current = { ...props };
  let lastTime = 0;

  applyStyle(el, props);
  applyContent(el, props, lastTime);

  return {
    onTime(t) {
      lastTime = t;
      if (current.mode === 'cycle') applyContent(el, current, t);
    },
    patch(nextProps) {
      current = { ...nextProps };
      applyStyle(el, nextProps);
      applyContent(el, nextProps, lastTime);
    },
    unmount() {
      el.classList.remove('gen-text');
      el.style.cssText = '';
      el.textContent = '';
    },
  };
}

function applyContent(el, p, t) {
  if (p.mode === 'cycle') {
    const lines = p.lines ?? [];
    if (lines.length === 0) { el.textContent = ''; return; }
    const speed = Math.max(0.001, p.cycleSpeed ?? 0.5);
    const start = Math.max(0, Math.round(p.cycleStart ?? 0));
    const idx = (Math.floor(t / speed) + start) % lines.length;
    el.textContent = lines[idx];
  } else {
    el.textContent = p.content;
  }
}

function applyStyle(el, p) {
  Object.assign(el.style, {
    fontFamily: 'var(--font-mono)',
    fontSize: `${p.size}px`,
    color: p.color,
    textAlign: p.align,
    fontWeight: p.weight,
    lineHeight: '1.3',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      p.align === 'left'  ? 'flex-start' :
      p.align === 'right' ? 'flex-end'   : 'center',
    overflow: 'hidden',
    wordBreak: 'break-word',
    boxSizing: 'border-box',
  });
}
