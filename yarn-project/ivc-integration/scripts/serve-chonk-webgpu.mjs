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

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
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

  // Root → index.html.
  if (url === '/' || url === '/index.html') {
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
