/// <reference types="@webgpu/types" />
// bench-c-sweep — find the fastest Pippenger window size `c` for the MsmV2
// WebGPU MSM across problem sizes 2^MIN_LOGN .. 2^MAX_LOGN.
//
// For every (n, c) it builds an MsmV2, runs WARMUP discarded + REPS timed
// run() dispatches, and records the median / min wall time. Each row's
// fastest c (green) is the value MsmV2.pickC should return for that size;
// the run finishes with a copy-pasteable summary table.
//
// Points are real on-curve SRS points — run()'s host window-combine does
// genuine elliptic-curve arithmetic, so off-curve inputs make it hit a
// non-invertible value. Scalars are random, for a representative bucket
// distribution. The SRS is range-fetched once and cached in IndexedDB.
//
// Query params (all optional):
//   ?minlogn=10 ?maxlogn=20 ?cmin=7 ?cmax=17 ?reps=15 ?warmup=3
//   ?s= ?wgi= ?reducewg= ?l0log= ?inv=a|loop  (pipeline knobs, forwarded to MsmV2)

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { MsmV2, type MsmConfig } from './msm_v2.js';
import { loadSrsPoints } from './srs.js';

// BN254 base field modulus. Scalars are reduced mod p: MsmV2 hands the GPU
// `s·R mod p` (de-Montgomery'd back to `s mod p`), while the host planner
// Booth-decodes the raw `s` — so a scalar ≥ p would decode differently on
// host and GPU and corrupt the plan.
const FP = BN254_BASE_FIELD;

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

// Pipeline-knob overrides forwarded to every MsmV2 (unset = current behaviour),
// so a c-sweep can be run at a chosen S / workgroup size / etc.
const optInt = (key: string): number | undefined => {
  const raw = qp.get(key);
  if (raw === null) return undefined;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : undefined;
};
const KNOBS: MsmConfig = {
  s: optInt('s'),
  wgi: optInt('wgi'),
  reduceWg: optInt('reducewg'),
  l0Log: optInt('l0log'),
  invVariant: qp.get('inv') === 'loop' ? 'loop' : undefined,
};

// MsmV2.pickC's current table (logN -> c); sizes outside it fall back to 13.
const CURRENT_PICKC: Record<number, number> = {
  10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 10, 16: 13, 17: 13, 18: 15, 19: 15, 20: 15,
};
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

// Fill `buf` with 32-byte LE scalars — each a uniform random value reduced
// mod p (see the FP comment above for why the reduction is required).
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
    msm = await MsmV2.create(device, n, points, { ...KNOBS, c });
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

    // One input set at the largest size; each smaller n is a 64-byte-aligned
    // prefix. Points: real on-curve SRS (the host window-combine needs valid
    // curve points); scalars: random.
    const maxN = 2 ** MAX_LOGN;
    log(`loading ${maxN.toLocaleString()} SRS points…`);
    const pointsBuf = await loadSrsPoints(maxN, e => {
      if (e.kind === 'info') log(`  ${e.msg}`);
    });
    log(`generating ${maxN.toLocaleString()} random scalars (mod p)…`);
    const scalarsBuf = new Uint8Array(maxN * 32);
    fillScalars(scalarsBuf, makeRng(0xc0ffee));
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
