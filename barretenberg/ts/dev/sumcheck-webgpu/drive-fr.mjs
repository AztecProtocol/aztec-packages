// Headless driver for the Fr-primitives correctness page. Loads it with
// ?autorun=fr-ops, waits for the autorun to finish, prints the log, and exits
// non-zero on any failure.
//   node dev/sumcheck-webgpu/drive-fr.mjs                 # default logn=14
//   node dev/sumcheck-webgpu/drive-fr.mjs --headed 'index.html?autorun=fr-ops&logn=16'
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
let target = argv.find(a => !a.startsWith('--')) ?? 'index.html?autorun=fr-ops&logn=14';
if (!/^https?:/.test(target)) target = `http://localhost:5173/dev/sumcheck-webgpu/${target}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-http2'],
});
const page = await browser.newPage();
page.on('console', m => console.log(`  · ${m.text()}`));
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

console.log(`navigating: ${target}`);
let runnerErr = null;
let state = null;
try {
  await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(
    () => /\[autorun\] state=/.test(document.getElementById('log')?.textContent ?? ''),
    { timeout: 600000 },
  );
  state = await page.evaluate(() => {
    const t = document.getElementById('log')?.textContent ?? '';
    const m = t.match(/\[autorun\] state=(\w+)/);
    return m ? m[1] : null;
  });
} catch (e) {
  runnerErr = e.message;
}

const logText = await page.evaluate(() => {
  const el = document.getElementById('log');
  return el ? Array.from(el.children).map(c => c.textContent ?? '').join('\n') : '';
});
console.log('─'.repeat(64));
if (runnerErr) console.log(`runner: ${runnerErr}`);
for (const l of logText.split('\n').slice(-40)) console.log(l);
await browser.close();
process.exit(runnerErr || state !== 'ok' ? 1 : 0);
