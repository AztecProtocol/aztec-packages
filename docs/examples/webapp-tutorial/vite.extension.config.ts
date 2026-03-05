/**
 * Vite configuration for building the wallet extension.
 * Uses the same polyfills as the main webapp.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

/**
 * Vite plugin: patch Barretenberg worker files with crossOriginIsolated = true.
 *
 * Chrome extensions have SharedArrayBuffer but crossOriginIsolated === false.
 * bb.js checks crossOriginIsolated in workers to decide whether to create
 * shared WebAssembly.Memory. Without this patch, workers create non-shared
 * memory then crash when instantiating barretenberg-threads.wasm.
 *
 * We prepend the patch at build time so it runs before any worker code.
 * This avoids runtime Worker constructor overrides (which would require blob
 * URLs that violate the extension's Content Security Policy).
 */
function patchWorkersCrossOriginIsolated() {
  const PATCH = `Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,writable:false,configurable:true});\n`;
  return {
    name: 'patch-workers-cross-origin-isolated',
    generateBundle(_: unknown, bundle: Record<string, any>) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.includes('.worker') && chunk.type === 'chunk') {
          chunk.code = PATCH + chunk.code;
        }
        // Also handle worker assets (Vite may emit workers as assets, not chunks)
        if (fileName.includes('.worker') && chunk.type === 'asset' && typeof chunk.source === 'string') {
          chunk.source = PATCH + chunk.source;
        }
      }
    },
  };
}

export default defineConfig({
  // Extension entry scripts live in test-extension/dist/.
  // Vite's modulepreload helper builds absolute URLs from `base`;
  // without this the preload URLs resolve to /chunks/... (extension root)
  // instead of /dist/chunks/... where the files actually live.
  base: '/dist/',
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        process: true,
        Buffer: true,
      },
      // Don't polyfill these - they might interfere with extension APIs
      exclude: ['chrome'],
    }),
    patchWorkersCrossOriginIsolated(),
  ],
  define: {
    // Ensure chrome isn't replaced by any polyfill
    'globalThis.chrome': 'globalThis.chrome',
  },
  build: {
    outDir: 'test-extension/dist',
    emptyOutDir: true, // Clean stale chunks between builds (#16). Content-script is built AFTER Vite.
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'test-extension/src/background.ts'),
        // content-script built separately with esbuild (requires IIFE format)
        offscreen: resolve(__dirname, 'test-extension/src/offscreen/offscreen.ts'),
        popup: resolve(__dirname, 'test-extension/src/popup/popup.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // Ensure WASM files are placed in a predictable location
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.wasm') || assetInfo.name?.endsWith('.wasm.gz')) {
            return 'wasm/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        format: 'es',
      },
    },
    target: 'esnext',
    minify: false, // Keep readable for debugging
    sourcemap: true,
    // Ensure WASM files are bundled/copied, not externalized
    assetsInlineLimit: 0, // Don't inline any assets, including small WASM files
  },
  // Exclude WASM-containing packages from pre-bundling
  optimizeDeps: {
    include: ['pino', 'pino/browser'],
    exclude: [
      '@aztec/noir-noirc_abi',
      '@aztec/noir-acvm_js',
      '@aztec/bb.js',
      '@aztec/noir-noir_js',
    ],
  },
  resolve: {
    alias: {
      // Ensure crypto polyfill for browser
      crypto: 'crypto-browserify',
    },
  },
});
