// SwiftShader headless WebGPU MSM driver.
//   node swiftshader-msm.mjs <logn> [autorun=msm-cross-check]
import { chromium } from 'playwright-core';
const CHROME = process.env.CHROMIUM_PATH || '/opt/ms-playwright/chromium-1148/chrome-linux/chrome';
const ICD = '/opt/ms-playwright/chromium-1148/chrome-linux/vk_swiftshader_icd.json';
const logn = process.argv[2] || '10';
const autorun = process.argv[3] || 'msm-cross-check';
const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-webgpu-adapter=swiftshader',
         '--enable-unsafe-swiftshader','--disable-gpu-sandbox','--disable-http2','--ignore-certificate-errors'],
  env: { ...process.env, VK_ICD_FILENAMES: ICD, VK_ICD_FILENAME: ICD },
});
const page = await browser.newPage();
const domLog = [];
page.on('console', m => { const t=m.text(); if(/cross-check|autorun|\[err|\[gpu|FATAL|disagree|agree/.test(t)) console.log(`  . ${t}`); });
page.on('pageerror', e => console.log(`  ! ${e.message}`));
const url = `http://localhost:5173/dev/msm-webgpu/index.html?coi=1&autorun=${autorun}&logn=${logn}`;
console.log(`MSM ${autorun} logn=${logn} on SwiftShader...`);
let runnerErr = null, finalLog = '';
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''), null, { timeout: 1800000 });
  // Capture immediately after the terminal line appears, before any teardown.
  finalLog = await page.evaluate(() => {
    const el = document.getElementById('log'); if (!el) return '';
    return Array.from(el.children).map(c => c.textContent ?? '').join('\n');
  });
} catch (e) { runnerErr = e.message;
  try { finalLog = await page.evaluate(() => Array.from(document.getElementById('log')?.children ?? []).map(c=>c.textContent??'').join('\n')); } catch {}
}
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of finalLog.split('\n').slice(-60)) console.log(l);
await browser.close();
const ok = /(cross-check|ref-check).*\bagree\b/i.test(finalLog) && !/disagree/i.test(finalLog);
console.log(`\n>>> CROSSCHECK ${ok ? 'PASS' : 'FAIL'} (logn=${logn})`);
process.exit(ok ? 0 : 1);
