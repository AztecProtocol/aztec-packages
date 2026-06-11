#!/usr/bin/env node
// Drive the msm-bench autorun page via headless Chrome on the LOCAL GPU
// (M4). Prints per-rep wall times; with --trace also prints a per-phase
// GPU-time breakdown aggregated from passTimes (Dawn timestamp queries).
// Usage:
//   node dev/msm-webgpu/local-bench-driver.mjs [--port 5251] [--logn 17]
//       [--reps 5] [--trace] [--profile A] [--extra "&foo=1"] [--timeout 300000]

import { chromium } from 'playwright-core';
import { parseArgs } from 'node:util';

const { values: argv } = parseArgs({
  options: {
    port: { type: 'string', default: '5251' },
    logn: { type: 'string', default: '17' },
    reps: { type: 'string', default: '5' },
    profile: { type: 'string', default: 'A' },
    trace: { type: 'boolean', default: false },
    extra: { type: 'string', default: '' },
    timeout: { type: 'string', default: '300000' },
    headed: { type: 'boolean', default: false },
  },
});

const timeoutMs = parseInt(argv.timeout, 10);
const url =
  `http://127.0.0.1:${argv.port}/dev/msm-webgpu/index.html` +
  `?autorun=msm-bench&no_wasm=1&logn=${argv.logn}&reps=${argv.reps}` +
  // --extra may carry its own scalar_dist; URLSearchParams takes the FIRST
  // occurrence, so only add the default profile when extra has none.
  (argv.extra.includes('scalar_dist=') ? '' : `&scalar_dist=profile&profile=${argv.profile}`) +
  (argv.trace ? '&trace=1' : '') +
  argv.extra;

console.log(`[bench] ${url}`);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !argv.headed,
  // timestamp_quantization off: full-resolution Dawn pass timestamps, else
  // per-phase numbers are 65.5 µs-quantized + pass-begin-coalesced mush.
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=WebGPU',
    '--enable-webgpu-developer-features',
    '--disable-dawn-features=timestamp_quantization',
    '--disable-http2',
  ],
});
const page = await browser.newPage();
page.on('console', m => {
  const t = m.text();
  if (/\[(bench|gpu|trace|iso|stats)\]|FATAL|error/i.test(t)) console.log(`  · ${t}`);
});
page.on('pageerror', e => console.log(`  ! pageerror: ${e.message}`));

let ok = true;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => {
      const w = /** @type {any} */ (window);
      return Array.isArray(w.__benchSamples) && w.__benchSamples.length > 0;
    },
    undefined,
    { timeout: timeoutMs },
  );
} catch (e) {
  ok = false;
  console.log(`[bench] driver error: ${e.message}`);
}

if (ok) {
  const samples = await page.evaluate(() => /** @type {any} */ (window).__benchSamples);
  const walls = samples.map(s => s.wallMs);
  const sorted = [...walls].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  console.log(`[bench] walls(ms): ${walls.map(w => w.toFixed(1)).join(', ')}`);
  console.log(`[bench] median=${med.toFixed(2)} min=${sorted[0].toFixed(2)}`);

  // Per-phase GPU aggregation from passTimes ([phase, beginNs, endNs] strings).
  if (samples[0]?.passTimes?.length) {
    const phaseAgg = new Map();
    const repTotals = [];
    for (const s of samples) {
      const per = new Map();
      for (const [ph, b, e] of s.passTimes) {
        const d = (Number(e) - Number(b)) / 1e6;
        per.set(ph, (per.get(ph) ?? 0) + d);
      }
      let tot = 0;
      for (const [ph, ms] of per) {
        tot += ms;
        if (!phaseAgg.has(ph)) phaseAgg.set(ph, []);
        phaseAgg.get(ph).push(ms);
      }
      repTotals.push(tot);
    }
    const medOf = a => {
      const s2 = [...a].sort((x, y) => x - y);
      return s2[Math.floor(s2.length / 2)];
    };
    console.log(`[bench] per-phase GPU ms (median across reps):`);
    const rows = [...phaseAgg.entries()].map(([ph, arr]) => [ph, medOf(arr)]);
    rows.sort((a, b) => b[1] - a[1]);
    for (const [ph, ms] of rows) console.log(`    ${ph.padEnd(18)} ${ms.toFixed(3)}`);
    console.log(`    ${'TOTAL'.padEnd(18)} ${medOf(repTotals).toFixed(3)}`);
  }
}
await browser.close();
process.exit(ok ? 0 : 1);
