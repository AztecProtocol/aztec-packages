import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Root Vite at barretenberg/ts so relative imports from
// dev/sumcheck-webgpu/main.ts into src/msm_webgpu/... resolve naturally.
const tsRoot = path.resolve(__dirname, "../..");

// Standalone dev server for the WebGPU BN254 Fr-primitives correctness page.
// Pure compute: no SharedArrayBuffer / WASM threads, so no COOP/COEP headers
// are needed (unlike the MSM page). Run from barretenberg/ts with
// `yarn dev:sumcheck-webgpu`.
export default defineConfig({
  root: tsRoot,
  resolve: {
    // Mirror scripts/browser_postprocess.sh's node/->browser/ swap so any
    // src/ module that hard-codes a `node/` sub-path resolves to its browser
    // variant in the dev bundle (harmless for the current Fr imports; keeps
    // parity with the MSM page as this harness grows to import MsmV2/bridge).
    alias: [{ find: /^(.*)\/node\/(.*)$/, replacement: "$1/browser/$2" }],
  },
  server: {
    open: "/dev/sumcheck-webgpu/index.html",
    allowedHosts: [".trycloudflare.com", "127.0.0.1", "localhost"],
  },
});
