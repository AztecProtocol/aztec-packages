// Paired A/B in ONE page session to control for thermal drift: run runChonkMedian
// twice (config A then config B) back-to-back. The WASM median is the invariant
// anchor — if WASM matches across A and B, the WebGPU delta is the real config effect.
// Env: CDP_URL, PAGE_URL, FLOW, RUNS (default 6), SETUP_A, SETUP_B, LABEL_A, LABEL_B.
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
const RUNS = parseInt(process.env.RUNS || '6', 10);
const SETUP_A = process.env.SETUP_A || '';
const SETUP_B = process.env.SETUP_B || '';
const LABEL_A = process.env.LABEL_A || 'A';
const LABEL_B = process.env.LABEL_B || 'B';

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
  if (/\[median\]|route=|rejected|\[ERR\]/i.test(t)) console.log('  [page]', t.slice(0, 160));
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkMedian === 'function', { timeout: 60_000 });
const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`GPU adapter: ${adapter}`);

async function runMedian(setup, label) {
  console.log(`\n--- ${label}: SETUP=${setup || '(none)'} ---`);
  await page.evaluate(s => {
    // Reset batch knobs to a known state, then apply this config.
    delete globalThis.__bridge_batch_enabled;
    delete globalThis.__bridge_batch_min_b;
    delete globalThis.__bridge_blocklist_override;
    if (s) (0, eval)(s);
  }, setup);
  await page.evaluate(
    (flow, runs) => {
      window.__m = undefined;
      window.runChonkMedian(flow, runs).then(r => (window.__m = r)).catch(e => (window.__m = { fatal: String(e) }));
    },
    FLOW,
    RUNS,
  );
  const t0 = Date.now();
  for (;;) {
    let r;
    try {
      r = await page.evaluate(() => window.__m);
    } catch (e) {
      return { fatal: e.message };
    }
    if (r !== undefined) {
      if (r.fatal) return r;
      console.log(
        `  ${label}: wasm med=${r.wasm.medianTotal.toFixed(0)} (min ${r.wasm.minTotal.toFixed(0)}) | webgpu med=${r.webgpu.medianTotal.toFixed(0)} (min ${r.webgpu.minTotal.toFixed(0)}) | spd=${(r.wasm.medianTotal / r.webgpu.medianTotal).toFixed(4)}`,
      );
      return r;
    }
    if ((Date.now() - t0) % 20000 < 4000) console.log(`  …${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
    await new Promise(res => setTimeout(res, 4000));
  }
}

const A = await runMedian(SETUP_A, LABEL_A);
const B = await runMedian(SETUP_B, LABEL_B);
console.log('\n=== PAIRED A/B ===');
const out = {
  adapter,
  [LABEL_A]: { wasm: A.wasm?.medianTotal, webgpu: A.webgpu?.medianTotal, webgpuMin: A.webgpu?.minTotal },
  [LABEL_B]: { wasm: B.wasm?.medianTotal, webgpu: B.webgpu?.medianTotal, webgpuMin: B.webgpu?.minTotal },
};
if (A.webgpu && B.webgpu) {
  out.webgpuDelta_BminusA = Number((B.webgpu.medianTotal - A.webgpu.medianTotal).toFixed(1));
  out.wasmDrift_BminusA = Number((B.wasm.medianTotal - A.wasm.medianTotal).toFixed(1));
  out.note = 'real config effect ≈ webgpuDelta − wasmDrift (wasm is the thermal anchor)';
  out.configEffect = Number((out.webgpuDelta_BminusA - out.wasmDrift_BminusA).toFixed(1));
}
console.log(JSON.stringify(out, null, 2));
await browser.disconnect();
