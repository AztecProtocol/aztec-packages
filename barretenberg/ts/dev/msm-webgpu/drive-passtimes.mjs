// One-off: run ?autorun=msm-trace and summarize window.__lastPassTimes per phase.
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { join } from 'path';
const target = process.argv[2];
const profile = process.argv[3] ?? join(homedir(), 'localclaudebox', 'playwright-msm-profile');
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
ctx.setDefaultTimeout(0);
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(0);
let err = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => /\[bench\] DONE|state=error/.test(document.getElementById('log')?.textContent ?? ''),
    null,
    { timeout: 600000 },
  );
} catch (e) {
  err = e.message;
}
const pt = await page.evaluate(() => (window.__lastPassTimes ?? []).map(([p, b, e]) => [p, Number(b), Number(e)]));
await ctx.close();
if (err) {
  console.log(`runner: ${err}`);
  process.exit(1);
}
// Summarize: total + per-phase sums across all captured runs; also per-pass list for 'reduce'.
const byPhase = new Map();
let total = 0;
for (const [phase, b, e] of pt) {
  const d = (e - b) / 1e3; // ns -> us
  total += d;
  byPhase.set(phase, (byPhase.get(phase) ?? 0) + d);
}
console.log(`passes=${pt.length} totalGpuUs=${total.toFixed(0)}`);
for (const [p, us] of [...byPhase.entries()].sort((a, b2) => b2[1] - a[1]))
  console.log(`${p}\t${us.toFixed(0)}us\t${((100 * us) / total).toFixed(1)}%`);
const reduces = pt.filter(([p]) => p === 'reduce');
console.log(`reduce passes: ${reduces.length}`);
console.log(reduces.map(([, b, e]) => ((e - b) / 1e3).toFixed(0)).join(','));
