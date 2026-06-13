import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { join } from 'path';
const target = process.argv[2];
// Default profile lives under ~/localclaudebox so the IndexedDB-cached
// (downloaded + decompressed) SRS survives reboots and is reused across
// every agent/session that runs this driver. Cold SRS fetch+decompress
// takes 30+ s and pollutes the first MSM's timing — always run via this
// persistent driver, not via drive-index.mjs, when benching.
const profile = process.argv[3] ?? join(homedir(), 'localclaudebox', 'playwright-msm-profile');
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
ctx.setDefaultTimeout(0);
const page = ctx.pages()[0] ?? await ctx.newPage();
page.setDefaultTimeout(0);
page.on('console', m => console.log(`  · ${m.text()}`));
let runnerErr = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => /\[bench\] DONE|state=done|state=error/.test(document.getElementById('log')?.textContent ?? ''),
    null, { timeout: 600000 }
  );
} catch (e) { runnerErr = e.message; }
const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  if (!el) return '';
  return Array.from(el.children).map(c => c.textContent ?? '').join('\n');
}).catch(() => '');
const samples = await page.evaluate(() => (window).__benchSamples ?? null).catch(() => null);
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-500)) console.log(l);
if (samples) {
  console.log('─'.repeat(64));
  console.log('SAMPLES_JSON: ' + JSON.stringify(samples));
}
await ctx.close().catch(()=>{});
