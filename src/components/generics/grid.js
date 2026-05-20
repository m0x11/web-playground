// Grid — layout primitive.
//
// Two modes:
//   - columns: CSS Grid with N equal-width columns + gap
//   - freeform: relative-positioned container; children position absolutely
//
// Structure:
//   .gen-grid                 — outer, owns padding + sizing
//     .gen-grid__frame        — inner, owns layout mode + holds children
//       <cells / real children>
//
// The frame wrapper is what makes padding work in freeform mode: abs-positioned
// children inside the frame are sized relative to the frame, which fills the
// outer's *content* box, so padding genuinely insets them.
//
// Placeholder cells fill the frame when ctx.childCount === 0 (Phase 1). Once
// real children land via the left-rail picker (Phase 2), placeholders hide.

export const schema = {
  name: 'Grid',
  category: 'layout',
  children: 'multiple',
  props: {
    mode: {
      type: 'enum',
      label: 'Mode',
      options: ['columns', 'freeform'],
      default: 'columns',
    },
    columns: {
      type: 'number',
      label: 'Columns',
      min: 1, max: 12, step: 1,
      default: 3,
      visibleWhen: { mode: 'columns' },
    },
    gap: {
      type: 'number',
      label: 'Gap',
      min: 0, max: 200, step: 1, unit: 'px',
      default: 16,
      visibleWhen: { mode: 'columns' },
    },
    padding: {
      type: 'number',
      label: 'Padding',
      min: 0, max: 200, step: 1, unit: 'px',
      default: 24,
    },
  },
};

export function mount(el, props, ctx) {
  el.classList.add('gen-grid');

  const frame = document.createElement('div');
  frame.className = 'gen-grid__frame';
  el.appendChild(frame);

  apply(el, frame, props, ctx);

  return {
    patch(nextProps, nextCtx = ctx) {
      ctx = nextCtx;
      apply(el, frame, nextProps, ctx);
    },
    unmount() {
      el.classList.remove('gen-grid');
      frame.remove();
      el.style.cssText = '';
    },
  };
}

function apply(el, frame, p, ctx) {
  // Outer: padding + sizing only.
  Object.assign(el.style, {
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    padding: `${p.padding}px`,
  });

  // Frame: layout mode. Fills the outer's content box, so padding visually
  // insets everything — including freeform abs-positioned children.
  if (p.mode === 'columns') {
    Object.assign(frame.style, {
      display: 'grid',
      gridTemplateColumns: `repeat(${p.columns}, 1fr)`,
      gap: `${p.gap}px`,
      position: '',
      width: '100%',
      height: '100%',
    });
  } else {
    Object.assign(frame.style, {
      display: 'block',
      gridTemplateColumns: '',
      gap: '',
      position: 'relative',
      width: '100%',
      height: '100%',
    });
  }

  const showPlaceholders = (ctx?.childCount ?? 0) === 0;
  if (showPlaceholders) renderPlaceholders(frame, p);
  else frame.innerHTML = '';
}

function renderPlaceholders(frame, p) {
  const count = p.mode === 'columns' ? p.columns : 4;
  while (frame.children.length > count) frame.lastChild.remove();
  while (frame.children.length < count) {
    const cell = document.createElement('div');
    cell.className = 'gen-grid__cell';
    frame.appendChild(cell);
  }
  for (let i = 0; i < count; i++) {
    const cell = frame.children[i];
    cell.textContent = String(i);
    Object.assign(cell.style, {
      border: '1px dashed rgba(0,0,0,0.25)',
      background: 'rgba(0,0,0,0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(0,0,0,0.5)',
      fontFamily: 'var(--font-mono)',
      fontSize: '14px',
      minHeight: '80px',
      ...(p.mode === 'freeform' ? {
        position: 'absolute',
        left: `${(i % 4) * 25 + 5}%`,
        top: `${Math.floor(i / 4) * 28 + 5}%`,
        width: '20%',
        height: '23%',
      } : { position: '', left: '', top: '', width: '', height: '' }),
    });
  }
}
