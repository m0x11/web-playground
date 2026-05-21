// Drop OS files onto a Media cell in the preview to set its media.
//
// The mode is inferred from what's dropped:
//   1 image            → source: image
//   2+ images          → source: cycle  (all of them)
//   video(s)           → source: video  (the first)
//   images + videos    → images win (treated as above)
//
// Document-level listeners also stop the browser from navigating away when a
// file is dropped anywhere off-target.

import { importFile } from '../scene/assets.js';

export function mountMediaDrop(scene) {
  let activeCell = null;

  const isFileDrag = e =>
    !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

  function mediaCellAt(target) {
    const el = target?.closest?.('[data-scene-id]');
    if (!el) return null;
    const node = scene.getNode(el.dataset.sceneId);
    if (!node) return null;
    // Media, or the legacy "Image" alias.
    return (node.component === 'Media' || node.component === 'Image') ? el : null;
  }

  function setActive(cell) {
    if (activeCell === cell) return;
    activeCell?.classList.remove('media-drop-active');
    activeCell = cell;
    activeCell?.classList.add('media-drop-active');
  }

  document.addEventListener('dragover', e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();                         // suppress the browser default
    const cell = mediaCellAt(e.target);
    setActive(cell);
    e.dataTransfer.dropEffect = cell ? 'copy' : 'none';
  });

  document.addEventListener('dragleave', e => {
    if (isFileDrag(e) && !e.relatedTarget) setActive(null);
  });

  document.addEventListener('drop', async e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    const cell = mediaCellAt(e.target);
    setActive(null);
    if (!cell) return;
    await applyDropped(scene, cell.dataset.sceneId, [...e.dataTransfer.files]);
  });
}

async function applyDropped(scene, id, files) {
  const images = files.filter(f => f.type.startsWith('image/'));
  const videos = files.filter(f => f.type.startsWith('video/'));
  try {
    if (images.length > 1) {
      const paths = [];
      for (const f of images) paths.push(await importFile(f));
      scene.updateProps(id, { source: 'cycle', images: paths });
    } else if (images.length === 1) {
      scene.updateProps(id, { source: 'image', image: await importFile(images[0]) });
    } else if (videos.length >= 1) {
      scene.updateProps(id, { source: 'video', video: await importFile(videos[0]) });
    } else {
      return;
    }
    scene.select(id);
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}
