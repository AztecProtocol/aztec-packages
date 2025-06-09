import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { PolyfillOptions, nodePolyfills } from 'vite-plugin-node-polyfills';
import bundlesize from 'vite-plugin-bundlesize';

// Only required for alternative bb wasm file, left as reference
//import { viteStaticCopy } from 'vite-plugin-static-copy';

// Unfortunate, but needed due to https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
// Suspected to be because of the yarn workspace setup, but not sure
const nodePolyfillsFix = (options?: PolyfillOptions | undefined): Plugin => {
  return {
    ...nodePolyfills(options),
    /* @ts-ignore */
    resolveId(source: string) {
      const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source);
      if (m) {
        return `./node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    logLevel: process.env.CI ? 'error' : undefined,
    server: {
      // Headers needed for bb WASM to work in multithreaded mode
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // Allow vite to serve files from these directories, since they are symlinked
      // These are the protocol circuit artifacts, noir WASMs and bb WASMs.
      fs: {
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          '../yarn-project/noir-protocol-circuits-types/artifacts',
          '../noir/packages/noirc_abi/web',
          '../noir/packages/acvm_js/web',
          '../barretenberg/ts/dest/browser',
        ],
      },
    },
    plugins: [
      react({ jsxImportSource: '@emotion/react' }),
      nodePolyfillsFix({ include: ['buffer', 'path'] }),
      // This is unnecessary unless BB_WASM_PATH is defined (default would be /assets/barretenberg.wasm.gz)
      // Left as an example of how to use a different bb wasm file than the default lazily loaded one
      // viteStaticCopy({
      //   targets: [
      //     {
      //       src: '../barretenberg/cpp/build-wasm-threads/bin/*.wasm',
      //       dest: 'assets/',
      //     },
      //   ],
      // }),
      bundlesize({
        // Bump log:
        // - AD: bumped from 1600 => 1680 as we now have a 20kb msgpack lib in bb.js and other logic got us 50kb higher, adding some wiggle room.
        limits: [{ name: 'assets/index-*', limit: '1700kB' }],
      }),
    ],
    define: {
      'process.env': JSON.stringify({
        LOG_LEVEL: env.LOG_LEVEL,
        // docs:start:bb-wasm-path
        // The path to a custom WASM file for bb.js.
        // Only the single-threaded file name is needed, the multithreaded file name will be inferred
        // by adding the -threads suffix: e.g: /assets/barretenberg.wasm.gz -> /assets/barretenberg-threads.wasm.gz
        // Files can be compressed or uncompressed, but must be gzipped if compressed.
        BB_WASM_PATH: env.BB_WASM_PATH,
        // docs:end:bb-wasm-path
      }),
    },
    build: {
      // Required by vite-plugin-bundle-size
      sourcemap: 'hidden',
    },
  };
});
