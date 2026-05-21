/// <reference types="@webgpu/types" />
// bench-msm-v2 — A/B harness for the MsmV2 pipeline knobs.
//
// Drives MsmV2 at one (n, knobs) config and reports median wall + per-pass GPU
// breakdown over warm reps. Open the page twice with one URL param changed to
// A/B a knob; the printed `result x` should be identical across runs (a knob
// must not change the MSM result), and the breakdown shows where it moved.
//
// Real on-curve SRS points + mod-p random scalars. Query params (all optional):
//   ?n=16384  ?c=  ?s=  ?wgi=  ?reducewg=  ?l0log=  ?inv=a|loop|pk
//   ?reps=20  ?warmup=5  ?profile=0   (per-pass GPU breakdown is on by default)

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { MsmV2, type MsmConfig, type ProfileBreakdown } from './msm_v2.js';
import { loadSrsPoints } from './srs.js';

const FP = BN254_BASE_FIELD;
const qp = new URLSearchParams(location.search);

const intParam = (key: string, dflt: number): number => {
  const v = Number(qp.get(key));
  return Number.isInteger(v) && v > 0 ? v : dflt;
};
const optInt = (key: string): number | undefined => {
  const raw = qp.get(key);
  if (raw === null) return undefined;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : undefined;
};

const N = intParam('n', 1 << 14);
const REPS = intParam('reps', 20);
const WARMUP = intParam('warmup', 5);
const config: MsmConfig = {
  c: optInt('c'),
  s: optInt('s'),
  wgi: optInt('wgi'),
  reduceWg: optInt('reducewg'),
  l0Log: optInt('l0log'),
  invVariant:
    qp.get('inv') === 'a' ? 'a' : qp.get('inv') === 'loop' ? 'loop' : qp.get('inv') === 'pk' ? 'pk' : undefined,
  addsub: qp.get('addsub') === 'unpack' ? 'unpack' : qp.get('addsub') === 'native' ? 'native' : undefined,
  profile: qp.get('profile') !== '0',
};

const GPU_CATS = [
  'demont', 'decompose', 'transpose', 'convert', 'planner',
  'fused', 'carry', 'finalize', 'redInit', 'redFused',
] as const;

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  n: number;
  config: MsmConfig;
  resultX: string | null;
  wallMedian: number;
  wallMin: number;
  breakdown: Record<string, number> | null;
  error: string | null;
}
const benchState: BenchState = {
  state: 'boot', n: N, config, resultX: null,
  wallMedian: 0, wallMin: 0, breakdown: null, error: null,
};
(window as unknown as { __bench: BenchState }).__bench = benchState;

const $log = document.getElementById('log') as HTMLDivElement;
const $out = document.getElementById('out') as HTMLDivElement;
function log(msg: string): void {
  const div = document.createElement('div');
  div.textContent = msg;
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
  console.log(`[msm-v2-bench] ${msg}`);
}

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 0;
  };
}

// Fill `buf` with 32-byte LE scalars, each a uniform random value reduced mod
// p — MsmV2's host planner Booth-decodes the raw scalar while the GPU sees
// `s mod p`, so a scalar >= p would decode differently on the two sides.
function fillScalars(buf: Uint8Array, rng: () => number): void {
  const u32 = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength >>> 2);
  const nScalars = u32.length >>> 3;
  for (let i = 0; i < nScalars; i++) {
    let v = 0n;
    for (let k = 0; k < 8; k++) v = (v << 32n) | BigInt(rng());
    v %= FP;
    for (let k = 0; k < 8; k++) {
      u32[i * 8 + k] = Number(v & 0xffffffffn);
      v >>= 32n;
    }
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main(): Promise<void> {
  try {
    benchState.state = 'running';
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — no WebGPU');
    log(`MsmV2 A/B bench — n=${N.toLocaleString()}, reps=${REPS}, warmup=${WARMUP}`);
    log(`config: ${JSON.stringify(config)}`);
    const device = await get_device();
    log('WebGPU device acquired');

    log(`loading ${N.toLocaleString()} SRS points…`);
    const pointsBuf = await loadSrsPoints(N, e => {
      if (e.kind === 'info') log(`  ${e.msg}`);
    });
    log(`generating ${N.toLocaleString()} random scalars (mod p)…`);
    const scalarsBuf = new Uint8Array(N * 32);
    fillScalars(scalarsBuf, makeRng(0xc0ffee));

    const msm = await MsmV2.create(device, N, pointsBuf, config);
    msm.prepare(scalarsBuf);
    log(`warming up (${WARMUP})…`);
    for (let w = 0; w < WARMUP; w++) await msm.run();

    const walls: number[] = [];
    const profiles: ProfileBreakdown[] = [];
    let resultX = '';
    for (let r = 0; r < REPS; r++) {
      const t0 = performance.now();
      const res = await msm.run();
      walls.push(performance.now() - t0);
      if (res.profile) profiles.push(res.profile);
      resultX = '0x' + res.x.toString(16);
    }
    msm.destroy();

    const wallMedian = median(walls);
    const wallMin = Math.min(...walls);
    benchState.resultX = resultX;
    benchState.wallMedian = wallMedian;
    benchState.wallMin = wallMin;
    log(`result x=${resultX.slice(0, 22)}…`);
    log(`wall: median ${wallMedian.toFixed(2)}ms  min ${wallMin.toFixed(2)}ms`);

    // Per-pass GPU breakdown (median over reps).
    let rows = '';
    if (profiles.length) {
      const bd: Record<string, number> = {};
      for (const cat of GPU_CATS) bd[cat] = median(profiles.map(p => p[cat]));
      const gpuTotal = GPU_CATS.reduce((a, cat) => a + bd[cat], 0);
      bd.gpuTotal = gpuTotal;
      bd.host = wallMedian - gpuTotal;
      benchState.breakdown = bd;
      for (const cat of GPU_CATS) {
        log(`  ${cat.padEnd(10)} ${bd[cat].toFixed(3)} ms`);
        rows += `<tr><td>${cat}</td><td>${bd[cat].toFixed(3)}</td><td>${((bd[cat] / wallMedian) * 100).toFixed(1)}%</td></tr>`;
      }
      rows +=
        `<tr class="sum"><td>GPU total</td><td>${gpuTotal.toFixed(3)}</td>` +
        `<td>${((gpuTotal / wallMedian) * 100).toFixed(1)}%</td></tr>` +
        `<tr><td>host (wall − GPU)</td><td>${bd.host.toFixed(3)}</td>` +
        `<td>${((bd.host / wallMedian) * 100).toFixed(1)}%</td></tr>`;
    }

    const cfg = Object.entries(config)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    $out.innerHTML =
      `<table><tbody>` +
      `<tr><th>n</th><td>${N.toLocaleString()}</td></tr>` +
      `<tr><th>config</th><td>${cfg || '(all defaults)'}</td></tr>` +
      `<tr><th>result x</th><td style="font-family:ui-monospace,monospace">${resultX.slice(0, 26)}…</td></tr>` +
      `<tr><th>wall median</th><td>${wallMedian.toFixed(2)} ms</td></tr>` +
      `<tr><th>wall min</th><td>${wallMin.toFixed(2)} ms</td></tr>` +
      `</tbody></table>` +
      (rows
        ? `<table><thead><tr><th>pass</th><th>ms (median)</th><th>% wall</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p>(profiling off — pass <code>?profile=1</code> for the per-pass breakdown)</p>');

    benchState.state = 'done';
    log('done');
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    log(`FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main();
