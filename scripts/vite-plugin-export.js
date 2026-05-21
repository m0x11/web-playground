// Vite plugin: in-GUI export endpoint.
//
// Mounts /__export — POST receives { scene, options }, streams NDJSON
// progress events back, ends with a final 'done' or 'error' event. The
// client (src/gui/export-modal.js) reads it via fetch + ReadableStream.
//
// Also mounts /__reveal — POST { path } → spawn `open -R <path>` to show
// the file in Finder. Personal-tool QoL, no security gating beyond
// confining paths to the project root.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { exportScene, PROJECT_ROOT, AbortError } from './exporter.js';

export function exportPlugin() {
  return {
    name: 'web-playground-export',
    configureServer(server) {
      server.middlewares.use('/__export', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        await handleExport(req, res, server);
      });
      server.middlewares.use('/__reveal', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        await handleReveal(req, res);
      });
    },
  };
}

async function handleExport(req, res, server) {
  const ctrl = new AbortController();
  // Detect client disconnect via the RESPONSE stream — req.on('close') fires
  // too eagerly (Connect/Node may close the request stream after parsing the
  // body, even though the underlying socket stays open for the response).
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort();
  });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const emit = e => {
    if (!res.writableEnded) res.write(JSON.stringify(e) + '\n');
  };

  let body;
  try {
    body = JSON.parse((await readBody(req)).toString('utf-8'));
  } catch (err) {
    emit({ type: 'error', message: `Bad request body: ${err.message}` });
    res.end();
    return;
  }

  const viteUrl = server.resolvedUrls?.local?.[0]
    ?? `http://localhost:${server.config.server.port}`;

  try {
    await exportScene({
      sceneJson: body.scene,
      options: body.options ?? {},
      viteUrl,
      onProgress: emit,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err instanceof AbortError) emit({ type: 'aborted' });
    else emit({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
}

async function handleReveal(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString('utf-8'));
  } catch {
    res.writeHead(400); res.end('bad json'); return;
  }
  const requested = body.path;
  if (typeof requested !== 'string' || !requested) {
    res.writeHead(400); res.end('missing path'); return;
  }
  const abs = resolve(PROJECT_ROOT, requested);
  if (!abs.startsWith(PROJECT_ROOT)) {
    res.writeHead(403); res.end('path outside project'); return;
  }
  // -R reveals; if it fails (e.g. file missing) `open` itself reports.
  const action = body.action === 'open' ? [] : ['-R'];
  const p = spawn('open', [...action, abs], { detached: true, stdio: 'ignore' });
  p.on('error', () => {});
  p.unref();
  res.writeHead(204); res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
