import inject from '@rollup/plugin-inject';
import react from '@vitejs/plugin-react';
// Get require functionality in ESM
import { createRequire } from 'module';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const require = createRequire(import.meta.url);
console.log('logging the path');
console.log(require.resolve('node-stdlib-browser/helpers/esbuild/shim'));

const { default: stdLibBrowser } = await import('node-stdlib-browser');
const esbuildShim = require.resolve('node-stdlib-browser/helpers/esbuild/shim');

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: stdLibBrowser,
  },
  optimizeDeps: {
    include: ['buffer', 'process'],
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@aztec/circuits.js/resources/aztec3-circuits.wasm',
          dest: '',
        },
      ],
    }),
    {
      ...inject({
        global: [esbuildShim, 'global'],
        process: [esbuildShim, 'process'],
        Buffer: [esbuildShim, 'Buffer'],
      }),
      enforce: 'post',
    },
  ],
});
