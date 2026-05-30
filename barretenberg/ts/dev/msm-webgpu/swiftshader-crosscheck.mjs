// Headless SwiftShader (CPU Vulkan) WebGPU cross-check driver.
// Usage: node swiftshader-crosscheck.mjs [logn] [stream_s]
import { chromium } from 'playwright-core';

const logn = process.argv[2] ?? '10';
const streamS = process.argv[3];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=vulkan',
    '--use-vulkan=swiftshader',
    '--disable-gpu-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  . ${m.text()}`));
page.on('pageerror', e => console.log(`  ! ${e.message}`));

let q = `http://localhost:5173/dev/msm-webgpu/index.html?coi=1&autorun=gpu-vs-noble&logn=${logn}`;
if (streamS) q += `&stream_s=${streamS}`;
console.log(`MSM cross-check logn=${logn}${streamS ? ` stream_s=${streamS}` : ''} on SwiftShader...`);
let runnerErr = null;
try {
  await page.goto(q, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(
    () => {
      const t = document.getElementById('log')?.textContent ?? '';
      return /\[autorun\] state=/.test(t);
    },
    null,
    { timeout: 600000 },
  );
} catch (e) {
  runnerErr = e.message;
}

const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  if (!el) return '';
  return Array.from(el.children).map(c => c.textContent ?? '').join('\n');
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-50)) console.log(l);
await browser.close();
const ok = /\[autorun\] state=done/.test(logText) || logText.includes('state=done');
process.exit(ok ? 0 : 1);
