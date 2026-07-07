#!/usr/bin/env node
// Decompose a paired Chonk WebGPU vs WASM e2e Perfetto trace into a rigorous
// performance attribution, so a single trace pair is never mistaken for the
// real (median) win. Produced for the WebGPU-MSM optimisation effort; see
// src/msm_webgpu/docs/MSM_IMPL.md §5.2 for the analysis this encodes.
//
// Usage:
//   node chonk-trace-attribution.mjs <webgpu-trace.json> <wasm-trace.json> [--median <median.json>]
//
// Both traces are Perfetto JSON ({traceEvents:[{ph:'X',name,ts,dur,tid,args}]})
// captured with BB_BENCH + the bridge trace lanes ("WASM main",
// "GPU (WebGPU passes)", "CPU (host MSM bridge)").
//
// What it reports (and why each matters for the 20% target):
//   1. Clock-coherence check — flags when a trace's total is an outlier vs the
//      supplied 20-run median, the #1 way single-trace comparisons mislead.
//   2. Per-commit-group CPU-vs-WebGPU table — shows which groups the GPU wins
//      (single dense MSMs) vs loses (same-N wires, structured translator).
//   3. GPU-busy vs host-overhead split — the gap is the synchronous-dispatch
//      tax; shrinking it toward the GPU-busy floor is the path to the target.
//   4. Bridge-thread span breakdown — separates genuine marshalling from the
//      backpressure stalls that masquerade as "prepare" time.

import fs from 'fs';

const args = process.argv.slice(2);
const medianIdx = args.indexOf('--median');
const medianPath = medianIdx >= 0 ? args[medianIdx + 1] : null;
const [webgpuPath, wasmPath] = args.filter((a, i) => a !== '--median' && args[i - 1] !== '--median');
if (!webgpuPath || !wasmPath) {
  console.error('usage: chonk-trace-attribution.mjs <webgpu-trace.json> <wasm-trace.json> [--median <median.json>]');
  process.exit(1);
}

function load(p) {
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ev = Array.isArray(t) ? t : t.traceEvents;
  const tidByName = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') tidByName.set(e.args?.name, e.tid);
  const X = ev.filter(e => e.ph === 'X');
  let mn = Infinity,
    mx = -Infinity;
  for (const e of X) {
    if (e.ts < mn) mn = e.ts;
    if (e.ts + e.dur > mx) mx = e.ts + e.dur;
  }
  return { X, tid: n => tidByName.get(n), spanMs: (mx - mn) / 1000 };
}

// Union (merged-interval) length in ms of a thread's spans within [s,e].
function busyMs(X, tid, s = -Infinity, e = Infinity) {
  if (tid == null) return 0;
  const iv = [];
  for (const ev of X)
    if (ev.tid === tid && ev.ts < e && ev.ts + ev.dur > s) iv.push([Math.max(ev.ts, s), Math.min(ev.ts + ev.dur, e)]);
  if (!iv.length) return 0;
  iv.sort((a, b) => a[0] - b[0]);
  let tot = 0,
    [cs, ce] = iv[0];
  for (let i = 1; i < iv.length; i++) {
    const [a, b] = iv[i];
    if (a > ce) {
      tot += ce - cs;
      cs = a;
      ce = b;
    } else if (b > ce) ce = b;
  }
  return (tot + ce - cs) / 1000;
}

// Sum of durations of main-thread spans whose name matches `re` (commit groups).
function groupSums(X, mainTid, re) {
  const agg = new Map();
  for (const e of X) {
    if (e.tid !== mainTid || !re.test(e.name)) continue;
    const k = e.name.replace(/[0-9]+/g, '#');
    const v = agg.get(k) ?? { n: 0, dur: 0 };
    v.n++;
    v.dur += e.dur;
    agg.set(k, v);
  }
  return agg;
}

const wg = load(webgpuPath);
const wa = load(wasmPath);

console.log('================ Chonk WebGPU vs WASM trace attribution ================');
console.log(`WebGPU trace span: ${wg.spanMs.toFixed(0)}ms   WASM trace span: ${wa.spanMs.toFixed(0)}ms`);
console.log(
  `Single-pair "speedup": ${(wa.spanMs / wg.spanMs).toFixed(3)}×  (${((1 - wg.spanMs / wa.spanMs) * 100).toFixed(1)}% faster)`,
);

// 1. Clock-coherence check vs median.
if (medianPath) {
  const m = JSON.parse(fs.readFileSync(medianPath, 'utf8'));
  const check = (label, spanMs, side) => {
    const med = side?.medianTotal,
      mn = side?.minTotal,
      mx = side?.maxTotal;
    if (med == null) return;
    const dev = ((spanMs - med) / med) * 100;
    const flag =
      spanMs > mx * 0.999 ? '  ⚠ SLOWEST-RUN OUTLIER' : spanMs < mn * 1.001 ? '  ⚠ fastest-run outlier' : '';
    console.log(
      `  ${label}: trace=${spanMs.toFixed(0)}ms vs median=${med.toFixed(0)}ms (${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%) [${mn?.toFixed(0)}-${mx?.toFixed(0)}]${flag}`,
    );
  };
  console.log('\n--- 1. Clock-coherence vs 20-run median (trust the median, not the pair) ---');
  check('WebGPU', wg.spanMs, m.webgpu);
  check('WASM  ', wa.spanMs, m.wasm);
  if (m.wasm?.medianTotal && m.webgpu?.medianTotal)
    console.log(
      `  => ROBUST median speedup: ${(m.wasm.medianTotal / m.webgpu.medianTotal).toFixed(3)}× (${((1 - m.webgpu.medianTotal / m.wasm.medianTotal) * 100).toFixed(1)}% faster)`,
    );
}

// 2. Per-commit-group CPU vs WebGPU (median-correct the WASM side if median given).
const GROUP_RE = /commit_to|TranslatorProver|ECCVMProver::execute_wire|IPA::srs_msm|batch_commit/;
const wgMain = wg.tid('WASM main'),
  waMain = wa.tid('WASM main');
let corr = 1;
if (medianPath) {
  const m = JSON.parse(fs.readFileSync(medianPath, 'utf8'));
  if (m.wasm?.medianTotal) corr = m.wasm.medianTotal / wa.spanMs; // scale slow WASM run -> median
}
console.log(
  `\n--- 2. Per-commit-group: WASM${corr !== 1 ? ` (×${corr.toFixed(3)} median-corrected)` : ''} vs WebGPU ---`,
);
const wgG = groupSums(wg.X, wgMain, GROUP_RE);
const waG = groupSums(wa.X, waMain, GROUP_RE);
const keys = [...new Set([...wgG.keys(), ...waG.keys()])].sort(
  (a, b) => (wgG.get(b)?.dur ?? 0) - (wgG.get(a)?.dur ?? 0),
);
console.log('  group'.padEnd(48), 'WASM~'.padStart(9), 'WebGPU'.padStart(9), 'Δ(wg-wa)'.padStart(10), 'verdict');
for (const k of keys) {
  const waMs = ((waG.get(k)?.dur ?? 0) / 1000) * corr;
  const wgMs = (wgG.get(k)?.dur ?? 0) / 1000;
  if (waMs < 30 && wgMs < 30) continue;
  const d = wgMs - waMs;
  const verdict = d < -20 ? 'GPU wins' : d > 20 ? 'GPU LOSES' : 'wash';
  console.log(
    '  ' + k.slice(0, 46).padEnd(46),
    waMs.toFixed(0).padStart(9),
    wgMs.toFixed(0).padStart(9),
    (d >= 0 ? '+' : '') + d.toFixed(0).padStart(9),
    ' ' + verdict,
  );
}

// 3. GPU-busy vs host-overhead split (the synchronous-dispatch tax).
const gpuBusy = busyMs(wg.X, wg.tid('GPU (WebGPU passes)'));
const brBusy = busyMs(wg.X, wg.tid('CPU (host MSM bridge)'));
const msmLeaf = (X, t) => {
  let s = 0;
  for (const e of X) if (e.tid === t && e.name === 'MSM::batch_multi_scalar_mul') s += e.dur;
  return s / 1000;
};
const wgMsm = msmLeaf(wg.X, wgMain),
  waMsm = msmLeaf(wa.X, waMain);
console.log('\n--- 3. MSM dispatch: GPU compute vs host overhead (WebGPU) ---');
console.log(
  `  MSM::batch_multi_scalar_mul wall:  WebGPU ${wgMsm.toFixed(0)}ms   WASM ${(waMsm * corr).toFixed(0)}ms (median-corr)  => ${wgMsm < waMsm * corr ? 'GPU faster' : 'GPU SLOWER/wash'}`,
);
console.log(`  GPU compute busy:    ${gpuBusy.toFixed(0)}ms`);
console.log(
  `  Host bridge busy:    ${brBusy.toFixed(0)}ms  (genuine marshalling is ~50ms of this; the rest is submit+wait / prepare-backpressure — see §4)`,
);
console.log(
  `  => MSM phase floor is the GPU-busy ${gpuBusy.toFixed(0)}ms. Compare the phase wall (chonk-msm-phase.json:msmPhaseMs)`,
);
console.log(
  `     to that floor: (phase wall − ${gpuBusy.toFixed(0)}ms) is the overlap-able host tax pipelining can reclaim.`,
);

// 4. Bridge-thread span breakdown (genuine marshalling vs backpressure).
console.log('\n--- 4. Host bridge span breakdown (backpressure ≠ work) ---');
const brTid = wg.tid('CPU (host MSM bridge)');
const brAgg = new Map();
for (const e of wg.X) {
  if (e.tid !== brTid) continue;
  const k = e.name
    .replace(/[0-9]+/g, '#')
    .split('·')[0]
    .trim();
  const v = brAgg.get(k) ?? { n: 0, dur: 0 };
  v.n++;
  v.dur += e.dur;
  brAgg.set(k, v);
}
for (const [k, v] of [...brAgg.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 10))
  console.log(
    '  ' + k.padEnd(42),
    'n=' + String(v.n).padStart(3),
    'sum=' + (v.dur / 1000).toFixed(1).padStart(7) + 'ms',
  );
console.log('\nNote: large `prepare <label>` sums on same-N groups (W_R/W_O/ORDERED/CONCAT) are');
console.log("GPU-queue backpressure (each prepare waits on the prior MSM's histogram/decompose),");
console.log('not marshalling. They vanish if the per-MSM histogram round-trip is removed.');
