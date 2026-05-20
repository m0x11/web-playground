// Text — primitive. Single block of text, monospace by default.

export const schema = {
  name: 'Text',
  category: 'primitives',
  children: 'none',
  props: {
    content: { type: 'text', label: 'Content', default: 'Text' },
    size: { type: 'number', label: 'Size', min: 8, max: 320, step: 1, unit: 'px', default: 32 },
    color: { type: 'color', label: 'Color', default: '#000000' },
    align: { type: 'enum', label: 'Align', options: ['left', 'center', 'right'], default: 'center' },
    weight: { type: 'enum', label: 'Weight', options: ['normal', 'bold'], default: 'normal' },
  },
};

export function mount(el, props, _ctx) {
  el.classList.add('gen-text');
  apply(el, props);
  return {
    patch(nextProps) { apply(el, nextProps); },
    unmount() {
      el.classList.remove('gen-text');
      el.style.cssText = '';
      el.textContent = '';
    },
  };
}

function apply(el, p) {
  el.textContent = p.content;
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
