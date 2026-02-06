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
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
