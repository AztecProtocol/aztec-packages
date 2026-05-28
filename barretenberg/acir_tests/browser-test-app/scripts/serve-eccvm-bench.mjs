#!/usr/bin/env node
import { createServer } from 'node:http';
import { appendFileSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}

const port = Number(args.get('--port') ?? process.env.PORT ?? 8080);
const root = resolve(args.get('--root') ?? 'dest');
const resultsFile = args.get('--results-file') ?? '/tmp/eccvm-browserstack-results.jsonl';
const progressFile = args.get('--progress-file') ?? '/tmp/eccvm-browserstack-progress.jsonl';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.gz', 'application/gzip'],
  ['.json', 'application/json; charset=utf-8'],
]);

function headers(contentType = 'text/plain; charset=utf-8') {
  return {
    'content-type': contentType,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function appendJsonl(file, rawBody) {
  const parsed = rawBody ? JSON.parse(rawBody) : {};
  appendFileSync(file, JSON.stringify({ receivedAt: new Date().toISOString(), ...parsed }) + '\n');
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers());
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, headers('application/json; charset=utf-8'));
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/results' || url.pathname === '/progress')) {
      appendJsonl(url.pathname === '/results' ? resultsFile : progressFile, await readBody(req));
      res.writeHead(200, headers('application/json; charset=utf-8'));
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, headers());
      res.end('method not allowed');
      return;
    }

    const requested = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const file = resolve(join(root, requested));
    if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, headers());
      res.end('not found');
      return;
    }

    res.writeHead(200, headers(contentTypes.get(extname(file)) ?? 'application/octet-stream'));
    createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500, headers());
    res.end(err?.stack ?? String(err));
  }
});

server.listen(port, () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`);
  console.log(`results: ${resultsFile}`);
  console.log(`progress: ${progressFile}`);
});
