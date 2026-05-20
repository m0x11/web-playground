// Right rail — properties + animations of the active selection (Phase 1+ / 5).
// Phase 0: placeholder.

export function mountRightRail(el, _scene) {
  el.innerHTML = `
    <div class="panel-section">
      <div class="panel-label">properties</div>
      <div class="panel-placeholder">nothing selected</div>
    </div>
    <div class="panel-section">
      <div class="panel-label">animations</div>
      <div class="panel-placeholder">phase 5</div>
    </div>
  `;
}
