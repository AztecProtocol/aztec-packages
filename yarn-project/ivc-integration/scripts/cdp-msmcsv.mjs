// Drive runChonkMsmCsv(flow) on the remote GPU: per-MSM cpu_ms vs gpu_ms for a flow.
// Use to inspect WHERE the large MSMs are and whether the GPU wins on them.
// Env: FLOW (required-ish), OUT (csv path).
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:8080/';
const FLOW = process.env.FLOW || 'ecdsar1+storage_proof_7_layers+sponsored_fpc';
const OUT = process.env.OUT || '/tmp/msmcsv.csv';

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
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.goto(PAGE, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => typeof window.runChonkMsmCsv === 'function', { timeout: 60_000 });
const adapter = await page.evaluate(() => document.querySelector('#adapter')?.textContent || 'n/a');
console.log(`adapter: ${adapter} | flow: ${FLOW}`);

await page.evaluate(flow => {
  window.__csv = undefined;
  window
    .runChonkMsmCsv(flow)
    .then(r => (window.__csv = { csv: r.csv, rowCount: r.rowCount, cpuOnly: r.cpuOnly, gpuOnly: r.gpuOnly }))
    .catch(e => (window.__csv = { fatal: e instanceof Error ? e.message : String(e) }));
}, FLOW);

let r;
const t0 = Date.now();
for (;;) {
  try {
    r = await page.evaluate(() => window.__csv);
  } catch (e) {
    console.log(`poll failed: ${e.message}`);
    break;
  }
  if (r !== undefined) break;
  console.log(`  …running (${Math.round((Date.now() - t0) / 1000)}s)`);
  await new Promise(res => setTimeout(res, 5000));
}
if (!r || r.fatal) {
  console.log('FAILED:', JSON.stringify(r));
  await browser.disconnect();
  process.exit(1);
}
writeFileSync(OUT, r.csv);
console.log(`wrote ${OUT}  rows=${r.rowCount} cpuOnly=${r.cpuOnly} gpuOnly=${r.gpuOnly}`);
// Print header + the largest-n rows (where the GPU should shine).
const lines = r.csv.trim().split('\n');
console.log('header:', lines[0]);
const header = lines[0].split(',');
const ni = header.indexOf('n'),
  ci = header.findIndex(h => /cpu/.test(h)),
  gi = header.findIndex(h => /gpu/.test(h));
const rows = lines.slice(1).map(l => l.split(','));
rows.sort((a, b) => Number(b[ni]) - Number(a[ni]));
console.log(`\nTop 25 rows by n (n, cpu_ms, gpu_ms, cpu/gpu speedup):`);
for (const row of rows.slice(0, 25)) {
  const n = Number(row[ni]),
    cpu = Number(row[ci]),
    gpu = Number(row[gi]);
  const spd = gpu > 0 ? (cpu / gpu).toFixed(2) : '-';
  console.log(`  ${row[0].slice(0, 28).padEnd(28)} n=${String(n).padStart(7)}  cpu=${String(cpu.toFixed(1)).padStart(8)}  gpu=${String(gpu.toFixed(1)).padStart(8)}  cpu/gpu=${spd}`);
}
await browser.disconnect();
