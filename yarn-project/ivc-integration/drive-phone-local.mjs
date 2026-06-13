// Local headless-Chrome driver for the phone autorun page — validates the
// exact path the S25+ will take (serve-phone.mjs + ?autorun=) on the Mac's
// own GPU before going on-device. Loads the autorun URL, mirrors browser
// console to stdout, and waits for the terminal document.title sentinel.
//
// Usage:
//   PORT=5300 node drive-phone-local.mjs chonk-on
//   PORT=5300 node drive-phone-local.mjs chonk-webgpu [flow]
//
// Exits 0 only on CHONK-DONE-OK.
import { launch } from 'puppeteer';

const PORT = process.env.PORT ?? '5300';
const MODE = process.argv[2] ?? 'chonk-webgpu';
const FLOW = process.argv[3] ?? 'ecdsar1+transfer_1_recursions+sponsored_fpc';
const THREADS = process.env.THREADS ? `&threads=${process.env.THREADS}` : '';
const url = `http://localhost:${PORT}/?autorun=${MODE}&flow=${encodeURIComponent(FLOW)}${THREADS}`;

const browser = await launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-webgpu',
    '--enable-webgpu-developer-features',
    '--disable-vulkan-fallback-to-gl-for-testing',
  ],
});

const page = await browser.newPage();
page.on('console', m => console.log(`[browser] ${m.text()}`));
page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));

console.log(`[drive] loading ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

try {
  await page.waitForFunction(() => /^CHONK-(DONE|ERROR)/.test(document.title), {
    timeout: 15 * 60_000,
    polling: 1000,
  });
} catch (err) {
  console.log(`[drive] TIMEOUT waiting for terminal title: ${err.message}`);
}

const title = await page.title();
const status = await page.$eval('#autorun-status', el => el.textContent).catch(() => '(no #autorun-status)');
console.log(`[drive] TITLE: ${title}`);
console.log(`[drive] STATUS: ${status}`);

await browser.close();
process.exit(title === 'CHONK-DONE-OK' ? 0 : 1);
