// docs:start:vite-config
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
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
