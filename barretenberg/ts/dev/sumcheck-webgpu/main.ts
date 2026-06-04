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

const REGISTRY: Suite[] = [
  frSuite, monoSuite, arithSuite, deltaSuite, eccSuite, pos2InitSuite,
  nnfSuite, ellipticSuite, permSuite, logderivSuite, memorySuite, pos2ExtSuite,
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

// Autorun: ?autorun=all | <suite id>
const autorun = new URLSearchParams(window.location.search).get('autorun');
if (autorun) {
  const suites = autorun === 'all' ? REGISTRY : REGISTRY.filter(s => s.id === autorun);
  if (suites.length > 0) void runSuites(suites);
  else log('err', `unknown autorun target "${autorun}" (have: ${REGISTRY.map(s => s.id).join(', ')}, all)`);
}
