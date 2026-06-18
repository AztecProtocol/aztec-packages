// Unified sumcheck-webgpu dashboard. Two tabs:
//   - Benchmark: the single WASM-vs-WebGPU multi-pass sumcheck benchmark. A
//     configurable WASM-fallback threshold T routes sizes <= 2^T to pure WASM and
//     folds the first (d-T) rounds of larger sizes on the WebGPU engine before
//     handing the tail to WASM (see runMultiPassBenchmark).
//   - Testing: the WebGPU correctness suites diffed against CPU references; one
//     button per suite plus "Run All".
// A single GPUDevice is shared across runs, and the `[autorun] state=ok|err` marker
// the headless driver waits on is emitted to #log.
//
// Run: `yarn dev:sumcheck-webgpu`, open the page, click Run.
// Headless: `node dev/sumcheck-webgpu/drive.mjs [all|fr|mono|...|bench]`.
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
  runProfileReport, runE2EProfile, runMemoryProfile, initWasm, type MultiPassRow, type SsHybridRow,
} from './bench.js';
import { type CircuitProfile, DENSE_PROFILE, PROFILES } from './sparsity.js';

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

// Build one button per suite + Run All (Testing tab).
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

// ===== Tab switching =====
document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    const which = btn.dataset.tab;
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === `tab-${which}`));
  });
});

// ===== Benchmark tab (multi-pass WASM vs WebGPU) =====
const $benchLog = document.getElementById('bench-log') as HTMLDivElement;
const $benchTbody = document.getElementById('bench-tbody') as HTMLTableSectionElement;
const $benchRun = document.getElementById('bench-run') as HTMLButtonElement;
const $benchMin = document.getElementById('bench-min') as HTMLInputElement;
const $benchMax = document.getElementById('bench-max') as HTMLInputElement;
const $thresh = document.getElementById('bench-thresh') as HTMLInputElement;
const $threshVal = document.getElementById('bench-thresh-val') as HTMLSpanElement;
const $benchSkip = document.getElementById('bench-skip') as HTMLInputElement;
const $benchProfile = document.getElementById('bench-profile') as HTMLSelectElement;

$thresh.addEventListener('input', () => { $threshVal.textContent = $thresh.value; });

function benchLog(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $benchLog.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fmtFactor(x: number | null): string {
  if (x === null) return '<span class="pending">—</span>';
  const cls = x >= 1 ? 'faster' : 'slower';
  return `<span class="${cls}">${x.toFixed(2)}×</span>`;
}

function appendMultiPassRow(r: MultiPassRow): void {
  const tr = document.createElement('tr');
  const dash = '<span class="pending">—</span>';
  const ms = (x: number | null): string => (x === null ? dash : x.toFixed(1));
  const pureWasm = r.gpuRounds === 0;
  const split = pureWasm
    ? '<span class="muted">WASM only</span>'
    : `<span class="split">${r.gpuRounds} GPU</span><span class="muted"> + ${r.logN - r.gpuRounds} WASM</span>`;
  tr.innerHTML =
    `<td>2^${r.logN}</td><td>${split}</td>` +
    `<td>${pureWasm ? dash : r.gpuMs.toFixed(1)}</td><td>${pureWasm ? dash : r.handoffMs.toFixed(1)}</td>` +
    `<td>${ms(r.wasmTailMs)}</td><td>${ms(r.multipassMs)}</td><td>${ms(r.fullWasmMs)}</td>` +
    `<td>${fmtFactor(r.speedup)}</td>`;
  $benchTbody.appendChild(tr);
}

$benchRun.addEventListener('click', () => void (async () => {
  if (running) return;
  running = true;
  $benchRun.disabled = true;
  $benchTbody.replaceChildren();
  $benchLog.replaceChildren();
  const lo = Math.max(2, Math.min(20, parseInt($benchMin.value, 10) || 10));
  const hi = Math.max(lo, Math.min(22, parseInt($benchMax.value, 10) || 18));
  const threshold = Math.max(2, Math.min(22, parseInt($thresh.value, 10) || 13));
  const logNs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const profile = selectedProfile($benchSkip, $benchProfile);
  benchLog(
    'info',
    `sweeping 2^${lo} … 2^${hi}  ·  WASM fallback ≤ 2^${threshold}  ·  larger sizes fold their first (d−${threshold}) rounds on WebGPU`,
  );
  try {
    const device = await getDevice();
    await runMultiPassBenchmark(device, logNs, threshold, benchLog, appendMultiPassRow, profile);
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

// ===== SS-Hybrid tab (single-submission GPU front + WASM tail) =====
const $sshLog = document.getElementById('ssh-log') as HTMLDivElement;
const $sshTbody = document.getElementById('ssh-tbody') as HTMLTableSectionElement;
const $sshRun = document.getElementById('ssh-run') as HTMLButtonElement;
const $sshMin = document.getElementById('ssh-min') as HTMLInputElement;
const $sshMax = document.getElementById('ssh-max') as HTMLInputElement;
const $sshThresh = document.getElementById('ssh-thresh') as HTMLInputElement;
const $sshThreshVal = document.getElementById('ssh-thresh-val') as HTMLSpanElement;
const $sshSkip = document.getElementById('ssh-skip') as HTMLInputElement;
const $sshProfile = document.getElementById('ssh-profile') as HTMLSelectElement;

$sshThresh.addEventListener('input', () => { $sshThreshVal.textContent = $sshThresh.value; });

function sshLog(level: Level, msg: string): void {
  const div = document.createElement('div');
  if (level !== 'info') div.className = level;
  div.textContent = msg;
  $sshLog.appendChild(div);
  // eslint-disable-next-line no-console
  console.log(msg);
}

function appendSsHybridRow(r: SsHybridRow): void {
  const tr = document.createElement('tr');
  const dash = '<span class="pending">—</span>';
  const ms = (x: number | null): string => (x === null ? dash : x.toFixed(1));
  const pureWasm = r.gpuRounds === 0;
  const split = pureWasm
    ? '<span class="muted">WASM only</span>'
    : `<span class="split">${r.gpuRounds} SS-GPU</span><span class="muted"> + ${r.logN - r.gpuRounds} WASM</span>`;
  tr.innerHTML =
    `<td>2^${r.logN}</td><td>${split}</td>` +
    `<td>${pureWasm ? dash : r.setupMs.toFixed(1)}</td><td>${pureWasm ? dash : r.gpuFrontMs.toFixed(1)}</td>` +
    `<td>${pureWasm ? dash : r.handoffMs.toFixed(1)}</td>` +
    `<td>${ms(r.wasmTailMs)}</td><td>${ms(r.hybridMs)}</td><td>${ms(r.fullWasmMs)}</td>` +
    `<td>${fmtFactor(r.speedup)}</td>`;
  $sshTbody.appendChild(tr);
}

$sshRun.addEventListener('click', () => void (async () => {
  if (running) return;
  running = true;
  $sshRun.disabled = true;
  $sshTbody.replaceChildren();
  $sshLog.replaceChildren();
  const lo = Math.max(2, Math.min(20, parseInt($sshMin.value, 10) || 10));
  const hi = Math.max(lo, Math.min(22, parseInt($sshMax.value, 10) || 18));
  const threshold = Math.max(2, Math.min(22, parseInt($sshThresh.value, 10) || 9));
  const logNs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const profile = selectedProfile($sshSkip, $sshProfile);
  sshLog('info', `single-submission GPU front, last ${threshold} rounds on WASM · sweeping 2^${lo} … 2^${hi} · WASM fallback ≤ 2^${threshold}`);
  let ok = true;
  try {
    const device = await getDevice();
    await runSingleSubmitHybridBenchmark(device, logNs, threshold, sshLog, appendSsHybridRow, profile);
    sshLog('ok', '✓ SS-hybrid benchmark complete');
  } catch (e) {
    ok = false;
    sshLog('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    $sshRun.disabled = false;
    sshLog('muted', 'done');
    log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`); // mirror to #log so the headless driver detects completion/failure
  }
})());

// ===== Profile tab (per-kernel GPU timing) =====
const $profileLog = document.getElementById('profile-log') as HTMLDivElement;
const $profileLogn = document.getElementById('profile-logn') as HTMLInputElement;
const $profileSkip = document.getElementById('profile-skip') as HTMLInputElement;
const $profileProfile = document.getElementById('profile-profile') as HTMLSelectElement;
const $profileRun = document.getElementById('profile-run') as HTMLButtonElement;
const $fineprofileRun = document.getElementById('fineprofile-run') as HTMLButtonElement;
const $ssprofileRun = document.getElementById('ssprofile-run') as HTMLButtonElement;
const $ssprofileTailRun = document.getElementById('ssprofile-tail-run') as HTMLButtonElement;
const $ssprofileTail = document.getElementById('ssprofile-tail') as HTMLInputElement;
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

// Run one profiling pass, guarding the shared `running` flag and emitting the
// `[autorun] state=...` marker to #log so the headless driver detects completion.
async function runProfileTask(task: (device: GPUDevice) => Promise<void>): Promise<void> {
  if (running) return;
  running = true;
  const btns = [$profileRun, $fineprofileRun, $ssprofileRun, $ssprofileTailRun, $e2eRun, $memRun, $profilereportRun];
  btns.forEach(b => (b.disabled = true));
  $profileLog.replaceChildren();
  let ok = true;
  try {
    const device = await getDevice();
    await task(device);
  } catch (e) {
    ok = false;
    profileLog('err', `error: ${(e as Error).message}`);
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    running = false;
    btns.forEach(b => (b.disabled = false));
    profileLog('muted', 'done');
    log('muted', `[autorun] state=${ok ? 'ok' : 'err'}`);
  }
}

$profileRun.addEventListener('click', () => void runProfileTask(async d => { await runProfile(d, profileLogN(), profileLog, selectedProfile($profileSkip, $profileProfile)); }));
$fineprofileRun.addEventListener('click', () => void runProfileTask(async d => { await runFineProfile(d, profileLogN(), profileLog, selectedProfile($profileSkip, $profileProfile)); }));
$ssprofileRun.addEventListener('click', () => void runProfileTask(async d => { await runSingleSubmitProfile(d, profileLogN(), profileLog, 0, selectedProfile($profileSkip, $profileProfile)); }));
$ssprofileTailRun.addEventListener('click', () => void runProfileTask(async d => { await runSingleSubmitProfile(d, profileLogN(), profileLog, profileTail(), selectedProfile($profileSkip, $profileProfile)); }));
$e2eRun.addEventListener('click', () => void runProfileTask(async d => { await runE2EProfile(d, profileLogN(), profileTail(), profileLog, selectedProfile($profileSkip, $profileProfile)); }));
$memRun.addEventListener('click', () => void runProfileTask(async d => { await runMemoryProfile(d, profileLogN(), profileLog); }));
$profilereportRun.addEventListener('click', () => void runProfileTask(d => runProfileReport(d, profileLog)));

// Autorun: ?autorun=bench | profile | ssprofile | profilereport | all | <suite id>
const autorun = new URLSearchParams(window.location.search).get('autorun');
// `?skip=1` enables realistic sparsity; `?profile=realistic-block|realistic-scattered`
// picks the instance (default realistic-block). Lets the headless driver exercise the
// skip path on both tabs.
function applySkipParams(params: URLSearchParams, skipEl: HTMLInputElement, profEl: HTMLSelectElement): void {
  const skipParam = params.get('skip');
  if (skipParam && skipParam !== '0' && skipParam !== 'false') skipEl.checked = true;
  const profParam = params.get('profile');
  if (profParam) profEl.value = profParam;
}

if (autorun === 'bench') {
  (document.getElementById('tab-btn-bench') as HTMLButtonElement).click();
  // Let `?logn=N` (LOGN=N via drive.mjs) raise the sweep's upper bound, e.g. to probe
  // 2^17+ where the GPU front carries more rounds before the WASM tail.
  const params = new URLSearchParams(window.location.search);
  const lognParam = params.get('logn');
  if (lognParam) $benchMax.value = lognParam;
  applySkipParams(params, $benchSkip, $benchProfile);
  $benchRun.click();
} else if (autorun === 'sshybrid') {
  (document.getElementById('tab-btn-sshybrid') as HTMLButtonElement).click();
  // `?logn=N` raises the sweep's upper bound; `?t=N` sets the WASM-fallback threshold.
  const params = new URLSearchParams(window.location.search);
  const lognParam = params.get('logn');
  if (lognParam) $sshMax.value = lognParam;
  const tParam = params.get('t');
  if (tParam) { $sshThresh.value = tParam; $sshThreshVal.textContent = tParam; }
  applySkipParams(params, $sshSkip, $sshProfile);
  $sshRun.click();
} else if (
  autorun === 'profile' || autorun === 'fineprofile' || autorun === 'ssprofile' || autorun === 'ssprofiletail' ||
  autorun === 'e2e' || autorun === 'memory' || autorun === 'profilereport'
) {
  (document.getElementById('tab-btn-profile') as HTMLButtonElement).click();
  // `?logn=N` sets the profile size (profilereport bakes its own sizes and ignores it);
  // `?t=N` sets the WASM-tail rounds for ssprofiletail/e2e.
  const params = new URLSearchParams(window.location.search);
  const lognParam = params.get('logn');
  if (lognParam) $profileLogn.value = lognParam;
  const tParam = params.get('t');
  if (tParam) $ssprofileTail.value = tParam;
  applySkipParams(params, $profileSkip, $profileProfile);
  if (autorun === 'profile') $profileRun.click();
  else if (autorun === 'fineprofile') $fineprofileRun.click();
  else if (autorun === 'ssprofile') $ssprofileRun.click();
  else if (autorun === 'ssprofiletail') $ssprofileTailRun.click();
  else if (autorun === 'e2e') $e2eRun.click();
  else if (autorun === 'memory') $memRun.click();
  else $profilereportRun.click();
} else if (autorun) {
  (document.getElementById('tab-btn-testing') as HTMLButtonElement).click();
  const suites = autorun === 'all' ? REGISTRY : REGISTRY.filter(s => s.id === autorun);
  if (suites.length > 0) void runSuites(suites);
  else log('err', `unknown autorun target "${autorun}" (have: ${REGISTRY.map(s => s.id).join(', ')}, all)`);
}

// Warm up the memoized bb.js threads backend on the FIRST user interaction (not on page
// load), so the first WASM benchmark skips the ~1-3 s thread-pool spin-up without adding
// any network/CPU work to a plain GPU-only page load. initWasm is memoized so the
// redundant second listener is a no-op; a no-op too when COI is off.
const warmWasm = () => void initWasm(() => {});
globalThis.addEventListener?.('pointerdown', warmWasm, { once: true });
globalThis.addEventListener?.('keydown', warmWasm, { once: true });
