// Click a rendered element in the preview to select it.
//
// Selection flows through scene.select() — the right-rail properties panel and
// the left-rail tree both update from the selection-changed event. Clicking
// resolves to the innermost scene-node under the cursor (a Media/Text cell, or
// the Grid itself when you click its padding / gaps).

export function mountCanvasSelect(scene) {
  const root = document.getElementById('scene-root');
  root.addEventListener('click', e => {
    const el = e.target.closest?.('[data-scene-id]');
    if (el) scene.select(el.dataset.sceneId);
  });
}
