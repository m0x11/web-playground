# web-playground

A personal compositing tool for animated HTML/CSS scenes. Think sdf-playground's UX (side menu, parameter controls, scenes-as-files, precise easing) but the output is real DOM instead of a shader canvas.

## Why this exists

Concrete motivating use case: making an Instagram reel of the snowflake grid from `second-nature-next`. Doing it as chunks of recordings + ad-hoc code modifications was painful; a composable environment where animations and layout are first-class makes it tractable.

The tool will grow with every project. New needs become new components.

## The model

Three concentric layers:

1. **Component library** — the growing toolkit, two flavors:
   - **Generics** with declared prop schemas (Grid, Text, Image, Border…). Schemas drive the side-menu controls automatically.
   - **Lifts** — components ported in from real projects (e.g. the snowflake-grid border, an Ephemeris button). Once ported, they live alongside generics.
2. **Scenes** — saved compositions. Each scene is a folder on disk: a manifest (tree of components + props + animations + asset refs) plus any one-off code Claude writes for that scene.
3. **Animation layer** — wraps any element. sdf-playground-style easing-curve editor. Animatable property whitelist grows over time (size first, then transform, opacity, color…).

Recording (the eventual payoff — Instagram reels of compositions) is downstream of all three. Not v0.

## Scope boundaries

- **Not Framer / Webflow.** Limited surface area, personal use, opinionated.
- **Not for other users.** No accounts, no sharing, no SSR.
- **No backend, no database.** Scenes live on disk. Assets live in folders.
- **Iterative.** Features added as projects demand them, not designed up front.

## Stack

- Vanilla JS modules (no framework)
- Vite for HMR during dev (drop later if it gets in the way)
- Hand-rolled animation runtime (no library — required for deterministic 4K30 export; see [RECORDING.md](./RECORDING.md))
- Playwright + ffmpeg for offline 4K30 export
- Typography and palette: lifted from `sdf-playground-main` (PP Right Serif Mono, same dark UI feel)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the implementation model, [RECORDING.md](./RECORDING.md) for the export pipeline, and [ROADMAP.md](./ROADMAP.md) for the rough phasing.

## Quick start

```bash
npm install                              # once
npx playwright install chromium          # once (export only)
npm run dev                              # editor at http://localhost:5173

# Author + save a scene from the editor, then:
npm run export -- --scene scenes/foo.json
# → foo.mp4 at 3840×2160 / 30 fps. Override with --fps, --width, --height.
```

ffmpeg must be on PATH (`brew install ffmpeg`).

## Status

Planning. No code yet.
# web-playground
