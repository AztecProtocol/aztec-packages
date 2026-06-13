// Standalone HTTP server that serves the webpack ChonkApi::prove bundle
// (dist/) + the pinned ivc-inputs.msgpack with the COOP/COEP/CORP headers
// SharedArrayBuffer (multi-threaded WASM) requires. Unlike the Puppeteer
// harness in src/chonk_browser_webgpu_bench.test.ts, this is a long-running
// server bound to all interfaces so an external device (e.g. an S25+ over
// `adb reverse tcp:PORT tcp:PORT`, or the LAN) can load the page itself.
//
// The served page has no `#status` div, so src/serve.ts runs its autorun
// dispatcher: load `http://<host>:PORT/?autorun=chonk-on` to fire an on-only
// GPU prove with no interaction, or `?autorun=chonk-webgpu` for the full
// off+on vks_match bench. Terminal result is a `[CHONK-RESULT] {json}` console
// line + document.title sentinel (CHONK-DONE-OK / -FAIL / CHONK-ERROR).
//
// Usage:
//   node serve-phone.mjs                 # PORT=5300, binds 0.0.0.0
//   PORT=5301 node serve-phone.mjs
import { existsSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, 'dist');
const pinnedInputsRoot = join(__dirname, '..', 'end-to-end', 'example-app-ivc-inputs-out');

const PORT = parseInt(process.env.PORT ?? '5300', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const CONTENT_TYPES = {
  js: 'application/javascript; charset=utf-8',
  wasm: 'application/wasm',
  json: 'application/json',
  css: 'text/css',
  html: 'text/html; charset=utf-8',
};

// A minimal page that loads the webpack bundle. No `#status` div → serve.ts's
// autorun + console-mirroring UI path runs (the query string drives the prove).
function pageHtml() {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>CHONK-IDLE</title></head>
<body>
  <h1>Chonk WebGPU MSM — ChonkApi::prove</h1>
  <p>Append <code>?autorun=chonk-on</code> (smoke) or <code>?autorun=chonk-webgpu</code> (off+on vks_match) to run.</p>
  <script src="index.js"></script>
</body>
</html>`;
}

const server = createServer((req, res) => {
  // SharedArrayBuffer requires cross-origin isolation.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-store');

  // URL minus query string for routing; serve.ts reads the query itself.
  const url = (req.url ?? '/').split('?')[0];

  if (url === '/' || url === '/index.html' || url === '/test.html') {
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES.html });
    res.end(pageHtml());
    return;
  }

  if (url.startsWith('/ivc-inputs/') && url.endsWith('.msgpack')) {
    const flowName = url.slice('/ivc-inputs/'.length, -'.msgpack'.length);
    const filePath = join(pinnedInputsRoot, flowName, 'ivc-inputs.msgpack');
    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': content.length });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end(`Pinned inputs not found for flow '${flowName}' at ${filePath}`);
    }
    return;
  }

  const filePath = join(distPath, url);
  try {
    if (existsSync(filePath) && !filePath.endsWith('/')) {
      const content = readFileSync(filePath);
      const ext = filePath.split('.').pop() || '';
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Content-Length': content.length,
      });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not found: ' + url);
    }
  } catch (error) {
    res.writeHead(500);
    res.end('Server error: ' + error.message);
  }
});

server.listen(PORT, HOST, () => {
  if (!existsSync(join(distPath, 'index.js'))) {
    console.warn(`[serve-phone] WARNING: ${join(distPath, 'index.js')} missing — run \`yarn webpack\` first.`);
  }
  console.log(`[serve-phone] listening on http://${HOST}:${PORT}`);
  console.log(`[serve-phone]   phone (adb reverse tcp:${PORT} tcp:${PORT}): http://localhost:${PORT}/?autorun=chonk-on`);
  console.log(`[serve-phone]   smoke (on-only):  /?autorun=chonk-on`);
  console.log(`[serve-phone]   full  (off+on):   /?autorun=chonk-webgpu`);
});
