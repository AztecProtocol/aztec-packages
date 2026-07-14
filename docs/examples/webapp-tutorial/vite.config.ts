// docs:start:vite-config
import { defineConfig, type Plugin } from "vite";
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

export default defineConfig({
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
      "@aztec/noir-noirc_abi",
      "@aztec/noir-acvm_js",
      "@aztec/bb.js",
      "@aztec/noir-noir_js",
    ],
  },
  resolve: {
    // Keep linked @aztec packages under this app so plugin-injected shim imports
    // resolve from the webapp tutorial's node_modules.
    preserveSymlinks: true,
  },
});
// docs:end:vite-config
