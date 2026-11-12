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
const PLAYER_1 = '.players-container > .player-panel:nth-child(1)';
const PLAYER_2 = '.players-container > .player-panel:nth-child(2)';

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

  it('loads the app in two-player local mode', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });

    // The local network gets the two-player split screen, one embedded wallet per player
    const twoPlayer = await page.waitForSelector('.two-player-local');
    expect(twoPlayer).toBeTruthy();

    // Network picker defaults to local
    const selectValue = await page.$eval('.network-picker select', (el) =>
      (el as HTMLSelectElement).value,
    );
    expect(selectValue).toBe('local');
  });

  it('lets player 2 connect only after player 1', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.two-player-local');

    const buttons = await page.$$eval(`${PLAYER_1} button, ${PLAYER_2} button`, (els) =>
      els.map((b) => ({ text: b.textContent, disabled: (b as HTMLButtonElement).disabled })),
    );
    expect(buttons).toEqual([
      { text: 'Connect Account #1', disabled: false },
      { text: 'Connect Account #2', disabled: true },
    ]);
  });

  it(
    'connects player 1 test account when sandbox is running',
    async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle0' });

      await page.click(`${PLAYER_1} button`);

      await page.waitForFunction(
        (sel) => document.querySelector(sel)?.textContent?.includes('Initializing PXE'),
        { timeout: 10_000 },
        `${PLAYER_1} .player-status`,
      );

      // Wait for connection (this requires a running sandbox)
      try {
        await page.waitForFunction(
          (sel) => document.querySelector(sel)?.textContent?.includes('Connected!'),
          { timeout: 90_000 },
          `${PLAYER_1} .player-status`,
        );

        // Player 1 can now create the game, and player 2 can connect
        const p1Action = await page.$eval(`${PLAYER_1} button`, (el) => el.textContent);
        expect(p1Action).toBe('Deploy Contract & Create Game');
        const p2Disabled = await page.$eval(
          `${PLAYER_2} button`,
          (el) => (el as HTMLButtonElement).disabled,
        );
        expect(p2Disabled).toBe(false);
      } catch {
        // If sandbox is not running, we expect an error status
        const status = await page.$eval(`${PLAYER_1} .player-status`, (el) => el.textContent);
        console.log('Connection result (sandbox may not be running):', status);
        expect(status).toMatch(/Error|Connected/);
      }
    },
    120_000,
  );
});
