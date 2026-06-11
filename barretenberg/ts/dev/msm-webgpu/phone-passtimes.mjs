// Phone variant of drive-passtimes: connect to content_shell over CDP
// (adb forward localabstract:content_shell_devtools_remote), navigate to an
// ?autorun=msm-trace URL, and summarize window.__lastPassTimes per phase.
// Usage: node phone-passtimes.mjs <cdp-endpoint> <msm-trace-url> [timeout-s]
import { chromium } from 'playwright-core';

const [endpoint, target, timeoutS = '420'] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
if (!page) throw new Error('no page over CDP');
page.setDefaultTimeout(0);
let err = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => /\[bench\] DONE|state=error/.test(document.getElementById('log')?.textContent ?? ''),
    null,
    { timeout: parseInt(timeoutS, 10) * 1000 },
  );
} catch (e) {
  err = e.message;
}
const logTail = await page
  .evaluate(() => (document.getElementById('log')?.textContent ?? '').split('\n').slice(-8).join('\n'))
  .catch(() => '');
const pt = await page.evaluate(() => (window.__lastPassTimes ?? []).map(([p, b, e]) => [p, Number(b), Number(e)]));
await browser.close().catch(() => {});
if (err) {
  console.log(`runner: ${err}\n${logTail}`);
  process.exit(1);
}
const byPhase = new Map();
let total = 0;
for (const [phase, b, e] of pt) {
  const d = (e - b) / 1e3;
  total += d;
  byPhase.set(phase, (byPhase.get(phase) ?? 0) + d);
}
console.log(logTail);
console.log(`passes=${pt.length} totalGpuUs=${total.toFixed(0)}`);
for (const [p, us] of [...byPhase.entries()].sort((a, b2) => b2[1] - a[1]))
  console.log(`${p}\t${us.toFixed(0)}us\t${((100 * us) / total).toFixed(1)}%`);
const reduces = pt.filter(([p]) => String(p).startsWith('reduce'));
console.log(`reduce-phase passes: ${reduces.length}`);
console.log(reduces.map(([, b, e]) => ((e - b) / 1e3).toFixed(0)).join(','));
