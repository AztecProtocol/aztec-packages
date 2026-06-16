// Unified sumcheck-webgpu test dashboard. Registers each test suite, builds a
// button per suite plus "Run All", shares a single GPUDevice across runs, and
// emits the `[autorun] state=ok|err` marker the headless driver waits on.
//
// Run: `yarn dev:sumcheck-webgpu`, open the page, click a suite (or Run All).
// Headless: `node dev/sumcheck-webgpu/drive.mjs [all|fr|mono|arith]` (autoruns
// via `?autorun=<id>`).
//
// Adding a relation = write a suite_<name>.ts exporting a Suite and add it to
// REGISTRY below.

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { type Suite, type Level, P } from './harness.js';
import { frSuite } from './suite_fr.js';
import { monoSuite } from './suite_mono.js';
import { arithSuite } from './suite_arith.js';
import { deltaSuite } from './suite_delta.js';
import { eccSuite } from './suite_ecc.js';
import { pos2InitSuite } from './suite_pos2init.js';
import { nnfSuite } from './suite_nnf.js';
import { ellipticSuite } from './suite_elliptic.js';
import { permSuite } from './suite_perm.js';
import { logderivSuite } from './suite_logderiv.js';
import { memorySuite } from './suite_memory.js';
import { pos2ExtSuite } from './suite_pos2ext.js';
import { pos2TransSuite } from './suite_pos2trans.js';
import { pos2QuadTermSuite } from './suite_pos2quadterm.js';
import { pos2QuadSuite } from './suite_pos2quad.js';
import { databusSuite } from './suite_databus.js';
import { integrationSuite } from './suite_integration.js';
import { foldSuite } from './suite_fold.js';
import { roundsSuite } from './suite_rounds.js';
import { batchSuite } from './batch_gpu.js';
import { poseidon2Suite } from './poseidon2_gpu.js';
import { singleSubmitSuite } from './suite_singlesubmit.js';
import { runSingleSubmitBench } from './single_submit.js';
import { runBenchmark, runWgSweep, runProfile, runHybridBenchmark, type BenchRow, type HybridRow } from './bench.js';

const REGISTRY: Suite[] = [
  frSuite, monoSuite, arithSuite, deltaSuite, eccSuite, pos2InitSuite,
  nnfSuite, ellipticSuite, permSuite, logderivSuite, memorySuite,
  pos2ExtSuite, pos2TransSuite, pos2QuadTermSuite, pos2QuadSuite, databusSuite,
  foldSuite, batchSuite, poseidon2Suite, integrationSuite, roundsSuite, singleSubmitSuite,
];

const $log = document.getElementById('log') as HTMLDivElement;
const $logn = document.getElementById('logn') as HTMLInputElement;
const $controls = document.getElementById('controls') as HTMLDivElement;

function log(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $log.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

let devicePromise: Promise<GPUDevice> | null = null;
const getDevice = (): Promise<GPUDevice> => (devicePromise ??= get_device());

let running = false;
function setButtonsDisabled(disabled: boolean): void {
  $controls.querySelectorAll('button').forEach(btn => {
    (btn as HTMLButtonElement).disabled = disabled;
  });
}

async function runSuites(suites: Suite[]): Promise<boolean> {
  if (running) return false;
  running = true;
  setButtonsDisabled(true);
  $log.replaceChildren();
  const n = 1 << Math.max(4, Math.min(20, parseInt($logn.value, 10) || 14));
  log('info', `n = ${n} (2^${Math.log2(n)})   ·   p = ${P}`);
  let allOk = true;
  try {
    const device = await getDevice();
    for (const suite of suites) {
      log('info', `── ${suite.label} ──`);
      const t0 = performance.now();
      let ok = false;
      try {
        ok = await suite.run({ device, n, log });
      } catch (e) {
        log('err', `  exception: ${(e as Error).message}`);
        // eslint-disable-next-line no-console
        console.error(e);
      }
      allOk = allOk && ok;
      log(ok ? 'ok' : 'err', `  ${suite.label}: ${ok ? 'PASS' : 'FAIL'}  (${(performance.now() - t0).toFixed(0)} ms)`);
    }
    log(allOk ? 'ok' : 'err', allOk ? '✓ ALL SELECTED SUITES PASS' : '✗ FAILURES DETECTED');
  } catch (e) {
    allOk = false;
    log('err', `device/setup error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    setButtonsDisabled(false);
    log('muted', `[autorun] state=${allOk ? 'ok' : 'err'}`);
  }
  return allOk;
}

// Build one button per suite + Run All.
for (const suite of REGISTRY) {
  const btn = document.createElement('button');
  btn.textContent = suite.label;
  btn.addEventListener('click', () => void runSuites([suite]));
  $controls.appendChild(btn);
}
const allBtn = document.createElement('button');
allBtn.textContent = 'Run All';
allBtn.style.fontWeight = '600';
allBtn.addEventListener('click', () => void runSuites(REGISTRY));
$controls.appendChild(allBtn);

// Occupancy experiment: sweep the accumulate-kernel workgroup size at the current
// size to find the GPU-compute sweet spot for the register-heavy relations.
const WG_SWEEP = [32, 64, 96, 128, 192, 256];
async function runWgSweepAuto(): Promise<boolean> {
  if (running) return false;
  running = true;
  setButtonsDisabled(true);
  $log.replaceChildren();
  const logN = Math.max(4, Math.min(20, parseInt($logn.value, 10) || 14));
  log('info', `WG occupancy sweep · 2^${logN} · accumulate workgroup size ∈ {${WG_SWEEP.join(', ')}}`);
  let ok = true;
  try {
    const device = await getDevice();
    await runWgSweep(device, logN, WG_SWEEP, log);
  } catch (e) {
    ok = false;
    log('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    setButtonsDisabled(false);
    log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`);
  }
  return ok;
}
const wgBtn = document.createElement('button');
wgBtn.textContent = 'WG sweep';
wgBtn.addEventListener('click', () => void runWgSweepAuto());
$controls.appendChild(wgBtn);

// Per-kernel GPU profile (round 0) to see where GPU time actually goes.
async function runProfileAuto(): Promise<boolean> {
  if (running) return false;
  running = true;
  setButtonsDisabled(true);
  $log.replaceChildren();
  const logN = Math.max(4, Math.min(20, parseInt($logn.value, 10) || 14));
  let ok = true;
  try {
    await runProfile(await getDevice(), logN, log);
  } catch (e) {
    ok = false;
    log('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    setButtonsDisabled(false);
    log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`);
  }
  return ok;
}
const profBtn = document.createElement('button');
profBtn.textContent = 'Profile';
profBtn.addEventListener('click', () => void runProfileAuto());
$controls.appendChild(profBtn);

// Single-submission GPU Fiat-Shamir sumcheck vs WASM across sizes (probe the 3x goal).
async function runSSBenchAuto(): Promise<boolean> {
  if (running) return false;
  running = true;
  setButtonsDisabled(true);
  $log.replaceChildren();
  const lo = Math.max(2, Math.min(20, parseInt($logn.value, 10) || 10));
  const hi = Math.max(lo, Math.min(22, parseInt(($benchMax && $benchMax.value) || '', 10) || 16));
  const logNs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  log('info', `single-submission sumcheck (GPU Fiat-Shamir) vs WASM · 2^${lo}..2^${hi}`);
  let ok = true;
  try { await runSingleSubmitBench(await getDevice(), logNs, log); }
  catch (e) { ok = false; log('err', `error: ${(e as Error).message}`); console.error(e); }
  finally { running = false; setButtonsDisabled(false); log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`); }
  return ok;
}
const ssBtn = document.createElement('button');
ssBtn.textContent = 'SS bench';
ssBtn.addEventListener('click', () => void runSSBenchAuto());
$controls.appendChild(ssBtn);

// ===== Tab switching =====
document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    const which = btn.dataset.tab;
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === `tab-${which}`));
  });
});

// ===== Benchmark tab =====
const $benchLog = document.getElementById('bench-log') as HTMLDivElement;
const $benchTbody = document.getElementById('bench-tbody') as HTMLTableSectionElement;
const $benchRun = document.getElementById('bench-run') as HTMLButtonElement;
const $benchMin = document.getElementById('bench-min') as HTMLInputElement;
const $benchMax = document.getElementById('bench-max') as HTMLInputElement;

function benchLog(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $benchLog.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

function appendBenchRow(r: BenchRow): void {
  const tr = document.createElement('tr');
  const wasm = r.wasmMs === null ? '<span class="pending">— rebuild wasm</span>' : r.wasmMs.toFixed(1);
  // outputs cell: ✓/✗ over all available checks; superscript = how many independent
  // engines agreed (2 = both GPU engines, 3 = + the CPU reference at small n). Hover
  // shows the per-check breakdown.
  const cpuRan = r.cpuRefMatch !== null;
  const cls = r.outputsMatch ? 'faster' : 'slower';
  const title =
    `Fiat-Shamir (GPU vs CPU re-derive): ${r.fiatShamirOk ? '✓' : '✗'}  ·  ` +
    `multi-round ≡ single-submit: ${r.multiVsSingle ? '✓' : '✗'}  ·  ` +
    `CPU reference: ${r.cpuRefMatch === null ? 'skipped (n too large)' : r.cpuRefMatch ? '✓' : '✗'}`;
  const match = `<span class="${cls}" title="${title}">${r.outputsMatch ? '✓' : '✗'}<sup>${cpuRan ? 3 : 2}</sup></span>`;
  tr.innerHTML =
    `<td>2^${r.logN}</td><td>${r.webgpuGpuMs.toFixed(1)}</td><td>${r.webgpuWallMs.toFixed(1)}</td>` +
    `<td>${r.ssGpuMs.toFixed(1)}</td><td>${r.ssWallMs.toFixed(1)}</td><td>${wasm}</td>` +
    `<td>${fmtFactor(r.speedup)}</td><td>${fmtFactor(r.ssSpeedup)}</td><td>${match}</td>`;
  $benchTbody.appendChild(tr);
}

$benchRun.addEventListener('click', () => void (async () => {
  if (running) return;
  running = true;
  $benchRun.disabled = true;
  $benchTbody.replaceChildren();
  $benchLog.replaceChildren();
  const lo = Math.max(2, Math.min(20, parseInt($benchMin.value, 10) || 10));
  const hi = Math.max(lo, Math.min(22, parseInt($benchMax.value, 10) || 16));
  const logNs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  benchLog('info', `sweeping 2^${lo} … 2^${hi}   ·   full multi-round MegaFlavor sumcheck`);
  try {
    const device = await getDevice();
    await runBenchmark(device, logNs, benchLog, appendBenchRow);
    benchLog('ok', '✓ benchmark complete');
  } catch (e) {
    benchLog('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    $benchRun.disabled = false;
    benchLog('muted', 'done');
    log('muted', '[autorun] state=ok'); // mirror to #log so the headless driver detects completion
  }
})());

// ===== Hybrid tab (GPU front + WASM tail) =====
const $hybridLog = document.getElementById('hybrid-log') as HTMLDivElement;
const $hybridTbody = document.getElementById('hybrid-tbody') as HTMLTableSectionElement;
const $hybridRun = document.getElementById('hybrid-run') as HTMLButtonElement;
const $hybridMin = document.getElementById('hybrid-min') as HTMLInputElement;
const $hybridMax = document.getElementById('hybrid-max') as HTMLInputElement;
const $hybridSplits = document.getElementById('hybrid-splits') as HTMLInputElement;

function hybridLog(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $hybridLog.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fmtFactor(x: number | null): string {
  if (x === null) return '<span class="pending">—</span>';
  const cls = x >= 1 ? 'faster' : 'slower';
  return `<span class="${cls}">${x.toFixed(2)}×</span>`;
}

function appendHybridRow(r: HybridRow): void {
  const tr = document.createElement('tr');
  const wasmTail = r.wasmTailMs === null ? '<span class="pending">— rebuild wasm</span>' : r.wasmTailMs.toFixed(1);
  const hybrid = r.hybridMs === null ? '<span class="pending">—</span>' : r.hybridMs.toFixed(1);
  const fullWasm = r.fullWasmMs === null ? '<span class="pending">—</span>' : r.fullWasmMs.toFixed(1);
  tr.innerHTML =
    `<td>2^${r.logN}</td><td>${r.gpuRounds}</td><td>${r.gpuRoundsMs.toFixed(1)}</td>` +
    `<td>${r.handoffMs.toFixed(1)}</td><td>${wasmTail}</td><td>${hybrid}</td>` +
    `<td>${fullWasm}</td><td>${r.fullGpuMs.toFixed(1)}</td>` +
    `<td>${fmtFactor(r.vsWasm)}</td><td>${fmtFactor(r.vsGpu)}</td>`;
  $hybridTbody.appendChild(tr);
}

function parseSplits(raw: string): number[] {
  const ks = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(k => Number.isFinite(k) && k >= 1);
  return ks.length ? Array.from(new Set(ks)).sort((a, b) => a - b) : [1, 2, 3];
}

async function runHybridAuto(): Promise<boolean> {
  if (running) return false;
  running = true;
  $hybridRun.disabled = true;
  $hybridTbody.replaceChildren();
  $hybridLog.replaceChildren();
  const lo = Math.max(2, Math.min(20, parseInt($hybridMin.value, 10) || 12));
  const hi = Math.max(lo, Math.min(22, parseInt($hybridMax.value, 10) || 18));
  const logNs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const splits = parseSplits($hybridSplits.value);
  hybridLog('info', `sweeping 2^${lo} … 2^${hi}   ·   GPU first {${splits.join(', ')}} round(s) + WASM tail`);
  let ok = true;
  try {
    const device = await getDevice();
    await runHybridBenchmark(device, logNs, splits, hybridLog, appendHybridRow);
    hybridLog('ok', '✓ hybrid sweep complete');
  } catch (e) {
    ok = false;
    hybridLog('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    $hybridRun.disabled = false;
    hybridLog('muted', 'done');
    log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`); // mirror to #log for the headless driver
  }
  return ok;
}
$hybridRun.addEventListener('click', () => void runHybridAuto());

// Autorun: ?autorun=all | <suite id> | bench | wgsweep | hybrid
const autorun = new URLSearchParams(window.location.search).get('autorun');
if (autorun === 'bench') {
  (document.getElementById('tab-btn-bench') as HTMLButtonElement).click();
  // Let `?logn=N` (LOGN=N via drive.mjs) raise the sweep's upper bound, e.g. to
  // probe 2^17+ where the per-round sync amortizes further against compute.
  const lognParam = new URLSearchParams(window.location.search).get('logn');
  if (lognParam) $benchMax.value = lognParam;
  $benchRun.click();
} else if (autorun === 'hybrid') {
  (document.getElementById('tab-btn-hybrid') as HTMLButtonElement).click();
  const lognParam = new URLSearchParams(window.location.search).get('logn');
  if (lognParam) $hybridMax.value = lognParam;
  $hybridRun.click();
} else if (autorun === 'wgsweep') {
  void runWgSweepAuto();
} else if (autorun === 'profile') {
  void runProfileAuto();
} else if (autorun === 'ssbench') {
  void runSSBenchAuto();
} else if (autorun) {
  const suites = autorun === 'all' ? REGISTRY : REGISTRY.filter(s => s.id === autorun);
  if (suites.length > 0) void runSuites(suites);
  else log('err', `unknown autorun target "${autorun}" (have: ${REGISTRY.map(s => s.id).join(', ')}, all)`);
}
