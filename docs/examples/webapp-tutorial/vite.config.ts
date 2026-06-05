// docs:start:vite-config
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { type PolyfillOptions, nodePolyfills } from "vite-plugin-node-polyfills";

// vite-plugin-node-polyfills injects imports of its own shims (e.g.
// `vite-plugin-node-polyfills/shims/buffer`) into modules that use Node globals.
// Our @aztec/* dependencies are `link:`ed to the monorepo, so those injected
// specifiers get resolved from the linked package directory, where the plugin is
// not installed, and rollup fails to resolve them. Redirect the shim specifiers
// to the copy installed in this project.
// See https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
const nodePolyfillsFix = (options?: PolyfillOptions): Plugin => ({
  ...nodePolyfills(options),
  resolveId(source: string) {
    const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source);
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
});
// docs:end:vite-config
