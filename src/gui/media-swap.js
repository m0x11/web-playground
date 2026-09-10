// Drag a Media cell onto another Media cell in the preview to swap their
// contents. Only the props travel (source, media, fit, pan, grading, …);
// the cells themselves — ids, order, spans, animations — stay where they
// are. So a 3×3 grid keeps its layout while you shuffle which picture lives
// where.
//
// Pointer-based (not HTML5 drag-and-drop) so it doesn't collide with the
// OS-file drop handler in media-drop.js, and so we control the ghost.
// A press that never travels past the threshold is left alone and becomes
// an ordinary click-to-select (canvas-select.js).

const DRAG_THRESHOLD_PX = 6;

export function mountMediaSwap(scene) {
  const root = document.getElementById('scene-root');

  let pending = null;   // { id, x, y } — pressed, not yet dragging
  let drag = null;      // { id, ghost, over }

  function mediaCellAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const el = hit?.closest?.('[data-scene-id]');
    if (!el || !root.contains(el)) return null;
    const node = scene.getNode(el.dataset.sceneId);
    return node?.component === 'Media' ? el : null;
  }

  function mediaCellFromTarget(target) {
    const el = target?.closest?.('[data-scene-id]');
    if (!el) return null;
    const node = scene.getNode(el.dataset.sceneId);
    return node?.component === 'Media' ? el : null;
  }

  // Native image/video drag would hijack the gesture — suppress it inside
  // Media cells. (OS-file drags come from outside; they never fire dragstart.)
  root.addEventListener('dragstart', e => {
    if (mediaCellFromTarget(e.target)) e.preventDefault();
  });

  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const cell = mediaCellFromTarget(e.target);
    if (!cell) return;
    pending = { id: cell.dataset.sceneId, x: e.clientX, y: e.clientY };
  });

  document.addEventListener('pointermove', e => {
    if (pending && !drag) {
      const dx = e.clientX - pending.x, dy = e.clientY - pending.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      startDrag(pending.id, e);
    }
    if (!drag) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    const cell = mediaCellAt(e.clientX, e.clientY);
    setOver(cell && cell.dataset.sceneId !== drag.id ? cell : null);
  });

  document.addEventListener('pointerup', e => {
    pending = null;
    if (!drag) return;
    const target = drag.over;
    const sourceId = drag.id;
    endDrag();
    if (target) {
      scene.swapProps(sourceId, target.dataset.sceneId);
      scene.select(target.dataset.sceneId);   // follow the media you dragged
      swallowNextClick();
    }
  });

  document.addEventListener('pointercancel', () => { pending = null; endDrag(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) { pending = null; endDrag(); swallowNextClick(); }
  });

  function startDrag(id, e) {
    const sourceEl = scene.getEl(id);
    const ghost = document.createElement('div');
    ghost.className = 'media-swap-ghost';
    // Thumbnail: a snapshot <img>/<video poster> is overkill — clone the
    // visible media element so the ghost shows what you're carrying.
    const media = [...(sourceEl?.querySelectorAll('img, video') ?? [])]
      .find(m => m.style.display !== 'none' && m.offsetParent !== null);
    if (media) {
      const clone = media.cloneNode(false);
      clone.removeAttribute('style');
      if (clone.tagName === 'VIDEO') { clone.muted = true; clone.currentTime = media.currentTime; }
      ghost.appendChild(clone);
    }
    document.body.appendChild(ghost);
    document.body.classList.add('media-swap-dragging');
    sourceEl?.classList.add('media-swap-source');
    drag = { id, ghost, over: null };
    moveGhost(e.clientX, e.clientY);
  }

  function moveGhost(x, y) {
    drag.ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
  }

  function setOver(cell) {
    if (drag.over === cell) return;
    drag.over?.classList.remove('media-swap-target');
    drag.over = cell;
    drag.over?.classList.add('media-swap-target');
  }

  function endDrag() {
    if (!drag) return;
    drag.ghost.remove();
    drag.over?.classList.remove('media-swap-target');
    scene.getEl(drag.id)?.classList.remove('media-swap-source');
    document.body.classList.remove('media-swap-dragging');
    drag = null;
  }

  // The click that follows a completed drag would re-select the source
  // cell; eat it.
  function swallowNextClick() {
    const eat = e => { e.stopPropagation(); e.preventDefault(); };
    document.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', eat, { capture: true }), 0);
  }
}
