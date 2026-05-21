// Scene save / load.
//
// File I/O uses the FileSystem Access API where available (Chrome/Edge),
// falling back to download + file-input on browsers that don't support it.
//
// See SCENE_FORMAT.md for the v1 schema and validation rules.

import { getComponent, isKnownComponent } from '../components/index.js';

const SCENE_FILE_TYPES = [
  { description: 'Scene', accept: { 'application/json': ['.json'] } },
];

export async function saveSceneToFile(scene) {
  const json = scene.serialize();
  if (!json) throw new Error('No scene loaded');

  const text = JSON.stringify(json, null, 2);
  const filename = `${(json.name || 'scene').replace(/[^a-z0-9_-]+/gi, '-')}.json`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: SCENE_FILE_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled — silent.
      console.warn('FS Access save failed, falling back to download:', err);
    }
  }

  triggerDownload(text, filename);
}

export async function loadSceneFromFile(scene) {
  let text = null;

  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: SCENE_FILE_TYPES,
        multiple: false,
      });
      const file = await handle.getFile();
      text = await file.text();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('FS Access open failed, falling back to file input:', err);
    }
  }

  if (text == null) {
    text = await pickFileViaInput();
    if (text == null) return; // user cancelled
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not valid JSON: ${err.message}`);
  }
  validateScene(json);
  scene.loadScene(json);
}

// ── helpers ─────────────────────────────────────────────────────────────

function triggerDownload(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pickFileViaInput() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      resolve(await f.text());
    });
    // Cancel detection on input picker is unreliable across browsers; if the
    // user cancels, the change event never fires and the Promise stays
    // pending. That's acceptable here — they can just click Load again.
    input.click();
  });
}

export function validateScene(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Scene file is not a JSON object');
  }
  if (json.version !== 1) {
    throw new Error(`Unsupported scene version: ${json.version} (expected 1)`);
  }
  if (!json.root || typeof json.root !== 'object') {
    throw new Error('Scene missing required field: root');
  }
  if (json.canvas != null) {
    if (typeof json.canvas !== 'object') {
      throw new Error('Invalid canvas: must be an object');
    }
    const c = json.canvas;
    const validAspect = Number.isFinite(c.aspectW) && Number.isFinite(c.aspectH) && c.aspectW > 0 && c.aspectH > 0;
    const validLegacy = Number.isFinite(c.width)   && Number.isFinite(c.height)   && c.width   > 0 && c.height   > 0;
    if (!validAspect && !validLegacy) {
      throw new Error('Invalid canvas: must be { aspectW: >0, aspectH: >0 } (or legacy { width, height })');
    }
  }
  validateNode(json.root, new Set(), []);
}

function validateNode(node, seenIds, path) {
  const here = path.concat(node?.id ?? '?').join(' › ');
  if (!node || typeof node !== 'object') {
    throw new Error(`Invalid node at ${here}: not an object`);
  }
  if (typeof node.id !== 'string' || !node.id) {
    throw new Error(`Invalid node at ${here}: missing id`);
  }
  if (seenIds.has(node.id)) {
    throw new Error(`Duplicate node id "${node.id}" at ${here}`);
  }
  seenIds.add(node.id);

  if (typeof node.component !== 'string' || !node.component) {
    throw new Error(`Invalid node "${node.id}": missing component`);
  }
  if (!isKnownComponent(node.component)) {
    throw new Error(`Unknown component "${node.component}" in node "${node.id}" — not in registry`);
  }
  // Lookup to enforce schema accessibility (also surfaces any registry bugs).
  getComponent(node.component);

  if (node.children != null && !Array.isArray(node.children)) {
    throw new Error(`Invalid node "${node.id}": children must be an array or omitted`);
  }
  for (const child of node.children ?? []) {
    validateNode(child, seenIds, path.concat(node.id));
  }
}
