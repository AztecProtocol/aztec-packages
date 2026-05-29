// Headless driver that forces the SwiftShader Vulkan software renderer so
// the MSM WebGPU page runs without real GPU hardware. Mirrors
// drive-index.mjs but pins the playwright Chromium build + SwiftShader
// flags found working in prior sessions (Chrome headless, localhost
// secure context).
//   node dev/msm-webgpu/drive-swiftshader.mjs 'index.html?coi=1&autorun=msm-cross-check&logn=8'
import { chromium } from 'playwright-core';

const CHROME_DIR =
  process.env.CHROMIUM_DIR || '/opt/ms-playwright/chromium-1148/chrome-linux';
const EXE = process.env.CHROMIUM_PATH || `${CHROME_DIR}/chrome`;
// Dawn's Vulkan backend needs the SwiftShader ICD registered explicitly;
// without VK_ICD_FILENAMES the adapter request fails ("Couldn't request
// WebGPU adapter") even with --use-vulkan=swiftshader.
const ICD = process.env.VK_ICD_FILENAMES || `${CHROME_DIR}/vk_swiftshader_icd.json`;

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target = argv.find(a => !a.startsWith('--')) ?? 'index.html?coi=1&autorun=msm-cross-check&logn=8';
if (!/^https?:/.test(target)) target = `http://127.0.0.1:5173/dev/msm-webgpu/${target}`;

const browser = await chromium.launch({
  executablePath: EXE,
  headless: !headed,
  env: { ...process.env, VK_ICD_FILENAMES: ICD },
  args: [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-vulkan=swiftshader',
    '--disable-http2',
    '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  · ${m.text()}`));
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

console.log(`navigating: ${target}`);
let runnerErr = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });
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
for (const l of logText.split('\n').slice(-70)) console.log(l);
await browser.close();
process.exit(runnerErr ? 1 : 0);
