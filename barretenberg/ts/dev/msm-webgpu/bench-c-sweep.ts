/// <reference types="@webgpu/types" />
// bench-c-sweep — find the fastest Pippenger window size `c` for the MsmV2
// WebGPU MSM across problem sizes 2^MIN_LOGN .. 2^MAX_LOGN.
//
// For every (n, c) it builds an MsmV2, runs WARMUP discarded + REPS timed
// run() dispatches, and records the median / min wall time. Each row's
// fastest c (green) is the value MsmV2.pickC should return for that size;
// the run finishes with a copy-pasteable summary table.
//
// Inputs are synthetic — random field-element points and random scalars.
// The pair-tree pipeline's runtime does not depend on point values, and
// random scalars give a representative bucket distribution, so no SRS
// download is needed (matching bench-msm-tree-v2's synthetic approach).
//
// Query params (all optional):
//   ?minlogn=10 ?maxlogn=20 ?cmin=7 ?cmax=17 ?reps=15 ?warmup=3

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { MsmV2 } from './msm_v2.js';

const qp = new URLSearchParams(location.search);
const intParam = (key: string, dflt: number): number => {
  const v = Number(qp.get(key));
  return Number.isInteger(v) && v > 0 ? v : dflt;
};
const MIN_LOGN = intParam('minlogn', 10);
const MAX_LOGN = intParam('maxlogn', 20);
const C_MIN = intParam('cmin', 7);
const C_MAX = intParam('cmax', 17);
const REPS = intParam('reps', 15);
const WARMUP = intParam('warmup', 3);

// MsmV2.pickC's current table (logN -> c); sizes outside it fall back to 13.
const CURRENT_PICKC: Record<number, number> = { 16: 13, 17: 14, 18: 14, 19: 15, 20: 16 };
const currentPickC = (logN: number): number => CURRENT_PICKC[logN] ?? 13;

interface Cell {
  c: number;
  min: number;
  median: number;
  err: string | null;
}
interface Row {
  logN: number;
  cells: Cell[];
  bestC: number | null;
}
interface SweepState {
  state: 'boot' | 'running' | 'done' | 'error';
  rows: Row[];
  error: string | null;
}
const benchState: SweepState = { state: 'boot', rows: [], error: null };
(window as unknown as { __bench: SweepState }).__bench = benchState;

const $log = document.getElementById('log') as HTMLDivElement;
const $table = document.getElementById('table') as HTMLDivElement;
function log(msg: string): void {
  const div = document.createElement('div');
  div.textContent = msg;
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
  console.log(`[c-sweep] ${msg}`);
}

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 0;
  };
}

// Fill a byte buffer with RNG output through a u32 view. The bytes are an
// uninterpreted random field element / scalar, which is all the timing
// path needs (point values do not affect pipeline runtime).
function fillRandom(buf: Uint8Array, rng: () => number): void {
  const u32 = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength >>> 2);
  for (let i = 0; i < u32.length; i++) u32[i] = rng();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function renderTable(): void {
  const cs: number[] = [];
  for (let c = C_MIN; c <= C_MAX; c++) cs.push(c);
  let h = '<table><thead><tr><th>n \\ c</th>';
  for (const c of cs) h += `<th>${c}</th>`;
  h += '<th>best</th><th>current</th></tr></thead><tbody>';
  for (const row of benchState.rows) {
    h += `<tr><th>2<sup>${row.logN}</sup></th>`;
    for (const c of cs) {
      const cell = row.cells.find(x => x.c === c);
      if (!cell) {
        h += '<td class="pending">·</td>';
      } else if (cell.err) {
        h += '<td class="err">×</td>';
      } else {
        h += `<td class="${row.bestC === c ? 'best' : ''}">${cell.median.toFixed(1)}</td>`;
      }
    }
    h += `<td class="best">${row.bestC === null ? '—' : 'c=' + row.bestC}</td>`;
    h += `<td>c=${currentPickC(row.logN)}</td></tr>`;
  }
  h += '</tbody></table>';
  $table.innerHTML = h;
}

// One (n, c) measurement: build, warm up, time REPS run()s, tear down. A
// failing cell (e.g. a c too large to fit in GPU memory) is recorded as an
// error rather than aborting the whole sweep.
async function sweepCell(
  device: GPUDevice,
  n: number,
  c: number,
  points: Uint8Array,
  scalars: Uint8Array,
): Promise<Cell> {
  let msm: MsmV2 | null = null;
  try {
    msm = await MsmV2.create(device, n, points, c);
    msm.prepare(scalars);
    for (let w = 0; w < WARMUP; w++) await msm.run();
    const times: number[] = [];
    for (let r = 0; r < REPS; r++) {
      const t0 = performance.now();
      await msm.run();
      times.push(performance.now() - t0);
    }
    return { c, min: Math.min(...times), median: median(times), err: null };
  } catch (e) {
    return { c, min: 0, median: 0, err: e instanceof Error ? e.message : String(e) };
  } finally {
    msm?.destroy();
  }
}

async function main(): Promise<void> {
  try {
    benchState.state = 'running';
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — no WebGPU in this browser');
    log(`c-sweep: n=2^${MIN_LOGN}..2^${MAX_LOGN}, c=${C_MIN}..${C_MAX}, reps=${REPS}, warmup=${WARMUP}`);
    const device = await get_device();
    log('WebGPU device acquired');

    // One synthetic input set at the largest size; each smaller n is a prefix.
    const maxN = 2 ** MAX_LOGN;
    log(`generating synthetic inputs for ${maxN.toLocaleString()} points (${((maxN * 96) / (1 << 20)).toFixed(0)} MiB)…`);
    const rng = makeRng(0xc0ffee);
    const pointsBuf = new Uint8Array(maxN * 64);
    const scalarsBuf = new Uint8Array(maxN * 32);
    fillRandom(pointsBuf, rng);
    fillRandom(scalarsBuf, rng);
    renderTable();

    for (let logN = MIN_LOGN; logN <= MAX_LOGN; logN++) {
      const n = 2 ** logN;
      const points = pointsBuf.subarray(0, n * 64);
      const scalars = scalarsBuf.subarray(0, n * 32);
      const row: Row = { logN, cells: [], bestC: null };
      benchState.rows.push(row);
      for (let c = C_MIN; c <= C_MAX; c++) {
        const cell = await sweepCell(device, n, c, points, scalars);
        row.cells.push(cell);
        let bc: number | null = null;
        let bm = Infinity;
        for (const x of row.cells) {
          if (!x.err && x.median < bm) {
            bm = x.median;
            bc = x.c;
          }
        }
        row.bestC = bc;
        renderTable();
        log(
          cell.err
            ? `  2^${logN} c=${c}: ERROR — ${cell.err}`
            : `  2^${logN} c=${c}: median ${cell.median.toFixed(2)}ms  min ${cell.min.toFixed(2)}ms`,
        );
      }
      log(`2^${logN}: fastest c=${row.bestC} (current pickC=${currentPickC(logN)})`);
    }

    const summary = benchState.rows
      .filter(r => r.bestC !== null)
      .map(r => `${r.logN}: ${r.bestC}`)
      .join(', ');
    log(`recommended pickC table  ->  { ${summary} }`);
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
