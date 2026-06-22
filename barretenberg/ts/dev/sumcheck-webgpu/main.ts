// sumcheck-webgpu dashboard. Two tabs:
//   - Benchmark: the WASM-vs-WebGPU hybrid sumcheck. A WASM-fallback threshold T
//     routes sizes <= 2^T to pure WASM and folds the first (d-T) rounds of larger
//     sizes on the GPU before handing the tail to WASM. The `engine` select picks the
//     GPU front: single-submission (one command buffer) or multi-pass (one readback
//     per round). "Check correctness" runs the WebGPU suites against CPU references.
//   - Profile: GPU timing + memory — the MP-vs-SS floor verdict, the E2E hybrid
//     timeline, the per-buffer memory accounting, and the full PROFILE_DATA report.
// A single GPUDevice is shared across runs, and the `[autorun] state=ok|err` marker
// the headless driver waits on is emitted to #log.
//
// Run: `yarn dev:sumcheck-webgpu`, open the page, click Run.
// Headless: `node dev/sumcheck-webgpu/drive.mjs [all|fr|mono|...|bench|sshybrid|e2e|...]`.
// The finer profile passes have no on-page button; reach them headless via
// ?autorun=profile|fineprofile|ssprofile|ssprofiletail (see PROFILE_TASKS).
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
import {
  runMultiPassBenchmark, runSingleSubmitHybridBenchmark, runProfile, runFineProfile, runSingleSubmitProfile,
  runFloorComparison, runProfileReport, runE2EProfile, runMemoryProfile, initWasm, type MultiPassRow, type SsHybridRow,
} from './bench.js';
import { type CircuitProfile, DENSE_PROFILE, PROFILES } from './sparsity.js';

// Correctness suites run at this fixed size (the established default); ?autorun=all|<id>
// can override it via ?logn=N.
const CORRECTNESS_LOGN = 14;

// Resolve the active sparsity profile from a tab's skip checkbox + profile select:
// unchecked => dense (skipping off, original behavior); checked => the chosen profile.
function selectedProfile(skipEl: HTMLInputElement, profEl: HTMLSelectElement): CircuitProfile {
  if (!skipEl.checked) return DENSE_PROFILE;
  return PROFILES[profEl.value] ?? DENSE_PROFILE;
}

const REGISTRY: Suite[] = [
  frSuite, monoSuite, arithSuite, deltaSuite, eccSuite, pos2InitSuite,
  nnfSuite, ellipticSuite, permSuite, logderivSuite, memorySuite,
  pos2ExtSuite, pos2TransSuite, pos2QuadTermSuite, pos2QuadSuite, databusSuite,
  foldSuite, batchSuite, poseidon2Suite, integrationSuite, roundsSuite, singleSubmitSuite,
];

const $log = document.getElementById('log') as HTMLDivElement;

// #log carries the benchmark output, the correctness suite results, and the
// `[autorun] state=...` completion marker the headless driver polls for.
function log(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $log.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

function markAutorun(ok: boolean): void {
  log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`);
}

let devicePromise: Promise<GPUDevice> | null = null;
const getDevice = (): Promise<GPUDevice> => (devicePromise ??= get_device());

let running = false;
function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.controls button').forEach(btn => {
    btn.disabled = busy;
  });
}

// ===== Tab switching =====
document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    const which = btn.dataset.tab;
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === `tab-${which}`));
  });
});

// ===== Benchmark tab =====
const $benchTbody = document.getElementById('bench-tbody') as HTMLTableSectionElement;
const $benchRun = document.getElementById('bench-run') as HTMLButtonElement;
const $benchCorrectness = document.getElementById('bench-correctness') as HTMLButtonElement;
const $benchMin = document.getElementById('bench-min') as HTMLInputElement;
const $benchMax = document.getElementById('bench-max') as HTMLInputElement;
const $benchEngine = document.getElementById('bench-engine') as HTMLSelectElement;
const $thresh = document.getElementById('bench-thresh') as HTMLInputElement;
const $threshVal = document.getElementById('bench-thresh-val') as HTMLSpanElement;
const $benchSkip = document.getElementById('bench-skip') as HTMLInputElement;
const $benchProfile = document.getElementById('bench-profile') as HTMLSelectElement;

$thresh.addEventListener('input', () => { $threshVal.textContent = $thresh.value; });

function fmtFactor(x: number | null): string {
  if (x === null) return '<span class="pending">—</span>';
  const cls = x >= 1 ? 'faster' : 'slower';
  return `<span class="${cls}">${x.toFixed(2)}×</span>`;
}

// Unified benchmark row: both engines render into the one table. The single-submission
// engine reports a separate `setup` (column upload); multi-pass folds it in and leaves
// setup empty.
interface BenchRow {
  logN: number; gpuRounds: number; splitLabel: string;
  setupMs: number | null; gpuMs: number; handoffMs: number;
  wasmTailMs: number | null; totalMs: number | null; fullWasmMs: number | null; speedup: number | null;
}
const fromSsHybrid = (r: SsHybridRow): BenchRow => ({
  logN: r.logN, gpuRounds: r.gpuRounds, splitLabel: 'SS-GPU',
  setupMs: r.setupMs, gpuMs: r.gpuFrontMs, handoffMs: r.handoffMs,
  wasmTailMs: r.wasmTailMs, totalMs: r.hybridMs, fullWasmMs: r.fullWasmMs, speedup: r.speedup,
});
const fromMultiPass = (r: MultiPassRow): BenchRow => ({
  logN: r.logN, gpuRounds: r.gpuRounds, splitLabel: 'GPU',
  setupMs: null, gpuMs: r.gpuMs, handoffMs: r.handoffMs,
  wasmTailMs: r.wasmTailMs, totalMs: r.multipassMs, fullWasmMs: r.fullWasmMs, speedup: r.speedup,
});

function appendBenchRow(r: BenchRow): void {
  const tr = document.createElement('tr');
  const dash = '<span class="pending">—</span>';
  const ms = (x: number | null): string => (x === null ? dash : x.toFixed(1));
  const pureWasm = r.gpuRounds === 0;
  const split = pureWasm
    ? '<span class="muted">WASM only</span>'
    : `<span class="split">${r.gpuRounds} ${r.splitLabel}</span><span class="muted"> + ${r.logN - r.gpuRounds} WASM</span>`;
  tr.innerHTML =
    `<td>2^${r.logN}</td><td>${split}</td>` +
    `<td>${pureWasm ? dash : ms(r.setupMs)}</td><td>${pureWasm ? dash : r.gpuMs.toFixed(1)}</td>` +
    `<td>${pureWasm ? dash : r.handoffMs.toFixed(1)}</td>` +
    `<td>${ms(r.wasmTailMs)}</td><td>${ms(r.totalMs)}</td><td>${ms(r.fullWasmMs)}</td>` +
    `<td>${fmtFactor(r.speedup)}</td>`;
  $benchTbody.appendChild(tr);
}

async function runBenchmark(): Promise<void> {
  if (running) return;
  running = true;
  setBusy(true);
  $benchTbody.replaceChildren();
  $log.replaceChildren();
  const lo = Math.max(2, Math.min(20, parseInt($benchMin.value, 10) || 10));
  const hi = Math.max(lo, Math.min(22, parseInt($benchMax.value, 10) || 18));
  const threshold = Math.max(2, Math.min(22, parseInt($thresh.value, 10) || 9));
  const logNs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const profile = selectedProfile($benchSkip, $benchProfile);
  const ss = $benchEngine.value !== 'multipass';
  log(
    'info',
    `${ss ? 'single-submission' : 'multi-pass'} GPU front · sweeping 2^${lo} … 2^${hi} · WASM fallback ≤ 2^${threshold} · ` +
      `larger sizes fold their first (d−${threshold}) rounds on WebGPU`,
  );
  let ok = true;
  try {
    const device = await getDevice();
    if (ss) {
      await runSingleSubmitHybridBenchmark(device, logNs, threshold, log, r => appendBenchRow(fromSsHybrid(r)), profile);
    } else {
      await runMultiPassBenchmark(device, logNs, threshold, log, r => appendBenchRow(fromMultiPass(r)), profile);
    }
    log('ok', '✓ benchmark complete');
  } catch (e) {
    ok = false;
    log('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    setBusy(false);
    markAutorun(ok);
  }
}

$benchRun.addEventListener('click', () => void runBenchmark());

// ===== Correctness (WebGPU suites vs CPU references) =====
async function runSuites(suites: Suite[], logN: number): Promise<boolean> {
  if (running) return false;
  running = true;
  setBusy(true);
  $log.replaceChildren();
  const n = 1 << Math.max(4, Math.min(20, logN || CORRECTNESS_LOGN));
  log('info', `correctness · n = ${n} (2^${Math.log2(n)})   ·   p = ${P}`);
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
    log(allOk ? 'ok' : 'err', allOk ? '✓ ALL SUITES PASS' : '✗ FAILURES DETECTED');
  } catch (e) {
    allOk = false;
    log('err', `device/setup error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    setBusy(false);
    markAutorun(allOk);
  }
  return allOk;
}

$benchCorrectness.addEventListener('click', () => void runSuites(REGISTRY, CORRECTNESS_LOGN));

// ===== Profile tab =====
const $profileLog = document.getElementById('profile-log') as HTMLDivElement;
const $profileLogn = document.getElementById('profile-logn') as HTMLInputElement;
const $profileSkip = document.getElementById('profile-skip') as HTMLInputElement;
const $profileProfile = document.getElementById('profile-profile') as HTMLSelectElement;
const $ssprofileTail = document.getElementById('ssprofile-tail') as HTMLInputElement;
const $floorcmpRun = document.getElementById('floorcmp-run') as HTMLButtonElement;
const $e2eRun = document.getElementById('e2e-run') as HTMLButtonElement;
const $memRun = document.getElementById('mem-run') as HTMLButtonElement;
const $profilereportRun = document.getElementById('profilereport-run') as HTMLButtonElement;

function profileLog(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $profileLog.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

const profileLogN = (): number => Math.max(4, Math.min(20, parseInt($profileLogn.value, 10) || 16));
// WASM tail rounds T, shared by the ss-tail profile and the e2e timeline (both hybrid, T >= 1).
const profileTail = (): number => Math.max(1, Math.min(20, parseInt($ssprofileTail.value, 10) || 9));
const profileSel = (): CircuitProfile => selectedProfile($profileSkip, $profileProfile);

// Every profile pass, keyed by its ?autorun=<key> target. Only floorcmp / e2e / memory /
// profilereport have on-page buttons; profile / fineprofile / ssprofile / ssprofiletail
// are headless-only (the driver dispatches them straight through this map).
const PROFILE_TASKS: Record<string, (d: GPUDevice) => Promise<void>> = {
  profile: async d => { await runProfile(d, profileLogN(), profileLog, profileSel()); },
  fineprofile: async d => { await runFineProfile(d, profileLogN(), profileLog, profileSel()); },
  ssprofile: async d => { await runSingleSubmitProfile(d, profileLogN(), profileLog, 0, profileSel()); },
  ssprofiletail: async d => { await runSingleSubmitProfile(d, profileLogN(), profileLog, profileTail(), profileSel()); },
  floorcmp: async d => { await runFloorComparison(d, profileLogN(), profileLog, profileSel()); },
  e2e: async d => { await runE2EProfile(d, profileLogN(), profileTail(), profileLog, profileSel()); },
  memory: async d => { await runMemoryProfile(d, profileLogN(), profileLog); },
  profilereport: d => runProfileReport(d, profileLog),
};

// Run one profiling pass, guarding the shared `running` flag and emitting the
// `[autorun] state=...` marker to #log so the headless driver detects completion.
async function runProfileTask(task: (device: GPUDevice) => Promise<void>): Promise<void> {
  if (running) return;
  running = true;
  setBusy(true);
  $profileLog.replaceChildren();
  let ok = true;
  try {
    await task(await getDevice());
  } catch (e) {
    ok = false;
    profileLog('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    setBusy(false);
    profileLog('muted', 'done');
    markAutorun(ok);
  }
}

$floorcmpRun.addEventListener('click', () => void runProfileTask(PROFILE_TASKS.floorcmp));
$e2eRun.addEventListener('click', () => void runProfileTask(PROFILE_TASKS.e2e));
$memRun.addEventListener('click', () => void runProfileTask(PROFILE_TASKS.memory));
$profilereportRun.addEventListener('click', () => void runProfileTask(PROFILE_TASKS.profilereport));

// ===== Autorun =====
// ?autorun=bench|sshybrid (Benchmark tab) | profile|fineprofile|ssprofile|ssprofiletail|
//   floorcmp|e2e|memory|profilereport (Profile tab) | all|<suite id> (correctness)
const params = new URLSearchParams(window.location.search);
const autorun = params.get('autorun');

// `?skip=1` enables realistic sparsity; `?profile=realistic-block|...` picks the instance.
function applySkipParams(p: URLSearchParams, skipEl: HTMLInputElement, profEl: HTMLSelectElement): void {
  const skipParam = p.get('skip');
  if (skipParam && skipParam !== '0' && skipParam !== 'false') skipEl.checked = true;
  const profParam = p.get('profile');
  if (profParam) profEl.value = profParam;
}

if (autorun === 'bench' || autorun === 'sshybrid') {
  (document.getElementById('tab-btn-bench') as HTMLButtonElement).click();
  $benchEngine.value = autorun === 'bench' ? 'multipass' : 'ss';
  // `?logn=N` raises the sweep's upper bound; `?t=N` sets the WASM-fallback threshold.
  const lognParam = params.get('logn');
  if (lognParam) $benchMax.value = lognParam;
  const tParam = params.get('t');
  if (tParam) { $thresh.value = tParam; $threshVal.textContent = tParam; }
  applySkipParams(params, $benchSkip, $benchProfile);
  $benchRun.click();
} else if (autorun && PROFILE_TASKS[autorun]) {
  (document.getElementById('tab-btn-profile') as HTMLButtonElement).click();
  // `?logn=N` sets the profile size (profilereport bakes its own sizes and ignores it);
  // `?t=N` sets the WASM-tail rounds for ssprofiletail/e2e.
  const lognParam = params.get('logn');
  if (lognParam) $profileLogn.value = lognParam;
  const tParam = params.get('t');
  if (tParam) $ssprofileTail.value = tParam;
  applySkipParams(params, $profileSkip, $profileProfile);
  void runProfileTask(PROFILE_TASKS[autorun]);
} else if (autorun) {
  (document.getElementById('tab-btn-bench') as HTMLButtonElement).click();
  const lognParam = params.get('logn');
  const logN = lognParam ? parseInt(lognParam, 10) : CORRECTNESS_LOGN;
  const suites = autorun === 'all' ? REGISTRY : REGISTRY.filter(s => s.id === autorun);
  if (suites.length > 0) void runSuites(suites, logN);
  else log('err', `unknown autorun target "${autorun}" (have: bench, sshybrid, ${Object.keys(PROFILE_TASKS).join(', ')}, all, ${REGISTRY.map(s => s.id).join(', ')})`);
}

// Warm up the memoized bb.js threads backend on the FIRST user interaction (not on page
// load), so the first WASM benchmark skips the ~1-3 s thread-pool spin-up without adding
// any network/CPU work to a plain GPU-only page load. initWasm is memoized so the
// redundant second listener is a no-op; a no-op too when COI is off.
const warmWasm = () => void initWasm(() => {});
globalThis.addEventListener?.('pointerdown', warmWasm, { once: true });
globalThis.addEventListener?.('keydown', warmWasm, { once: true });
