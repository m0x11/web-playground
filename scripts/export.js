// 4K-capable offline exporter.
//
// Programmatically starts a Vite server, launches headless Chromium via
// Playwright at the requested viewport, steps the scene's timeline frame by
// frame, screenshots each frame, and pipes the PNG sequence into ffmpeg →
// MP4 (libx264 / yuv420p). See RECORDING.md for the architectural rationale.
//
// Usage:
//   npm run export -- --scene scenes/foo.json
//   npm run export -- --scene scenes/foo.json --width 1920 --height 1080 --fps 60 --output foo.mp4
//   npm run export -- --scene scenes/foo.json --headed     (debug: show browser)

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    scene: null,
    output: null,
    fps: 30,
    width: 3840,
    height: 2160,
    duration: null,
    headed: false,
    crf: 18,
    preset: 'fast',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--scene':    out.scene = next(); break;
      case '--output':   out.output = next(); break;
      case '--fps':      out.fps = Number(next()); break;
      case '--width':    out.width = Number(next()); break;
      case '--height':   out.height = Number(next()); break;
      case '--duration': out.duration = Number(next()); break;
      case '--headed':   out.headed = true; break;
      case '--crf':      out.crf = Number(next()); break;
      case '--preset':   out.preset = next(); break;
      case '--help': case '-h':
        printUsage(); process.exit(0);
      default:
        if (a.startsWith('--')) {
          console.error(`Unknown option: ${a}`); printUsage(); process.exit(1);
        }
        if (!out.scene) out.scene = a;
    }
  }
  if (!out.scene) {
    console.error('Error: --scene is required');
    printUsage(); process.exit(1);
  }
  return out;
}

function printUsage() {
  console.log(`
Usage: npm run export -- --scene <path.json> [options]

Required:
  --scene <path>     Scene .json file to export

Options:
  --output <path>    Output MP4 path (default: <scene-name>.mp4)
  --fps <n>          Frames per second (default: 30)
  --width <n>        Viewport width (default: 3840)
  --height <n>       Viewport height (default: 2160)
  --duration <s>     Override scene duration in seconds
  --crf <n>          ffmpeg x264 CRF (default: 18, visually lossless)
  --preset <s>       ffmpeg x264 preset (default: fast)
  --headed           Show the browser (debugging)
  --help, -h         This message
`);
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  const scenePath = resolve(args.scene);
  if (!existsSync(scenePath)) {
    console.error(`Scene file not found: ${scenePath}`);
    process.exit(1);
  }
  const sceneJson = JSON.parse(readFileSync(scenePath, 'utf-8'));

  const outputPath = resolve(
    args.output ?? `${basename(scenePath, '.json')}.mp4`
  );
  mkdirSync(dirname(outputPath), { recursive: true });

  console.log(`▸ scene:    ${scenePath}`);
  console.log(`▸ output:   ${outputPath}`);
  console.log(`▸ viewport: ${args.width}×${args.height} @ ${args.fps} fps`);

  // 1. Start Vite programmatically so the page loads with full module support.
  const vite = await createServer({
    root: PROJECT_ROOT,
    server: { port: 0 },
    clearScreen: false,
    logLevel: 'warn',
  });
  await vite.listen();
  const viteUrl = vite.resolvedUrls?.local?.[0] ?? `http://localhost:${vite.config.server.port}`;

  // 2. Launch Chromium at the target viewport.
  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', err => console.error('[page error]', err.message));
  page.on('console',  msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.error(`[browser ${msg.type()}]`, msg.text());
    }
  });

  await page.goto(viteUrl);
  await page.waitForFunction(() => typeof window.__scene === 'object' && window.__scene !== null);

  // 3. Load our scene + hide GUI + await assets.
  await page.evaluate(s => window.__scene.loadScene(s), sceneJson);
  await page.evaluate(() => window.__scene.hideGUI());
  await page.evaluate(() => window.__scene.ready());

  // 4. Determine frame count.
  const duration = args.duration ?? (await page.evaluate(() => window.__scene.duration()));
  if (duration <= 0) {
    console.error(`Scene has duration 0 — nothing to export. Add animations or pass --duration.`);
    await browser.close(); await vite.close();
    process.exit(1);
  }
  const totalFrames = Math.max(1, Math.round(duration * args.fps));
  console.log(`▸ duration: ${duration.toFixed(3)}s · ${totalFrames} frames\n`);

  // 5. Spawn ffmpeg with image2pipe stdin.
  const ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(args.fps),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(args.crf),
    '-preset', args.preset,
    '-movflags', '+faststart',
    outputPath,
  ];
  const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'pipe'] });
  let ffmpegStderr = '';
  ff.stderr.on('data', chunk => { ffmpegStderr += chunk.toString(); });
  ff.on('error', err => {
    if (err.code === 'ENOENT') {
      console.error('\nffmpeg not found. Install with: brew install ffmpeg');
    }
  });

  // 6. Frame loop. setTime → wait paint → screenshot → pipe.
  const startMs = Date.now();
  let lastReport = 0;
  for (let n = 0; n < totalFrames; n++) {
    const t = n / args.fps;
    await page.evaluate(time => window.__scene.setTime(time), t);
    await page.evaluate(() => window.__scene.framePainted());
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: args.width, height: args.height },
    });
    const ok = ff.stdin.write(png);
    if (!ok) await new Promise(r => ff.stdin.once('drain', r));

    const now = Date.now();
    if (now - lastReport > 200 || n === totalFrames - 1) {
      const pct = ((n + 1) / totalFrames * 100).toFixed(1);
      const elapsed = (now - startMs) / 1000;
      const fps = (n + 1) / elapsed;
      process.stdout.write(`\r  ${n + 1}/${totalFrames} (${pct}%) · ${fps.toFixed(1)} fps · ${elapsed.toFixed(1)}s`);
      lastReport = now;
    }
  }
  process.stdout.write('\n');

  // 7. Close ffmpeg + browser + vite.
  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on('close', code => {
      if (code === 0) resolve();
      else {
        console.error(ffmpegStderr.split('\n').slice(-20).join('\n'));
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

  await browser.close();
  await vite.close();

  const totalMs = Date.now() - startMs;
  console.log(`\n✓ ${outputPath}`);
  console.log(`  ${totalFrames} frames in ${(totalMs / 1000).toFixed(1)}s ` +
              `(${(totalFrames / (totalMs / 1000)).toFixed(1)} fps avg)`);
}

main().catch(err => {
  console.error('\n✗ Export failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
