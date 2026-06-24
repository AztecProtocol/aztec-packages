// Run one WebGPU prove of a flow and capture every bridge MSM-routing line so we can
// see which MSM sizes are delegated to the GPU (and their GPU times) vs kept on CPU.
// Env: FLOW.
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+storage_proof_7_layers+sponsored_fpc';

const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 0 });
const page = await browser.newPage();
for (const p of await browser.pages()) {
  if (p !== page) {
    try {
      await p.close();
    } catch {
      /* ignore */
    }
  }
}
const lines = [];
page.on('console', m => {
  const t = m.text();
  if (/\[msm\]|\[batch|route=|routing (accepted|rejected)|\[msm-route\]|create n=/i.test(t)) lines.push(t);
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkSingleMode === 'function', { timeout: 60_000 });
const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`adapter: ${adapter} | flow: ${FLOW}`);
if (process.env.SETUP_JS) {
  await page.evaluate(s => (0, eval)(s), process.env.SETUP_JS);
  console.log(`applied: ${process.env.SETUP_JS}`);
}

await page.evaluate(flow => {
  window.__done = undefined;
  window
    .runChonkSingleMode('webgpu', flow)
    .then(r => (window.__done = { proveMs: r.result.proveMs, verified: r.result.verified }))
    .catch(e => (window.__done = { fatal: e instanceof Error ? e.message : String(e) }));
}, FLOW);
let r;
const t0 = Date.now();
for (;;) {
  try {
    r = await page.evaluate(() => window.__done);
  } catch (e) {
    console.log(`poll failed: ${e.message}`);
    break;
  }
  if (r !== undefined) break;
  console.log(`  …proving (${Math.round((Date.now() - t0) / 1000)}s)`);
  await new Promise(res => setTimeout(res, 5000));
}
console.log(`prove: ${JSON.stringify(r)}`);

// Summarize: unique n delegated to GPU (from [msm] / [batch] / route lines), with counts.
const nCounts = new Map(); // n -> {count, kinds:Set, route}
const rejected = new Map();
for (const l of lines) {
  const nm = l.match(/n=(\d+)/);
  if (!nm) continue;
  const n = Number(nm[1]);
  if (/rejected/.test(l)) {
    rejected.set(n, (rejected.get(n) || 0) + 1);
    continue;
  }
  const kind = (l.match(/kind=(\S+)/) || [])[1] || (/\[batch/.test(l) ? 'batch' : /route=cpu/.test(l) ? 'cpu' : 'gpu');
  const cur = nCounts.get(n) || { count: 0, kinds: new Set() };
  cur.count++;
  cur.kinds.add(kind);
  nCounts.set(n, cur);
}
const sorted = [...nCounts.entries()].sort((a, b) => b[0] - a[0]);
console.log(`\n=== unique MSM sizes seen in bridge telemetry (largest first) ===`);
for (const [n, v] of sorted) {
  console.log(`  n=${String(n).padStart(7)}  count=${String(v.count).padStart(3)}  kinds=${[...v.kinds].join(',')}`);
}
if (rejected.size) {
  console.log(`\n=== batch-rejected sizes (fell back to solo/mixed) ===`);
  for (const [n, c] of [...rejected.entries()].sort((a, b) => b[0] - a[0])) console.log(`  n=${n} x${c}`);
}
console.log(`\ntotal bridge MSM lines captured: ${lines.length}`);
console.log('--- sample of largest-n lines ---');
const big = lines.filter(l => /n=(\d{6,})/.test(l)).slice(0, 20);
for (const l of big) console.log('  ' + l.slice(0, 180));
await browser.disconnect();
