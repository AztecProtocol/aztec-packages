// Headless WebGPU MSM cross-check vs @noble/curves on SwiftShader (Vulkan ICD).
// Usage: node test-msm-xcheck.mjs [logn] [seed] [extraQuery]
//   logn  default 10
//   seed  default 1   (forwarded as &seed=)
//   extraQuery  e.g. "accum=coop" forwarded verbatim
import { chromium } from 'playwright-core';

const logn = process.argv[2] || '10';
const seed = process.argv[3] || '1';
const extra = process.argv[4] || '';

const icdDir = '/opt/ms-playwright/chromium-1148/chrome-linux';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || `${icdDir}/chrome`,
  env: {
    ...process.env,
    VK_ICD_FILENAMES: `${icdDir}/vk_swiftshader_icd.json`,
    VK_DRIVER_FILES: `${icdDir}/vk_swiftshader_icd.json`,
  },
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader',
    '--disable-vulkan-surface',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--disable-http2',
    '--ignore-certificate-errors',
  ],
});
const page = await browser.newPage();
const lines = [];
page.on('console', m => { const t = m.text(); lines.push(t); if (process.env.VERBOSE) console.log(`  . ${t}`); });
page.on('pageerror', e => { lines.push(`PAGEERR ${e.message}`); console.log(`  ! ${e.message}`); });

const mode = process.env.AUTORUN || 'msm-noble';
let q = `coi=1&autorun=${mode}&logn=${logn}&scalar_seed=${seed}`;
if (process.env.REPS) q += `&reps=${process.env.REPS}`;
if (extra) q += `&${extra}`;
console.log(`MSM ${mode} logn=${logn} seed=${seed} ${extra} on SwiftShader...`);
let runnerErr = null;
try {
  await page.goto(`http://localhost:5173/dev/msm-webgpu/index.html?${q}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(
    () => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''),
    null, { timeout: 600000 });
} catch (e) { runnerErr = e.message; }

const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  return el ? Array.from(el.children).map(c => c.textContent ?? '').join('\n') : '';
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-60)) console.log(l);
await browser.close();
const ok = /state=done/.test(logText) && !/state=error/.test(logText);
process.exit(ok ? 0 : 1);
