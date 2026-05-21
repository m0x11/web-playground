// Grid — layout primitive.
//
// Two modes:
//   columns  — CSS Grid, N equal-width columns.
//   freeform — flex-wrap flow. Cells size by `cellWidth` × ratio and wrap to
//              new rows. Per-cell overrides come from each child node's
//              `layout` field ({ width?, aspect? }).
//
// Cell height:
//   fillHeight off — `cellAspect` ratio (per-cell `layout.aspect` overrides).
//   fillHeight on  — cells stretch to fill the available vertical space.
//
// Cell borders:
//   cellBorder off — none.
//   cellBorder on, shareBorders off — full border per cell.
//   cellBorder on, shareBorders on  — borders are fully cell-driven (no frame
//     border, so they always match the cells exactly): every cell borders
//     right + bottom; cells on the first row also border top; cells starting
//     a row also border left. Adjacent tiles then share one line. Gap is
//     forced to 0 so cells sit flush.
//
// Structure:
//   .gen-grid           — outer, owns padding + sizing
//     .gen-grid__frame  — inner, owns layout mode + holds children

export const schema = {
  name: 'Grid',
  category: 'layout',
  children: 'multiple',
  props: {
    mode: {
      type: 'enum', label: 'Mode',
      options: ['columns', 'freeform'], default: 'columns',
    },
    columns: {
      type: 'number', label: 'Columns',
      min: 1, max: 12, step: 1, default: 3,
      visibleWhen: { mode: 'columns' },
    },
    cellWidth: {
      type: 'number', label: 'Cell width',
      min: 20, max: 2000, step: 1, unit: 'px', default: 360,
      visibleWhen: { mode: 'freeform' },
    },
    fillHeight: {
      type: 'boolean', label: 'Fill height', default: false,
    },
    cellAspect: {
      type: 'number', label: 'Cell ratio',
      min: 0.2, max: 5, step: 0.05, default: 1,
      visibleWhen: { fillHeight: false },
    },
    align: {
      type: 'enum', label: 'Align',
      options: ['start', 'center', 'end', 'space-between'], default: 'start',
      visibleWhen: { mode: 'freeform' },
    },
    gap: {
      type: 'number', label: 'Gap',
      min: 0, max: 300, step: 1, unit: 'px', default: 16,
      visibleWhen: { shareBorders: false },
    },
    padding: {
      type: 'number', label: 'Padding',
      min: 0, max: 400, step: 1, unit: 'px', default: 24,
    },
    cellBorder: {
      type: 'boolean', label: 'Cell border', default: false,
    },
    shareBorders: {
      type: 'boolean', label: 'Share borders', default: false,
      visibleWhen: { cellBorder: true },
    },
    borderWidth: {
      type: 'number', label: 'Border w',
      min: 0, max: 40, step: 1, unit: 'px', default: 2,
      visibleWhen: { cellBorder: true },
    },
    borderColor: {
      type: 'color', label: 'Border', default: '#000000',
      visibleWhen: { cellBorder: true },
    },
  },
};

const JUSTIFY = {
  start: 'flex-start', center: 'center',
  end: 'flex-end', 'space-between': 'space-between',
};

export function mount(el, props, ctx) {
  el.classList.add('gen-grid');

  const frame = document.createElement('div');
  frame.className = 'gen-grid__frame';
  el.appendChild(frame);

  let node = ctx?.node ?? null;
  apply(el, frame, props, ctx?.childCount ?? 0, node);

  return {
    childRoot: frame,
    patch(nextProps, nextCtx = {}) {
      if (nextCtx.node) node = nextCtx.node;
      apply(el, frame, nextProps, nextCtx.childCount ?? 0, node);
    },
    unmount() {
      el.classList.remove('gen-grid');
      frame.remove();
      el.style.cssText = '';
    },
  };
}

function apply(el, frame, p, childCount, node) {
  Object.assign(el.style, {
    boxSizing: 'border-box',
    width: '100%', height: '100%',
    padding: `${p.padding}px`,
  });

  // Shared borders need cells flush against each other.
  const gap = (p.cellBorder && p.shareBorders) ? 0 : p.gap;

  const common = {
    boxSizing: 'border-box',
    width: '100%', height: '100%',
    gap: `${gap}px`,
  };
  if (p.mode === 'columns') {
    Object.assign(frame.style, common, {
      display: 'grid',
      gridTemplateColumns: `repeat(${p.columns}, 1fr)`,
      gridAutoRows: p.fillHeight ? '1fr' : 'auto',
      alignContent: 'start',
      flexWrap: '', justifyContent: '',
    });
  } else {
    Object.assign(frame.style, common, {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: JUSTIFY[p.align] ?? 'flex-start',
      alignContent: p.fillHeight ? 'stretch' : 'flex-start',
      gridTemplateColumns: '', gridAutoRows: '',
    });
  }

  if (childCount === 0) {
    renderPlaceholders(frame, p);
  } else {
    clearPlaceholders(frame);
    styleChildren(frame, p, node);
  }
}

// ── real children ──────────────────────────────────────────────────────────

function styleChildren(frame, p, node) {
  if (!node) return;
  const cells = [];
  for (const child of node.children ?? []) {
    const cell = frame.querySelector(
      `:scope > .scene-node[data-scene-id="${CSS.escape(child.id)}"]`
    );
    if (!cell) continue;
    sizeCell(cell, p, child.layout);
    cells.push(cell);
  }
  applyBorders(frame, p, cells);
}

function sizeCell(cell, p, layout) {
  cell.style.boxSizing = 'border-box';
  if (p.mode === 'freeform') {
    cell.style.flex = '0 0 auto';
    cell.style.width = `${layout?.width ?? p.cellWidth}px`;
  } else {
    cell.style.flex = '';
    cell.style.width = '';
  }
  cell.style.aspectRatio = p.fillHeight ? '' : String(layout?.aspect ?? p.cellAspect);
  cell.style.height = '';
}

// ── borders ────────────────────────────────────────────────────────────────
//
// Fully cell-driven so the border always tracks the cells, never a fixed
// frame box. `cells` is in document/tree order.

function applyBorders(frame, p, cells) {
  for (const cell of cells) {
    cell.style.border = '';
    cell.style.borderTop = '';
    cell.style.borderRight = '';
    cell.style.borderBottom = '';
    cell.style.borderLeft = '';
  }
  if (!p.cellBorder) return;

  const b = `${p.borderWidth}px solid ${p.borderColor}`;

  if (!p.shareBorders) {
    for (const cell of cells) cell.style.border = b;
    return;
  }

  // Shared: right + bottom on every cell; top/left only on edge cells.
  for (const cell of cells) {
    cell.style.borderRight = b;
    cell.style.borderBottom = b;
  }
  if (p.mode === 'columns') {
    cells.forEach((cell, i) => {
      if (i < p.columns) cell.style.borderTop = b;
      if (i % p.columns === 0) cell.style.borderLeft = b;
    });
  } else if (cells.length > 0) {
    // Freeform: detect wrap rows by offsetTop (layout coords, transform-safe).
    const firstTop = cells[0].offsetTop;
    let prevTop = firstTop;
    cells.forEach((cell, i) => {
      const top = cell.offsetTop;
      if (i === 0 || top > prevTop + 1) cell.style.borderLeft = b;
      if (Math.abs(top - firstTop) < 1) cell.style.borderTop = b;
      prevTop = top;
    });
  }
}

// ── placeholder cells (shown only when the grid has no real children) ──────

function clearPlaceholders(frame) {
  for (const c of frame.querySelectorAll(':scope > .gen-grid__cell')) c.remove();
}

function renderPlaceholders(frame, p) {
  const count = p.mode === 'columns' ? p.columns : 4;
  const existing = [...frame.querySelectorAll(':scope > .gen-grid__cell')];
  while (existing.length > count) existing.pop().remove();
  while (existing.length < count) {
    const cell = document.createElement('div');
    cell.className = 'gen-grid__cell';
    frame.appendChild(cell);
    existing.push(cell);
  }
  existing.forEach((cell, i) => {
    cell.textContent = String(i);
    Object.assign(cell.style, {
      boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.05)',
      color: 'rgba(0,0,0,0.5)',
      fontFamily: 'var(--font-mono)', fontSize: '14px',
    });
    if (p.mode === 'freeform') {
      cell.style.flex = '0 0 auto';
      cell.style.width = `${p.cellWidth}px`;
    } else {
      cell.style.flex = '';
      cell.style.width = '';
    }
    cell.style.aspectRatio = p.fillHeight ? '' : String(p.cellAspect);
    cell.style.height = '';
  });

  applyBorders(frame, p, existing);
  if (!p.cellBorder) {
    for (const cell of existing) {
      cell.style.border = '1px dashed rgba(0,0,0,0.25)';
    }
  }
}
