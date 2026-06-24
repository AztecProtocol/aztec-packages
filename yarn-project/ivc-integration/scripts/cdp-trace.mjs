// Capture a paired e2e Perfetto trace (WebGPU + WASM) on the remote GPU via CDP and
// write both traceJson files + print the validation split (GPU-pass vs bridge submit/wait
// vs untracked). Feed the pair to chonk-trace-attribution.mjs for the host-overhead breakdown.
//
// Env: CDP_URL, PAGE_URL, FLOW, SETUP_JS (config hooks), OUT_DIR (default scratchpad).
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+transfer_1_recursions+sponsored_fpc';
const SETUP_JS = process.env.SETUP_JS || '';
const OUT_DIR = process.env.OUT_DIR || '.';
const TAG = process.env.TAG || 'cur';

const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 0 });
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
  if (/\[trace\]|validation|adapter|swiftshader|\[ERR\]/i.test(t)) console.log('  [page]', t.slice(0, 260));
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

console.log(`navigating to ${PAGE}`);
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkWebGpuTrace === 'function', { timeout: 60_000 });

const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`GPU adapter: ${adapter}`);

if (SETUP_JS) {
  console.log(`applying SETUP_JS: ${SETUP_JS}`);
  await page.evaluate(s => (0, eval)(s), SETUP_JS);
}

async function capture(webgpu) {
  const tag = webgpu ? 'webgpu' : 'wasm';
  console.log(`capturing ${tag} trace…`);
  await page.evaluate(
    (flow, wg) => {
      window.__trace = undefined;
      window
        .runChonkWebGpuTrace(flow, { webgpu: wg })
        .then(r => {
          window.__trace = r;
        })
        .catch(e => {
          window.__trace = { fatal: e instanceof Error ? e.message : String(e) };
        });
    },
    FLOW,
    webgpu,
  );
  let r;
  const t0 = Date.now();
  for (;;) {
    try {
      r = await page.evaluate(() => window.__trace);
    } catch (e) {
      console.log(`  [driver] poll failed: ${e.message}`);
      break;
    }
    if (r !== undefined) break;
    console.log(`  …${tag} running (${Math.round((Date.now() - t0) / 1000)}s)`);
    await new Promise(res => setTimeout(res, 4000));
  }
  if (!r || r.fatal) {
    console.log(`${tag} FAILED: ${JSON.stringify(r)}`);
    return null;
  }
  const file = `${OUT_DIR}/chonk-${tag}-${TAG}-trace.json`;
  writeFileSync(file, r.traceJson);
  console.log(`  wrote ${file} (${(r.traceJson.length / 1024).toFixed(0)} KB)`);
  console.log(`  ${tag}: prove=${r.proveMs?.toFixed?.(0)}ms verified=${r.verified} validation=${JSON.stringify(r.validation)}`);
  console.log(`  ${tag} top spans:`);
  for (const t of (r.top || []).slice(0, 14)) {
    console.log(`    ${String(t.totalMs.toFixed(1)).padStart(8)}ms ×${String(t.count).padStart(4)} [${t.lane}] ${t.name}`);
  }
  return r;
}

const ONLY = process.env.ONLY || '';
const wg = ONLY === 'wasm' ? null : await capture(true);
const wasm = ONLY === 'webgpu' ? null : await capture(false);
console.log('=== DONE ===');
console.log(JSON.stringify({ adapter, webgpu: wg?.validation, wasm: wasm?.validation }, null, 2));
await browser.disconnect();
