/// <reference types="@webgpu/types" />
// bench-msm-v2-check — end-to-end correctness check of the MsmV2 pipeline.
//
// The bench-msm-tree-v2 `?validate=1` path only proved the GPU faithfully
// replays the affine-add tree on off-curve random points — it never checked
// the Pippenger MATH (Booth digits + window combine) against a real MSM.
// This page does: it builds real BN254 G1 points [1]G..[n]G, random Fr
// scalars, runs MsmV2, and compares the result to noble's Pippenger MSM.
//
// ?n=N runs one size; with no param it sweeps 4096 then 65536.

import { bn254 } from '@noble/curves/bn254';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';
import { MsmV2 } from './msm_v2.js';

const FP_MOD = BN254_BASE_FIELD;

// 8x u32 little-endian -> bigint, at u32 offset `off`.
function packedToBig(w: Uint32Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(w[off + i] >>> 0);
  return v;
}

interface CheckState {
  state: 'boot' | 'running' | 'done' | 'error';
  results: { n: number; ok: boolean; ms: number }[];
  error: string | null;
}
const benchState: CheckState = { state: 'boot', results: [], error: null };
(window as unknown as { __bench: CheckState }).__bench = benchState;

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err', msg: string) {
  const span = document.createElement('div');
  span.className = level === 'ok' ? 'ok' : level === 'err' ? 'err' : '';
  span.textContent = msg;
  $log.appendChild(span);
  console.log(`[msm-v2-check] ${msg}`);
}

// 32-byte little-endian encode of a field element into `buf` at `off`.
function writeLE32(buf: Uint8Array, off: number, v: bigint): void {
  let x = v;
  for (let k = 0; k < 32; k++) {
    buf[off + k] = Number(x & 0xffn);
    x >>= 8n;
  }
}

type Affine = { x: bigint; y: bigint };
const G = bn254.G1.ProjectivePoint.BASE;
const FR_ORDER = bn254.fields.Fr.ORDER;

// Carry-free signed-Booth recode — copy of MsmV2's host helper.
function boothDigit(scalar: bigint, w: number, c: number): { bucket: number; sign: number } {
  const lo = w * c;
  const winBits = Number((scalar >> BigInt(lo)) & ((1n << BigInt(c)) - 1n));
  const lookback = w === 0 ? 0 : Number((scalar >> BigInt(lo - 1)) & 1n);
  const raw = (winBits << 1) | lookback;
  const neg = (raw >>> c) & 1;
  const negMask = neg ? 0xffffffff : 0;
  const valMask = (1 << c) - 1;
  const encode = (raw + 1) >>> 1;
  const bucket = (((encode - neg) >>> 0) ^ negMask) & valMask;
  return { bucket, sign: neg };
}

function pickC(n: number): number {
  const logN = Math.round(Math.log2(n));
  const table: Record<number, number> = { 16: 13, 17: 14, 18: 14, 19: 15, 20: 16 };
  return table[logN] ?? 13;
}

// The MSM computed the "v2 way" — Booth-decode, per-window weighted digit
// sum, Horner window-combine — but with TRUE elliptic-curve arithmetic
// (noble) and a direct bucket sum. Isolates the Booth / window-combine
// math (which `?validate=1` never checked) from the GPU pair-tree.
type Proj = ReturnType<typeof bn254.G1.ProjectivePoint.fromAffine>;
const ZERO = bn254.G1.ProjectivePoint.ZERO;
const toAff = (p: Proj): Affine => (p.equals(ZERO) ? { x: 0n, y: 0n } : p.toAffine());

function hostMsmV2Way(proj: Proj[], scalars: bigint[], c: number): { result: Affine; windows: Affine[] } {
  const numWindows = Math.ceil(254 / c);
  const L: Proj[] = [];
  for (let w = 0; w < numWindows; w++) {
    let Lw = ZERO;
    for (let i = 0; i < scalars.length; i++) {
      const d = boothDigit(scalars[i], w, c);
      if (d.bucket === 0) continue;
      let term = proj[i].multiply(BigInt(d.bucket));
      if (d.sign) term = term.negate();
      Lw = Lw.add(term);
    }
    L.push(Lw);
  }
  let acc = L[numWindows - 1];
  for (let w = numWindows - 2; w >= 0; w--) {
    for (let d = 0; d < c; d++) acc = acc.double();
    acc = acc.add(L[w]);
  }
  return { result: toAff(acc), windows: L.map(toAff) };
}

function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 0;
  };
}

function randomFr(rng: () => number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt(rng());
  return v % FR_ORDER;
}

async function checkOne(device: GPUDevice, n: number): Promise<boolean> {
  log('info', `=== n=${n}: building ${n} independent random points + scalars`);
  const rng = makeRng(0xc0ffee ^ n);
  // Each point is [r_i]G for an independent random r_i — no small integer
  // relation between points (representative of a real powers-of-tau SRS).
  // [i]G (consecutive multiples) would be unrepresentative: it makes
  // reduction partial-sum cancellations artificially common.
  const points: Affine[] = new Array(n);
  const pointsBuf = new Uint8Array(n * 64);
  const scalarsBuf = new Uint8Array(n * 32);
  const scalars: bigint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const aff = G.multiply(randomFr(rng) || 1n).toAffine();
    points[i] = aff;
    writeLE32(pointsBuf, i * 64, aff.x);
    writeLE32(pointsBuf, i * 64 + 32, aff.y);
    const s = randomFr(rng);
    scalars[i] = s;
    writeLE32(scalarsBuf, i * 32, s);
  }

  log('info', `n=${n}: MsmV2.create + prepare + run`);
  const msm = await MsmV2.create(device, n, pointsBuf);
  msm.prepare(scalarsBuf);
  const t0 = performance.now();
  const gpu = await msm.run();
  const ms = performance.now() - t0;
  log('info', `n=${n}: GPU MSM in ${ms.toFixed(1)} ms — x=${gpu.x}`);

  log('info', `n=${n}: noble reference MSM (CPU)…`);
  const proj = points.map(p => bn254.G1.ProjectivePoint.fromAffine(p));
  const ref = bn254.G1.ProjectivePoint.msm(proj, scalars).toAffine();
  // Host "v2-way" reference: same Booth/window math, true EC arithmetic.
  // O(windows*n) noble multiplies — only worth it at small n; the GPU-vs-
  // noble check is the real gate, this just localizes a failure.
  const c = pickC(n);
  const hostV2 = n <= 8192 ? hostMsmV2Way(proj, scalars, c) : null;
  if (hostV2) {
    const hostV2Ok = hostV2.result.x === ref.x && hostV2.result.y === ref.y;
    log(hostV2Ok ? 'ok' : 'err', `n=${n}: host-v2-way ${hostV2Ok ? 'matches noble' : 'MISMATCH'}`);
  }
  const ok = gpu.x === ref.x && gpu.y === ref.y;
  if (ok) {
    log('ok', `n=${n}: PASS — GPU MSM matches noble`);
  } else if (!hostV2) {
    log('err', `n=${n}: FAIL — GPU x=${gpu.x} != noble x=${ref.x} (re-run at n<=8192 to localize)`);
  } else {
    log('err', `n=${n}: FAIL — GPU x=${gpu.x}`);
    log('err', `n=${n}:        noble x=${ref.x}`);
    // --- Localize: per-window L_w (GPU vs host-v2-way) ---
    const gpuL = msm.windowSums;
    const bad: number[] = [];
    for (let w = 0; w < gpuL.length; w++) {
      const hw = hostV2.windows[w];
      if (gpuL[w].x !== hw.x || gpuL[w].y !== hw.y) bad.push(w);
    }
    const firstBad = bad.length ? bad[0] : -1;
    log('err', `n=${n}: per-window L_w mismatch in ${bad.length}/${gpuL.length} windows: [${bad.join(',')}]`);
    // --- For the first bad window: is the reduction wrong, or the buckets? ---
    if (firstBad >= 0) {
      const w = firstBad;
      const dbg = await msm.debugBucketResult();
      // GPU bucket[m] for window w: decode + un-Montgomery; sum Σ m·bucket[m].
      let bucketsOnCurve = true;
      let redFromBuckets = ZERO;
      let nonEmpty = 0;
      for (let m = 1; m <= dbg.stride; m++) {
        const b = w * dbg.BW + m;
        const xM = packedToBig(dbg.buf, 2 * b * 4);
        const yM = packedToBig(dbg.buf, 2 * dbg.BW * dbg.numWindows * 4 + 2 * b * 4);
        if (xM === 0n && yM === 0n) continue;
        nonEmpty++;
        const bx = (xM * dbg.rinv) % FP_MOD;
        const by = (yM * dbg.rinv) % FP_MOD;
        try {
          const bp = bn254.G1.ProjectivePoint.fromAffine({ x: bx, y: by });
          redFromBuckets = redFromBuckets.add(bp.multiply(BigInt(m)));
        } catch {
          bucketsOnCurve = false;
        }
      }
      const rfb = toAff(redFromBuckets);
      log('err', `n=${n}: window ${w}: ${nonEmpty} non-empty buckets, all on-curve=${bucketsOnCurve}`);
      log('err', `n=${n}: window ${w}: GPU L_w x=${gpuL[w].x}`);
      log('err', `n=${n}: window ${w}: host L_w x=${hostV2.windows[w].x}`);
      log('err', `n=${n}: window ${w}: Σ m·(GPU bucket[m]) x=${rfb.x}  (== host L_w means reduction OK, buckets wrong)`);
    }
  }
  msm.destroy();
  benchState.results.push({ n, ok, ms });
  return ok;
}

async function main(): Promise<void> {
  try {
    benchState.state = 'running';
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const qp = new URLSearchParams(window.location.search);
    const sizes = qp.get('n') ? [parseInt(qp.get('n')!, 10)] : [4096];
    let allOk = true;
    for (const n of sizes) allOk = (await checkOne(device, n)) && allOk;
    benchState.state = 'done';
    log(allOk ? 'ok' : 'err', `done — ${allOk ? 'ALL PASS' : 'FAILURES'}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main();
