// Reproduce the page's "Run WASM" then "Run WebGPU" buttons exactly: call
// runChonkModeMulti(mode, flow, runs) per mode (warm-backend reuse, median), in the
// order the user clicks. Reports each median + the same wasm/webgpu speedup the page shows.
// Env: FLOW, RUNS (default 5), ORDER ("wasm,webgpu" default | "webgpu,wasm").
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
const RUNS = parseInt(process.env.RUNS || '5', 10);
const ORDER = (process.env.ORDER || 'wasm,webgpu').split(',');

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
  if (/\[multi:/i.test(t)) console.log('  [page]', t.slice(0, 140));
});
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkModeMulti === 'function', { timeout: 60_000 });
const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`adapter: ${adapter} | flow: ${FLOW} | runs: ${RUNS} | order: ${ORDER.join(' → ')}`);

async function runOne(mode) {
  await page.evaluate(
    (m, flow, runs) => {
      window.__mm = undefined;
      window
        .runChonkModeMulti(m, flow, runs)
        .then(
          r =>
            (window.__mm = {
              medianTotal: r.medianTotal,
              min: r.minTotal,
              max: r.maxTotal,
              totals: r.totals,
              reused: r.reused,
              initMs: r.initMs,
            }),
        )
        .catch(e => (window.__mm = { fatal: e instanceof Error ? e.message : String(e) }));
    },
    mode,
    FLOW,
    RUNS,
  );
  const t0 = Date.now();
  for (;;) {
    let r;
    try {
      r = await page.evaluate(() => window.__mm);
    } catch (e) {
      return { fatal: e.message };
    }
    if (r !== undefined) return r;
    if ((Date.now() - t0) % 20000 < 3000) console.log(`    …${mode} (${Math.round((Date.now() - t0) / 1000)}s)`);
    await new Promise(res => setTimeout(res, 3000));
  }
}

const out = {};
for (const mode of ORDER) {
  console.log(`\n=== clicking "Run ${mode}" ===`);
  const r = await runOne(mode);
  out[mode] = r;
  console.log(
    `  ${mode}: median=${r.medianTotal?.toFixed?.(0)} min=${r.min?.toFixed?.(0)} reused=${r.reused} initMs=${r.initMs?.toFixed?.(0)} totals=[${(r.totals || []).map(t => t.toFixed(0)).join(',')}]`,
  );
}
const wasm = out.wasm,
  gpu = out.webgpu;
if (wasm?.medianTotal && gpu?.medianTotal) {
  const spd = wasm.medianTotal / gpu.medianTotal;
  console.log(`\n=== PAGE-STYLE SPEEDUP (wasmMedian / webgpuMedian) ===`);
  console.log(
    `wasm=${wasm.medianTotal.toFixed(0)}  webgpu=${gpu.medianTotal.toFixed(0)}  speedup=${spd.toFixed(4)} = ${(100 * (spd - 1)).toFixed(1)}% GPU faster`,
  );
}
await browser.disconnect();
