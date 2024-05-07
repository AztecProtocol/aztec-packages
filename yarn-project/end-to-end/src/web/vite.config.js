import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import topLevelAwait from 'vite-plugin-top-level-await';

const dir = resolve(dirname(fileURLToPath(import.meta.url)));

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: join(dir, 'vite-dist'),
  },
  plugins: [
    // node polyfills for things like buffer, stream, tty, etc
    // vite-plugin-node-polyfills over v0.17.0 has a buggy buffer polyfill
    // https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
    nodePolyfills(),
    // top-level await for loading wasm files
    topLevelAwait(),
  ],
});
