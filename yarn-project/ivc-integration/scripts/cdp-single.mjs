// Drive runChonkSingleMode(mode) for wasm + webgpu N times and report the
// ground-truth C++ MSM-phase wall (msmPhaseMs), proveMs, and the GPU gpuPhase
// breakdown. Decisive A/B: is the GPU MSM phase faster than the 16-thread WASM
// MSM phase, or parity? Env: CDP_URL, PAGE_URL, FLOW, RUNS (default 3), SETUP_JS.
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
const RUNS = parseInt(process.env.RUNS || '3', 10);
const SETUP_JS = process.env.SETUP_JS || '';

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
  if (/msm-phase-total|bench-single|\[ERR\]/i.test(t)) console.log('  [page]', t.slice(0, 200));
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkSingleMode === 'function', { timeout: 60_000 });
const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`GPU adapter: ${adapter}`);
if (SETUP_JS) {
  await page.evaluate(s => (0, eval)(s), SETUP_JS);
  console.log(`applied: ${SETUP_JS}`);
}

async function once(mode) {
  await page.evaluate(
    (m, flow) => {
      window.__single = undefined;
      window
        .runChonkSingleMode(m, flow)
        .then(r => {
          window.__single = {
            proveMs: r.result.proveMs,
            verified: r.result.verified,
            msmPhaseMs: r.result.msmPhaseMs,
            gpuPhase: r.gpuPhase || null,
          };
        })
        .catch(e => {
          window.__single = { fatal: e instanceof Error ? e.message : String(e) };
        });
    },
    mode,
    FLOW,
  );
  for (;;) {
    let r;
    try {
      r = await page.evaluate(() => window.__single);
    } catch (e) {
      return { fatal: e.message };
    }
    if (r !== undefined) return r;
    await new Promise(res => setTimeout(res, 3000));
  }
}

const out = { adapter, flow: FLOW, runs: RUNS, wasm: [], webgpu: [] };
for (const mode of ['wasm', 'webgpu']) {
  for (let i = 0; i < RUNS; i++) {
    const r = await once(mode);
    console.log(
      `${mode} run ${i + 1}: prove=${r.proveMs?.toFixed?.(0)} msmPhase=${r.msmPhaseMs?.toFixed?.(0)} verified=${r.verified}${r.fatal ? ' FATAL=' + r.fatal : ''}`,
    );
    out[mode].push(r);
  }
}
const med = arr => {
  const s = arr.filter(x => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const summary = {
  adapter,
  wasm: { proveMed: med(out.wasm.map(r => r.proveMs)), msmPhaseMed: med(out.wasm.map(r => r.msmPhaseMs)) },
  webgpu: {
    proveMed: med(out.webgpu.map(r => r.proveMs)),
    msmPhaseMed: med(out.webgpu.map(r => r.msmPhaseMs)),
    gpuPhase: out.webgpu[out.webgpu.length - 1]?.gpuPhase,
  },
};
summary.msmPhaseSpeedup = Number((summary.wasm.msmPhaseMed / summary.webgpu.msmPhaseMed).toFixed(3));
console.log('=== MSM-PHASE A/B ===');
console.log(JSON.stringify(summary, null, 2));
await browser.disconnect();
