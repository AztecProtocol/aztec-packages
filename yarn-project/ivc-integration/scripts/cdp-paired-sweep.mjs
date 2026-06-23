// Drive the chonk page's paired GPU↔WASM sweep on a REMOTE Chrome over CDP and
// print the per-example results as JSON. Used to run on the developer's Mac
// (real Metal GPU) from this container: the Mac launches a debug-enabled Chrome
// and reverse-tunnels its debug port here, then this script connects and drives it.
//
//   Mac:   Chrome --remote-debugging-port=9222 <gpu flags>
//   Mac:   ssh -N -R 9222:localhost:9222 <this-box>
//   here:  node scripts/cdp-paired-sweep.mjs
//
// Env: CDP_URL (default http://localhost:9222), PAGE_URL (default http://localhost:8080/).
import puppeteer from 'puppeteer';

const CDP = process.env.CDP_URL || 'http://localhost:9222';
// Use 127.0.0.1 (not localhost): VS Code / SSH port-forwards bind IPv4 127.0.0.1,
// while Chrome may resolve `localhost` to ::1 (IPv6) first and fail to connect.
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';

// protocolTimeout: 0 — the sweep runs many minutes; a single CDP call must not time out.
const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 0 });
console.log(`connected to ${CDP}`);
const page = await browser.newPage();
// Close any stale tabs from a prior run — an abandoned tab keeps its sweep proving
// on the GPU, and two concurrent sweeps would contend for the device.
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
  if (/\[paired\]|verified|VK match|adapter|swiftshader|\[ERR\]/i.test(t)) console.log('  [page]', t.slice(0, 240));
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

console.log(`navigating to ${PAGE}`);
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkPairedSweep === 'function', { timeout: 60_000 });

const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`GPU adapter: ${adapter}`);
if (/swiftshader/i.test(adapter)) {
  console.log(
    'WARNING: software WebGPU (SwiftShader) — GPU proofs will NOT verify. Launch a HEADFUL Chrome on the Mac.',
  );
}

// Kick the sweep off without blocking the evaluate (it runs for minutes); poll a marker.
await page.evaluate(() => {
  window.__sweep = undefined;
  const flows = Array.from(document.querySelectorAll('#flow option')).map(o => o.value);
  window
    .runChonkPairedSweep(flows)
    .then(r => {
      window.__sweep = r.results.map(x => ({
        flow: x.flow,
        circuits: x.numCircuits,
        gpuMs: x.gpu?.proveMs,
        gpuOk: x.gpu?.verified,
        wasmMs: x.wasm?.proveMs,
        wasmOk: x.wasm?.verified,
        speedup: x.speedup,
        vkMatch: x.vkMatch,
        error: x.error,
      }));
    })
    .catch(e => {
      window.__sweep = { fatal: e instanceof Error ? e.message : String(e) };
    });
});

console.log('sweep running on the remote GPU… (driver-side poll every 4s)');
// Driver-side poll with short evaluate calls (each returns immediately when the
// main thread is free between proves) — avoids one long-lived CDP call.
let results;
const t0 = Date.now();
for (;;) {
  try {
    results = await page.evaluate(() => window.__sweep);
  } catch (e) {
    console.log(`  [driver] poll failed — the page reloaded or the renderer crashed mid-sweep: ${e.message}`);
    break;
  }
  if (results !== undefined) break;
  console.log(`  …still running (${Math.round((Date.now() - t0) / 1000)}s)`);
  await new Promise(r => setTimeout(r, 4000));
}
if (results === undefined) {
  console.log('=== INTERRUPTED — no results (page navigation/crash) ===');
  await browser.disconnect();
  process.exit(1);
}
console.log('=== RESULTS ===');
console.log(JSON.stringify({ adapter, results }, null, 2));
await browser.disconnect();
