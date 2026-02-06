import { playwright } from '@vitest/browser-playwright';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use pre-installed playwright browsers if available (e.g., in CI)
const systemPlaywrightPath = '/opt/ms-playwright';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(systemPlaywrightPath)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = systemPlaywrightPath;
}

export default defineConfig({
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      // Browser stubs for modules that pull in Barretenberg WASM.
      '@aztec/foundation/eth-address': path.resolve(__dirname, 'browser-stubs/eth-address.js'),
      '@aztec/foundation/log': path.resolve(__dirname, 'browser-stubs/foundation-log.js'),
      buffer: path.resolve(__dirname, 'browser-stubs/buffer.js'),
      util: path.resolve(__dirname, 'browser-stubs/util.js'),
    },
  },
  // Pre-bundle third-party deps via esbuild at server startup.
  optimizeDeps: {
    include: [
      'chai',
      'zod',
      'idb',
      'sha3',
      'viem',
      'ohash',
      'hash.js',
      '@noble/curves/secp256k1',
      'colorette',
      'detect-node',
      'pino',
      'msgpackr',
      'pako',
      'idb-keyval',
      'comlink',
    ],
  },
  // Eagerly transform local source files during server startup so they're cached
  // before the browser requests them. This prevents CPU-intensive on-demand transforms
  // from blocking the event loop during test startup, which can cause BroadcastChannel
  // messages between orchestrator and tester to be lost in CPU-constrained CI (2 vCPUs).
  // Vite follows imports, so warming test files cascades to their dependency tree.
  server: {
    warmup: {
      clientFiles: [
        './src/indexeddb/**/*.ts',
        './src/interfaces/**/*.ts',
        './src/stores/**/*.ts',
        './browser-stubs/**/*.js',
      ],
    },
  },
  test: {
    globals: true,
    reporters: ['verbose'],
    include: ['./src/indexeddb/**/*.test.ts'],
    // Run test files sequentially to avoid race conditions in browser module loading
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      connectTimeout: 30_000,
      // Reuse a single browser iframe for all test files to reduce overhead.
      // Safe because tests use beforeEach/afterEach for IndexedDB store setup/teardown.
      isolate: false,
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--disable-software-rasterizer',
            ],
            timeout: 30_000,
          },
          context: {
            actionTimeout: 10_000,
          },
        },
      ],
    },
    testTimeout: 30000,
    teardownTimeout: 10000,
    globalSetup: './vitest.global-setup.ts',
  },
});
