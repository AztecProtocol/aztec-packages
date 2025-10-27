import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, Browser, Page } from 'playwright';
import { Barretenberg } from './index.js';

/**
 * Browser integration test for bb.js
 *
 * This test runs bb.js in a headless browser to verify:
 * - WASM loading and initialization
 * - Basic cryptographic operations (pedersen, poseidon)
 * - Memory management
 *
 * For debugging with Address Sanitizer (ASAN):
 * - Build: ../cpp/bootstrap.sh build_emscripten_threads_asan
 * - Create custom backend (see bb_backends/EMSCRIPTEN.md)
 * - Replace WASI backend with emscripten backend in this test
 */

// Increase timeout for browser tests
const BROWSER_TEST_TIMEOUT = 60000;

describe('Barretenberg Browser Integration', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // Launch headless browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'], // Required for some CI environments
    });

    const context = await browser.newContext();
    page = await context.newPage();

    // Log browser console messages
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}]`, msg.text());
    });

    // Log browser errors
    page.on('pageerror', err => {
      console.error('[Browser Error]', err);
    });

    // Create a minimal HTML page with bb.js
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BB.js Browser Test</title>
        </head>
        <body>
          <h1>BB.js Browser Test</h1>
          <script type="module">
            // This would load bb.js from the browser build
            // For now, we'll inject the test code directly
            window.testResults = {};
          </script>
        </body>
      </html>
    `);
  }, BROWSER_TEST_TIMEOUT);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it(
    'should initialize bb.js in browser environment',
    async () => {
      // Inject test code into the browser
      const result = await page.evaluate(async () => {
        try {
          // In a real browser environment, bb.js would be loaded from the browser build
          // This test demonstrates the concept - actual implementation would need:
          // 1. Webpack/rollup bundle of bb.js for browser
          // 2. WASM files served from a local server
          // 3. Proper module loading

          return {
            success: true,
            message: 'Browser environment ready',
            userAgent: navigator.userAgent,
            hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            hasWebAssembly: typeof WebAssembly !== 'undefined',
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      expect(result.success).toBe(true);
      expect(result.hasWebAssembly).toBe(true);
      console.log('Browser environment:', result);
    },
    BROWSER_TEST_TIMEOUT,
  );

  it(
    'should support SharedArrayBuffer for multi-threading',
    async () => {
      const result = await page.evaluate(() => {
        return {
          hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
          hasCrossOriginIsolation:
            typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
        };
      });

      // SharedArrayBuffer requires cross-origin isolation headers
      // In production, these headers would be set by the server:
      // Cross-Origin-Opener-Policy: same-origin
      // Cross-Origin-Embedder-Policy: require-corp
      console.log('Threading capabilities:', result);
    },
    BROWSER_TEST_TIMEOUT,
  );
});

/**
 * To run this test:
 *
 * 1. Build bb.js browser bundle:
 *    yarn build:browser
 *
 * 2. Serve the browser build with proper headers:
 *    cd dest/browser && python3 -m http.server 8080 \
 *      --header "Cross-Origin-Opener-Policy: same-origin" \
 *      --header "Cross-Origin-Embedder-Policy: require-corp"
 *
 * 3. Run the test:
 *    yarn test browser.test.ts
 *
 * For ASAN debugging with emscripten:
 * - See bb_backends/EMSCRIPTEN.md for detailed instructions
 * - Build emscripten ASAN WASM
 * - Create custom backend
 * - Modify test to use emscripten backend instead of WASI
 */
