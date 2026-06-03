#!/usr/bin/env node
// Static-file HTTP server for the interactive Chonk-webgpu benchmark page.
//
// Serves:
//   /            and /index.html  → dist/index.html (HtmlWebpackPlugin output)
//   /index.js, /*.chunk.js, ...   → dist/<file>     (the webpack bundle)
//   /ivc-inputs/<flow>.msgpack    → ../end-to-end/example-app-ivc-inputs-out/<flow>/ivc-inputs.msgpack
//
// Cross-origin isolation (COOP / COEP / CORP) headers are set on every
// response so SharedArrayBuffer is available — the multi-threaded WASM
// build requires it. The Puppeteer tests use the exact same headers; this
// script is a standalone equivalent so you can open the page in a real
// browser to drive the bench manually (the Puppeteer harness can't see a
// hardware GPU on machines that have one, since headless Chrome picks
// SwiftShader; the standalone page picks the real adapter).
//
// Usage from yarn-project/ivc-integration:
//   yarn webpack                       # one-time, after C++ / TS changes
//   yarn serve:chonk-webgpu            # default port 8080
//   yarn serve:chonk-webgpu --port 8765
//
// Then open http://localhost:8080/ in Chromium / Chrome / Brave with
// hardware WebGPU available. Apple Safari has no WebGPU shipped yet (as
// of 2026-05); use Chrome with `chrome://flags/#enable-unsafe-webgpu`
// enabled on macOS.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const distPath = join(projectRoot, 'dist');
const pinnedInputsRoot = join(projectRoot, '..', 'end-to-end', 'example-app-ivc-inputs-out');

const { values: argv } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '8080' },
    host: { type: 'string', default: '127.0.0.1' },
  },
});

const port = parseInt(argv.port, 10);
const host = argv.host;

// JSONL sinks for the headless autorun protocol (see serve.ts maybeAutorunChonkBench).
// The page POSTs one progress heartbeat per phase and a single final result row; the
// BrowserStack runner tails these files. Paths come from env so the runner can isolate
// each device's run; defaults keep manual `node serve-chonk-webgpu.mjs` runs working.
const progressFile = process.env.CHONK_PROGRESS_FILE ?? '/tmp/zac-webgpu/chonk-bs-progress.jsonl';
const resultsFile = process.env.CHONK_RESULTS_FILE ?? '/tmp/zac-webgpu/chonk-bs-results.jsonl';

// Append one already-serialized JSON object as a JSONL line. Body is the raw POST
// payload (already carries runId/ts), so we append it verbatim with a trailing newline.
function appendJsonl(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, body.endsWith('\n') ? body : body + '\n');
}

// Collect a POST body (bounded) then hand it to `onEnd`. Mirrors the /msm-phase sink.
function collectBody(req, res, maxBytes, onEnd) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    body += chunk;
    if (body.length > maxBytes) {
      res.writeHead(413);
      res.end('payload too large');
      req.destroy();
    }
  });
  req.on('end', () => onEnd(body));
}

if (!existsSync(join(distPath, 'index.html'))) {
  console.error(`error: ${distPath}/index.html not found. Run \`yarn webpack\` first.`);
  process.exit(1);
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.msgpack': 'application/octet-stream',
  '.gz': 'application/gzip',
};

function setCommonHeaders(res) {
  // Cross-origin isolation for SharedArrayBuffer (required for multi-threaded
  // WASM). The bb.js worker bootstrap fails without these.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // No-cache so re-running `yarn webpack` and refreshing the page picks up
  // the new bundle without the browser holding onto stale chunks.
  res.setHeader('Cache-Control', 'no-store');
}

function serveFile(res, filePath) {
  const stat = statSync(filePath);
  const body = readFileSync(filePath);
  const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
  });
  res.end(body);
}

const server = createServer((req, res) => {
  setCommonHeaders(res);
  const url = req.url ?? '/';
  const reqStart = Date.now();
  res.on('finish', () => {
    process.stdout.write(`  ${res.statusCode} ${req.method} ${url}  (${Date.now() - reqStart} ms)\n`);
  });

  // Headless autorun progress heartbeat sink. One small JSON row per phase, appended
  // as JSONL to CHONK_PROGRESS_FILE. The runner tails this to detect the runId and to
  // keep its first-progress / stall watchdogs satisfied during a long prove.
  if (req.method === 'POST' && url.split('?')[0] === '/progress') {
    collectBody(req, res, 64 * 1024, body => {
      try {
        appendJsonl(progressFile, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e));
      }
    });
    return;
  }

  // Headless autorun final-result sink. One JSON row per run (state=done|error with the
  // normalised off/on metrics), appended as JSONL to CHONK_RESULTS_FILE. Its appearance
  // is the runner's completion signal.
  if (req.method === 'POST' && url.split('?')[0] === '/results') {
    collectBody(req, res, 4 * 1024 * 1024, body => {
      try {
        appendJsonl(resultsFile, body);
        process.stdout.write(`  saved chonk autorun result: ${body.length} bytes → ${resultsFile}\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: body.length, path: resultsFile }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e));
      }
    });
    return;
  }

  // GPU MSM phase-breakdown sink: the page POSTs the aggregated prepare-vs-GPU-
  // compute breakdown (JSON) here. Default sink is /tmp/zac-webgpu/chonk-msm-phase.json;
  // an optional ?name=<file>.json picks the output basename so the solo and batch
  // runs don't clobber each other.
  if (req.method === 'POST' && url.split('?')[0] === '/msm-phase') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
        res.writeHead(413);
        res.end('payload too large');
        req.destroy();
      }
    });
    const phaseNameParam = new URL(url, 'http://localhost').searchParams.get('name');
    const phaseSafeName =
      phaseNameParam && /^[\w.-]+\.json$/.test(phaseNameParam) ? phaseNameParam : 'chonk-msm-phase.json';
    req.on('end', () => {
      try {
        const outDir = '/tmp/zac-webgpu';
        mkdirSync(outDir, { recursive: true });
        const outFile = join(outDir, phaseSafeName);
        writeFileSync(outFile, body);
        process.stdout.write(`  saved GPU phase breakdown: ${body.length} bytes → ${outFile}\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: body.length, path: outFile }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e));
      }
    });
    return;
  }

  // Per-MSM CSV sink: the page POSTs the runChonkMsmCsv output here so it
  // lands on this host for report generation (avoids copy-pasting hundreds of
  // rows). Written to /tmp/zac-webgpu/chonk-msm-metal.csv.
  if (req.method === 'POST' && url.split('?')[0] === '/msm-csv') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16 * 1024 * 1024) {
        res.writeHead(413);
        res.end('payload too large');
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const outDir = '/tmp/zac-webgpu';
        mkdirSync(outDir, { recursive: true });
        const outFile = join(outDir, 'chonk-msm-metal.csv');
        writeFileSync(outFile, body);
        process.stdout.write(`  saved per-MSM CSV: ${body.length} bytes → ${outFile}\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: body.length, path: outFile }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e));
      }
    });
    return;
  }

  // Perfetto trace sink: the page POSTs the aligned CPU+GPU Chrome Trace Event
  // JSON (built from the WebGPU bridge's per-batch spans) here. Written to
  // /tmp/zac-webgpu/chonk-trace.json — open it directly in ui.perfetto.dev.
  if (req.method === 'POST' && url.split('?')[0] === '/msm-trace') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 128 * 1024 * 1024) {
        res.writeHead(413);
        res.end('payload too large');
        req.destroy();
      }
    });
    // Optional ?name=<file>.json picks the output filename so the WASM and
    // WebGPU traces don't clobber each other. Sanitised to a bare basename.
    const nameParam = new URL(url, 'http://localhost').searchParams.get('name');
    const safeName = nameParam && /^[\w.-]+\.json$/.test(nameParam) ? nameParam : 'chonk-trace.json';
    req.on('end', () => {
      try {
        const outDir = '/tmp/zac-webgpu';
        mkdirSync(outDir, { recursive: true });
        const outFile = join(outDir, safeName);
        writeFileSync(outFile, body);
        process.stdout.write(`  saved Perfetto trace: ${body.length} bytes → ${outFile}\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: body.length, path: outFile }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e));
      }
    });
    return;
  }

  // Root → index.html. Strip the query string first so the autorun URL
  // (/?autorun=chonk-bench&…) still resolves to the page.
  const pathOnly = url.split('?')[0];
  if (pathOnly === '/' || pathOnly === '/index.html') {
    serveFile(res, join(distPath, 'index.html'));
    return;
  }

  // Pinned IVC inputs proxied from yarn-project/end-to-end/...
  if (url.startsWith('/ivc-inputs/') && url.endsWith('.msgpack')) {
    // Real browsers URL-encode `+` in path components to `%2B` even though
    // it's RFC-3986-legal there, so decodeURIComponent before the directory
    // lookup. Puppeteer happens not to encode it which is why the test
    // harness's identical-shape createServer never tripped on this.
    const flowName = decodeURIComponent(url.slice('/ivc-inputs/'.length, -'.msgpack'.length));
    const filePath = join(pinnedInputsRoot, flowName, 'ivc-inputs.msgpack');
    if (existsSync(filePath)) {
      serveFile(res, filePath);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(
        `pinned inputs not found for flow="${flowName}"\n` +
          `expected at ${filePath}\n` +
          `run \`barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs\` to populate.`,
      );
    }
    return;
  }

  // Otherwise serve from dist/.
  // Strip any leading `/` and reject parent-dir traversal.
  const safeUrl = url.split('?')[0].replace(/^\/+/, '');
  if (safeUrl.includes('..')) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  const filePath = join(distPath, safeUrl);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(`404: not found (${url})\n`);
});

server.listen(port, host, () => {
  console.log(`chonk-webgpu page listening on http://${host}:${port}/`);
  console.log(`  dist:          ${distPath}`);
  console.log(`  pinned inputs: ${pinnedInputsRoot}`);
  console.log(`  progress sink: ${progressFile}`);
  console.log(`  results sink:  ${resultsFile}`);
  console.log('');
  console.log('Open the URL above in Chrome / Chromium (WebGPU enabled).');
  console.log('Press Ctrl+C to stop.');
});

// Graceful shutdown for SIGINT / SIGTERM so the port is released cleanly
// when the user hits Ctrl+C.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} — closing.`);
    server.close(() => process.exit(0));
    // Force-exit after 2s if connections refuse to close.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
