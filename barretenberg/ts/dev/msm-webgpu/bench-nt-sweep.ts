/// <reference types="@webgpu/types" />
// bench-nt-sweep — find the fastest NUM_THREAD_MULS (= k) for the WebGPU
// `straus_msm` kernel stack (TrivialMsm) across problem sizes
// 2^MIN_LOGN .. 2^MAX_LOGN.
//
// For every (n, k) it builds a TrivialMsm, runs WARMUP discarded + REPS
// timed `run()` dispatches, and records median + min wall time. Each row's
// fastest k (green) is the value `pickNTM(logN)` should return. The same
// row also gets timed against the existing MsmV2 baseline so the page
// reports the speedup ratio per logN and the crossover where MsmV2
// overtakes TrivialMsm.
//
// Query params (all optional):
//   ?minlogn=4 ?maxlogn=16
//   ?ntmlist=1,2,3,4,6,8,12,16,24,32
//   ?reps=15 ?warmup=3 ?verify=0
//
// `verify=1` cross-checks each cell's first warmup run against an
// in-process noble reference computed at the same (points, scalars).

import { BN254_BASE_FIELD } from "../../src/msm_webgpu/cuzk/bn254.js";
import { get_device } from "../../src/msm_webgpu/cuzk/gpu.js";
import { bn254 } from "@noble/curves/bn254";
import { MsmV2 } from "./msm_v2.js";
import { makeResultsClient } from "./results_post.js";
import { loadSrsPoints } from "./srs.js";
import { TrivialMsm } from "./trivial_msm.js";

const FP = BN254_BASE_FIELD;

const qp = new URLSearchParams(location.search);
const intParam = (key: string, dflt: number): number => {
  const v = Number(qp.get(key));
  return Number.isInteger(v) && v > 0 ? v : dflt;
};
const listParam = (key: string, dflt: number[]): number[] => {
  const raw = qp.get(key);
  if (!raw) return dflt;
  const xs = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return xs.length ? xs : dflt;
};

const MIN_LOGN = intParam("minlogn", 4);
const MAX_LOGN = intParam("maxlogn", 16);
const NTM_LIST = listParam("ntmlist", [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]);
const REPS = intParam("reps", 15);
const WARMUP = intParam("warmup", 3);
const VERIFY = qp.get("verify") === "1";

interface Cell {
  ntm: number;
  min: number;
  median: number;
  err: string | null;
  verifyOk: boolean | null;
  phaseMs: Record<string, number> | null;
}
interface Row {
  logN: number;
  cells: Cell[];
  bestNtm: number | null;
  msmV2Median: number | null;
  msmV2Err: string | null;
}
interface SweepState {
  state: "boot" | "running" | "done" | "error";
  rows: Row[];
  error: string | null;
}
const benchState: SweepState = { state: "boot", rows: [], error: null };
(window as unknown as { __bench: SweepState }).__bench = benchState;

const results = makeResultsClient({ page: "bench-nt-sweep" });

const $log = document.getElementById("log") as HTMLDivElement;
const $table = document.getElementById("table") as HTMLDivElement;
function log(msg: string): void {
  const div = document.createElement("div");
  div.textContent = msg;
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
  console.log(`[nt-sweep] ${msg}`);
}

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 0;
  };
}

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

function leBytesToBigint(buf: Uint8Array, off: number, len: number): bigint {
  let v = 0n;
  for (let k = len - 1; k >= 0; k--) v = (v << 8n) | BigInt(buf[off + k]);
  return v;
}

function nobleRef(
  pointsBuf: Uint8Array,
  scalarsBuf: Uint8Array,
  n: number,
): { x: bigint; y: bigint } {
  let acc = bn254.G1.ProjectivePoint.ZERO;
  for (let i = 0; i < n; i++) {
    const x = leBytesToBigint(pointsBuf, i * 64, 32);
    const y = leBytesToBigint(pointsBuf, i * 64 + 32, 32);
    const s = leBytesToBigint(scalarsBuf, i * 32, 32) % bn254.fields.Fr.ORDER;
    if (s === 0n) continue;
    const p = bn254.G1.ProjectivePoint.fromAffine({ x, y });
    acc = acc.add(p.multiply(s));
  }
  if (acc.equals(bn254.G1.ProjectivePoint.ZERO)) return { x: 0n, y: 0n };
  const a = acc.toAffine();
  return { x: a.x, y: a.y };
}

function renderTable(): void {
  let h = '<table><thead><tr><th>n \\ k</th>';
  for (const k of NTM_LIST) h += `<th>${k}</th>`;
  h +=
    '<th>best k</th><th>min ms</th><th>MsmV2 ms</th><th>speedup</th></tr></thead><tbody>';
  for (const row of benchState.rows) {
    h += `<tr><th>2<sup>${row.logN}</sup></th>`;
    let bestMedian = Infinity;
    for (const k of NTM_LIST) {
      const cell = row.cells.find((x) => x.ntm === k);
      if (!cell) {
        h += '<td class="pending">·</td>';
      } else if (cell.err) {
        h += '<td class="err">×</td>';
      } else {
        h += `<td class="${row.bestNtm === k ? "best" : ""}">${cell.median.toFixed(1)}</td>`;
        if (cell.median < bestMedian) bestMedian = cell.median;
      }
    }
    h += `<td class="best">${row.bestNtm === null ? "—" : "k=" + row.bestNtm}</td>`;
    h += `<td>${bestMedian === Infinity ? "—" : bestMedian.toFixed(1)}</td>`;
    h += `<td>${row.msmV2Median === null ? (row.msmV2Err ? "×" : "·") : row.msmV2Median.toFixed(1)}</td>`;
    const speedup =
      row.msmV2Median !== null && bestMedian !== Infinity && bestMedian > 0
        ? (row.msmV2Median / bestMedian).toFixed(2)
        : "—";
    h += `<td>${speedup}</td></tr>`;
  }
  h += "</tbody></table>";
  $table.innerHTML = h;
}

async function sweepCell(
  device: GPUDevice,
  n: number,
  ntm: number,
  points: Uint8Array,
  scalars: Uint8Array,
  expected: { x: bigint; y: bigint } | null,
): Promise<Cell> {
  let msm: TrivialMsm | null = null;
  try {
    msm = await TrivialMsm.create(device, n, points, ntm);
    msm.prepare(scalars);
    let verifyOk: boolean | null = null;
    if (expected !== null) {
      const got = await msm.run();
      verifyOk = got.x === expected.x && got.y === expected.y;
      if (!verifyOk) {
        return {
          ntm,
          min: 0,
          median: 0,
          err: `verify mismatch (n=${n}, k=${ntm})`,
          verifyOk,
          phaseMs: msm.lastRunPhaseMs,
        };
      }
      for (let w = 1; w < WARMUP; w++) await msm.run();
    } else {
      for (let w = 0; w < WARMUP; w++) await msm.run();
    }
    const times: number[] = [];
    for (let r = 0; r < REPS; r++) {
      const t0 = performance.now();
      await msm.run();
      times.push(performance.now() - t0);
    }
    return {
      ntm,
      min: Math.min(...times),
      median: median(times),
      err: null,
      verifyOk,
      phaseMs: msm.lastRunPhaseMs,
    };
  } catch (e) {
    return {
      ntm,
      min: 0,
      median: 0,
      err: e instanceof Error ? e.message : String(e),
      verifyOk: null,
      phaseMs: msm?.lastRunPhaseMs ?? null,
    };
  } finally {
    msm?.destroy();
  }
}

async function timeMsmV2(
  device: GPUDevice,
  n: number,
  points: Uint8Array,
  scalars: Uint8Array,
): Promise<{ median: number | null; err: string | null }> {
  let m: MsmV2 | null = null;
  try {
    m = await MsmV2.create(device, n, points);
    m.prepare(scalars);
    for (let w = 0; w < WARMUP; w++) await m.run();
    const times: number[] = [];
    for (let r = 0; r < REPS; r++) {
      const t0 = performance.now();
      await m.run();
      times.push(performance.now() - t0);
    }
    return { median: median(times), err: null };
  } catch (e) {
    return { median: null, err: e instanceof Error ? e.message : String(e) };
  } finally {
    m?.destroy();
  }
}

async function main(): Promise<void> {
  try {
    benchState.state = "running";
    if (!("gpu" in navigator)) {
      throw new Error("navigator.gpu missing — no WebGPU in this browser");
    }
    log(
      `nt-sweep: n=2^${MIN_LOGN}..2^${MAX_LOGN}, ntmlist=[${NTM_LIST.join(",")}], reps=${REPS}, warmup=${WARMUP}, verify=${VERIFY ? "yes" : "no"}`,
    );
    const device = await get_device();
    log("WebGPU device acquired");

    const maxN = 2 ** MAX_LOGN;
    log(`loading ${maxN.toLocaleString()} SRS points…`);
    const pointsBuf = await loadSrsPoints(maxN, (e) => {
      if (e.kind === "info") log(`  ${e.msg}`);
    });
    log(`generating ${maxN.toLocaleString()} random scalars (mod p)…`);
    const scalarsBuf = new Uint8Array(maxN * 32);
    fillScalars(scalarsBuf, makeRng(0xc0ffee));
    renderTable();

    for (let logN = MIN_LOGN; logN <= MAX_LOGN; logN++) {
      const n = 2 ** logN;
      const points = pointsBuf.subarray(0, n * 64);
      const scalars = scalarsBuf.subarray(0, n * 32);
      const row: Row = {
        logN,
        cells: [],
        bestNtm: null,
        msmV2Median: null,
        msmV2Err: null,
      };
      benchState.rows.push(row);

      const expected = VERIFY ? nobleRef(points, scalars, n) : null;
      if (VERIFY) log(`  2^${logN}: noble reference computed`);

      for (const k of NTM_LIST) {
        const cell = await sweepCell(device, n, k, points, scalars, expected);
        row.cells.push(cell);
        let bn: number | null = null;
        let bm = Infinity;
        for (const x of row.cells) {
          if (!x.err && x.median < bm) {
            bm = x.median;
            bn = x.ntm;
          }
        }
        row.bestNtm = bn;
        renderTable();
        log(
          cell.err
            ? `  2^${logN} k=${k}: ERROR — ${cell.err}`
            : `  2^${logN} k=${k}: median ${cell.median.toFixed(2)}ms  min ${cell.min.toFixed(2)}ms` +
              (cell.verifyOk === true ? " ✓" : ""),
        );
        results.postProgress({
          logN,
          ntm: k,
          cell,
          bestNtm: row.bestNtm,
        });
      }

      const v2 = await timeMsmV2(device, n, points, scalars);
      row.msmV2Median = v2.median;
      row.msmV2Err = v2.err;
      renderTable();
      results.postProgress({
        logN,
        msmV2: { median: v2.median, err: v2.err },
        bestNtm: row.bestNtm,
      });
      if (v2.err) {
        log(`  2^${logN} MsmV2: ERROR — ${v2.err}`);
      } else if (v2.median !== null) {
        log(`  2^${logN} MsmV2 median ${v2.median.toFixed(2)}ms`);
      }

      log(`2^${logN}: bestNTM=${row.bestNtm}`);
    }

    const summary = benchState.rows
      .filter((r) => r.bestNtm !== null)
      .map((r) => `${r.logN}: ${r.bestNtm}`)
      .join(", ");
    const crossover = benchState.rows.find((r) => {
      if (r.msmV2Median === null) return false;
      const bestT = r.cells
        .filter((c) => !c.err)
        .reduce((m, c) => Math.min(m, c.median), Infinity);
      return r.msmV2Median <= bestT;
    });
    log(`recommended pickNTM table  ->  { ${summary} }`);
    log(
      crossover
        ? `MsmV2 overtakes TrivialMsm at logN=${crossover.logN}`
        : "TrivialMsm never overtaken in this sweep range",
    );
    benchState.state = "done";
    log("done");
    await results.postResults({
      state: "done",
      rows: benchState.rows,
      summary: Object.fromEntries(
        benchState.rows
          .filter((r) => r.bestNtm !== null)
          .map((r) => [r.logN, r.bestNtm]),
      ),
      crossover: crossover?.logN ?? null,
      params: {
        minLogN: MIN_LOGN,
        maxLogN: MAX_LOGN,
        ntmList: NTM_LIST,
        reps: REPS,
        warmup: WARMUP,
        verify: VERIFY,
      },
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    log(`FATAL: ${msg}`);
    benchState.state = "error";
    benchState.error = msg;
    await results.postResults({
      state: "error",
      error: msg,
      rows: benchState.rows,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
  }
}

main();
