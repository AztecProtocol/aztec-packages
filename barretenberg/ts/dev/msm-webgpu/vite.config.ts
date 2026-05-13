import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(__dirname, "../..");

// Standalone dev server for the WebGPU BN254 MSM correctness page.
// Roots Vite at `barretenberg/ts/` so relative imports from `dev/msm-webgpu/main.ts`
// into `src/msm_webgpu/...` resolve naturally, and Vite can pick up
// `node_modules/` for the noble reference. Run from `barretenberg/ts/`
// with `yarn dev:msm-webgpu`.
export default defineConfig({
  root: tsRoot,
  server: {
    open: "/dev/msm-webgpu/index.html",
    // No COOP/COEP here — this page never instantiates SharedArrayBuffer
    // and the headers were observed to trip a CSP "blocks the use of
    // eval" error in some dev-tooling code paths. Add them back later
    // when the bridge actually needs cross-origin isolation.
  },
});
