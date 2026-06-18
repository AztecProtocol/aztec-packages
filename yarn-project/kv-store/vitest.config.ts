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
      'msgpackr/index-no-eval',
      'pako',
      'idb-keyval',
      'comlink',
    ],
    // sqlite3mc-wasm ships its own .wasm asset loader; let Vite serve it as a static asset
    // rather than pre-bundling, per the upstream docs' recommendation.
    exclude: ['@aztec/sqlite3mc-wasm'],
  },
  test: {
    globals: true,
    // Bench suites do full-population + N-iteration work; default 30s is too tight.
    testTimeout: process.env.VITE_BENCH === '1' ? 300_000 : 30_000,
    // Run test files sequentially to avoid race conditions in browser module loading
    fileParallelism: false,
    teardownTimeout: 10_000,
    globalSetup: './vitest.global-setup.ts',
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            './src/lmdb/**/*.test.ts',
            './src/lmdb-v2/**/*.test.ts',
            './src/stores/**/*.test.ts',
            './src/interfaces/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            // Browser stubs for modules that pull in Barretenberg WASM.
            '@aztec/foundation/eth-address': path.resolve(__dirname, 'browser-stubs/eth-address.js'),
            '@aztec/foundation/log': path.resolve(__dirname, 'browser-stubs/foundation-log.js'),
            buffer: path.resolve(__dirname, 'browser-stubs/buffer.js'),
            util: path.resolve(__dirname, 'browser-stubs/util.js'),
          },
        },
        test: {
          name: 'browser',
          include: [
            './src/browser/**/*.test.ts',
            './src/indexeddb/**/*.test.ts',
            './src/sqlite-opfs/**/*.test.ts',
            // Benchmarks self-skip unless VITE_BENCH=1; include so they're discoverable.
            './src/bench/indexeddb/**/*.test.ts',
            './src/bench/sqlite-opfs/**/*.test.ts',
            './src/bench/sqlite-opfs-encrypted/**/*.test.ts',
          ],
          reporters: ['verbose'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
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
        },
      },
    ],
  },
});
