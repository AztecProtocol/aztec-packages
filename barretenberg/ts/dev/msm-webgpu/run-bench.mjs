// Headless bench runner — drives a WebGPU bench page with the system
// Chrome via Playwright, waits for window.__bench to reach a terminal
// state, and prints the streamed log plus the final result.
//
// Usage (from barretenberg/ts/, dev server already running):
//   node dev/msm-webgpu/run-bench.mjs 'bench-field-ops.html?validate=1&reps=3'
//   node dev/msm-webgpu/run-bench.mjs <full-url> [--headed]
//
// Exits 0 only if the bench reached state 'done'.
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target = argv.find(a => !a.startsWith('--')) ?? 'bench-field-ops.html';
if (!/^https?:/.test(target)) target = `http://localhost:5173/dev/msm-webgpu/${target}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  // --disable-http2: headless Chrome intermittently fails the CRS CDN
  // range fetch with ERR_HTTP2_PROTOCOL_ERROR (pages that load the SRS).
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  · ${m.text()}`));
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

console.log(`navigating: ${target}`);
let runnerErr = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(
    () => window.__bench && (window.__bench.state === 'done' || window.__bench.state === 'error'),
    { timeout: 240000 },
  );
} catch (e) {
  runnerErr = e.message;
}

const b = await page.evaluate(() => window.__bench ?? null);
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
if (b) {
  console.log(`state: ${b.state}`);
  if (b.error) console.log(`error: ${b.error}`);
  if (b.ratio != null) console.log(`ratio (by_inverse_a):    ${b.ratio}`);
  if (b.ratioLoop != null) console.log(`ratio (by_inverse_loop): ${b.ratioLoop}`);
} else {
  console.log('no window.__bench found on page');
}
await browser.close();
process.exit(b && b.state === 'done' ? 0 : 1);
