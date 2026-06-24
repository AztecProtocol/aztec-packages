// Run runChonkPairedSweep with a chosen pass order to expose the ordering/thermal bias.
// WASM_FIRST=1 → WASM pass cold/first, GPU pass hot/last (the control).
// default     → GPU pass cold/first, WASM pass hot/last (what the page normally does).
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const WASM_FIRST = process.env.WASM_FIRST === '1';

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
page.on('console', m => {
  const t = m.text();
  if (/\[paired\]/i.test(t)) console.log('  [page]', t.slice(0, 160));
});
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkPairedSweep === 'function', { timeout: 60_000 });
const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(
  `adapter: ${adapter} | order: ${WASM_FIRST ? 'WASM-first (cold) / GPU-last (hot)' : 'GPU-first (cold) / WASM-last (hot)'}`,
);

await page.evaluate(wf => {
  if (wf) globalThis.__sweep_wasm_first = true;
  else delete globalThis.__sweep_wasm_first;
  window.__sweep = undefined;
  const flows = Array.from(document.querySelectorAll('#flow option')).map(o => o.value);
  window
    .runChonkPairedSweep(flows)
    .then(r => {
      window.__sweep = r.results.map(x => ({
        flow: x.flow,
        gpuMs: x.gpu?.proveMs,
        wasmMs: x.wasm?.proveMs,
        speedup: x.speedup,
        vkMatch: x.vkMatch,
      }));
    })
    .catch(e => (window.__sweep = { fatal: String(e) }));
}, WASM_FIRST);

let results;
const t0 = Date.now();
for (;;) {
  try {
    results = await page.evaluate(() => window.__sweep);
  } catch (e) {
    console.log(`poll failed: ${e.message}`);
    break;
  }
  if (results !== undefined) break;
  console.log(`  …running (${Math.round((Date.now() - t0) / 1000)}s)`);
  await new Promise(r => setTimeout(r, 5000));
}
console.log('=== RESULTS ===');
console.log(JSON.stringify({ adapter, wasmFirst: WASM_FIRST, results }, null, 2));
if (Array.isArray(results)) {
  let g = 0,
    w = 0;
  for (const r of results) if (r.gpuMs && r.wasmMs) (g += r.gpuMs), (w += r.wasmMs);
  console.log(
    `AGGREGATE: GPU ${Math.round(g)}ms  WASM ${Math.round(w)}ms  => ${(w / g).toFixed(4)} (${(100 * (w / g - 1)).toFixed(1)}% GPU faster)`,
  );
}
await browser.disconnect();
