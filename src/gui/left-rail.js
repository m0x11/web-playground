// Left rail — scene tree + "add component" picker (Phase 1+).
// Phase 0: placeholder.

export function mountLeftRail(el, _scene) {
  el.innerHTML = `
    <div class="panel-section">
      <div class="panel-label">scene tree</div>
      <div class="panel-placeholder">empty — components land in phase 1</div>
    </div>
    <div class="panel-section">
      <div class="panel-label">add component</div>
      <div class="panel-placeholder">picker arrives with the first generic (Grid)</div>
    </div>
  `;
}
