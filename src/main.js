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

const scene = createScene({ renderer });

mountLeftRail(document.getElementById('left-rail'), scene);
mountRightRail(document.getElementById('right-rail'), scene);
mountTimelineBar(document.getElementById('timeline-bar'), scene);

// Phase 1 demo scene — a single Grid. Adjust its props from the right rail.
scene.loadScene({
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
});

window.__scene = scene;
