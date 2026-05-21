// Reusable export pipeline. Called by:
//   - scripts/export.js (CLI)
//   - scripts/vite-plugin-export.js (in-process from the running dev server)
//
// Architecture: Playwright headless Chromium drives window.__scene through
// frames at the requested viewport; PNG screenshots pipe into ffmpeg via
// image2pipe → MP4 (libx264/yuv420p). Deterministic by construction — same
// scene + same args → byte-identical MP4. See RECORDING.md.

import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '..');

export async function exportScene({
  sceneJson,
  options = {},
  viteUrl,
  onProgress = () => {},
  signal,
} = {}) {
  if (!sceneJson) throw new Error('exportScene: sceneJson is required');

  const {
    width = 3840,
    height = 2160,
    fps = 30,
    duration: durationOverride = null,
    output = null,
    crf = 18,
    preset = 'fast',
    headed = false,
  } = options;

  const outputPath = resolve(output ?? `exports/${safeName(sceneJson.name)}.mp4`);
  mkdirSync(dirname(outputPath), { recursive: true });

  // ── 1. Vite (start one if not supplied) ────────────────────────────────
  let ownVite = null;
  let url = viteUrl;
  if (!url) {
    ownVite = await createServer({
      root: PROJECT_ROOT,
      server: { port: 0 },
      clearScreen: false,
      logLevel: 'warn',
    });
    await ownVite.listen();
    url = ownVite.resolvedUrls?.local?.[0] ?? `http://localhost:${ownVite.config.server.port}`;
  }

  let browser, ff;
  try {
    abortable(signal);

    // ── 2. Browser ──────────────────────────────────────────────────────
    browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('pageerror', err => console.error('[page error]', err.message));

    abortable(signal);
    await page.goto(url);
    await page.waitForFunction(() => typeof window.__scene === 'object' && window.__scene !== null);

    // ── 3. Load scene + hide GUI ────────────────────────────────────────
    await page.evaluate(s => window.__scene.loadScene(s), sceneJson);
    await page.evaluate(() => window.__scene.hideGUI());
    await page.evaluate(() => window.__scene.ready());

    // ── 4. Determine frame count ────────────────────────────────────────
    const duration = durationOverride ?? (await page.evaluate(() => window.__scene.duration()));
    if (!(duration > 0)) {
      throw new Error('Scene has duration 0 and no override given — nothing to render.');
    }
    const totalFrames = Math.max(1, Math.round(duration * fps));

    onProgress({
      type: 'start',
      totalFrames,
      duration,
      output: outputPath,
      width, height, fps,
    });

    // ── 5. ffmpeg ────────────────────────────────────────────────────────
    ff = spawn('ffmpeg', [
      '-y',
      '-f', 'image2pipe',
      '-framerate', String(fps),
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', String(crf),
      '-preset', preset,
      '-movflags', '+faststart',
      outputPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let ffmpegStderr = '';
    ff.stderr.on('data', chunk => { ffmpegStderr += chunk.toString(); });

    let ffmpegFailed = null;
    ff.on('error', err => { ffmpegFailed = err; });

    // ── 6. Frame loop ───────────────────────────────────────────────────
    // Sample t spanning [0, duration] INCLUSIVE so animations complete on
    // the final exported frame. With totalFrames === round(duration * fps),
    // this introduces sub-frame cadence drift (3s @ 30fps: 3/89 vs 1/30 ≈
    // 0.0003s per frame) — imperceptible, and the video duration matches
    // scene duration exactly.
    const startMs = Date.now();
    for (let n = 0; n < totalFrames; n++) {
      abortable(signal);
      if (ffmpegFailed) throw ffmpegFailed;

      const t = totalFrames > 1 ? (n * duration) / (totalFrames - 1) : 0;
      await page.evaluate(time => window.__scene.setTime(time), t);
      await page.evaluate(() => window.__scene.framePainted());
      const png = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
      });
      const ok = ff.stdin.write(png);
      if (!ok) await new Promise(r => ff.stdin.once('drain', r));

      const elapsed = (Date.now() - startMs) / 1000;
      onProgress({
        type: 'frame',
        n: n + 1,
        total: totalFrames,
        fps: (n + 1) / Math.max(elapsed, 0.001),
        elapsed,
      });
    }

    // ── 7. Finalize ffmpeg ──────────────────────────────────────────────
    onProgress({ type: 'encoding' });
    ff.stdin.end();
    await new Promise((resolveDone, rejectDone) => {
      ff.on('close', code => {
        if (code === 0) resolveDone();
        else rejectDone(new Error(
          `ffmpeg exited with code ${code}.\n` +
          ffmpegStderr.split('\n').slice(-12).join('\n')
        ));
      });
    });

    const totalMs = Date.now() - startMs;
    onProgress({
      type: 'done',
      output: outputPath,
      totalFrames,
      totalMs,
    });

    return outputPath;
  } finally {
    if (ff && !ff.killed) ff.kill('SIGKILL');
    if (browser) await browser.close().catch(() => {});
    if (ownVite) await ownVite.close().catch(() => {});
  }
}

function safeName(name) {
  return String(name || 'scene').replace(/[^a-z0-9_-]+/gi, '-');
}

class AbortError extends Error {
  constructor() { super('Export aborted'); this.name = 'AbortError'; }
}

function abortable(signal) {
  if (signal?.aborted) throw new AbortError();
}

export { AbortError };
