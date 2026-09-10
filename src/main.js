// Entry point.
//
// Boots the scene runtime, mounts the GUI, exposes window.__scene for the
// (eventual) export driver. The runtime is feature-bearing; the GUI is a
// view over it. See ARCHITECTURE.md → "Scene/GUI separation contract".

import { createScene } from './scene/index.js';
import { renderer } from './renderer/index.js';
import { mountLeftRail } from './gui/left-rail.js';
import { mountRightRail } from './gui/right-rail.js';
import { mountTimelineBar } from './gui/timeline-bar.js';
import { mountMediaDrop } from './gui/media-drop.js';
import { mountCanvasSelect } from './gui/canvas-select.js';
import { mountAutosave, loadAutosave } from './scene/persistence.js';

const scene = createScene({ renderer });

mountLeftRail(document.getElementById('left-rail'), scene);
mountRightRail(document.getElementById('right-rail'), scene);
mountTimelineBar(document.getElementById('timeline-bar'), scene);
mountMediaDrop(scene);
mountCanvasSelect(scene);

// Starter scene — a single Grid. Adjust its props from the right rail.
const STARTER_SCENE = {
  version: 1,
  name: 'phase-1-grid',
  duration: 0,
  root: {
    id: 'root',
    component: 'Grid',
    props: { mode: 'columns', columns: 3, gap: 16, padding: 24 },
    children: [],
  },
  animations: [],
};

// Resume the autosaved working scene if there is one, else the starter.
// Every subsequent mutation is mirrored back to localStorage.
scene.loadScene(loadAutosave() ?? STARTER_SCENE);
mountAutosave(scene);

window.__scene = scene;
