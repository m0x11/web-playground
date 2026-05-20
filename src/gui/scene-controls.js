// Scene controls — editable name + save / load buttons. Lives at the top of
// the left rail.

import { saveSceneToFile, loadSceneFromFile } from '../scene/persistence.js';

export function mountSceneControls(host, scene) {
  host.innerHTML = `
    <section class="panel-section scene-controls">
      <div class="panel-label">scene</div>
      <input type="text" class="scene-name-input" id="scene-name" spellcheck="false" autocomplete="off">
      <div class="scene-controls__buttons">
        <button class="picker-btn" id="scene-save">save</button>
        <button class="picker-btn" id="scene-load">load</button>
      </div>
    </section>
  `;

  const nameInput = host.querySelector('#scene-name');
  nameInput.value = scene.getName();
  nameInput.addEventListener('input', () => scene.setName(nameInput.value));

  scene.on('scene-loaded', () => { nameInput.value = scene.getName(); });
  scene.on('scene-name-changed', name => {
    if (nameInput.value !== name) nameInput.value = name;
  });

  host.querySelector('#scene-save').addEventListener('click', async () => {
    try {
      await saveSceneToFile(scene);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  });

  host.querySelector('#scene-load').addEventListener('click', async () => {
    try {
      await loadSceneFromFile(scene);
    } catch (err) {
      alert(`Load failed: ${err.message}`);
    }
  });
}
