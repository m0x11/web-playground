// CLI entry point. Thin arg-parser around scripts/exporter.js.
//
// Usage:
//   npm run export -- --scene scenes/foo.json
//   npm run export -- --scene scenes/foo.json --width 1920 --height 1080 --fps 60
//   npm run export -- --scene scenes/foo.json --headed       (debug: show browser)

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { exportScene } from './exporter.js';

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
        if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); printUsage(); process.exit(1); }
        if (!out.scene) out.scene = a;
    }
  }
  if (!out.scene) {
    console.error('Error: --scene is required'); printUsage(); process.exit(1);
  }
  return out;
}

function printUsage() {
  console.log(`
Usage: npm run export -- --scene <path.json> [options]

Required:
  --scene <path>     Scene .json file to export

Options:
  --output <path>    Output MP4 path (default: exports/<scene-name>.mp4)
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

async function main() {
  const args = parseArgs(process.argv);

  const scenePath = resolve(args.scene);
  if (!existsSync(scenePath)) {
    console.error(`Scene file not found: ${scenePath}`); process.exit(1);
  }
  const sceneJson = JSON.parse(readFileSync(scenePath, 'utf-8'));
  const output = args.output ?? `exports/${basename(scenePath, '.json')}.mp4`;

  console.log(`▸ scene:    ${scenePath}`);
  console.log(`▸ output:   ${resolve(output)}`);
  console.log(`▸ viewport: ${args.width}×${args.height} @ ${args.fps} fps`);

  let totalFrames = 0;
  let lastReport = 0;

  await exportScene({
    sceneJson,
    options: {
      width: args.width, height: args.height, fps: args.fps,
      duration: args.duration ?? undefined,
      output,
      crf: args.crf, preset: args.preset, headed: args.headed,
    },
    onProgress: e => {
      if (e.type === 'start') {
        totalFrames = e.totalFrames;
        console.log(`▸ duration: ${e.duration.toFixed(3)}s · ${totalFrames} frames\n`);
      } else if (e.type === 'frame') {
        const now = Date.now();
        if (now - lastReport > 200 || e.n === totalFrames) {
          const pct = (e.n / totalFrames * 100).toFixed(1);
          process.stdout.write(`\r  ${e.n}/${totalFrames} (${pct}%) · ${e.fps.toFixed(1)} fps · ${e.elapsed.toFixed(1)}s`);
          lastReport = now;
        }
      } else if (e.type === 'transcoding') {
        process.stdout.write(`\n  transcoding ${e.file}…`);
      } else if (e.type === 'encoding') {
        process.stdout.write('\n  finalizing…');
      } else if (e.type === 'done') {
        console.log(`\n\n✓ ${e.output}`);
        console.log(`  ${e.totalFrames} frames in ${(e.totalMs / 1000).toFixed(1)}s ` +
                    `(${(e.totalFrames / (e.totalMs / 1000)).toFixed(1)} fps avg)`);
      }
    },
  });
}

main().catch(err => {
  console.error('\n✗ Export failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
