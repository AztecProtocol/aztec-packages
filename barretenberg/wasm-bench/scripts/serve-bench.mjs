#!/usr/bin/env node
/** Static server for the COOP/COEP bench page, pinned inputs, CRS, results, and traces. */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, '..');
const repoRoot = resolve(appRoot, '../..');
const distRoot = resolve(appRoot, 'dest');
const defaultInputsRoot = resolve(repoRoot, 'yarn-project/end-to-end/example-app-ivc-inputs-out');

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const nxt = process.argv[i + 1];
  if (nxt && !nxt.startsWith('--')) {
    args.set(k, nxt);
    i++;
  } else {
    args.set(k, 'true');
  }
}

const port = Number(args.get('port') ?? process.env.PORT ?? '8089');
const inputsRoot = resolve(args.get('inputs-dir') ?? defaultInputsRoot);
const crsRoot = resolve(args.get('crs-dir') ?? process.env.BB_CRS_PATH ?? join(homedir(), '.bb-crs'));
const resultsFile = resolve(args.get('results-file') ?? '/tmp/wasm-bench-results.jsonl');
const progressFile = resolve(args.get('progress-file') ?? '/tmp/wasm-bench-progress.jsonl');
const traceDir = resolve(args.get('trace-dir') ?? '/tmp/wasm-bench-traces');
const httpsKey = args.get('https-key');
const httpsCert = args.get('https-cert');

if (args.has('download-pinned')) {
  const script = resolve(repoRoot, 'barretenberg/cpp/scripts/chonk_inputs.sh');
  const r = spawnSync(script, ['download'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

await mkdir(inputsRoot, { recursive: true });
await mkdir(traceDir, { recursive: true });

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.gz', 'application/gzip'],
  ['.msgpack', 'application/octet-stream'],
  ['.map', 'application/json; charset=utf-8'],
]);

function sendHeaders(res, status, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'cross-origin',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
}

function sendJson(res, value) {
  sendHeaders(res, 200, 'application/json; charset=utf-8');
  res.end(JSON.stringify(value, null, 2));
}

function safeResolve(root, rel) {
  const out = resolve(root, normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (out !== root && !out.startsWith(root + sep)) return null;
  return out;
}

function logAsset(req, status, bytes, startedAt, extra = {}) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const parts = [
    `method=${req.method ?? 'GET'}`,
    `path=${url.pathname}`,
    `status=${status}`,
    `bytes=${bytes}`,
    `ms=${Date.now() - startedAt}`,
  ];
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== '') parts.push(`${key}=${value}`);
  }
  console.log(`WASM_BENCH_ASSET ${parts.join(' ')}`);
}

function serveFile(req, res, path) {
  const startedAt = Date.now();
  if (!existsSync(path) || !statSync(path).isFile()) {
    sendHeaders(res, 404);
    res.end('not found');
    logAsset(req, 404, 0, startedAt);
    return;
  }
  const stat = statSync(path);
  const isGzippedWasm = path.endsWith('.wasm.gz');
  const contentType = isGzippedWasm ? 'application/wasm' : types.get(extname(path)) ?? 'application/octet-stream';
  const encodingHeader = isGzippedWasm ? { 'content-encoding': 'gzip' } : {};
  const range = req.headers.range;
  if (typeof range === 'string') {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (m) {
      const start = Number(m[1]);
      const requestedEnd = m[2] ? Number(m[2]) : stat.size - 1;
      const end = Math.min(requestedEnd, stat.size - 1);
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end && start < stat.size) {
        res.writeHead(206, {
          'content-type': contentType,
          ...encodingHeader,
          'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${stat.size}`,
          'accept-ranges': 'bytes',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
          'cross-origin-resource-policy': 'cross-origin',
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        });
        res.once('finish', () => logAsset(req, 206, end - start + 1, startedAt, { range: `${start}-${end}` }));
        createReadStream(path, { start, end }).pipe(res);
        return;
      }
    }
    sendHeaders(res, 416, contentType);
    res.end('range not satisfiable');
    logAsset(req, 416, 0, startedAt);
    return;
  }
  res.writeHead(200, {
    'content-type': contentType,
    ...encodingHeader,
    'content-length': String(stat.size),
    'accept-ranges': 'bytes',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'cross-origin',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.once('finish', () => logAsset(req, 200, stat.size, startedAt));
  createReadStream(path).pipe(res);
}

function crsFile(name) {
  const path = safeResolve(crsRoot, name);
  if (!path || !existsSync(path) || !statSync(path).isFile()) return null;
  return { name, path, size: statSync(path).size };
}

function crsIndex() {
  const g1Compressed = crsFile('bn254_g1_compressed.dat');
  const g1Uncompressed = crsFile('bn254_g1.dat');
  const g2 = crsFile('bn254_g2.dat');
  const grumpkin = crsFile('grumpkin_g1.flat.dat');
  const g1 = g1Uncompressed
    ? { ...g1Uncompressed, bytesPerPoint: 64 }
    : g1Compressed
      ? { ...g1Compressed, bytesPerPoint: 32 }
      : null;
  if (!g1 || !g2 || !grumpkin) return null;
  return {
    root: crsRoot,
    g1: { path: `/crs/${g1.name}`, bytesPerPoint: g1.bytesPerPoint, size: g1.size },
    g2: { path: `/crs/${g2.name}`, size: g2.size },
    grumpkinG1: { path: `/crs/${grumpkin.name}`, bytesPerPoint: 64, size: grumpkin.size },
  };
}

let traceSeq = 0;

const handler = (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'POST' && url.pathname === '/results') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        await appendFile(resultsFile, `${JSON.stringify(parsed)}\n`);
        sendJson(res, { ok: true });
      } catch (e) {
        sendHeaders(res, 400);
        res.end(e instanceof Error ? e.message : String(e));
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/progress') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        await appendFile(progressFile, `${JSON.stringify(parsed)}\n`);
        sendJson(res, { ok: true });
      } catch (e) {
        sendHeaders(res, 400);
        res.end(e instanceof Error ? e.message : String(e));
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/caps') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        await writeFile('/tmp/wasm-bench-caps.json', body);
        sendJson(res, { ok: true });
      } catch (e) {
        sendHeaders(res, 400);
        res.end(e instanceof Error ? e.message : String(e));
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/trace') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const seq = ++traceSeq;
        const out = resolve(traceDir, `trace-${parsed.flow ?? 'unknown'}-${parsed.run ?? seq}.perfetto.json`);
        await writeFile(out, parsed.trace ?? '');
        sendJson(res, { ok: true, path: out });
      } catch (e) {
        sendHeaders(res, 400);
        res.end(e instanceof Error ? e.message : String(e));
      }
    });
    return;
  }

  if (url.pathname === '/inputs/index.json') {
    const flows = readdirSync(inputsRoot)
      .filter((n) => existsSync(join(inputsRoot, n, 'ivc-inputs.msgpack')))
      .sort();
    sendJson(res, { flows });
    return;
  }

  if (url.pathname.startsWith('/inputs/')) {
    const rel = decodeURIComponent(url.pathname.slice('/inputs/'.length));
    const path = safeResolve(inputsRoot, rel);
    if (!path) {
      sendHeaders(res, 400);
      res.end('bad path');
      return;
    }
    serveFile(req, res, path);
    return;
  }

  if (url.pathname === '/crs/index.json') {
    const index = crsIndex();
    if (!index) {
      sendHeaders(res, 404);
      res.end(`CRS files missing under ${crsRoot}`);
      return;
    }
    sendJson(res, index);
    return;
  }

  if (url.pathname.startsWith('/crs/')) {
    const rel = decodeURIComponent(url.pathname.slice('/crs/'.length));
    const path = safeResolve(crsRoot, rel);
    if (!path) {
      sendHeaders(res, 400);
      res.end('bad path');
      return;
    }
    serveFile(req, res, path);
    return;
  }

  const path = safeResolve(distRoot, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  serveFile(req, res, path ?? join(distRoot, 'index.html'));
};

const server = httpsKey && httpsCert
  ? createHttpsServer({ key: readFileSync(httpsKey), cert: readFileSync(httpsCert) }, handler)
  : createHttpServer(handler);
const protocol = httpsKey && httpsCert ? 'https' : 'http';

server.listen(port, '127.0.0.1', () => {
  console.log(`wasm-bench server listening on ${protocol}://127.0.0.1:${port}`);
  console.log(`inputs root:  ${inputsRoot}`);
  console.log(`crs root:     ${crsRoot}`);
  console.log(`results file:  ${resultsFile}`);
  console.log(`progress file: ${progressFile}`);
  console.log(`trace dir:     ${traceDir}`);
});
