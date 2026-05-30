// Cross-check the WebGPU MSM against the in-page reference under SwiftShader.
//   node swiftshader-crosscheck.mjs <logn>
// Requires the vite dev server on :5173 and CHROMIUM_PATH + VK_ICD_FILENAMES set.
import { chromium } from 'playwright-core';

const logn = process.argv[2] ?? '10';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=WebGPU,Vulkan',
    '--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader',
    '--disable-gpu-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  . ${m.text()}`));
page.on('pageerror', e => console.log(`  ! ${e.message}`));

const extra = process.argv[3] ? `&${process.argv[3]}` : '';
const target = `http://localhost:5173/dev/msm-webgpu/index.html?coi=1&autorun=msm-cross-check&ref=noble&logn=${logn}${extra}`;
console.log(`SwiftShader cross-check logn=${logn}${extra}`);
let runnerErr = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(
    () => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''),
    null,
    { timeout: 900000 },
  );
} catch (e) {
  runnerErr = e.message;
}
const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  return el ? Array.from(el.children).map(c => c.textContent ?? '').join('\n') : '';
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-60)) console.log(l);
const state = /\[autorun\] state=done/.test(logText) ? 'done' : 'error';
console.log(`\nRESULT: ${state}`);
await browser.close();
process.exit(state === 'done' ? 0 : 1);
