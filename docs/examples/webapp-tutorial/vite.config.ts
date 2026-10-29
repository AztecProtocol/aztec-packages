// docs:start:vite-config
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import {
  type PolyfillOptions,
  nodePolyfills,
} from "vite-plugin-node-polyfills";

// Unfortunate, but needed due to https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
const nodePolyfillsFix = (options?: PolyfillOptions): Plugin => ({
  ...nodePolyfills(options),
  resolveId(source: string) {
    const m =
      /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(
        source,
      );
    if (m) {
      return `./node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
    }
  },
});

export default defineConfig(({ mode }) => ({
  // process.env is only a shim in the browser, so substitute the node URL from .env (or the shell) at build time.
  define: {
    "process.env.AZTEC_NODE_URL": JSON.stringify(
      loadEnv(mode, process.cwd(), "").AZTEC_NODE_URL ?? "",
    ),
  },
  plugins: [
    react(),
    nodePolyfillsFix({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
  server: {
    // Headers required for SharedArrayBuffer (needed by bb WASM)
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Exclude WASM-containing packages from pre-bundling
  optimizeDeps: {
    include: ["pino", "pino/browser"],
    exclude: [
      "@aztec-foundation/noir-noirc_abi",
      "@aztec-foundation/noir-acvm_js",
      "@aztec-foundation/bb.js",
      "@aztec-foundation/noir-noir_js",
    ],
  },
  build: {
    // Aztec's prover (bb.js, about 5 MB) and circuit artifacts load lazily but exceed Vite's
    // 500 kB default; warn only above them.
    chunkSizeWarningLimit: 6000,
  },
  resolve: {
    // Keep linked @aztec packages under this app so plugin-injected shim imports
    // resolve from the webapp tutorial's node_modules.
    preserveSymlinks: true,
  },
}));
// docs:end:vite-config
