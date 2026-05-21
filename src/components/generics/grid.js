// Grid — layout primitive.
//
// Two modes:
//   columns  — CSS Grid, N equal-width columns. Per-cell node.layout may set
//              { colSpan, rowSpan } so a cell occupies an N×M block (e.g. a
//              2×2 featured tile in a 3-column grid). Row height is measured
//              from the column width so spans stay grid-aligned + proportional.
//   freeform — flex-wrap flow. Cells size by `cellWidth` × ratio and wrap.
//              Per-cell node.layout may set { width, aspect }.
//
// Cell height:
//   fillHeight off — `cellAspect` ratio.
//   fillHeight on  — cells stretch to fill the available vertical space.
//
// Cell borders:
//   cellBorder off — none.
//   cellBorder on, shareBorders off — full border per cell.
//   cellBorder on, shareBorders on  — cell-driven: every cell borders
//     right+bottom; cells on the top/left grid edge also border top/left.
//     Edge cells are found by measuring offsetTop/offsetLeft, so this is
//     correct even with spanning cells. Gap is forced to 0.

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
  let lastProps = props;
  let lastChildCount = ctx?.childCount ?? 0;

  function reapply() {
    apply(el, frame, lastProps, lastChildCount, node);
  }

  // The columns-mode row height is measured from the frame width, so re-apply
  // whenever the frame resizes (canvas aspect change, nested-grid resize, …).
  const ro = new ResizeObserver(() => reapply());
  ro.observe(frame);

  reapply();

  return {
    childRoot: frame,
    patch(nextProps, nextCtx = {}) {
      if (nextCtx.node) node = nextCtx.node;
      lastProps = nextProps;
      if (typeof nextCtx.childCount === 'number') lastChildCount = nextCtx.childCount;
      reapply();
    },
    unmount() {
      ro.disconnect();
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

  const gap = (p.cellBorder && p.shareBorders) ? 0 : p.gap;
  const common = {
    boxSizing: 'border-box',
    width: '100%', height: '100%',
    gap: `${gap}px`,
  };

  if (p.mode === 'columns') {
    let autoRows;
    if (p.fillHeight) {
      autoRows = '1fr';
    } else {
      // Measure one column's width → row height = colW / cellAspect. Makes a
      // 1×1 cell match cellAspect and an N×M span a clean grid-aligned block.
      const frameW = frame.clientWidth;
      const colW = (frameW - (p.columns - 1) * gap) / p.columns;
      const rowH = colW / Math.max(0.01, p.cellAspect);
      autoRows = (Number.isFinite(rowH) && rowH > 0) ? `${rowH}px` : 'auto';
    }
    Object.assign(frame.style, common, {
      display: 'grid',
      gridTemplateColumns: `repeat(${p.columns}, 1fr)`,
      gridAutoRows: autoRows,
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
  cell.style.height = '';
  if (p.mode === 'freeform') {
    cell.style.flex = '0 0 auto';
    cell.style.width = `${layout?.width ?? p.cellWidth}px`;
    cell.style.gridColumn = '';
    cell.style.gridRow = '';
    cell.style.aspectRatio = p.fillHeight ? '' : String(layout?.aspect ?? p.cellAspect);
  } else {
    cell.style.flex = '';
    cell.style.width = '';
    const colSpan = Math.min(p.columns, Math.max(1, Math.round(layout?.colSpan ?? 1)));
    const rowSpan = Math.max(1, Math.round(layout?.rowSpan ?? 1));
    cell.style.gridColumn = `span ${colSpan}`;
    cell.style.gridRow = `span ${rowSpan}`;
    cell.style.aspectRatio = '';   // shape comes from the measured row height
  }
}

// ── borders ────────────────────────────────────────────────────────────────
//
// Fully cell-driven so the border always tracks the cells. `cells` is in
// tree order. For shared borders, top/left edge cells are found by measured
// position — correct even when cells span multiple tracks.

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

  for (const cell of cells) {
    cell.style.borderRight = b;
    cell.style.borderBottom = b;
  }
  if (cells.length === 0) return;

  let minTop = Infinity, minLeft = Infinity;
  for (const cell of cells) {
    if (cell.offsetTop < minTop) minTop = cell.offsetTop;
    if (cell.offsetLeft < minLeft) minLeft = cell.offsetLeft;
  }
  for (const cell of cells) {
    if (cell.offsetTop <= minTop + 1) cell.style.borderTop = b;
    if (cell.offsetLeft <= minLeft + 1) cell.style.borderLeft = b;
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
      height: '',
    });
    if (p.mode === 'freeform') {
      cell.style.flex = '0 0 auto';
      cell.style.width = `${p.cellWidth}px`;
      cell.style.gridColumn = '';
      cell.style.gridRow = '';
      cell.style.aspectRatio = p.fillHeight ? '' : String(p.cellAspect);
    } else {
      cell.style.flex = '';
      cell.style.width = '';
      cell.style.gridColumn = '';
      cell.style.gridRow = '';
      cell.style.aspectRatio = '';
    }
  });

  applyBorders(frame, p, existing);
  if (!p.cellBorder) {
    for (const cell of existing) {
      cell.style.border = '1px dashed rgba(0,0,0,0.25)';
    }
  }
}
