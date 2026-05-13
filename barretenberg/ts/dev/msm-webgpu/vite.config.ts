import { defineConfig, type PluginOption } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createReadStream, statSync, existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(__dirname, "../..");
const cppBuildWasmThreads = path.resolve(
  tsRoot,
  "../cpp/build-wasm-threads/bin",
);

// Vite middleware that serves the freshly-built WASM out of the cpp build
// tree at `/dev/msm-webgpu/barretenberg-threads.wasm.gz`. bb.js's
// `fetchCode(multithreaded=true, wasmPath)` rewrites
// `${dir}/barretenberg.wasm.gz` → `${dir}/barretenberg-threads.wasm.gz`,
// so the dev page passes `wasmPath = '/dev/msm-webgpu/barretenberg.wasm.gz'`
// and bb.js asks for the `-threads` variant served below. Avoiding a copy
// keeps the dev page tracking the cpp build automatically.
function serveBarretenbergWasm(): PluginOption {
  const wasmFile = path.join(cppBuildWasmThreads, "barretenberg.wasm.gz");
  const servePath = "/dev/msm-webgpu/barretenberg-threads.wasm.gz";
  return {
    name: "serve-barretenberg-wasm",
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
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Cache-Control", "no-store");
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
    name: "conditional-coi-headers",
    configureServer(server) {
      // We can't tell "this request came from a page in COI mode" purely
      // from the request URL — the worker module fetches under
      // `/src/...` won't carry `?coi=1` even when the document does.
      // The pragmatic trade-off is to set CORP on every response and
      // COOP/COEP only on requests that opted in. CORP=same-origin
      // is harmless when COI is off (it just keeps the asset accessible
      // to same-origin code, which is what we want regardless).
      server.middlewares.use((req, res, next) => {
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        // Worker/SharedWorker requests don't carry `?coi=1` in their URL
        // (only the parent document does). But the spec requires that when
        // the parent has COEP=require-corp, the worker response also has
        // COEP=require-corp — otherwise worker creation fails with an
        // opaque error event. Detect worker requests via Sec-Fetch-Dest
        // and attach COEP to them unconditionally so a COI'd document can
        // actually spin up its workers.
        const dest = req.headers["sec-fetch-dest"];
        if (
          dest === "worker" ||
          dest === "sharedworker" ||
          dest === "serviceworker"
        ) {
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        if (req.url && /[?&]coi=1\b/.test(req.url)) {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
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
  plugins: [serveBarretenbergWasm(), conditionalCoiHeaders()],
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
        replacement: "$1/browser/$2",
      },
    ],
  },
  server: {
    open: "/dev/msm-webgpu/index.html",
  },
});
