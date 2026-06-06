import { defineConfig, type PluginOption } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createReadStream, statSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(__dirname, '../..');
const cppBuildWasmThreads = path.resolve(tsRoot, '../cpp/build-wasm-threads/bin');

// Vite middleware that serves the freshly-built WASM out of the cpp build
// tree at `/dev/msm-webgpu/barretenberg-threads.wasm.gz`. bb.js's
// `fetchCode(multithreaded=true, wasmPath)` rewrites
// `${dir}/barretenberg.wasm.gz` → `${dir}/barretenberg-threads.wasm.gz`,
// so the dev page passes `wasmPath = '/dev/msm-webgpu/barretenberg.wasm.gz'`
// and bb.js asks for the `-threads` variant served below. Avoiding a copy
// keeps the dev page tracking the cpp build automatically.
function serveBarretenbergWasm(): PluginOption {
  const wasmFile = path.join(cppBuildWasmThreads, 'barretenberg.wasm.gz');
  const servePath = '/dev/msm-webgpu/barretenberg-threads.wasm.gz';
  return {
    name: 'serve-barretenberg-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== servePath) {
          next();
          return;
        }
        if (!existsSync(wasmFile)) {
          res.statusCode = 404;
          res.end(
            `barretenberg.wasm.gz not found at ${wasmFile}. Build it first:\n` +
              `  cd barretenberg/cpp/build-wasm-threads && ninja barretenberg.wasm.gz`,
          );
          return;
        }
        const stat = statSync(wasmFile);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(wasmFile).pipe(res);
      });
    },
  };
}

// Per-request COOP/COEP middleware. We DO NOT want these headers set
// unconditionally — the comment on the original config flagged that
// they tripped CSP "blocks eval" errors in some dev-tooling paths, and
// in practice setting them broke the standalone WebGPU run (Quick
// Sanity Check crashed inside `compute_bn254_msm`). The page works fine
// without cross-origin isolation as long as we don't try to spin up
// multi-threaded WASM; only the MT pippenger path needs
// SharedArrayBuffer. The page asks for COI by appending `?coi=1` to
// the URL — see `main.ts` for the user-facing toggle.
function conditionalCoiHeaders(): PluginOption {
  return {
    name: 'conditional-coi-headers',
    configureServer(server) {
      // We can't tell "this request came from a page in COI mode" purely
      // from the request URL — the worker module fetches under
      // `/src/...` won't carry `?coi=1` even when the document does.
      // The pragmatic trade-off is to set CORP on every response and
      // COOP/COEP only on requests that opted in. CORP=same-origin
      // is harmless when COI is off (it just keeps the asset accessible
      // to same-origin code, which is what we want regardless).
      server.middlewares.use((req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        // Worker/SharedWorker requests don't carry `?coi=1` in their URL
        // (only the parent document does). But the spec requires that when
        // the parent has COEP=require-corp, the worker response also has
        // COEP=require-corp — otherwise worker creation fails with an
        // opaque error event. Detect worker requests via Sec-Fetch-Dest
        // and attach COEP to them unconditionally so a COI'd document can
        // actually spin up its workers.
        const dest = req.headers['sec-fetch-dest'];
        if (dest === 'worker' || dest === 'sharedworker' || dest === 'serviceworker') {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        }
        if (req.url && /[?&]coi=1\b/.test(req.url)) {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        }
        next();
      });
    },
  };
}

// SRS proxy for OFFLINE phone benching. The phone under test has no WAN
// internet (USB-only via `adb reverse`), so the dev page's direct fetch of the
// CRS CDN (https://crs.aztec-cdn.foundation/g1_compressed.dat in srs.ts) fails
// with "Failed to fetch" the moment the phone's IndexedDB SRS cache is cold.
// This middleware serves the SAME-ORIGIN path `/g1_compressed.dat` (reachable
// by the phone through the adb-reversed localhost tunnel) by Range-proxying to
// the real CDN, which the *host* Mac can reach. Bytes are byte-identical to a
// direct CDN fetch, so neither correctness nor GPU timing is affected — only
// the source of the (otherwise-cached) point bytes. Host-side only; no-op for
// online clients that still hit the CDN directly.
function serveSrsProxy(): PluginOption {
  const CDN_HOSTS = ['https://crs.aztec-cdn.foundation', 'https://crs.aztec-labs.com'];
  return {
    name: 'serve-srs-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Match any request whose path ends in /g1_compressed.dat (the dev page
        // fetches it same-origin once srs.ts is pointed at '' as the host).
        const url = req.url ?? '';
        if (!/\/g1_compressed\.dat(\?|$)/.test(url)) {
          next();
          return;
        }
        const range = (req.headers['range'] as string | undefined) ?? undefined;
        let lastErr: unknown = null;
        for (const host of CDN_HOSTS) {
          try {
            const upstream = await fetch(`${host}/g1_compressed.dat`, {
              headers: range ? { Range: range } : {},
            });
            if (!upstream.ok && upstream.status !== 206) {
              lastErr = new Error(`HTTP ${upstream.status} from ${host}`);
              continue;
            }
            res.statusCode = upstream.status;
            const cr = upstream.headers.get('content-range');
            const cl = upstream.headers.get('content-length');
            const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
            if (cr) res.setHeader('Content-Range', cr);
            if (cl) res.setHeader('Content-Length', cl);
            res.setHeader('Content-Type', ct);
            res.setHeader('Accept-Ranges', 'bytes');
            // Keep CORP consistent with the COI middleware so a cross-origin
            // isolated document can consume it.
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
            const ab = await upstream.arrayBuffer();
            res.end(Buffer.from(ab));
            return;
          } catch (e) {
            lastErr = e;
          }
        }
        res.statusCode = 502;
        res.end(`srs-proxy: all CDN hosts failed: ${(lastErr as Error)?.message ?? lastErr}`);
      });
    },
  };
}

// In-process result collector. Bench/sanity pages POST a JSON payload to
// `/results` when they reach a terminal state; progress chunks POST to
// `/progress` while running. The middleware appends each payload as a JSONL
// row to the file named by env var `MSM_WEBGPU_RESULTS_FILE` (default
// `/tmp/msm-webgpu-results.jsonl`) and also tees progress lines to
// `MSM_WEBGPU_PROGRESS_FILE`. The BrowserStack runner tails these JSONL
// files to apply stall/deadline watchdogs without polling JS globals.
function resultsCollector(): PluginOption {
  const resultsFile = process.env.MSM_WEBGPU_RESULTS_FILE ?? '/tmp/msm-webgpu-results.jsonl';
  const progressFile = process.env.MSM_WEBGPU_PROGRESS_FILE ?? '/tmp/msm-webgpu-progress.jsonl';
  for (const f of [resultsFile, progressFile]) {
    mkdirSync(path.dirname(f), { recursive: true });
  }
  function readBody(req: import('node:http').IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let buf = '';
      req.setEncoding('utf8');
      req.on('data', chunk => {
        buf += chunk;
        if (buf.length > 8 * 1024 * 1024) {
          reject(new Error('payload too large (>8MB)'));
        }
      });
      req.on('end', () => resolve(buf));
      req.on('error', reject);
    });
  }
  return {
    name: 'msm-webgpu-results-collector',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const targetFile = req.url === '/results' ? resultsFile : req.url === '/progress' ? progressFile : null;
        if (!targetFile) {
          next();
          return;
        }
        try {
          const body = await readBody(req);
          // Validate JSON before appending so a half-flushed POST can't
          // corrupt the JSONL file.
          const parsed = JSON.parse(body);
          const row = { ts: new Date().toISOString(), ...parsed };
          appendFileSync(targetFile, JSON.stringify(row) + '\n');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
        }
      });
      // CORS preflight: BrowserStack devices may issue an OPTIONS before
      // the actual POST when the page is fetched via a different origin
      // (Cloudflare Quick Tunnel is same-origin in practice, but Safari
      // is conservative about POSTing JSON without CORS approval).
      server.middlewares.use((req, res, next) => {
        if (req.method === 'OPTIONS' && (req.url === '/results' || req.url === '/progress')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

// Standalone dev server for the WebGPU BN254 MSM comparison page. Roots
// Vite at `barretenberg/ts/` so relative imports from `dev/msm-webgpu/main.ts`
// into `src/msm_webgpu/...` and `src/barretenberg/...` resolve naturally.
// Run from `barretenberg/ts/` with `yarn dev:msm-webgpu`.
export default defineConfig({
  root: tsRoot,
  plugins: [serveBarretenbergWasm(), serveSrsProxy(), conditionalCoiHeaders(), resultsCollector()],
  resolve: {
    // The src/ tree hard-codes `bb_backends/node/` and similar `node/`
    // sub-paths in import specifiers; the production browser bundle
    // swaps them via sed in `scripts/browser_postprocess.sh`. For the
    // Vite dev page we replicate that swap as a module-resolution alias
    // so `Barretenberg` and `BarretenbergWasmAsyncBackend` end up using
    // the browser-side worker factory and Node-specific helpers don't
    // leak into the bundle.
    alias: [
      {
        find: /^(.*)\/node\/(.*)$/,
        replacement: '$1/browser/$2',
      },
    ],
  },
  server: {
    open: false,
    // Allow the trycloudflare.com tunnel host (and the BrowserStack-side
    // host header) through Vite's default Host header guard. We don't
    // hard-disable the guard ("allowedHosts: true") because that opens
    // the dev server to DNS-rebinding when bound to a public interface;
    // the wildcard limits exposure to Cloudflare's Quick Tunnel domain
    // used by `scripts/run-browserstack.mjs`.
    allowedHosts: ['.trycloudflare.com', '127.0.0.1', 'localhost'],
  },
});
