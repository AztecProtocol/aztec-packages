import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';

import {
  defaultDistDir,
  defaultInputsDir,
  parsePositiveInteger,
  safeResolve,
} from './lib.mjs';

const CRS_PRIMARY_HOST = 'https://crs.aztec-cdn.foundation';
const CRS_FALLBACK_HOST = 'https://crs.aztec-labs.com';
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.msgpack', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
  ['.gz', 'application/gzip'],
]);

function setSharedHeaders(response, { cache = 'no-store' } = {}) {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Cache-Control', cache);
}

function send(response, status, body, headers = {}, sharedOpts = {}) {
  setSharedHeaders(response, sharedOpts);
  response.writeHead(status, headers);
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8' });
}

function sendError(response, status, error) {
  sendJson(response, status, { ok: false, error: error?.message ?? String(error) });
}

async function appendJsonl(path, body) {
  if (!path) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ receivedAt: new Date().toISOString(), ...body })}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function fetchWithFallback(primaryUrl, fallbackUrl, options) {
  try {
    const response = await fetch(primaryUrl, options);
    if (response.ok || response.status === 206) {
      return response;
    }
    throw new Error(`HTTP ${response.status}`);
  } catch {
    const fallback = await fetch(fallbackUrl, options);
    if (fallback.ok || fallback.status === 206) {
      return fallback;
    }
    throw new Error(`Failed CRS fetch: ${primaryUrl} and ${fallbackUrl} returned HTTP ${fallback.status}`);
  }
}

function rangeOptions(points, bytesPerPoint) {
  const count = parsePositiveInteger(points, 'points');
  return { headers: { Range: `bytes=0-${count * bytesPerPoint - 1}` } };
}

async function proxyCrs(response, pathname, searchParams) {
  let fileName;
  let options = {};
  if (pathname === '/crs/bn254-g1') {
    fileName = 'g1_compressed.dat';
    options = rangeOptions(searchParams.get('points') ?? '524288', 32);
  } else if (pathname === '/crs/bn254-g2') {
    fileName = 'g2.dat';
  } else if (pathname === '/crs/grumpkin-g1') {
    fileName = 'grumpkin_g1.dat';
    options = rangeOptions(searchParams.get('points') ?? '65536', 64);
  } else {
    return false;
  }

  const upstream = await fetchWithFallback(`${CRS_PRIMARY_HOST}/${fileName}`, `${CRS_FALLBACK_HOST}/${fileName}`, {
    ...options,
    cache: 'force-cache',
  });
  const bytes = Buffer.from(await upstream.arrayBuffer());
  send(response, 200, bytes, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(bytes.byteLength),
  }, { cache: 'public, max-age=3600' });
  return true;
}

async function listInputs(inputsDir) {
  const entries = await readdir(inputsDir, { withFileTypes: true }).catch(() => []);
  const flows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = join(inputsDir, entry.name, 'ivc-inputs.msgpack');
    if (await stat(file).then(info => info.isFile()).catch(() => false)) {
      flows.push(entry.name);
    }
  }
  return flows.sort();
}

async function serveStatic(response, root, pathname) {
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = safeResolve(root, relativePath);
  const info = await stat(filePath);
  if (!info.isFile()) {
    send(response, 404, 'not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  const isWasm = filePath.endsWith('.wasm.gz') || filePath.endsWith('.wasm');
  setSharedHeaders(response, isWasm ? { cache: 'public, max-age=3600' } : {});
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extname(filePath)) ?? contentTypes.get(extname(basename(filePath, '.gz'))) ?? 'application/octet-stream',
    'Content-Length': String(info.size),
  });
  createReadStream(filePath).pipe(response);
}

export function createBenchServer({
  root = defaultDistDir,
  inputsDir = defaultInputsDir,
  progressJsonl = '/tmp/wasm-bench-progress.jsonl',
  resultJsonl = '/tmp/wasm-bench-results.jsonl',
} = {}) {
  const staticRoot = resolve(root);
  const inputRoot = resolve(inputsDir);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, root: staticRoot, inputsDir: inputRoot });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/inputs/index.json') {
        sendJson(response, 200, { flows: await listInputs(inputRoot) });
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/inputs/') && url.pathname.endsWith('/ivc-inputs.msgpack')) {
        const flow = decodeURIComponent(url.pathname.slice('/inputs/'.length, -'/ivc-inputs.msgpack'.length));
        const filePath = safeResolve(inputRoot, `/${flow}/ivc-inputs.msgpack`);
        const body = await readFile(filePath);
        send(response, 200, body, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.byteLength) });
        return;
      }
      if (request.method === 'GET' && await proxyCrs(response, url.pathname, url.searchParams)) {
        return;
      }
      if (request.method === 'POST' && url.pathname === '/progress') {
        const body = await readJsonBody(request);
        await appendJsonl(progressJsonl, body);
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/result') {
        const body = await readJsonBody(request);
        await appendJsonl(resultJsonl, body);
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method !== 'GET') {
        send(response, 405, 'method not allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }
      await serveStatic(response, staticRoot, url.pathname);
    } catch (error) {
      sendError(response, error?.code === 'ENOENT' ? 404 : 500, error);
    }
  });
}

export async function main(argv = process.argv) {
  const program = new Command();
  program
    .option('--host <host>', 'Bind host', process.env.WASM_BENCH_HOST || '127.0.0.1')
    .option('--port <port>', 'Bind port', value => parsePositiveInteger(value, 'port'), Number(process.env.WASM_BENCH_PORT || 8090))
    .option('--root <path>', 'Built harness directory', process.env.WASM_BENCH_DIST_DIR || defaultDistDir)
    .option('--inputs-dir <path>', 'Pinned Chonk inputs directory', process.env.CHONK_PINNED_IVC_INPUTS_DIR || defaultInputsDir)
    .option('--progress-jsonl <path>', 'Progress JSONL output path', process.env.WASM_BENCH_PROGRESS_JSONL || '/tmp/wasm-bench-progress.jsonl')
    .option('--result-jsonl <path>', 'Result JSONL output path', process.env.WASM_BENCH_RESULT_JSONL || '/tmp/wasm-bench-results.jsonl')
    .parse(argv);

  const options = program.opts();
  const server = createBenchServer(options);
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port, options.host, resolveListen);
  });
  console.log(`wasm-bench serving http://${options.host}:${options.port}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
