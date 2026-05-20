# Architecture

How the pieces fit. This is the working model; expect revisions as we build.

## Stack rationale

**Vanilla JS modules, no framework.** Decided against React because:
- Animation tools need *stable DOM node identity* across state changes. React's diffing makes that fragile (surprise remounts kill tweens).
- The "tree from scene JSON → DOM" renderer is ~50 lines of vanilla code; the framework buys us nothing here.
- This is a personal tool; no SSR, SEO, or routing concerns to justify a framework.
- "Pulling components from other projects" → in practice these are ports, not imports. Tailwind JSX → vanilla HTML/CSS is a 10-minute transform.

**Vite for dev HMR.** Not for bundling philosophy — just because hand-iterating GUI without HMR is miserable. If Vite gets in the way, fall back to sdf-playground's import-map + static-server setup.

**Hand-rolled animation runtime.** Decided against GSAP, anime.js, motion. The pipeline must deliver 4K30 frame-perfect exports (see [RECORDING.md](./RECORDING.md)), which means owning the clock end-to-end: `scene.setTime(t)` must compute every animated property synchronously and deterministically, with zero internal scheduling. Any third-party engine adds variables — RAF tickers, microtask batching, lag smoothing — that risk subtle export non-determinism. We're already building a custom easing-curve editor, so we own curve sampling regardless. anime.js v4 is the fallback if we hit a genuinely hard case, but a tween is `progress → eased → lerp → apply` — that's ~15 lines.

## The three layers, in code

### 1. Component library — `src/components/`

Each component is a module that exports:

```js
export const schema = {
  name: 'Grid',
  category: 'layout',
  props: {
    mode: { type: 'enum', options: ['columns', 'freeform'], default: 'columns' },
    columns: { type: 'number', min: 1, max: 12, default: 3, visibleWhen: { mode: 'columns' } },
    gap: { type: 'number', min: 0, max: 200, default: 16, unit: 'px' },
    // ...
  },
  children: 'multiple', // or 'none' or 'single'
};

export function mount(el, props, ctx) {
  // Imperatively set up DOM inside el using props.
  // Return a patch fn for prop updates and a cleanup fn.
  return {
    patch(nextProps) { /* ... */ },
    unmount() { /* ... */ },
  };
}
```

Schema is the source of truth for GUI controls. The right-rail prop panel reads it and generates sliders / dropdowns / color pickers / image-folder selectors automatically. New component → new module → it just appears in the "add component" menu.

Two subdirs:
- `src/components/generics/` — reusable building blocks (Grid, Text, Image, Border, Stack, …)
- `src/components/lifts/` — components ported from specific projects (`snowflake-border/`, `ephemeris-button/`, …)

Lifts may declare which project they came from in their schema for organization, but at runtime they're treated identically to generics.

### 2. Scene format — `scenes/<name>/`

Each scene is a folder:

```
scenes/snowflake-reel/
  scene.json        — tree + animations + asset refs
  code/             — optional per-scene one-offs Claude writes
    custom-foo.js
  assets.json       — pointers to local asset folders (optional)
```

`scene.json` shape (sketch — will evolve):

```json
{
  "version": 1,
  "name": "snowflake-reel",
  "root": {
    "id": "root",
    "component": "Grid",
    "props": { "columns": 3, "gap": 24 },
    "children": [
      { "id": "g1", "component": "Image", "props": { "source": "@assets/snowflakes/", "indexMode": "byIndex" } },
      { "id": "g2", "component": "Text", "props": { "content": "{{index}}" } }
    ]
  },
  "animations": [
    {
      "target": "g1",
      "property": "scale",
      "from": 0,
      "to": 1,
      "duration": 800,
      "easing": { "type": "curve", "points": [/* ... */] },
      "delay": { "type": "stagger", "amount": 100 }
    }
  ]
}
```

Why scene-as-folder, not scene-as-file: lets per-scene custom code (the bits Claude writes for one-off needs in a specific project) live next to the scene that uses it, without polluting the global component library or shoving code-strings into JSON.

### 3. Animation layer — `src/animation/`

Hand-rolled. The core loop is small enough to own outright, and owning it is what makes 4K30 deterministic export possible (see [RECORDING.md](./RECORDING.md)).

- `timeline.js` — the time-driven engine. Single source of truth for "what time is it in the scene." Exposes `setTime(t)`, `addTween(targetElId, property, { from, to, start, duration, easing })`, `play()`, `pause()`, `scrub(t)`, `duration()`. No internal RAF scheduler at runtime — the GUI drives playback via one rAF loop that calls `setTime(performance.now() - startMs)`. The export driver calls `setTime(frameIdx / fps)` directly. Same code path either way.
- `tween.js` — pure function: `tweenValueAt(spec, t) → value`. Given a tween spec and a time, returns the eased + lerped value. No side effects. Trivially testable.
- `property-registry.js` — explicit whitelist of animatable properties. Each entry knows how to apply a value to a DOM node. Transform parts (`scale`, `rotation`, `translateX/Y`) funnel through a per-element transform composer so multiple tweens compose cleanly into one `transform` string. Whitelist grows over time.
- `easing/` — curve representations (CSS bezier, custom LUT from the curve editor, spring presets) plus sampling functions. Pure.
- `easing-editor/` — visual curve editor (canvas-based control points + LUT preview). Outputs curve specs that `easing/` can sample.

## The renderer — `src/renderer/`

The thing that turns `scene.json` into DOM and keeps it in sync as you edit.

Key contract: **node identity is stable.** Every element in the scene tree gets a persistent DOM node keyed by its `id`. Prop edits call the component's `patch(nextProps)` — they never tear down and re-create the node. This is what makes animations survive editing.

Two passes:
- **Initial mount.** Walk the tree, instantiate each component's `mount(el, props, ctx)`, recurse into children.
- **Patch.** On scene-state change, diff old vs new tree by id. Same id → call `patch()`. New id → mount. Removed id → unmount.

The renderer also exposes a lookup `getEl(id)` so the animation layer can grab the right DOM node by scene-id.

## Scene/GUI separation contract

The recording pipeline (see [RECORDING.md](./RECORDING.md)) drives the same scene runtime that the GUI drives. That requires a clean separation, enforced from day one:

- **Scene runtime** — pure state + behavior. Owns the scene tree, the timeline, the renderer. Exposes a small API surface: `loadScene(json)`, `setTime(t)`, `play()`, `pause()`, `duration()`, `ready()`, `framePainted()`, plus an event channel. Knows nothing about the GUI.
- **GUI** — reads / mutates Scene state, displays it, generates controls. Has no animation timing logic of its own.
- **Export driver** — a Playwright script (Node) that loads the same `index.html`, hides the GUI, and steps the Scene runtime frame-by-frame via the same API.

Practical rules:

- No `setTimeout` / `setInterval` / `requestIdleCallback` in animation paths.
- No reading `Date.now()` / `performance.now()` inside tween evaluation — only inside the GUI's playback rAF loop.
- All scene-state mutations go through Scene API methods, not direct DOM pokes from GUI components.
- The page exposes the runtime as `window.__scene` so Playwright can drive it without parsing DOM.
- `framePainted()` returns a Promise that resolves after a double-rAF, so export can reliably wait for paint completion.

Rule of thumb: build the Scene runtime feature first, then wrap it in GUI. Never the reverse.

## GUI structure — `src/gui/`

Three regions, sdf-playground-inspired:

- **Left rail** — scene tree (collapsible) + "Add component" picker. Select a node here → it becomes the active selection.
- **Right rail** — context panel for the active selection: props (auto-generated from the component's schema) and animations (list, add, edit easing curves).
- **Top bar** — scene save/load, play/pause/scrub timeline, viewport size, eventually a record button.
- **Center** — the live preview. Real DOM rendering the scene.

All GUI controls (sliders, color pickers, etc.) are themselves vanilla modules under `src/gui/controls/`, reused by the auto-generated prop panel.

## Directory layout (proposed)

```
web-playground/
  README.md
  ARCHITECTURE.md
  ROADMAP.md
  index.html
  package.json
  vite.config.js
  src/
    main.js                  — entry: mount GUI, load default scene
    renderer/                — scene-tree → DOM, stable identity
    components/
      generics/              — Grid, Text, Image, Border, ...
      lifts/                 — ported from other projects
    animation/               — GSAP wrapper, easing editor, prop registry
    gui/
      controls/              — Slider, ColorPicker, EnumDropdown, FolderPicker, ...
      left-rail/             — scene tree + add picker
      right-rail/            — props + animations panel
      top-bar/               — save/load, timeline, viewport
    scenes/                  — runtime scene loader
    shared/                  — utilities
  scenes/                    — saved scenes (one folder each)
    example/
      scene.json
      code/                  — optional per-scene custom code
  assets/                    — image folders, fonts, etc.
  fonts/                     — PP Right Serif Mono (from sdf-playground)
```

## Open questions

- **Scene state model.** Single mutable object the GUI mutates, with subscribers? Or event-sourced (every edit = an event in an undo stack, derive state from events)? sdf-playground uses a snapshot-based undo stack — that's probably the right call here too.
- **Asset folder binding.** Browser sandbox makes "point at a folder on disk" hard. Options: drag-folder-into-page (FileSystem Access API), copy folder into `assets/` and reference by path, or build-time `import.meta.glob`. Lean drag-or-glob.
- **Custom code execution.** Per-scene `code/` files — how are they loaded? Lazy `import()` from the scene folder. Need to figure out Vite's handling of that.
- **Lifts that depend on Three.js / shaders.** The snowflake-border lift will need WebGL. The renderer probably needs to support a component mounting a `<canvas>` and managing its own loop. Note for when we get there.
