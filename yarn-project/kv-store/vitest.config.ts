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
    // sqlite-wasm ships its own .wasm asset loader; let Vite serve it as a static asset
    // rather than pre-bundling, per the upstream docs' recommendation.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  test: {
    globals: true,
    reporters: ['verbose'],
    include: [
      './src/indexeddb/**/*.test.ts',
      // sqlite-opfs browser tests hang intermittently in the 2-CPU CI container
      // (see https://github.com/AztecProtocol/aztec-packages/pull/22693). The
      // backend is still experimental — gate these behind VITE_SQLITE_OPFS=1
      // so they run in dev but don't block the merge-train until the hang is
      // root-caused.
      ...(process.env.VITE_SQLITE_OPFS === '1' ? ['./src/sqlite-opfs/**/*.test.ts'] : []),
      // Benchmarks self-skip unless VITE_BENCH=1; include so they're discoverable.
      './src/bench/indexeddb/**/*.test.ts',
      './src/bench/sqlite-opfs/**/*.test.ts',
    ],
    // Bench suites do full-population + N-iteration work; default 30s is too tight.
    testTimeout: process.env.VITE_BENCH === '1' ? 300_000 : 30_000,
    // Run test files sequentially to avoid race conditions in browser module loading
    fileParallelism: false,
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
    teardownTimeout: 10000,
    globalSetup: './vitest.global-setup.ts',
  },
});
