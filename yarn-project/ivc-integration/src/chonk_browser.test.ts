/**
 * Browser-based IVC Integration Tests using Puppeteer
 *
 * This test suite runs the same IVC integration tests as client_ivc_integration.test.ts,
 * but executes them in a real browser environment using Puppeteer.
 *
 * Key features:
 * - Self-contained: Includes its own HTTP server with COOP/COEP headers
 * - Automatic build: Builds the webpack bundle if it doesn't exist
 * - Browser testing: Tests WebAssembly + SharedArrayBuffer multithreading in Chrome
 * - Test parity: Runs the same proving/verification tests as the Node.js version
 *
 * How it works:
 * 1. beforeAll: Builds webpack bundle, starts HTTP server with security headers, launches browser
 * 2. Each test: Creates a page, navigates to test HTML, runs test code in browser, captures results
 * 3. afterAll: Cleans up browser and server
 *
 * The test HTML (created by createTestHtml):
 * - Loads the webpack bundle (index.js) which exposes APIs on window
 * - Loads pako library for gzip decompression
 * - Creates window.runIVCTest() and window.runGatesTest() functions
 * - Puppeteer calls these functions and returns results to Jest
 *
 * COOP/COEP headers are required for SharedArrayBuffer support (for multithreading).
 *
 * Usage:
 *   cd yarn-project/ivc-integration
 *   yarn test client_ivc_browser.test.ts
 */
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, join } from 'path';
import puppeteer, { Browser } from 'puppeteer';
import { fileURLToPath } from 'url';

const logger = createLogger('ivc-integration:test:browser');

// Get project paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

jest.setTimeout(300_000); // 5 minutes for browser tests

describe('Chonk Integration - Browser with Puppeteer', () => {
  let server: ReturnType<typeof createServer>;
  let browser: Browser;
  let serverUrl: string;

  beforeAll(async () => {
    // Ensure webpack build exists
    const distPath = join(projectRoot, 'dist');
    if (!existsSync(join(distPath, 'index.js'))) {
      logger.info('Building browser bundle with webpack...');
      try {
        execSync('yarn webpack', { cwd: projectRoot, stdio: 'inherit' });
      } catch (error) {
        logger.error('Failed to build browser bundle');
        throw error;
      }
    }

    // Start HTTP server with COOP/COEP headers
    const port = await startTestServer();
    serverUrl = `http://localhost:${port}`;
    logger.info(`Test server started on ${serverUrl}`);

    // Launch Puppeteer browser
    // Use Playwright's chromium if available (for CI compatibility)
    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };

    // Try to use Playwright's chromium executable if Puppeteer's Chrome isn't available
    try {
      const { chromium } = await import('playwright');
      const playwrightPath = chromium.executablePath();
      if (existsSync(playwrightPath)) {
        logger.info(`Using Playwright's chromium at: ${playwrightPath}`);
        launchOptions.executablePath = playwrightPath;
      }
    } catch {
      // Playwright not available or chromium path not found, fall back to Puppeteer's default
      logger.info("Using Puppeteer's default Chrome");
    }

    browser = await puppeteer.launch(launchOptions);
    logger.info('Browser launched');
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
      logger.info('Server closed');
    }
  });

  async function runTestInBrowser(testName: string, numCreatorApps: number, numReaderApps: number): Promise<boolean> {
    const page = await browser.newPage();
    let pageError: Error | null = null;

    try {
      // Capture ALL console logs from the browser for debugging
      page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        const prefix = `Browser[${type}]:`;
        if (type === 'error') {
          logger.error(`${prefix} ${text}`);
        } else if (type === 'warn') {
          logger.warn(`${prefix} ${text}`);
        } else {
          logger.info(`${prefix} ${text}`);
        }
      });

      // Capture page errors and fail fast
      page.on('pageerror', error => {
        logger.error(`Browser page error: ${error.message}`);
        logger.error(`Browser page error stack: ${error.stack}`);
        pageError = error;
      });

      // Navigate to test page
      await page.goto(`${serverUrl}/test.html`, { waitUntil: 'networkidle0', timeout: 10000 });
      logger.info(`Navigated to test page`);

      // Check for page errors before waiting
      if (pageError) {
        throw new Error(`Page error during load: ${String(pageError)}`);
      }

      // Wait for test environment to be ready
      await page.waitForFunction('typeof window.runIVCTest !== "undefined"', { timeout: 10000 });
      logger.info('Test environment ready');

      // Run the test in the browser
      logger.info(`Running test: ${testName} (creators: ${numCreatorApps}, readers: ${numReaderApps})`);

      const result = await page.evaluate(
        async (creators: number, readers: number) => {
          return await (window as any).runIVCTest(creators, readers);
        },
        numCreatorApps,
        numReaderApps,
      );

      if (!result.success) {
        logger.error(`Test failed: ${result.error}`);
        return false;
      }

      logger.info(`Test ${testName} completed, verified: ${result.verified}`);
      return result.verified;
    } finally {
      await page.close();
    }
  }

  it('Should generate a verifiable chonk proof from a simple mock tx in browser', async () => {
    const verified = await runTestInBrowser('simple', 1, 0);
    expect(verified).toBe(true);
  });

  it('Should generate a verifiable chonk proof from a complex mock tx in browser', async () => {
    const verified = await runTestInBrowser('complex', 1, 1);
    expect(verified).toBe(true);
  });

  // Helper function to start the test server
  function startTestServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const distPath = join(projectRoot, 'dist');

      server = createServer((req, res) => {
        logger.info(`[Server] ${req.method} ${req.url}`);

        // Set COOP/COEP headers for SharedArrayBuffer support
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'no-store');

        if (req.url === '/test.html') {
          // Serve our custom test HTML
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(createTestHtml());
        } else if (req.url === '/') {
          // Redirect to test page
          res.writeHead(302, { Location: '/test.html' });
          res.end();
        } else {
          // Serve files from dist directory
          const filePath = join(distPath, req.url || '');
          try {
            if (existsSync(filePath)) {
              const content = readFileSync(filePath);
              const ext = filePath.split('.').pop() || '';
              const contentTypes: Record<string, string> = {
                js: 'application/javascript; charset=utf-8',
                wasm: 'application/wasm',
                json: 'application/json',
                css: 'text/css',
                html: 'text/html; charset=utf-8',
              };
              res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'application/octet-stream',
                'Content-Length': content.length,
              });
              res.end(content);
            } else {
              res.writeHead(404);
              res.end('Not found: ' + req.url);
            }
          } catch (error: any) {
            res.writeHead(500);
            res.end('Server error: ' + error.message);
          }
        }
      });

      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      server.on('error', reject);
    });
  }

  function createTestHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Chonk Integration Browser Test</title>
  <style>
    body {
      font-family: monospace;
      padding: 20px;
      background: #1e1e1e;
      color: #d4d4d4;
    }
    #status {
      padding: 10px;
      margin: 10px 0;
      border: 1px solid #555;
      background: #2d2d2d;
    }
    .loading { color: #ffaa00; }
    .ready { color: #4ec9b0; }
    .error { color: #f48771; }
  </style>
</head>
<body>
  <h1>Chonk Integration Browser Test</h1>
  <div id="status" class="loading">Initializing...</div>

  <script src="index.js"></script>
  <script type="module">
    // This script sets up the test environment using the bundled code
    const statusEl = document.getElementById('status');

    function setStatus(message, className) {
      statusEl.textContent = message;
      statusEl.className = className;
      console.log('[Status]', message);
    }

    async function initTestEnvironment() {
      try {
        setStatus('Loading dependencies...', 'loading');

        // Wait a bit for the bundle to fully execute
        await new Promise(resolve => setTimeout(resolve, 100));

        // Debug: log what's available on window
        console.log('[Init] Checking window.Barretenberg:', typeof window.Barretenberg);
        console.log('[Init] Checking window.AztecClientBackend:', typeof window.AztecClientBackend);

        // The webpack bundle should expose these on window
        const { Barretenberg, AztecClientBackend, generateTestingIVCStack,
                MockAppCreatorCircuit, MockPrivateKernelInitCircuit,
                MockPrivateKernelTailCircuit, MockHidingCircuit } = window;

        if (!Barretenberg) {
          console.error('[Init] window keys:', Object.keys(window).filter(k => k.includes('Barr') || k.includes('Aztec') || k.includes('Mock')));
          throw new Error('Barretenberg not found. Is the bundle loaded correctly?');
        }

        setStatus('Creating test functions...', 'loading');

        // Create test function for IVC proving
        window.runIVCTest = async function(numCreatorApps, numReaderApps) {
          try {
            console.log(\`[Test] Starting IVC test with \${numCreatorApps} creators, \${numReaderApps} readers\`);

            const barretenberg = await Barretenberg.initSingleton({
              threads: 16,
              logger: (m) => console.log('[BB]', m),
            });
            console.log('[Test] Barretenberg initialized');

            console.log('[Test] Generating testing IVC stack...');
            const [bytecodes, witnessStack, , vks] = await generateTestingIVCStack(
              numCreatorApps,
              numReaderApps
            );
            console.log(\`[Test] Generated stack with \${bytecodes.length} circuits\`);

            console.log('[Test] Creating AztecClientBackend...');
            const backend = new AztecClientBackend(bytecodes, barretenberg);

            console.log('[Test] Proving...');
            const [, proof, vk] = await backend.prove(witnessStack, vks);
            console.log(\`[Test] Proof generated, size: \${proof.length} bytes\`);

            console.log('[Test] Verifying...');
            const verified = await backend.verify(proof, vk);
            console.log(\`[Test] Verification result: \${verified}\`);

            await Barretenberg.destroySingleton();
            console.log('[Test] Barretenberg destroyed');

            return { success: true, verified };
          } catch (error) {
            console.error('[Test] Error:', error);
            return { success: false, error: error.message, stack: error.stack };
          }
        };

        setStatus('Test environment ready!', 'ready');
        console.log('[Init] Test environment initialized successfully');

      } catch (error) {
        console.error('[Init] Failed to initialize test environment:', error);
        setStatus('Failed to initialize: ' + error.message, 'error');
        throw error;
      }
    }

    // Wait for DOM and then initialize
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTestEnvironment);
    } else {
      initTestEnvironment();
    }
  </script>
</body>
</html>`;
  }
});
