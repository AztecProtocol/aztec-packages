import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,UseSkiaRenderer',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  . ${m.text()}`));
page.on('pageerror', e => console.log(`  ! ${e.message}`));

console.log('MSM cross-check logn=10 on SwiftShader...');
let runnerErr = null;
try {
  await page.goto(
    'http://localhost:5173/dev/msm-webgpu/index.html?coi=1&autorun=msm-cross-check&logn=10',
    { waitUntil: 'load', timeout: 120000 },
  );
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
process.exit(runnerErr ? 1 : 0);
