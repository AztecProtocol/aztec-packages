// Headless SwiftShader driver: cross-check the WebGPU MSM against the
// noble CPU reference at a small logN. For the GPU-less dev box, where
// the multi-threaded WASM oracle can't boot. Pass logN(s) as args:
//   node dev/msm-webgpu/swiftshader-noble.mjs 8 10
import { chromium } from 'playwright-core';

const logns = process.argv.slice(2).filter(a => /^\d+$/.test(a));
if (logns.length === 0) logns.push('10');
const extra = process.argv.slice(2).filter(a => a.startsWith('--') && a !== '--glv');
// `--glv` cross-checks the GLV-decomposed pipeline; default checks the plain V2.
const autorunMode = process.argv.includes('--glv') ? 'gpu-vs-noble-glv' : 'gpu-vs-noble';
const agreeRe = autorunMode === 'gpu-vs-noble-glv' ? /GLV WebGPU and Noble agree/ : /WebGPU and Noble agree/;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--enable-unsafe-swiftshader',
    // `--use-vulkan=swiftshader` is required for the lavapipe-less dev box to
    // expose a WebGPU adapter under headless Chromium — without it
    // `requestAdapter()` returns null and the cross-check can't run.
    '--use-vulkan=swiftshader',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
    ...extra,
  ],
});

let allOk = true;
for (const logn of logns) {
  const page = await browser.newPage();
  page.on('console', m => console.log(`  · ${m.text()}`));
  page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));
  page.on('crash', () => console.log('  !! PAGE CRASHED'));
  const cQ = process.env.GLV_C ? `&c=${process.env.GLV_C}` : '';
  const url = `http://localhost:5173/dev/msm-webgpu/index.html?coi=1&autorun=${autorunMode}&logn=${logn}${cQ}`;
  console.log(`\n=== logN=${logn} :: ${url} ===`);
  let runnerErr = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(
      () => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''),
      null,
      { timeout: 900000 },
    );
  } catch (e) {
    runnerErr = e.message;
  }
  let logText = '';
  try {
    logText = await page.evaluate(() => {
      const el = document.getElementById('log');
      return el ? Array.from(el.children).map(c => c.textContent ?? '').join('\n') : '';
    });
  } catch (e) {
    console.log(`evaluate failed: ${e.message}`);
  }
  console.log('─'.repeat(60));
  if (runnerErr) console.log(`runner: ${runnerErr}`);
  for (const l of logText.split('\n').slice(-18)) console.log(l);
  const ok = /\[autorun\] state=done/.test(logText) && agreeRe.test(logText);
  console.log(`>>> logN=${logn}: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) allOk = false;
  await page.close();
}
await browser.close();
console.log(`\n==== OVERALL: ${allOk ? 'PASS' : 'FAIL'} ====`);
process.exit(allOk ? 0 : 1);
