import { defineConfig } from 'vite';
import { nodePolyfills, PolyfillOptions } from 'vite-plugin-node-polyfills';

// Unfortunate, but needed due to https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
// You don't need this outside of a monorepo. Use nodePolyfills directly.
const nodePolyfillsFix = (options?: PolyfillOptions | undefined) => {
  return {
    ...nodePolyfills(options),
    /* @ts-ignore */
    resolveId(source: string) {
      const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source);
      if (m) {
        return `../../node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};

export default defineConfig(() => {
  return {
    root: 'app',
    publicDir: './public',
    optimizeDeps: {
      // We require wasm files exported by these packages to be served separately
      exclude: ['@aztec/noir-noirc_abi', '@aztec/noir-acvm_js', '@aztec/bb.js'],
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    plugins: [nodePolyfillsFix({ include: ['buffer', 'path'] })],
  };
});
