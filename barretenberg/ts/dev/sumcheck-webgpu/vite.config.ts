import { defineConfig, type PluginOption } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createReadStream, statSync, existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Root Vite at barretenberg/ts so relative imports from
// dev/sumcheck-webgpu/main.ts into src/msm_webgpu/... resolve naturally.
const tsRoot = path.resolve(__dirname, "../..");
const cppBuildWasmThreads = path.resolve(tsRoot, "../cpp/build-wasm-threads/bin");

// Serve the freshly-built threads WASM out of the cpp build tree at
// `/dev/sumcheck-webgpu/barretenberg-threads.wasm.gz`. The benchmark tab inits
// bb.js with `wasmPath = '/dev/sumcheck-webgpu/barretenberg.wasm.gz'`, and bb.js's
// fetchCode(multithreaded=true, wasmPath) rewrites that to the `-threads` variant
// served here — so the WASM sumcheck baseline tracks the cpp build with no copy.
function serveBarretenbergWasm(): PluginOption {
  const wasmFile = path.join(cppBuildWasmThreads, "barretenberg.wasm.gz");
  const servePath = "/dev/sumcheck-webgpu/barretenberg-threads.wasm.gz";
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

// Cross-origin isolation headers for the WASM-threads backend (needs
// SharedArrayBuffer). Set CORP on every response and COOP/COEP only when the
// document opts in via `?coi=1`, plus COEP on worker requests (which don't carry
// the query string). The WebGPU testing tab works without COI; only the WASM
// benchmark baseline needs it.
function conditionalCoiHeaders(): PluginOption {
  return {
    name: "conditional-coi-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        const dest = req.headers["sec-fetch-dest"];
        if (dest === "worker" || dest === "sharedworker" || dest === "serviceworker") {
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

// Standalone dev server for the sumcheck-webgpu test + benchmark page. Run from
// barretenberg/ts with `yarn dev:sumcheck-webgpu`. For the WASM benchmark column,
// open the page with `?coi=1` so the threads backend gets SharedArrayBuffer.
export default defineConfig({
  root: tsRoot,
  plugins: [serveBarretenbergWasm(), conditionalCoiHeaders()],
  resolve: {
    // Mirror scripts/browser_postprocess.sh's node/->browser/ swap so src/ modules
    // that hard-code a `node/` sub-path (e.g. the bb.js worker backend) resolve to
    // their browser variant in the dev bundle.
    alias: [{ find: /^(.*)\/node\/(.*)$/, replacement: "$1/browser/$2" }],
  },
  server: {
    open: "/dev/sumcheck-webgpu/index.html",
    allowedHosts: [".trycloudflare.com", "127.0.0.1", "localhost"],
  },
});
