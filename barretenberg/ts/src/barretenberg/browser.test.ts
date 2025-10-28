import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, Browser, Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Browser integration test for bb.js
 *
 * This test runs bb.js in a headless browser to verify:
 * - WASM loading and initialization
 * - Basic cryptographic operations (pedersen, blake2s)
 * - Memory management
 * - Multi-threading support
 *
 * For debugging with Address Sanitizer (ASAN):
 * - Build: ../cpp/bootstrap.sh build_emscripten_threads_asan
 * - Create custom backend (see bb_backends/EMSCRIPTEN.md)
 * - Replace WASI backend with emscripten backend in this test
 */

// Increase timeout for browser tests (WASM loading + compilation can take time)
const BROWSER_TEST_TIMEOUT = 120000;
const SERVER_PORT = 8765;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

describe('Barretenberg Browser Integration', () => {
  let browser: Browser;
  let page: Page;
  let serverProcess: ChildProcess;

  beforeAll(async () => {
    // Start HTTP server with proper CORS headers for SharedArrayBuffer
    const serverScript = path.join(__dirname, '..', '..', 'scripts', 'serve_browser.js');
    serverProcess = spawn('node', [serverScript], {
      env: { ...process.env, PORT: SERVER_PORT.toString() },
      stdio: 'pipe',
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5000);

      serverProcess.stdout?.on('data', data => {
        console.log(`[Server] ${data}`);
        if (data.toString().includes('Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess.stderr?.on('data', data => {
        console.error(`[Server Error] ${data}`);
      });

      serverProcess.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Launch headless browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-web-security', // Allow loading local modules
      ],
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

    // Navigate to test.html served by the HTTP server
    // This ensures CORS headers are properly applied
    await page.goto(`${SERVER_URL}/test.html`, { waitUntil: 'networkidle' });

    // Wait for bb.js to load
    await page.waitForFunction(() => window.bbReady === true, { timeout: 30000 });
  }, BROWSER_TEST_TIMEOUT);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  it(
    'should initialize bb.js in browser environment',
    async () => {
      const result = await page.evaluate(async () => {
        try {
          console.log('Starting Barretenberg initialization...');
          // @ts-ignore - Barretenberg is loaded globally
          // Use BackendType.Wasm (non-worker) for simpler initialization in tests
          const BackendType = { Wasm: 'wasm' };
          const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });
          console.log('Barretenberg initialized successfully');

          return {
            success: true,
            message: 'Barretenberg initialized successfully',
            userAgent: navigator.userAgent,
            hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            hasWebAssembly: typeof WebAssembly !== 'undefined',
            hasCrossOriginIsolation: crossOriginIsolated,
          };
        } catch (err) {
          console.error('Initialization error:', err);
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          };
        }
      });

      console.log('Initialization result:', result);
      expect(result.success).toBe(true);
      expect(result.hasWebAssembly).toBe(true);
    },
    BROWSER_TEST_TIMEOUT,
  );

  it(
    'should perform blake2s hash in browser',
    async () => {
      const result = await page.evaluate(async () => {
        try {
          // @ts-ignore
          const BackendType = { Wasm: 'wasm' };
          const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });

          // Test blake2s hash
          const input = new Uint8Array([1, 2, 3, 4, 5]);
          const result = await api.blake2s({ data: input });
          const hash = result.hash;

          // Clean up
          await api.destroy();

          return {
            success: true,
            hashLength: hash.length,
            hash: Array.from(hash.slice(0, 8)), // First 8 bytes for verification
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      console.log('blake2s hash result:', result);
      if (!result.success) {
        console.error('blake2s error:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.hashLength).toBe(32); // blake2s produces 32 bytes
    },
    BROWSER_TEST_TIMEOUT,
  );

  it(
    'should perform pedersen hash in browser',
    async () => {
      const result = await page.evaluate(async () => {
        try {
          // @ts-ignore
          const BackendType = { Wasm: 'wasm' };
          const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });

          // Test pedersen hash with field elements
          const input1 = new Uint8Array(32).fill(1);
          const input2 = new Uint8Array(32).fill(2);
          const result = await api.pedersenHash({ inputs: [input1, input2], hashIndex: 0 });
          const hash = result.hash;

          // Clean up
          await api.destroy();

          return {
            success: true,
            hashLength: hash.length,
            hash: Array.from(hash.slice(0, 8)), // First 8 bytes for verification
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      console.log('Pedersen hash result:', result);
      if (!result.success) {
        console.error('Pedersen error:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.hashLength).toBe(32); // Pedersen hash produces 32 bytes
    },
    BROWSER_TEST_TIMEOUT,
  );

  it(
    'should support SharedArrayBuffer for multi-threading',
    async () => {
      const result = await page.evaluate(() => {
        return {
          hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
          hasCrossOriginIsolation: crossOriginIsolated,
        };
      });

      // SharedArrayBuffer requires cross-origin isolation headers
      console.log('Threading capabilities:', result);

      // With proper headers, we should have cross-origin isolation
      expect(result.hasSharedArrayBuffer).toBe(true);
      expect(result.hasCrossOriginIsolation).toBe(true);
    },
    BROWSER_TEST_TIMEOUT,
  );

  it(
    'should load UltraHonk backend classes in browser',
    async () => {
      const result = await page.evaluate(async () => {
        try {
          console.log('Testing UltraHonk backend class availability...');

          // @ts-ignore
          const backendModule = await import('./barretenberg/backend.js');

          // Verify the classes are available
          const hasUltraHonkBackend = typeof backendModule.UltraHonkBackend === 'function';
          const hasVerifierBackend = typeof backendModule.UltraHonkVerifierBackend === 'function';
          const hasClientBackend = typeof backendModule.AztecClientBackend === 'function';

          console.log(`UltraHonkBackend available: ${hasUltraHonkBackend}`);
          console.log(`UltraHonkVerifierBackend available: ${hasVerifierBackend}`);
          console.log(`AztecClientBackend available: ${hasClientBackend}`);

          return {
            success: true,
            hasUltraHonkBackend,
            hasVerifierBackend,
            hasClientBackend,
            message: 'All backend classes loaded successfully',
          };
        } catch (err) {
          console.error('Backend loading error:', err);
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      console.log('Backend loading result:', result);
      if (!result.success) {
        console.error('Backend loading error:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.hasUltraHonkBackend).toBe(true);
      expect(result.hasVerifierBackend).toBe(true);
      expect(result.hasClientBackend).toBe(true);
    },
    BROWSER_TEST_TIMEOUT,
  );

  it.skip(
    'should initialize and use emscripten backend with ASAN',
    async () => {
      // NOTE: This test is skipped by default because:
      // 1. Emscripten WASM is 250MB+ and not included in standard builds
      // 2. Requires: cd ../cpp && ./bootstrap.sh build_emscripten_threads_asan
      // 3. Emscripten JS is not built with MODULARIZE, so dynamic imports don't work
      //
      // To enable, manually copy files and adapt backend loading:
      // cp ../cpp/build-emscripten-threads-asan/bin/barretenberg-debug.wasm.* dest/browser/emscripten/
      //
      // This test validates that emscripten ASAN builds can be loaded in browser for debugging.

      const result = await page.evaluate(async () => {
        try {
          console.log('Loading emscripten backend with ASAN...');

          // @ts-ignore - BarretenbergEmscriptenBackend is loaded globally
          const BarretenbergEmscriptenBackend = window.BarretenbergEmscriptenBackend;

          if (!BarretenbergEmscriptenBackend) {
            throw new Error('BarretenbergEmscriptenBackend not found');
          }

          // Create emscripten backend with paths to ASAN-instrumented WASM
          const emBackend = await BarretenbergEmscriptenBackend.new(
            '/emscripten/barretenberg-debug.wasm.wasm',
            '/emscripten/barretenberg-debug.wasm.js',
          );

          console.log('Emscripten backend loaded successfully');

          // Verify we have emscripten-specific features
          // @ts-ignore
          const hasModule = emBackend.module !== undefined;
          // @ts-ignore
          const hasHeapU8 = emBackend.heapU8 !== undefined;

          // Check for emscripten-specific symbols in the module
          // @ts-ignore
          const hasEmscriptenMalloc = typeof emBackend.module._malloc === 'function';
          // @ts-ignore
          const hasEmscriptenFree = typeof emBackend.module._free === 'function';
          // @ts-ignore
          const hasHEAPU8 = emBackend.module.HEAPU8 !== undefined;
          // @ts-ignore
          const hasHEAPU32 = emBackend.module.HEAPU32 !== undefined;

          // Verify ASAN is active by checking memory size
          // ASAN builds need significantly more memory (we set INITIAL_MEMORY to 256MB)
          // @ts-ignore
          const heapSize = emBackend.module.HEAPU8.buffer.byteLength;
          const isLargeHeap = heapSize >= 256 * 1024 * 1024; // >= 256MB

          console.log(`Heap size: ${(heapSize / (1024 * 1024)).toFixed(2)} MB`);
          console.log(`Has emscripten _malloc: ${hasEmscriptenMalloc}`);
          console.log(`Has emscripten _free: ${hasEmscriptenFree}`);
          console.log(`Has HEAPU8: ${hasHEAPU8}`);
          console.log(`Has HEAPU32: ${hasHEAPU32}`);

          await emBackend.destroy();

          return {
            success: true,
            hasModule,
            hasHeapU8,
            hasEmscriptenMalloc,
            hasEmscriptenFree,
            hasHEAPU8,
            hasHEAPU32,
            isLargeHeap,
            heapSizeMB: heapSize / (1024 * 1024),
            message: 'Emscripten backend with ASAN verified',
          };
        } catch (err) {
          console.error('Emscripten backend error:', err);
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          };
        }
      });

      console.log('Emscripten backend result:', result);
      if (!result.success) {
        console.error('Emscripten error:', result.error);
        console.error('Stack:', result.stack);
      }

      // Verify backend loaded successfully
      expect(result.success).toBe(true);

      // Verify emscripten-specific features
      expect(result.hasModule).toBe(true);
      expect(result.hasHeapU8).toBe(true);
      expect(result.hasEmscriptenMalloc).toBe(true);
      expect(result.hasEmscriptenFree).toBe(true);
      expect(result.hasHEAPU8).toBe(true);
      expect(result.hasHEAPU32).toBe(true);

      // Verify ASAN memory configuration
      expect(result.isLargeHeap).toBe(true);
      expect(result.heapSizeMB).toBeGreaterThanOrEqual(256);

      console.log(`✓ Confirmed emscripten backend with ASAN (${result.heapSizeMB.toFixed(2)} MB heap)`);
    },
    BROWSER_TEST_TIMEOUT,
  );
});

/**
 * This test automatically:
 * 1. Starts an HTTP server with proper CORS headers for SharedArrayBuffer
 * 2. Loads bb.js in a headless browser
 * 3. Runs cryptographic operations (blake2s, pedersen)
 * 4. Cleans up server and browser
 *
 * For ASAN debugging with emscripten:
 * - See bb_backends/EMSCRIPTEN.md for detailed instructions
 * - Build emscripten ASAN WASM: ../cpp/bootstrap.sh build_emscripten_threads_asan
 * - Create custom backend using BarretenbergEmscriptenBackend
 * - Modify test to use emscripten backend instead of WASI
 */
