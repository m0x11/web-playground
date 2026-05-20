// Image — primitive. URL-driven for Phase 2; folder binding lands in Phase 4.

export const schema = {
  name: 'Image',
  category: 'primitives',
  children: 'none',
  props: {
    src: { type: 'text', label: 'URL', default: '' },
    fit: { type: 'enum', label: 'Fit', options: ['cover', 'contain', 'fill', 'none'], default: 'cover' },
    alt: { type: 'text', label: 'Alt', default: '' },
  },
};

export function mount(el, props, _ctx) {
  el.classList.add('gen-image');
  const img = document.createElement('img');
  apply(el, img, props);
  return {
    patch(nextProps) { apply(el, img, nextProps); },
    unmount() {
      el.classList.remove('gen-image');
      el.style.cssText = '';
      el.textContent = '';
    },
  };
}

function apply(el, img, p) {
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  if (p.src) {
    el.textContent = '';
    if (img.parentElement !== el) el.appendChild(img);
    img.src = p.src;
    img.alt = p.alt;
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: p.fit,
      display: 'block',
    });
  } else {
    if (img.parentElement) img.remove();
    el.textContent = '(no image)';
    Object.assign(el.style, {
      background: 'rgba(0,0,0,0.05)',
      border: '1px dashed rgba(0,0,0,0.25)',
      color: 'rgba(0,0,0,0.45)',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
    });
  }
}
