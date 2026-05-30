// SwiftShader (software WebGPU) headless driver for the standalone MSM
// cross-check page (xcheck.html). Launches Chromium with the Vulkan
// SwiftShader ICD so navigator.gpu.requestAdapter() returns the software
// adapter, navigates to the cross-check harness for a given logn, forwards
// page console output, waits for a terminal PASS/FAIL, and prints the log.
//
// Run from barretenberg/ts/ so the playwright-core import resolves:
//   node dev/msm-webgpu/swiftshader-driver.mjs 8
//   node dev/msm-webgpu/swiftshader-driver.mjs 10
//
// Optional second arg: timeout in ms (default 240000).
import { chromium } from 'playwright-core';

const logn = process.argv[2] ?? '10';
const timeoutMs = parseInt(process.argv[3] ?? '240000', 10);
// Optional 3rd arg: extra query string for A/B knobs, e.g. "tpb=64" or
// "tpb=128&prefdev=1". Forwarded verbatim to the xcheck page.
const extra = process.argv[4] ? `&${process.argv[4]}` : '';
const target = `http://localhost:5173/dev/msm-webgpu/xcheck.html?logn=${logn}${extra}`;

const CHROME = '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';
const ICD = '/opt/ms-playwright/chromium-1148/chrome-linux/vk_swiftshader_icd.json';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  env: { ...process.env, VK_ICD_FILENAMES: ICD },
  args: [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--enable-dawn-features=allow_unsafe_apis',
  ],
});
const page = await browser.newPage();
page.setDefaultTimeout(timeoutMs);
page.setDefaultNavigationTimeout(timeoutMs);
page.on('console', m => console.log(`  · ${m.text()}`));
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));
page.on('requestfailed', r =>
  console.log(`  ! requestfailed: ${r.url()} — ${r.failure()?.errorText ?? '?'}`),
);
page.on('response', r => {
  if (r.status() >= 400) console.log(`  ! http ${r.status()}: ${r.url()}`);
});

console.log(`navigating: ${target}  (timeout ${timeoutMs} ms)`);
let runnerErr = null;
let status = '?';
try {
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => {
      const t = document.getElementById('status')?.textContent ?? '';
      return /^(PASS|FAIL|THROW)/.test(t);
    },
    { timeout: timeoutMs },
  );
  status = await page.evaluate(() => document.getElementById('status')?.textContent ?? '?');
} catch (e) {
  runnerErr = e.message;
}

const logText = await page.evaluate(() => document.getElementById('log')?.textContent ?? '');
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
console.log(logText);
console.log('─'.repeat(64));
console.log(`STATUS(logn=${logn}): ${status}`);
await browser.close();
process.exit(status.startsWith('PASS') ? 0 : 1);
