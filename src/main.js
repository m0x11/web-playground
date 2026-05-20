// Entry point.
//
// Boots the scene runtime, mounts the GUI, exposes window.__scene for the
// (eventual) export driver. The runtime is feature-bearing; the GUI is a
// view over it. See ARCHITECTURE.md → "Scene/GUI separation contract".

import { createScene } from './scene/index.js';
import { renderer } from './renderer/index.js';
import { mountLeftRail } from './gui/left-rail.js';
import { mountRightRail } from './gui/right-rail.js';

const scene = createScene({ renderer });

mountLeftRail(document.getElementById('left-rail'), scene);
mountRightRail(document.getElementById('right-rail'), scene);

// Phase 0 placeholder scene — proves scene → renderer → DOM pipeline.
scene.loadScene({
  version: 1,
  name: 'phase-0-placeholder',
  duration: 0,
  root: {
    id: 'root',
    component: 'Placeholder',
    props: { text: 'phase 0 · scene runtime online' },
    children: [],
  },
  animations: [],
});

window.__scene = scene;
