// Focused CDP driver: run runChonkMedian(flow, runs) on the remote GPU and print JSON.
// Far faster to iterate than the full 11-flow paired sweep. Lets a measurement harness
// inject __bridge_* config hooks via SETUP_JS before the median runs.
//
// Env:
//   CDP_URL   (default http://127.0.0.1:9222)
//   PAGE_URL  (default http://127.0.0.1:8080/)
//   FLOW      (default ecdsar1+transfer_1_recursions+sponsored_fpc)
//   RUNS      (default 8)
//   SETUP_JS  optional JS evaluated in the page before the median (set __bridge_* hooks)
//   LABEL     optional tag echoed back in the result
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
const RUNS = parseInt(process.env.RUNS || '8', 10);
const SETUP_JS = process.env.SETUP_JS || '';
const LABEL = process.env.LABEL || '';

const browser = await puppeteer.connect({
  browserURL: CDP,
  defaultViewport: null,
  protocolTimeout: 0,
});
console.log(`connected to ${CDP}`);
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
  if (/\[median\]|verified|adapter|swiftshader|\[ERR\]|error|route=|batch-v2|rejected/i.test(t))
    console.log('  [page]', t.slice(0, 240));
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

console.log(`navigating to ${PAGE}`);
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkMedian === 'function', {
  timeout: 60_000,
});

const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`GPU adapter: ${adapter}`);
if (/swiftshader/i.test(adapter)) {
  console.log('WARNING: software WebGPU (SwiftShader) — GPU proofs will NOT verify.');
}

if (SETUP_JS) {
  console.log(`applying SETUP_JS: ${SETUP_JS}`);
  await page.evaluate(s => {
    // eslint-disable-next-line no-eval
    (0, eval)(s);
  }, SETUP_JS);
}

await page.evaluate(
  (flow, runs) => {
    window.__median = undefined;
    window
      .runChonkMedian(flow, runs)
      .then(r => {
        window.__median = r;
      })
      .catch(e => {
        window.__median = { fatal: e instanceof Error ? e.message : String(e) };
      });
  },
  FLOW,
  RUNS,
);

console.log(`median running on remote GPU: flow=${FLOW} runs=${RUNS} (poll every 4s)…`);
let result;
const t0 = Date.now();
for (;;) {
  try {
    result = await page.evaluate(() => window.__median);
  } catch (e) {
    console.log(`  [driver] poll failed — page reloaded / renderer crashed: ${e.message}`);
    break;
  }
  if (result !== undefined) break;
  console.log(`  …still running (${Math.round((Date.now() - t0) / 1000)}s)`);
  await new Promise(r => setTimeout(r, 4000));
}
if (result === undefined || result?.fatal) {
  console.log('=== FAILED ===');
  console.log(JSON.stringify({ label: LABEL, adapter, flow: FLOW, runs: RUNS, result }, null, 2));
  await browser.disconnect();
  process.exit(1);
}

const wasm = result.wasm,
  gpu = result.webgpu;
const speedup = wasm.medianTotal / gpu.medianTotal;
const summary = {
  label: LABEL,
  adapter,
  flow: FLOW,
  runs: RUNS,
  wasm: {
    median: wasm.medianTotal,
    min: wasm.minTotal,
    max: wasm.maxTotal,
    totals: wasm.totals,
    ok: wasm.allVerified,
  },
  webgpu: {
    median: gpu.medianTotal,
    min: gpu.minTotal,
    max: gpu.maxTotal,
    totals: gpu.totals,
    ok: gpu.allVerified,
  },
  speedup: Number(speedup.toFixed(4)),
  pctFaster: Number(((speedup - 1) * 100).toFixed(2)),
};
console.log('=== MEDIAN RESULT ===');
console.log(JSON.stringify(summary, null, 2));
await browser.disconnect();
