// Headless SwiftShader driver: launches the installed Playwright Chromium with
// WebGPU forced onto SwiftShader (Vulkan) — for GPU-less CI/correctness runs.
// Reads the #log DOM until the autorun reports a terminal [autorun] state.
//   node dev/msm-webgpu/drive-swiftshader.mjs 'index.html?autorun=msm-cross-check&logn=10'
import { chromium } from 'playwright-core';

const EXEC =
  process.env.CHROMIUM_BIN ||
  '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';
const PORT = process.env.MSM_PORT || '5198';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target = argv.find(a => !a.startsWith('--')) ?? 'index.html?autorun=msm-cross-check&logn=10';
if (!/^https?:/.test(target)) target = `http://localhost:${PORT}/dev/msm-webgpu/${target}`;

const browser = await chromium.launch({
  executablePath: EXEC,
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--use-vulkan=swiftshader',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--disable-http2',
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
    () => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''),
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
for (const l of logText.split('\n')) console.log(l);
await browser.close();
process.exit(runnerErr ? 1 : 0);
