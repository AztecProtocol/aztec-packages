// GPU-only timing run of the WebGPU MSM under SwiftShader (software Vulkan).
// Not a perf number — validates the msm-bench autorun path + memory accounting
// headlessly before spending a real BrowserStack seat.
//   node swiftshader-bench.mjs <logn> <reps>
import { chromium } from 'playwright-core';

const logn = process.argv[2] ?? '10';
const reps = process.argv[3] ?? '2';
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

const target = `http://localhost:5173/dev/msm-webgpu/index.html?autorun=msm-bench&logn=${logn}&reps=${reps}`;
console.log(`SwiftShader bench logn=${logn} reps=${reps}`);
let runnerErr = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(
    () => /\[bench\] state=/.test(document.getElementById('log')?.textContent ?? ''),
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
for (const l of logText.split('\n').slice(-50)) console.log(l);
await browser.close();
process.exit(0);
