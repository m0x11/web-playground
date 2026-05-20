# Roadmap

Rough phasing. Expect reordering as real projects (Instagram reels, etc.) surface needs we didn't predict.

Each phase ends with something demonstrable. No phase is "done" if the demo doesn't run.

## Phase 0 — Foundation

Get the empty shell standing up.

- Vite scaffold, `index.html`, `src/main.js`
- Lift fonts + color palette from `sdf-playground-main` (PP Right Serif Mono + the dark UI feel)
- Empty three-region layout: left rail, right rail, top bar, center preview area
- Stub renderer that mounts a hardcoded scene into the preview (single `<div>` with text — proves the pipeline)

**Done when:** `npm run dev` shows a styled empty editor matching sdf-playground's typography, with a single hardcoded element in the preview.

## Phase 1 — First generic + schema-driven controls

End-to-end vertical slice for ONE component, including auto-generated UI.

- Define the component module contract (`schema`, `mount(el, props, ctx)` returning `{ patch, unmount }`)
- Build `Grid` as the first generic (modes: columns + freeform; props: columns, gap, padding)
- Build the right-rail prop panel that reads any schema and emits controls
- Slider + EnumDropdown controls (minimum needed for Grid)
- Renderer wires prop edits → component `patch`

**Done when:** Adding a Grid via the (still-hardcoded) scene, editing its columns/gap in the right rail, sees the DOM update live with no remount.

## Phase 2 — Component library + add/remove from scene

Make the left rail real.

- Left-rail scene tree (list of components, selectable, expandable)
- "Add component" picker that lists everything in `src/components/generics/`
- Selection model (clicking a tree node makes it the active selection; right rail follows)
- Add `Text` and `Image` generics so there's variety to compose
- ColorPicker control (for Text)

**Done when:** Can build a small composition from scratch by clicking "Add" repeatedly, with no scene.json file involved yet.

## Phase 3 — Scene save/load

The "scenes-as-folders" model becomes real.

- Define and freeze v1 of `scene.json` schema
- Save current scene state to a scene folder (download a zip first; FileSystem Access API later if it's not painful)
- Load a scene folder back into the editor
- Scene picker in top bar

**Done when:** Build a scene, save it, refresh, load it back, it's identical.

## Phase 4 — Image-folder binding

The first "real" feature for the snowflake-reel use case.

- FolderPicker control (drag a folder onto the playground or pick via FileSystem Access API)
- `Image` component grows: `source` prop accepts a folder, `indexMode` decides how each grid child maps to a file
- Index variables exposed to children (`{{index}}` in Text content)

**Done when:** Drop a folder of snowflake PNGs onto the playground, set a Grid's children to be Images bound to that folder, see the grid populate.

## Phase 5 — Animation engine v1

- GSAP wrapper as `src/animation/timeline.js`
- Animatable property registry — start with `scale`, `opacity`, `width`, `height`
- Right-rail "Animations" tab for the selected element: add tween, set from/to/duration/delay, choose easing from preset list
- Top-bar play/pause/scrub
- Scene format extended with `animations` array (persisted on save/load)

**Done when:** Add a scale-up animation to a grid item, hit play, watch it tween in. Save the scene, reload, animation persists.

## Phase 6 — Easing curve editor

The sdf-playground-style precision control.

- Canvas-based curve editor (control points, drag to adjust, LUT preview)
- Custom curves stored in scene; emit to GSAP as `CustomEase` or sampled bezier
- Replace the easing dropdown's "custom" option with the editor

**Done when:** Can author a custom easing curve, see it applied to a tween, save it, reload it.

## Phase 7 — First lift

Prove the "port from another project" path.

- Pick a small component from `second-nature-next` (probably a button or the engraving display) and port to a vanilla lift module
- Then attempt the snowflake-border (needs Three.js inside a component — first WebGL lift, will surface renderer assumptions)

**Done when:** The snowflake-border renders as a Border component option on Grid, configurable from the right rail.

## Phase 8 — Recording

The eventual payoff.

- MediaRecorder on the preview region's `getDisplayMedia` stream, OR offscreen rendering at higher resolution (defer that until needed)
- Timeline-driven recording: hit record, the scene plays from t=0, recording stops when the timeline ends
- Output MP4 / WebM download

**Done when:** Snowflake-reel scene records cleanly at 1080p with all animations intact.

## Beyond

Everything past phase 8 is reactive — driven by whatever the next real project needs:

- More generics as patterns repeat
- More lifts as components from existing projects become useful
- Animatable property whitelist grows
- Per-scene custom-code loading
- Maybe: keyboard shortcuts, undo/redo stack, multi-selection, viewport sizing presets (story, reel, square…)
