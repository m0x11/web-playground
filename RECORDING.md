# Recording

How web-playground produces 4K30 (and any-res / any-fps) frame-perfect videos from a scene.

## The constraint that shapes everything

**Real-time capture cannot deliver 4K30 from DOM.** `MediaRecorder` + `getDisplayMedia` (or `canvas.captureStream`) is wall-clock-driven — if any frame takes longer than 33ms to paint at 4K, frames drop silently. Even with hardware encoders, 4K30 from a non-trivial DOM scene is a coin flip per frame.

Conclusion: we render **offline**. The timeline is stepped one frame at a time, each frame is captured to PNG, frames are concatenated with ffmpeg. Time in the export pipeline has nothing to do with wall-clock time.

Same architecture as Remotion. Without React.

## The pipeline

```
Node export script
└─ Playwright launches Chromium, opens playground page
   at 3840×2160 viewport, deviceScaleFactor 1, GUI hidden
   │
   await page.evaluate(() => window.__scene.ready())
   │
   for n in 0 .. totalFrames-1:
     await page.evaluate(t => window.__scene.setTime(t), n / fps)
     await page.evaluate(() => window.__scene.framePainted())
     png = await page.screenshot({ type: 'png', omitBackground: false,
             clip: { x: 0, y: 0, width: 3840, height: 2160 } })
     ffmpegStdin.write(png)
   ffmpegStdin.end()
   │
   ffmpeg -f image2pipe -framerate 30 -i pipe:0
          -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow
          -movflags +faststart out.mp4
```

## Why Playwright (and not the alternatives)

- **`page.screenshot()`** captures the fully composited page at exact pixel dimensions, including any canvas elements — so the snowflake-border lift (Three.js inside a component) just works, no special compositing path needed.
- **Synchronous frame stepping** via `page.evaluate()` — `evaluate()` only resolves after the awaited JS in the page resolves. This is the entire control-flow primitive.
- **Headed or headless** — useful for debugging weird export-only bugs by watching the export happen.
- **Native viewport sizing** at any resolution + DPR.

Alternatives considered:

| Option | Why not |
|---|---|
| Puppeteer | Same architecture, slightly older API. Playwright is the modern fork; either works. |
| `html2canvas` + `CCapture.js` (in-browser) | html2canvas misses CSS edge cases (backdrop-filter, certain transforms, some filter chains). Hard pass for a tool that aspires to pixel-perfect output. |
| CDP screenshot directly | What Playwright does under the hood. No reason to reimplement. |
| `getDisplayMedia` + MediaRecorder | Real-time, drops frames at 4K30. Non-deterministic. |
| OffscreenCanvas-only pipeline | Defeats the DOM-output goal of the playground. |

## What the Scene runtime must guarantee

For the export driver to work, the scene runtime exposes itself on `window.__scene`:

```js
window.__scene = {
  loadScene(json),        // Replace current scene
  setTime(t),             // Synchronously set timeline position (seconds)
  duration(),             // Total scene duration (seconds)
  ready(),                // Promise — resolves once all fonts / images / assets loaded
  framePainted(),         // Promise — resolves after the next paint completes
  setSize(w, h),          // Set internal scene viewport (if it differs from window)
  hideGUI(),              // Suppress GUI for export mode
};
```

**Critical invariants:**

- `setTime(t)` is **synchronous and deterministic**. Two calls with the same `t` produce the same DOM state.
- No `setTimeout` / `setInterval` / `requestIdleCallback` anywhere in animation evaluation.
- All animation values are derived from the timeline's current `t`, never from `performance.now()` or `Date.now()`.
- After `setTime(t)` returns and `framePainted()` resolves, the DOM is *visually* at time `t`.

`framePainted()` uses double-rAF because the browser may schedule paint between the first rAF callback and the second:

```js
framePainted() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}
```

Components that own their own internal loops (e.g. WebGL components) must also derive from `t`, and their internal "draw the current frame" must complete before `framePainted()` resolves. For canvas-based components this usually means calling their draw function inside `setTime()`.

## Viewport and DPR

4K means 3840×2160 *device pixels*. Two ways to get there:

1. **Viewport = 3840×2160, deviceScaleFactor = 1.** CSS pixels match device pixels directly. Components render at the actual target resolution. Simplest; this is the default.
2. **Viewport = 1920×1080, deviceScaleFactor = 2.** Components render at lower CSS resolution; browser upscales for retina-equivalent output. Smaller layout calculations but font hinting / sub-pixel artifacts will differ from option 1.

Default: option 1.

Playwright setup:

```js
const context = await browser.newContext({
  viewport: { width: 3840, height: 2160 },
  deviceScaleFactor: 1,
});
```

Future: aspect-ratio presets baked into scenes (`{ format: 'reel' }` → 1080×1920, `{ format: 'square' }` → 1080×1080, etc.). Export script reads the scene's declared format and sizes the viewport accordingly.

## ffmpeg encoding

Default delivery encode (for Instagram / web / general):

```
-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart
```

- `libx264 / yuv420p` — universal compatibility.
- `crf 18` — visually lossless.
- `preset slow` — better compression for one-shot final renders.
- `+faststart` — playable while streaming.

Alternatives we may want later:

- **Lossless intermediate:** `-c:v libx264 -qp 0 -preset veryslow` or ProRes (`-c:v prores_ks -profile:v 3`).
- **Web/animations format:** `-c:v libvpx-vp9 -crf 24 -b:v 0` (WebM, smaller but slower encode).

ffmpeg is a system dependency. Document install in README when we ship Phase 8 (`brew install ffmpeg` on macOS).

## Performance expectations

- 4K PNG ≈ 3–8 MB depending on content. Piped to ffmpeg, never hits disk.
- Per-frame cost: ~50–150ms for screenshot + ~paint time. Call it ~100ms average.
- 30-second clip @ 30fps = 900 frames ≈ **1.5 minutes** to export.
- 60-second @ 60fps = 3600 frames ≈ **6 minutes**.

Acceptable for a personal tool. Speedups available if needed:

- **Parallel contexts.** Multiple Playwright contexts each handling a frame range, concat with ffmpeg at the end. Linear speedup with cores.
- **Direct canvas readback.** For WebGL components, `gl.readPixels` is faster than full-page screenshot. Would require a different capture path for canvas-only scenes; not worth the complexity unless we hit the wall.

## Open questions

- **Audio.** Scenes may eventually have audio (music, sfx). ffmpeg can mux a separate audio track at the end via `-i audio.m4a -c:a aac -shortest`. Defer until needed.
- **WebGL component determinism.** Shader-based lifts may have non-determinism (uninitialized buffers, random seeds, frame-to-frame accumulators). Lifts that include shaders must accept `t` as input and produce the same output for the same `t`. Note this when we port the snowflake-border.
- **Font loading.** `document.fonts.ready` must be awaited before frame 0. Bake into `window.__scene.ready()`.
- **Image decoding.** Similar — all referenced images must be loaded + decoded before frame 0. Use `img.decode()` and gate on it.
- **Error recovery.** If frame N fails (browser crash, paint timeout, OOM): for now, fail loud and restart from 0. Resume-from-N is future work.
- **Determinism verification.** Worth building a "diff two exports of the same scene" tool early — render twice, compare PNG sequences. Any mismatch is a bug in our determinism story.
