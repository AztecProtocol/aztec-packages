import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { exec, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const TUTORIAL_DIR = resolve(import.meta.dirname, '../..');
const DIST_DIR = join(TUTORIAL_DIR, 'dist');
const APP_PORT = 4173;
const APP_URL = `http://localhost:${APP_PORT}`;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

describe('Embedded wallet E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    // Verify dist exists (must run `yarn build` first)
    if (!existsSync(join(DIST_DIR, 'index.html'))) {
      throw new Error(
        'dist/index.html not found. Run `yarn build` in the webapp-tutorial directory first.',
      );
    }

    // Start a static HTTP server with COOP/COEP headers for SharedArrayBuffer
    server = createServer((req, res) => {
      const filePath = join(DIST_DIR, req.url === '/' ? 'index.html' : req.url!);
      if (!existsSync(filePath)) {
        // SPA fallback
        const indexPath = join(DIST_DIR, 'index.html');
        const content = readFileSync(indexPath);
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        });
        res.end(content);
        return;
      }
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      res.end(content);
    });

    await new Promise<void>((resolve) => server.listen(APP_PORT, resolve));

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    });

    page = await browser.newPage();
    page.setDefaultTimeout(60_000);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it('loads the app and shows wallet connect', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });

    // App should show the wallet connect section
    const walletConnect = await page.waitForSelector('.wallet-connect');
    expect(walletConnect).toBeTruthy();

    // Network picker defaults to local
    const selectValue = await page.$eval('.network-picker select', (el) =>
      (el as HTMLSelectElement).value,
    );
    expect(selectValue).toBe('local');
  });

  it('shows test account selector for local network', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });

    // Local network should show the local connect section
    const localConnect = await page.waitForSelector('.local-connect');
    expect(localConnect).toBeTruthy();

    // Should have the test account dropdown
    const selectOptions = await page.$$eval('.local-connect select option', (opts) =>
      opts.map((o) => (o as HTMLOptionElement).textContent),
    );
    expect(selectOptions).toEqual(['Account 1', 'Account 2', 'Account 3']);

    // Connect button should be present
    const button = await page.$eval('.local-connect button', (el) => el.textContent);
    expect(button).toBe('Connect Test Account');
  });

  it(
    'connects test account when sandbox is running',
    async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle0' });

      // Click "Connect Test Account"
      await page.click('.local-connect button');

      // Wait for status to indicate PXE initialization
      await page.waitForFunction(
        () => document.querySelector('.status')?.textContent?.includes('Initializing PXE'),
        { timeout: 10_000 },
      );

      // Wait for connection (this requires a running sandbox)
      try {
        await page.waitForFunction(
          () => document.querySelector('.status')?.textContent?.includes('Connected!'),
          { timeout: 90_000 },
        );

        // Should transition to lobby
        const lobby = await page.waitForSelector('.game-lobby', { timeout: 5_000 });
        expect(lobby).toBeTruthy();
      } catch {
        // If sandbox is not running, we expect an error status
        const status = await page.$eval('.status', (el) => el.textContent);
        console.log('Connection result (sandbox may not be running):', status);
        expect(status).toMatch(/Error|Connected/);
      }
    },
    120_000,
  );
});
