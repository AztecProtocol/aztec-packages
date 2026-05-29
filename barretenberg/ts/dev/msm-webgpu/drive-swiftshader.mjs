// SwiftShader headless driver for the MSM comparison page (no-GPU containers).
// Requires VK_ICD_FILENAMES pointing at the SwiftShader Vulkan ICD and
// CHROMIUM_PATH pointing at a chromium build, e.g.:
//   export CHROMIUM_PATH=/opt/ms-playwright/chromium-1148/chrome-linux/chrome
//   export VK_ICD_FILENAMES=/opt/ms-playwright/chromium-1148/chrome-linux/vk_swiftshader_icd.json
//   node dev/msm-webgpu/drive-swiftshader.mjs 'index.html?coi=1&autorun=msm-cross-check&logn=10'
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target = argv.find(a => !a.startsWith('--')) ?? 'index.html?coi=1&autorun=msm-cross-check&logn=10';
if (!/^https?:/.test(target)) target = `http://localhost:5173/dev/msm-webgpu/${target}`;

const browser = await chromium.launch({
  headless: !headed,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-vulkan=swiftshader',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  . ${m.text()}`));
page.on('pageerror', e => console.log(`  ! ${e.message}`));

console.log(`navigating: ${target}`);
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
  if (!el) return '';
  return Array.from(el.children).map(c => c.textContent ?? '').join('\n');
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-80)) console.log(l);
await browser.close();
process.exit(runnerErr ? 1 : 0);
