import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { hashToEmoji } from '@aztec-labs/wallet-sdk/crypto';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const TUTORIAL_DIR = resolve(import.meta.dirname, '../..');
const DIST_DIR = join(TUTORIAL_DIR, 'dist');
const EXTENSION_DIR = join(TUTORIAL_DIR, 'test-extension');
const APP_PORT = 4174; // Different port from embedded-wallet tests
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

describe('Extension wallet E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof createServer>;
  let walletPage: Promise<Page> | undefined;

  beforeAll(async () => {
    if (!existsSync(join(DIST_DIR, 'index.html'))) {
      throw new Error(
        'dist/index.html not found. Run `yarn build` in the webapp-tutorial directory first.',
      );
    }

    if (!existsSync(join(EXTENSION_DIR, 'dist', 'background.js'))) {
      throw new Error(
        'test-extension/dist/background.js not found. Run `yarn build:test-extension` first.',
      );
    }

    // Start static server with COOP/COEP headers
    server = createServer((req, res) => {
      const filePath = join(DIST_DIR, req.url === '/' ? 'index.html' : req.url!);
      if (!existsSync(filePath)) {
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
      headless: false, // Extensions require non-headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
      ],
    });

    page = await browser.newPage();
    page.setDefaultTimeout(30_000);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it('loads the app and can switch to remote mode', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });

    // Switch to remote network
    await page.select('.network-picker select', 'remote');

    // Should show the extension list area
    const extensionList = await page.waitForSelector('.extension-list');
    expect(extensionList).toBeTruthy();
  });

  it(
    'discovers the test extension wallet once the user approves',
    async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle0' });
      await page.select('.network-picker select', 'remote');

      const discovery = await pendingFromApp('discoveries');
      await sendToWallet({ type: 'approve-connection', requestId: discovery.requestId });

      const walletButton = await page.waitForSelector('.extension-list button', { timeout: 15_000 });
      expect(walletButton).toBeTruthy();

      const buttonText = await page.$eval('.extension-list button', (el) => el.textContent);
      expect(buttonText).toContain('Aztec Tutorial Wallet');
    },
    30_000,
  );

  it(
    'shows emoji verification after clicking connect',
    async () => {
      await connectToWallet();

      const emojiText = await page.$eval('.emoji-grid', (el) => el.textContent);
      expect(emojiText!.length).toBeGreaterThan(0);

      const heading = await page.$eval('.emoji-verification h3', (el) => el.textContent);
      expect(heading).toBe('Verify Connection');
    },
    30_000,
  );

  it(
    'sends the capability request once the user confirms the emojis in the wallet',
    async () => {
      await connectToWallet();
      const emojis = await page.$eval('.emoji-grid', (el) => el.textContent);

      // The wallet queues the app's requests until the user confirms, in the wallet, the session
      // whose emojis match the app's. Sessions from earlier page loads stay listed there.
      const verification = await pendingFromApp(
        'pendingSessionVerifications',
        (v) => hashToEmoji(v.verificationHash!) === emojis,
      );
      await sendToWallet({ type: 'confirm-session', sessionId: verification.sessionId });

      // Granting needs an account in the wallet, which this suite does not create
      const capabilities = await pendingFromApp(
        'pendingCapabilities',
        (c) => c.sessionId === verification.sessionId,
      );
      expect(capabilities.appMetadata?.name).toBe('Pod Racing');
    },
    30_000,
  );

  /** Loads the app in remote mode, approves discovery, and clicks connect until the emojis show. */
  async function connectToWallet(): Promise<void> {
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.select('.network-picker select', 'remote');
    const discovery = await pendingFromApp('discoveries');
    await sendToWallet({ type: 'approve-connection', requestId: discovery.requestId });
    await page.waitForSelector('.extension-list button', { timeout: 15_000 });
    await page.click('.extension-list button');
    await page.waitForSelector('.emoji-grid', { timeout: 10_000 });
  }

  /**
   * Sends a message to the wallet's background as its popup does. A fresh profile trusts no origin,
   * so the wallet holds discovery, the session and the capability request for the user to approve
   * in the popup; the tests send the popup's messages from the offscreen document instead, an
   * extension page that is always open and has no window to take focus from the app.
   */
  async function sendToWallet(message: Record<string, unknown>): Promise<WalletResponse> {
    // page() is null for a background_page target
    walletPage ??= browser
      .waitForTarget((t) => t.url().endsWith('/dist/offscreen.html'))
      .then((t) => t.asPage());
    const response = await (await walletPage).evaluate(
      (m) =>
        new Promise<WalletResponse>((resolve) =>
          chrome.runtime.sendMessage({ ...m, target: 'background' }, resolve),
        ),
      message,
    );
    if (!response?.success) throw new Error(`Wallet rejected ${message.type}: ${response?.error}`);
    return response;
  }

  /** Waits until the wallet holds a pending item of `kind` from the app's origin that `match` accepts. */
  async function pendingFromApp(
    kind: PendingKind,
    match: (item: PendingItem) => boolean = () => true,
  ): Promise<PendingItem> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const { result } = await sendToWallet({ type: 'getPendingItems' });
      const item = result[kind].find((i: PendingItem) => i.origin === APP_URL && match(i));
      if (item) return item;
      if (Date.now() > deadline) throw new Error(`The wallet holds no ${kind} from ${APP_URL}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
});

type PendingKind = 'discoveries' | 'pendingSessionVerifications' | 'pendingCapabilities';
type PendingItem = {
  origin: string;
  requestId?: string;
  sessionId?: string;
  verificationHash?: string;
  appMetadata?: { name: string };
};
type WalletResponse = { success: boolean; error?: string; result?: any };

/** The extension API, present only inside the extension's own pages. */
declare const chrome: {
  runtime: { sendMessage(message: object, callback: (response: WalletResponse) => void): void };
};
