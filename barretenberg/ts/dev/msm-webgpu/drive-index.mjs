// Headless driver for the index.html MSM comparison page. Loads it with
// ?autorun=msm-cross-check, waits for the autorun to finish, prints the log.
//   node dev/msm-webgpu/drive-index.mjs 'index.html?coi=1&autorun=msm-cross-check&logn=16'
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target = argv.find(a => !a.startsWith('--')) ?? 'index.html?coi=1&autorun=msm-cross-check&logn=16';
if (!/^https?:/.test(target)) target = `http://localhost:5173/dev/msm-webgpu/${target}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  // --disable-http2: headless Chrome intermittently fails the CRS CDN
  // range fetch with ERR_HTTP2_PROTOCOL_ERROR; HTTP/1.1 is reliable.
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
    () => {
      const t = document.getElementById('log')?.textContent ?? '';
      return /\[(autorun|batch-check|bridge-check|union-validate|calibrate)\] state=/.test(t);
    },
    { timeout: 600000 },
  );
} catch (e) {
  runnerErr = e.message;
}

const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  if (!el) return '';
  return Array.from(el.children)
    .map(c => c.textContent ?? '')
    .join('\n');
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-70)) console.log(l);
await browser.close();
process.exit(runnerErr ? 1 : 0);
