// Headless driver for the sumcheck-webgpu test dashboard. Runs a suite (default
// "all") via ?autorun=<id>, waits for the [autorun] state marker, prints the
// log, and exits non-zero on any failure.
//   node dev/sumcheck-webgpu/drive.mjs              # all suites
//   node dev/sumcheck-webgpu/drive.mjs mono         # one suite (fr | mono | arith)
//   node dev/sumcheck-webgpu/drive.mjs --headed all
//   LOGN=16 node dev/sumcheck-webgpu/drive.mjs
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
const which = argv.find(a => !a.startsWith('--')) ?? 'all';
const logn = process.env.LOGN ?? '14';
// The benchmark's WASM column uses bb.js threads, which need cross-origin
// isolation (SharedArrayBuffer); request it via ?coi=1 for the WASM-backed targets.
// The WASM-backed targets use bb.js threads (SharedArrayBuffer), which need
// cross-origin isolation; request it via ?coi=1. The e2e timeline times a WASM
// tail/baseline, so it needs it too; the memory profile is GPU-only.
const coi = which === 'bench' || which === 'sshybrid' || which === 'e2e' ? '&coi=1' : '';
// `T=<n> drive.mjs sshybrid|e2e` sets the WASM tail rounds (sshybrid: fallback
// threshold; e2e: hybrid split tail, k = d - T GPU front rounds).
const tParam = (which === 'sshybrid' || which === 'e2e') && process.env.T ? `&t=${process.env.T}` : '';
const target = `http://localhost:5173/dev/sumcheck-webgpu/index.html?autorun=${which}&logn=${logn}${coi}${tParam}`;

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
for (const l of logText.split('\n').slice(-50)) console.log(l);
await browser.close();
process.exit(runnerErr || state !== 'ok' ? 1 : 0);
