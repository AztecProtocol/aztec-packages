/// <reference types="@webgpu/types" />
// bench-msm-tree-v2 — "v3 done right": GPU scan-planner + fused
// super-kernel pair-tree MSM bucket-accumulate, MULTI-WINDOW.
//
// Models a full Pippenger MSM: a scalar of `numbits` bits is split into
// NUM_WINDOWS = ceil(numbits/c) windows of c bits; each window is an
// independent bucket-accumulate over BW = 2^(c-1) buckets, and every
// input point lands in one bucket per window. The bench runs all
// windows together — B = NUM_WINDOWS*BW buckets, N = NUM_WINDOWS*n
// insertions — so the GPU sees the real per-level parallelism.
//
// Per level (all GPU, one command list):
//   1. ba_planner_v2   — one workgroup per window; bin-packs each
//      window's pairs into its slice of chunk/scatter/carry plan and
//      emits next-level counts/offsets. params.w = WSTRIDE makes the
//      emitted offsets global: window w lives in active_sums slots
//      [w*WSTRIDE, (w+1)*WSTRIDE).
//   2. ba_fused_super  — marshal + disjoint affine adds + scatter.
//   3. ba_carry_copy   — propagate odd-count carries.
//   4. ba_finalize_copy — harvest a bucket's sum when its count hits 1.
//
// The pipeline is run `reps` times (re-initialised each time): rep 0 is
// cold (GPU clocks ramping, caches cold), reps 1+ are warm — comparing
// them isolates GPU cold-start from intrinsic per-level cost.
//
// Default = a 2^16-point MSM at c=15: 17 windows x 16384 buckets,
// lambda = 4.   Override: ?n=&c=&numbits=&s=&wgi=&reps=&validate=1
//
// ?validate=1 replays the whole pipeline on the host and checks
// bucket_result byte-for-byte (slow at full scale — ~10s+).

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD, modInverse } from '../../src/msm_webgpu/cuzk/bn254.js';
import { makeResultsClient } from './results_post.js';

const PG = 2;
const PLANNER_TPB = 256; // ba_planner_v2 workgroup size (one workgroup per window)
const DEFAULT_N = 1 << 16; // points per window (= MSM size)
const DEFAULT_C = 15; // Pippenger window bits
const DEFAULT_NUMBITS = 254; // scalar field bits
const DEFAULT_S = 8; // chunk size; 8 is fastest — more chunks = more parallel threads
const DEFAULT_WGI = 64;
const DEFAULT_REPS = 3;

let NPTS = DEFAULT_N;
let CBITS = DEFAULT_C;
let NUMBITS = DEFAULT_NUMBITS;
let S = DEFAULT_S;
let WGI = DEFAULT_WGI;
let REPS = DEFAULT_REPS;
let VALIDATE = false;
// Lever G window-batch count. 0 = auto (from n); ?batches= overrides it,
// which is how the batched path is exercised at small n under ?validate=1.
let BATCHES = 0;
// Field-inversion variant used by the fused super-kernel: 'a' =
// fr_inv_by_a (Option A, BATCH=26), 'loop' = fr_inv_by_loop
// (register-minimal, BATCH=12). Toggle with ?inv=loop.
let INV_VARIANT: 'a' | 'loop' = 'a';
// Reduction leaf-partition size as log2(L0). Phase A is L0-1 levels, so
// L0=2 (L0_LOG=1) minimises the level count. Tune with ?l0log=.
const DEFAULT_L0_LOG = 1;
let L0_LOG = DEFAULT_L0_LOG;
// Threads per workgroup for the fused reduction (one workgroup per window).
// 128 measured fastest (64 starves the wide levels; 256 ties 128). ?redwg=.
let REDUCE_WG = 128;

const FP = BN254_BASE_FIELD;

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomBelow(p: bigint, rng: () => number): bigint {
  const bitlen = p.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  for (;;) {
    let v = 0n;
    // Take the HIGH byte: an LCG's low bits cycle with a tiny period
    // (low 8 bits → period 256 → randomBelow period 8), which would
    // make ~every 4th point byte-identical and produce dx=0 pairs.
    for (let i = 0; i < byteLen; i++) v = (v << 8n) | BigInt((rng() >>> 24) & 0xff);
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v > 0n && v < p) return v;
  }
}

function bigintToPackedU32x8(v: bigint): Uint32Array {
  const w = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    w[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return w;
}

function packedU32x8ToBigint(w: Uint32Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(w[off + i] >>> 0);
  return v;
}

// Normal-form field arithmetic mod FP (inputs assumed in [0, FP)).
const fsub = (a: bigint, b: bigint): bigint => (a - b + FP) % FP;
const fmul = (a: bigint, b: bigint): bigint => (a * b) % FP;

// Affine point addition — the exact formula ba_fused_super applies:
//   lambda = (by - ay) / (bx - ax),  x3 = lambda^2 - ax - bx,
//   y3 = lambda*(ax - x3) - ay.   Requires ax != bx.
interface Pt {
  x: bigint;
  y: bigint;
}
function affineAdd(a: Pt, b: Pt): Pt {
  const lam = fmul(fsub(b.y, a.y), modInverse(fsub(b.x, a.x), FP));
  const x3 = fsub(fsub(fmul(lam, lam), a.x), b.x);
  const y3 = fsub(fmul(lam, fsub(a.x, x3)), a.y);
  return { x: x3, y: y3 };
}

// Affine point doubling — the exact formula ba_reduce_fused applies:
//   lambda = 3x^2 / 2y,  x3 = lambda^2 - 2x,  y3 = lambda*(x - x3) - y.
function affineDouble(p: Pt): Pt {
  const x2 = fmul(p.x, p.x);
  const lam = fmul((x2 + x2 + x2) % FP, modInverse((p.y + p.y) % FP, FP));
  const x3 = fsub(fmul(lam, lam), (p.x + p.x) % FP);
  const y3 = fsub(fmul(lam, fsub(p.x, x3)), p.y);
  return { x: x3, y: y3 };
}

// Per-bucket pair / carry / new-count, finalize-and-drop semantics —
// matches ba_planner_v2: a count-1 bucket finalizes (no carry, nc = 0).
function bucketSplit(n: number): { pc: number; cf: number; nc: number } {
  const pc = n >>> 1;
  const cf = n === 1 ? 0 : n & 1;
  return { pc, cf, nc: pc + cf };
}

// Carry-free signed-Booth recode of window w (c bits) of `scalar` — the
// host mirror of decompose_scalars_booth.template.wgsl / Constantine's
// signedWindowEncoding. Reads the window's c bits plus the lookback bit
// below them; returns the bucket magnitude in [0, 2^(c-1)] and a sign.
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

// Build level 0 from synthetic raw scalars. The GPU decompose recodes
// each c-bit window with the carry-free signed-Booth encoding into a
// bucket magnitude (chunks) + a sign bit; the transpose counting-sorts
// the buckets into a per-window CSR; csr_to_v2 (index_mode) writes the
// level-0 (point index | sign<<31) buffer + counts/offsets.
//
// Scalars enter in Montgomery form (s * R mod p) — the representation the
// prover hands over — and a GPU de-Montgomery pass reduces them to raw
// integers before the bit-slicing recode. Points enter in Montgomery form
// and stay so; lever B/D drops the precomputed -y plane — the level-0
// gather negates y on the sign bit.
//
// Returns the synthetic scalars + the Montgomery point pool (pointX,
// pointY for the GPU; poolPt + padPts for the replay model); the host
// carry-free-Booth reference (chunks, signs) the GPU decompose must
// reproduce; and the host counts/offsets the planner uses. The
// slot->point model is built post-run from the GPU's actual val_idx.
function buildL0(numWindows: number, BW: number, npw: number, c: number, R: bigint, rng: () => number) {
  const wstride = npw;
  const inputSize = npw; // points (and scalars) per window/subtask
  const M = numWindows * wstride + 3;
  const totalSlots = numWindows * inputSize;

  // Montgomery point pool. Lever B/D: no precomputed -y plane — the
  // level-0 gather negates y on the fly. Pool entries 0 and 1 double as
  // the index-mode level-0 pad pair, so they must have distinct x (a pad
  // pair with dx == 0 would poison its chunk's batched inversion).
  const poolPt: Pt[] = new Array(inputSize);
  for (let i = 0; i < inputSize; i++) poolPt[i] = { x: randomBelow(FP, rng), y: randomBelow(FP, rng) };
  if (poolPt[0].x === poolPt[1].x) poolPt[1].x = (poolPt[1].x + 1n) % FP;
  const pointX = new Uint32Array(inputSize * 8);
  const pointY = new Uint32Array(inputSize * 8);
  for (let i = 0; i < inputSize; i++) {
    pointX.set(bigintToPackedU32x8((poolPt[i].x * R) % FP), i * 8);
    pointY.set(bigintToPackedU32x8((poolPt[i].y * R) % FP), i * 8);
  }

  // Synthetic scalars in Montgomery form (s * R mod p) — the representation
  // the prover hands over; the GPU de-Montgomerys them before decompose.
  // 8 u32 little-endian. scalarBig keeps the raw s for the host recode.
  const scalars = new Uint32Array(inputSize * 8);
  const scalarBig: bigint[] = new Array(inputSize);
  for (let i = 0; i < inputSize; i++) {
    const s = randomBelow(FP, rng);
    scalarBig[i] = s;
    scalars.set(bigintToPackedU32x8((s * R) % FP), i * 8);
  }

  // Host carry-free-Booth reference: per (window, point) the bucket
  // magnitude + sign the GPU decompose must reproduce. Then a counting-
  // sort -> per-window counts + global offsets for the planner.
  const chunks = new Uint32Array(totalSlots);
  const signs = new Uint32Array(totalSlots);
  const rowPtr = new Uint32Array(numWindows * (BW + 1));
  const initCounts = new Uint32Array(numWindows * BW);
  const initOffsets = new Uint32Array(numWindows * BW);
  let maxCount = 0;
  for (let w = 0; w < numWindows; w++) {
    const cw = new Uint32Array(BW);
    const viBase = w * inputSize;
    for (let i = 0; i < inputSize; i++) {
      const d = boothDigit(scalarBig[i], w, c);
      chunks[viBase + i] = d.bucket;
      signs[viBase + i] = d.sign;
      cw[d.bucket]++;
    }
    const rpBase = w * (BW + 1);
    for (let b = 0; b < BW; b++) rowPtr[rpBase + b + 1] = rowPtr[rpBase + b] + cw[b];
    for (let b = 0; b < BW; b++) {
      const g = w * BW + b;
      initCounts[g] = cw[b];
      initOffsets[g] = w * wstride + rowPtr[rpBase + b]; // global active_sums offset
      if (cw[b] > maxCount) maxCount = cw[b];
    }
  }

  // Pad trio: 2 distinct-x points (pad_l, pad_r) + a discard slot.
  const padPts: Pt[] = [];
  for (let j = 0; j < 3; j++) padPts.push({ x: randomBelow(FP, rng), y: randomBelow(FP, rng) });
  if (padPts[0].x === padPts[1].x) padPts[1].x = (padPts[1].x + 1n) % FP;

  return {
    scalars, pointX, pointY, poolPt, padPts,
    chunks, signs, initCounts, initOffsets, M, maxCount,
  };
}

// Build the pad-trio SoA buffer for an active_sums buffer of element
// stride Mb: the 3 pad slots (pad_l, pad_r, discard) sit at Mb-3..Mb-1 in
// Montgomery form. Written once into bufA/bufB; the converter and the
// level loop only touch the real region, so the trio survives every
// batch and rep. With lever B, Mb is the per-batch level >= 1 stride M1.
function buildPadBuf(Mb: number, padPts: Pt[], R: bigint): Uint32Array {
  const padBuf = new Uint32Array(2 * PG * Mb * 4);
  for (let j = 0; j < 3; j++) {
    const slot = Mb - 3 + j;
    const xw = bigintToPackedU32x8((padPts[j].x * R) % FP);
    const yw = bigintToPackedU32x8((padPts[j].y * R) % FP);
    for (let q = 0; q < PG; q++) {
      const xb = (PG * slot + q) * 4;
      const yb = (PG * Mb + PG * slot + q) * 4;
      for (let k = 0; k < 4; k++) {
        padBuf[xb + k] = xw[4 * q + k];
        padBuf[yb + k] = yw[4 * q + k];
      }
    }
  }
  return padBuf;
}

// Running sum of every GPU buffer createBuffer'd by the helpers below —
// the v2 pipeline's resident GPU footprint. Reset per runPipeline.
let gpuBytesAllocated = 0;

function makeSoABuf(device: GPUDevice, M: number): GPUBuffer {
  const size = 2 * PG * M * 4 * 4;
  gpuBytesAllocated += size;
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
}

interface LevelPlan {
  cpw: number; // chunks per window (per-window output stride)
  carpw: number; // carries per window
  tChunks: number; // batchWindows * cpw — filled once NUM_BATCHES is known
  tCarries: number; // batchWindows * carpw — filled once NUM_BATCHES is known
}

// Plan one level: per-window pair/carry counts → next-level counts and
// global windowed offsets, plus the per-window chunk/carry strides. The
// GPU planner re-derives the plan on-device; the host needs only these
// sizes (for dispatch / buffers) and counts/offsets (for the replay).
// cpw/carpw are the max over ALL windows (every batch uses the same
// per-level stride); tChunks/tCarries (= batchWindows * cpw|carpw) are
// filled in once the lever-G batch count is chosen.
function planLevel(counts: Uint32Array, s: number, numWindows: number, BW: number, wstride: number) {
  const newCounts = new Uint32Array(numWindows * BW);
  const newOffsets = new Uint32Array(numWindows * BW);
  let cpw = 1;
  let carpw = 1;
  for (let w = 0; w < numWindows; w++) {
    let pairs = 0;
    let carries = 0;
    let localOff = 0;
    for (let bl = 0; bl < BW; bl++) {
      const g = w * BW + bl;
      const { pc, cf, nc } = bucketSplit(counts[g]);
      pairs += pc;
      carries += cf;
      newCounts[g] = nc;
      newOffsets[g] = w * wstride + localOff;
      localOff += nc;
    }
    cpw = Math.max(cpw, Math.ceil(pairs / s));
    carpw = Math.max(carpw, carries);
  }
  const plan: LevelPlan = { cpw, carpw, tChunks: 0, tCarries: 0 };
  return { plan, newCounts, newOffsets };
}

interface RunResult {
  n: number;
  windows: number;
  buckets_total: number;
  lambda: number;
  s: number;
  wgi: number;
  reps: number;
  levels: number;
  gpu_wall_ms: number; // last (warm) rep
  ns_per_inpt: number; // last (warm) rep
  validated: boolean;
  sanity_ok: boolean;
}

interface BenchState {
  state: 'boot' | 'running' | 'done' | 'error';
  params: Record<string, unknown> | null;
  results: RunResult[];
  error: string | null;
  log: string[];
}

const benchState: BenchState = { state: 'boot', params: null, results: [], error: null, log: [] };
(window as unknown as { __bench: BenchState }).__bench = benchState;
const resultsClient = makeResultsClient({ page: 'bench-msm-tree-v2' });
(window as unknown as { __runId: string }).__runId = resultsClient.runId;

async function postFinal(): Promise<void> {
  await resultsClient.postResults({
    state: benchState.state,
    params: benchState.params,
    results: benchState.results,
    error: benchState.error,
    log: benchState.log,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
}

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err' | 'warn', msg: string) {
  const cls = level === 'ok' ? 'ok' : level === 'err' ? 'err' : level === 'warn' ? 'warn' : '';
  const span = document.createElement('div');
  span.className = cls;
  span.textContent = msg;
  $log.appendChild(span);
  benchState.log.push(`[${level}] ${msg}`);
  console.log(`[bench-msm-tree-v2] ${msg}`);
}

async function compileOne(device: GPUDevice, code: string, key: string, layout: GPUBindGroupLayout): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  let hasError = false;
  const errLines: string[] = [];
  for (const m of info.messages) {
    const line = `[shader ${key}] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
    if (m.type === 'error') {
      console.error(line);
      log('err', line);
      errLines.push(line);
      hasError = true;
    } else {
      console.warn(line);
    }
  }
  if (hasError) throw new Error(`WGSL compile failed for ${key}: ${errLines.slice(0, 4).join(' | ')}`);
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
}

async function readbackU32(device: GPUDevice, buf: GPUBuffer, byteLength: number): Promise<Uint32Array> {
  const staging = device.createBuffer({ size: byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, byteLength);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return out;
}

function storageBuf(device: GPUDevice, bytes: number): GPUBuffer {
  const size = Math.max(bytes, 4);
  gpuBytesAllocated += size;
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
}

function uniformBuf(device: GPUDevice, data: Uint32Array<ArrayBuffer>): GPUBuffer {
  gpuBytesAllocated += Math.max(16, Math.ceil(data.byteLength / 16) * 16);
  const b = device.createBuffer({
    size: Math.max(16, Math.ceil(data.byteLength / 16) * 16),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(b, 0, data);
  return b;
}

async function runPipeline(device: GPUDevice, sm: ShaderManager, R: bigint, rinv: bigint): Promise<RunResult> {
  const NUM_WINDOWS = Math.ceil(NUMBITS / CBITS);
  // The carry-free Booth decompose emits bucket magnitudes in [0, 2^(c-1)]
  // — 2^(c-1)+1 columns — padded up to a multiple of the planner workgroup.
  const BW = Math.ceil((2 ** (CBITS - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
  const WSTRIDE = NPTS;
  const B_TOTAL = NUM_WINDOWS * BW;
  const N_TOTAL = NUM_WINDOWS * NPTS;
  const lambda = NPTS / BW;

  log('info', `=== MSM: ${NUM_WINDOWS} windows x ${BW} buckets, ${NPTS} pts/window (c=${CBITS}, numbits=${NUMBITS})`);
  log('info', `total: ${N_TOTAL} insertions, ${B_TOTAL} buckets, lambda=${lambda.toFixed(2)}, S=${S} WGI=${WGI} reps=${REPS}`);
  gpuBytesAllocated = 0;

  const rng = makeRng(0x9111);
  const {
    scalars, pointX, pointY, poolPt, padPts,
    chunks, signs, initCounts, initOffsets, M, maxCount,
  } = buildL0(NUM_WINDOWS, BW, NPTS, CBITS, R, rng);
  log('info', `active_sums M=${M}, bucket max count=${maxCount}`);

  // Plan every level on the host: per-level dispatch / buffer sizes and
  // (with ?validate) the host-replay reference.
  const levelPlans: LevelPlan[] = [];
  const levelCounts: Uint32Array[] = [initCounts];
  const levelOffsets: Uint32Array[] = [initOffsets];
  {
    let counts: Uint32Array = initCounts;
    for (let lv = 0; lv < 64; lv++) {
      let anyActive = false;
      for (let g = 0; g < B_TOTAL; g++) {
        if (counts[g] >= 1) {
          anyActive = true;
          break;
        }
      }
      if (!anyActive) break;
      const { plan, newCounts, newOffsets } = planLevel(counts, S, NUM_WINDOWS, BW, WSTRIDE);
      levelPlans.push(plan);
      levelCounts.push(newCounts);
      levelOffsets.push(newOffsets);
      counts = newCounts;
    }
  }
  const levels = levelPlans.length;
  log(
    'info',
    `levels=${levels}, cpw=[${levelPlans.map(p => p.cpw).join(',')}], carpw=[${levelPlans.map(p => p.carpw).join(',')}]`,
  );

  // Lever B: levels >= 1 hold full-point sums in bufA/bufB; level 0 is the
  // 4-byte-per-slot index buffer. wstride1 is the tightest per-window
  // active_sums stride that fits every window's count at every level >= 1
  // — exact (the max over all such levels / windows), so bufA/bufB shrink
  // from the level-0 element count to ~half.
  let wstride1 = 1;
  for (let lv = 1; lv <= levels; lv++) {
    const lc = levelCounts[lv];
    for (let w = 0; w < NUM_WINDOWS; w++) {
      let cnt = 0;
      for (let b = 0; b < BW; b++) cnt += lc[w * BW + b];
      if (cnt > wstride1) wstride1 = cnt;
    }
  }
  // Lever G: choose the window-batch count. Pick the smallest batch count
  // whose estimated resident GPU memory fits MEM_BUDGET and whose csr
  // dispatch stays within the 65535 workgroups-per-dimension limit. Each
  // batch processes batchWindows windows; the O(NUM_WINDOWS*n) buffers
  // size to one batch. NUM_BATCHES=1 is the unbatched pipeline; ?batches=
  // overrides the estimate (used to exercise the batched path at small n).
  const MEM_BUDGET = 248 * (1 << 20);
  const maxCpw = Math.max(1, ...levelPlans.map(p => p.cpw));
  const maxCarpw = Math.max(1, ...levelPlans.map(p => p.carpw));
  const RED_M_EST = NUM_WINDOWS * 2 ** (CBITS - 1);
  const estimateMem = (nb: number): number => {
    const bw = Math.ceil(NUM_WINDOWS / nb);
    const m1 = bw * wstride1 + 3;
    const bSlots = bw * NPTS;
    const bBuckets = bw * BW;
    const tc = bw * maxCpw;
    const tile = Math.min(Math.ceil((1 << 16) / WGI) * WGI, Math.max(WGI, Math.ceil(tc / WGI) * WGI));
    return (
      2 * 64 * m1 +                                  // bufA, bufB
      64 * B_TOTAL +                                 // bucket_result (global)
      4 * 4 * bBuckets +                             // counts / offsets ping-pong
      4 * (bSlots + 3) +                             // l0IdxBuf
      2 * (3 * tc * S + 2 * bw * maxCarpw) * 4 +     // plan ring
      tile * S * 8 * 4 +                             // pref_scratch
      3 * 4 * bSlots +                               // chunks, signs, valIdx
      4 * bw * (BW + 1) + 4 * bBuckets +             // rowPtr, curr
      4 * 32 * NPTS +                                // pointX/Y, scalars, scalarsRaw
      68 * RED_M_EST                                 // redBuf + isPresent (global)
    );
  };
  // csr dispatches ceil(batchWindows*NPTS/WGI) workgroups in X — keep it
  // under the 65535 per-dimension limit.
  const wgFits = (nb: number): boolean =>
    Math.ceil((Math.ceil(NUM_WINDOWS / nb) * NPTS) / WGI) < 65000;
  let autoBatches = 1;
  while (
    autoBatches < NUM_WINDOWS &&
    (estimateMem(autoBatches) > MEM_BUDGET || !wgFits(autoBatches))
  ) {
    autoBatches++;
  }
  const NUM_BATCHES = Math.max(1, Math.min(NUM_WINDOWS, BATCHES > 0 ? BATCHES : autoBatches));
  const batchWindows = Math.ceil(NUM_WINDOWS / NUM_BATCHES);
  const batchBuckets = batchWindows * BW;
  const batchSlots = batchWindows * NPTS;
  for (const p of levelPlans) {
    p.tChunks = batchWindows * p.cpw;
    p.tCarries = batchWindows * p.carpw;
  }
  const M1 = batchWindows * wstride1 + 3;
  const l0Slots = batchSlots + 3; // index buffer: real slots + pad trio
  log(
    'info',
    `batches=${NUM_BATCHES} x ${batchWindows} windows, lever B: wstride1=${wstride1}, ` +
      `M1=${M1}, l0 index slots=${l0Slots}, est ${(estimateMem(NUM_BATCHES) / (1 << 20)).toFixed(0)} MB`,
  );

  // --- GPU buffers (created once, reused across reps) ---
  // Lever B: bufA/bufB hold only the level >= 1 full-point sums (M1
  // elements); the level-0 index buffer l0IdxBuf is 16x smaller per slot.
  // bucket_result is global and persists across batches (lever G) —
  // finalize writes each batch's bucket slice incrementally. The pad trio
  // is written once into bufA/bufB; the level loop only touches the real
  // region, so it survives every batch and rep.
  const padBuf = buildPadBuf(M1, padPts, R);
  const bufA = makeSoABuf(device, M1);
  const bufB = makeSoABuf(device, M1);
  device.queue.writeBuffer(bufA, 0, padBuf);
  device.queue.writeBuffer(bufB, 0, padBuf);
  const bucketResult = makeSoABuf(device, B_TOTAL);
  // Level-0 active_sums: one u32 (point index | sign<<31) per slot. The 3
  // pad slots hold pool indices 0 / 1 / 2 — the planner's level-0 pad
  // pairs gather poolPt[0], poolPt[1] (ensured distinct-x in buildL0).
  const l0IdxBuf = storageBuf(device, l0Slots * 4);
  device.queue.writeBuffer(l0IdxBuf, batchSlots * 4, new Uint32Array([0, 1, 2]));

  // counts / offsets ping-pong + currBuf are per-batch sized; planMeta
  // keeps the global stride (the planner indexes its tail by NUM_WINDOWS).
  const countsBufs = [storageBuf(device, batchBuckets * 4), storageBuf(device, batchBuckets * 4)];
  const offsetsBufs = [storageBuf(device, batchBuckets * 4), storageBuf(device, batchBuckets * 4)];
  const planMeta = storageBuf(device, (3 * NUM_WINDOWS + 6) * 4);

  // Plan buffers — a 2-deep ring sized for the widest level (lever E).
  // ba_planner_v2 runs with self_pad: it rewrites every per-window tail
  // each level, so the same two buffers serve all levels (ping-pong by
  // level parity) with no host pre-padding, even as the per-level stride
  // shrinks. The pad trio's slot indices are handed to the planner via
  // padParams0Buf / padParams1Buf below.
  const maxTChunks = Math.max(...levelPlans.map(p => p.tChunks));
  const maxTCarries = Math.max(1, ...levelPlans.map(p => p.tCarries));
  const chunkPlanRing: GPUBuffer[] = [];
  const scatterPlanRing: GPUBuffer[] = [];
  const carryPlanRing: GPUBuffer[] = [];
  for (let r = 0; r < 2; r++) {
    chunkPlanRing.push(storageBuf(device, 2 * maxTChunks * S * 4));
    scatterPlanRing.push(storageBuf(device, maxTChunks * S * 4));
    carryPlanRing.push(storageBuf(device, 2 * maxTCarries * 4));
  }
  // Lever B: the pad trio differs by level class. Level 0's pad sources
  // are l0IdxBuf slots (batchSlots, batchSlots+1); its pad destination is
  // a bufB slot (M1-1). Levels >= 1 read and write bufA/bufB, pad trio at
  // M1-3 / M1-2 / M1-1.
  const padParams0Buf = uniformBuf(device, new Uint32Array([batchSlots, batchSlots + 1, M1 - 1, 0]));
  const padParams1Buf = uniformBuf(device, new Uint32Array([M1 - 3, M1 - 2, M1 - 1, 0]));

  // pref_scratch: the fused kernel's forward prefix products, moved out of
  // per-thread private memory into a storage buffer so occupancy no longer
  // scales with S. Lever A tiles the fused dispatch so this buffer is a
  // fixed, n-independent size: FUSED_TILE threads per tile (a multiple of
  // WGI so a tile's local gid.x stays in [0, FUSED_TILE)), capped at 64K
  // and never wider than the widest level — small n keeps the single-tile
  // shape (FUSED_TILE = maxTChunks), so pref_scratch is unchanged there.
  const FUSED_TILE = Math.min(
    Math.ceil((1 << 16) / WGI) * WGI,
    Math.max(WGI, Math.ceil(maxTChunks / WGI) * WGI),
  );
  const prefScratchBuf = storageBuf(device, FUSED_TILE * S * 8 * 4);

  // --- Layouts ---
  const plannerLayout = device.createBindGroupLayout({
    entries: [0, 1, 2, 3, 4, 5, 6, 7]
      .map(binding => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: (binding <= 1 ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
      }))
      .concat([8, 9].map(binding => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' as GPUBufferBindingType },
      }))),
  });
  const fusedLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const carryLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const finalizeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  // Lever B: level-0 variants of fused / carry / finalize. They read the
  // level-0 index buffer (binding 2, a flat u32 array) and gather operand
  // points from the pool (point_x / point_y, the trailing bindings).
  const lt = (types: GPUBufferBindingType[]): GPUBindGroupLayout =>
    device.createBindGroupLayout({
      entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
  const fusedLayoutL0 = lt([
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'storage',
    'read-only-storage', 'read-only-storage',
  ]);
  const carryLayoutL0 = lt([
    'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'read-only-storage', 'read-only-storage',
  ]);
  const finalizeLayoutL0 = lt([
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform',
    'read-only-storage', 'read-only-storage',
  ]);

  const pairCap = Math.max(64, Math.ceil(maxCount / 2) + 16);
  const plannerPipe = await compileOne(
    device,
    sm.gen_ba_planner_v2_bench_shader(PLANNER_TPB, CBITS, NUMBITS, S, pairCap, BW, true),
    `planner-v2-c${CBITS}-w${NUM_WINDOWS}`,
    plannerLayout,
  );
  const fusedPipe = await compileOne(device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true), `fused-W${WGI}-S${S}-${INV_VARIANT}`, fusedLayout);
  const carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry-W${WGI}`, carryLayout);
  const finalizePipe = await compileOne(device, sm.gen_ba_finalize_copy_bench_shader(WGI), `finalize-W${WGI}`, finalizeLayout);
  // Lever B: level-0 variants — fused / carry / finalize gathering from
  // the point pool with index-mode level-0 active_sums.
  const fusedPipeL0 = await compileOne(
    device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true, true), `fused-l0-W${WGI}-S${S}`, fusedLayoutL0,
  );
  const carryPipeL0 = await compileOne(
    device, sm.gen_ba_carry_copy_bench_shader(WGI, true), `carry-l0-W${WGI}`, carryLayoutL0,
  );
  const finalizePipeL0 = await compileOne(
    device, sm.gen_ba_finalize_copy_bench_shader(WGI, true), `finalize-l0-W${WGI}`, finalizeLayoutL0,
  );
  log('info', '7 pipelines compiled (4 + 3 level-0 index-mode variants)');

  // --- Pippenger pre-steps: decompose -> transpose -> csr_to_v2.
  // The carry-free Booth decompose recodes scalars into per-(window,point)
  // bucket magnitudes (chunks) + signs; the transpose counting-sorts the
  // buckets into a per-window CSR; csr_to_v2 materialises level-0
  // active_sums (negating sign-flagged points) + counts/offsets. ---
  const scalarsBuf = storageBuf(device, scalars.byteLength);
  const scalarsRawBuf = storageBuf(device, scalars.byteLength);
  const pointXBuf = storageBuf(device, pointX.byteLength);
  const pointYBuf = storageBuf(device, pointY.byteLength);
  device.queue.writeBuffer(scalarsBuf, 0, scalars);
  device.queue.writeBuffer(pointXBuf, 0, pointX);
  device.queue.writeBuffer(pointYBuf, 0, pointY);
  // Decompose outputs (chunks -> transpose, signs -> csr_to_v2), transpose
  // outputs, and curr = scatter cursors. All are per-batch sized (lever G)
  // and reused across batches. rowPtr / curr are atomic-accumulated, so
  // both are zeroed before each batch's count / scatter.
  const chunksBuf = storageBuf(device, batchSlots * 4);
  const signsBuf = storageBuf(device, batchSlots * 4);
  const rowPtrBuf = storageBuf(device, batchWindows * (BW + 1) * 4);
  const valIdxBuf = storageBuf(device, batchSlots * 4);
  const currBuf = storageBuf(device, batchBuckets * 4);
  const demontParams = uniformBuf(device, new Uint32Array([NPTS, 0, 0, 0]));
  // decompose: num_windows = batchWindows; the dispatch Y-count limits it
  // to this batch's real windows. csr params guard on the batch sizes.
  const decomposeParams = uniformBuf(device, new Uint32Array([NPTS, batchWindows, CBITS, 8]));
  const xposeParams = uniformBuf(device, new Uint32Array([Math.ceil(NPTS / BW), BW, NPTS, 0]));
  // index_mode csr uses params[0]=total_slots, [2]=wstride, [3]=input_size.
  const convActiveParams = uniformBuf(device, new Uint32Array([batchSlots, M1, WSTRIDE, NPTS]));
  const convMetaParams = uniformBuf(device, new Uint32Array([BW, batchBuckets, NPTS, 0]));
  // Lever G: per-batch decompose window base (global index of the batch's
  // first window — decompose slices scalar bits at that global offset).
  const batchWindowBaseBufs: GPUBuffer[] = [];
  for (let bi = 0; bi < NUM_BATCHES; bi++) {
    batchWindowBaseBufs.push(uniformBuf(device, new Uint32Array([bi * batchWindows, 0, 0, 0])));
  }

  const bgl = (types: GPUBufferBindingType[]): GPUBindGroupLayout =>
    device.createBindGroupLayout({
      entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
  const mkBind = (layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup =>
    device.createBindGroup({ layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });

  const demontLayout = bgl(['read-only-storage', 'storage', 'uniform']);
  const decomposeLayout = bgl(['read-only-storage', 'storage', 'storage', 'uniform', 'uniform']);
  const xposeCountLayout = bgl(['read-only-storage', 'storage', 'uniform']);
  const xposeScanLayout = bgl(['storage', 'uniform']);
  const xposeScatterLayout = bgl(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
  // Lever B: csr_to_v2_active_sums in index_mode — val_idx + signs in, the
  // flat (point index | sign<<31) level-0 buffer out. No point pool input.
  const convActiveLayout = bgl(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
  const convMetaLayout = bgl(['read-only-storage', 'storage', 'storage', 'uniform']);

  const demontPipe = await compileOne(device, sm.gen_demont_scalars_shader(WGI), `demont-W${WGI}`, demontLayout);
  const decomposePipe = await compileOne(device, sm.gen_decompose_scalars_booth_shader(WGI), `decompose-W${WGI}`, decomposeLayout);
  const xposeCountPipe = await compileOne(device, sm.gen_transpose_count_shader(WGI), `xpose-count-W${WGI}`, xposeCountLayout);
  const xposeScanPipe = await compileOne(device, sm.gen_transpose_scan_shader(NUM_WINDOWS), 'xpose-scan', xposeScanLayout);
  const xposeScatterPipe = await compileOne(device, sm.gen_transpose_scatter_shader(WGI), `xpose-scatter-W${WGI}`, xposeScatterLayout);
  const convActivePipe = await compileOne(device, sm.gen_csr_to_v2_active_sums_shader(WGI, true, true), `csr2v2-active-idx-W${WGI}`, convActiveLayout);
  const convMetaPipe = await compileOne(device, sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta-W${WGI}`, convMetaLayout);

  const demontBind = mkBind(demontLayout, [scalarsBuf, scalarsRawBuf, demontParams]);
  // decompose: one bind per batch — only the batch_window_base uniform
  // differs. Every other pre-step bind references the (per-batch sized,
  // reused-each-batch) buffers directly, so they are batch-independent.
  const decomposeBinds = batchWindowBaseBufs.map(bwb =>
    mkBind(decomposeLayout, [scalarsRawBuf, chunksBuf, signsBuf, decomposeParams, bwb]));
  const xposeCountBind = mkBind(xposeCountLayout, [chunksBuf, rowPtrBuf, xposeParams]);
  const xposeScanBind = mkBind(xposeScanLayout, [rowPtrBuf, xposeParams]);
  const xposeScatterBind = mkBind(xposeScatterLayout, [chunksBuf, rowPtrBuf, valIdxBuf, currBuf, xposeParams]);
  // Lever B: csr_to_v2_active_sums writes the level-0 index buffer.
  const convActiveBind = mkBind(convActiveLayout, [valIdxBuf, l0IdxBuf, convActiveParams, signsBuf]);
  const convMetaBind = mkBind(convMetaLayout, [rowPtrBuf, countsBufs[0], offsetsBufs[0], convMetaParams]);

  const nXposePts = Math.ceil(NPTS / WGI);
  const nConvMeta = Math.ceil(batchBuckets / WGI);
  log('info', '7 pre-step pipelines compiled (demont + decompose + transpose x3 + csr_to_v2 x2)');

  // --- Bucket reduction: fused recursive affine 4-phase tree ---
  // Per window compute the weighted bucket sum Σ_m m·bucket[m]. The whole
  // 4-phase reduction (A suffix-sums, B log-recombine, C weight-baking
  // doublings, D flat tree-add) runs in ONE dispatch: one workgroup per
  // window, a storageBarrier between the levels (driven by a uniform
  // schedule). STRIDE = 2^(c-1) — the weighted bucket magnitudes 1..2^(c-1),
  // already a power of two (the zero-digit column 0 is dropped by init).
  const STRIDE = 2 ** (CBITS - 1);
  const C0 = Math.max(1, Math.min(L0_LOG, Math.log2(STRIDE) - 1));
  const L0 = 1 << C0;
  const D = STRIDE / L0;
  const RED_M = NUM_WINDOWS * STRIDE;
  log('info', `reduction: STRIDE=${STRIDE}, L0=${L0} (c0=${C0}), D=${D}, redwg=${REDUCE_WG}`);

  // The 4-phase level schedule (data-independent — fixed power-of-2 strides).
  // Each entry drives both the fused GPU kernel and the host-replay check.
  interface ReducePass {
    isDouble: boolean;
    shaderPhase: number; // 0 = A-mode index math, !=0 = B/D-mode
    p2x: number;
    p2y: number;
    ppw: number; // candidates per window
  }
  const reducePasses: ReducePass[] = [];
  const pushPass = (isDouble: boolean, shaderPhase: number, p2x: number, p2y: number, ppw: number) => {
    reducePasses.push({ isDouble, shaderPhase, p2x, p2y, ppw });
  };
  for (let l = L0 - 1; l >= 1; l--) pushPass(false, 0, L0, l, D); // A
  for (let L1 = L0; L1 < STRIDE; L1 *= 2) pushPass(false, 1, L0, L1, STRIDE / (2 * L1)); // B
  for (let j = 0; j < C0; j++) pushPass(true, 2, L0, 0, D - 1); // C initial
  for (let L1 = 2 * L0; L1 < STRIDE; L1 *= 2) pushPass(true, 2, L1, 0, STRIDE / L1 - 1); // C successive
  for (let m = 1; m < STRIDE; m *= 2) pushPass(false, 2, L0, m, STRIDE / (2 * m)); // D
  if (reducePasses.length > 64) throw new Error(`reduction schedule too long: ${reducePasses.length} > 64`);
  log('info', `reduction: ${reducePasses.length} levels, fused into one dispatch`);

  // Schedule uniform: per level (kind, a, b, ppw) — kind 0 = A-add,
  // 1 = B/D-add, 2 = C-double. MAXC = widest per-thread candidate chunk.
  let MAXC = 1;
  const schedule = new Uint32Array(64 * 4);
  reducePasses.forEach((p, i) => {
    const kind = p.isDouble ? 2 : p.shaderPhase === 0 ? 0 : 1;
    const a = !p.isDouble && p.shaderPhase !== 0 ? p.p2y : p.p2x;
    const b = !p.isDouble && p.shaderPhase === 0 ? p.p2y : 0;
    schedule[i * 4 + 0] = kind;
    schedule[i * 4 + 1] = a;
    schedule[i * 4 + 2] = b;
    schedule[i * 4 + 3] = p.ppw;
    MAXC = Math.max(MAXC, Math.ceil(p.ppw / REDUCE_WG));
  });

  const redBuf = makeSoABuf(device, RED_M);
  const isPresentBuf = storageBuf(device, RED_M * 4);
  const reducePrefScratch = storageBuf(device, NUM_WINDOWS * REDUCE_WG * MAXC * 2 * 16);
  const reduceInitParams = uniformBuf(device, new Uint32Array([RED_M, STRIDE, BW, B_TOTAL]));
  const reduceFusedParams = uniformBuf(device, new Uint32Array([reducePasses.length, RED_M, MAXC, STRIDE]));
  const scheduleBuf = uniformBuf(device, schedule);

  const reduceInitLayout = bgl(['read-only-storage', 'storage', 'storage', 'uniform']);
  const reduceFusedLayout = bgl(['storage', 'storage', 'storage', 'uniform', 'uniform']);

  const reduceInitPipe = await compileOne(device, sm.gen_ba_reduce_init_bench_shader(WGI), `reduce-init-W${WGI}`, reduceInitLayout);
  const reduceFusedPipe = await compileOne(
    device, sm.gen_ba_reduce_fused_bench_shader(REDUCE_WG, INV_VARIANT), `reduce-fused-W${REDUCE_WG}`, reduceFusedLayout,
  );
  const reduceInitBind = mkBind(reduceInitLayout, [bucketResult, redBuf, isPresentBuf, reduceInitParams]);
  const reduceFusedBind = mkBind(reduceFusedLayout, [redBuf, isPresentBuf, reducePrefScratch, reduceFusedParams, scheduleBuf]);
  const nReduceInit = Math.ceil(RED_M / WGI);

  // --- Per-level bind groups + uniforms (built once, reused each rep) ---
  // Lever G: finalize writes the GLOBAL bucket_result. Per batch it gets
  // its bucket count (= thread count), M1, the batch's bucket base,
  // and the global plane stride B_TOTAL.
  const finalizeParamsBufs: GPUBuffer[] = [];
  for (let bi = 0; bi < NUM_BATCHES; bi++) {
    finalizeParamsBufs.push(
      uniformBuf(device, new Uint32Array([batchBuckets, M1, bi * batchBuckets, B_TOTAL])),
    );
  }
  const numWgsFinalize = Math.ceil(batchBuckets / WGI);
  interface LevelBind {
    plannerBind: GPUBindGroup;
    fusedTiles: { bind: GPUBindGroup; nx: number }[];
    carryBind: GPUBindGroup;
    finalizeBinds: GPUBindGroup[]; // one per batch (differ only in finalize params)
    nCarry: number;
  }
  const levelBinds: LevelBind[] = [];
  for (let lv = 0; lv < levels; lv++) {
    const plan = levelPlans[lv];
    // Lever B: level 0 reads the index buffer + gathers from the pool;
    // levels >= 1 read full points from the bufA/bufB ping-pong. The
    // ping-pong is unchanged for lv >= 1 (level 0's output is bufB).
    const isL0 = lv === 0;
    const inIdx = lv & 1;
    const outIdx = inIdx ^ 1;
    const activeOut = inIdx === 0 ? bufB : bufA;
    const activeIn = isL0 ? l0IdxBuf : (inIdx === 0 ? bufA : bufB);
    const plannerParams = uniformBuf(device, new Uint32Array([plan.cpw, plan.carpw, WGI, wstride1]));
    const carryParams = uniformBuf(device, new Uint32Array([plan.tCarries, M1, M1, 0]));
    const ring = lv & 1;
    // Lever A: one fused bind group per tile of FUSED_TILE threads; the
    // tile's global base thread rides in params.w. Small levels (and small
    // n, where FUSED_TILE == maxTChunks) collapse to a single tile.
    const fusedTiles: { bind: GPUBindGroup; nx: number }[] = [];
    for (let tileBase = 0; tileBase < plan.tChunks; tileBase += FUSED_TILE) {
      const tileThreads = Math.min(FUSED_TILE, plan.tChunks - tileBase);
      const tileParams = uniformBuf(device, new Uint32Array([plan.tChunks, M1, M1, tileBase]));
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: chunkPlanRing[ring] } },
        { binding: 1, resource: { buffer: scatterPlanRing[ring] } },
        { binding: 2, resource: { buffer: activeIn } },
        { binding: 3, resource: { buffer: activeOut } },
        { binding: 4, resource: { buffer: tileParams } },
        { binding: 5, resource: { buffer: prefScratchBuf } },
      ];
      if (isL0) {
        entries.push(
          { binding: 6, resource: { buffer: pointXBuf } },
          { binding: 7, resource: { buffer: pointYBuf } },
        );
      }
      fusedTiles.push({
        bind: device.createBindGroup({ layout: isL0 ? fusedLayoutL0 : fusedLayout, entries }),
        nx: Math.ceil(tileThreads / WGI),
      });
    }
    const carryEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: carryPlanRing[ring] } },
      { binding: 1, resource: { buffer: activeIn } },
      { binding: 2, resource: { buffer: activeOut } },
      { binding: 3, resource: { buffer: carryParams } },
    ];
    if (isL0) {
      carryEntries.push(
        { binding: 4, resource: { buffer: pointXBuf } },
        { binding: 5, resource: { buffer: pointYBuf } },
      );
    }
    levelBinds.push({
      plannerBind: device.createBindGroup({
        layout: plannerLayout,
        entries: [
          { binding: 0, resource: { buffer: countsBufs[inIdx] } },
          { binding: 1, resource: { buffer: offsetsBufs[inIdx] } },
          { binding: 2, resource: { buffer: chunkPlanRing[ring] } },
          { binding: 3, resource: { buffer: scatterPlanRing[ring] } },
          { binding: 4, resource: { buffer: carryPlanRing[ring] } },
          { binding: 5, resource: { buffer: countsBufs[outIdx] } },
          { binding: 6, resource: { buffer: offsetsBufs[outIdx] } },
          { binding: 7, resource: { buffer: planMeta } },
          { binding: 8, resource: { buffer: plannerParams } },
          { binding: 9, resource: { buffer: isL0 ? padParams0Buf : padParams1Buf } },
        ],
      }),
      fusedTiles,
      carryBind: device.createBindGroup({ layout: isL0 ? carryLayoutL0 : carryLayout, entries: carryEntries }),
      finalizeBinds: finalizeParamsBufs.map(fp => {
        const fe: GPUBindGroupEntry[] = [
          { binding: 0, resource: { buffer: countsBufs[inIdx] } },
          { binding: 1, resource: { buffer: offsetsBufs[inIdx] } },
          { binding: 2, resource: { buffer: activeIn } },
          { binding: 3, resource: { buffer: bucketResult } },
          { binding: 4, resource: { buffer: fp } },
        ];
        if (isL0) {
          fe.push(
            { binding: 5, resource: { buffer: pointXBuf } },
            { binding: 6, resource: { buffer: pointYBuf } },
          );
        }
        return device.createBindGroup({ layout: isL0 ? finalizeLayoutL0 : finalizeLayout, entries: fe });
      }),
      nCarry: Math.ceil(plan.tCarries / WGI),
    });
  }

  // --- Timestamp query set (reused across reps) ---
  // Per rep: de-Montgomery once, then per batch (lever G) a 6-pass
  // prologue (decompose, transpose x3, csr_to_v2 x2) and per level a
  // planner + fusedTiles + carry + finalize, then reduce init + reduce
  // fused. The fused step is tiled (lever A) — a level contributes a
  // variable number of passes.
  const totalFusedTiles = levelBinds.reduce((a, lb) => a + lb.fusedTiles.length, 0);
  const passCount = 1 + NUM_BATCHES * (6 + levels * 3 + totalFusedTiles) + 2;
  const tsEnabled = device.features.has('timestamp-query');
  if (!tsEnabled) log('warn', 'timestamp-query unavailable — per-component timing skipped');
  const querySet = tsEnabled ? device.createQuerySet({ type: 'timestamp', count: passCount * 2 }) : null;
  const tsResolve = tsEnabled
    ? device.createBuffer({ size: passCount * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
    : null;
  const tsStaging = tsEnabled
    ? device.createBuffer({ size: passCount * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    : null;

  // Per-batch prologue-output staging — populated only on the validation
  // run, where the host-replay needs the GLOBAL chunks / signs / valIdx /
  // rowPtr but each is per-batch sized and overwritten between batches.
  interface Snapshot {
    chunks: GPUBuffer[];
    signs: GPUBuffer[];
    valIdx: GPUBuffer[];
    rowPtr: GPUBuffer[];
  }
  const createSnapshot = (): Snapshot => {
    const mk = (bytes: number): GPUBuffer[] =>
      Array.from({ length: NUM_BATCHES }, () =>
        device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    return {
      chunks: mk(batchSlots * 4), signs: mk(batchSlots * 4),
      valIdx: mk(batchSlots * 4), rowPtr: mk(batchWindows * (BW + 1) * 4),
    };
  };

  // One pipeline run: encode every batch's prologue + level loop and the
  // final reduction into one command list, time the single submit, read
  // the per-pass timestamps. With `snap` (the validation run) each batch's
  // prologue outputs are copied into per-batch staging in the same encoder.
  const runOnce = async (rep: number, snap: Snapshot | null): Promise<number> => {
    const enc = device.createCommandEncoder();
    let passIdx = 0;
    const dispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, nx: number, ny = 1) => {
      const desc: GPUComputePassDescriptor = {};
      if (querySet) {
        desc.timestampWrites = {
          querySet,
          beginningOfPassWriteIndex: 2 * passIdx,
          endOfPassWriteIndex: 2 * passIdx + 1,
        };
      }
      const pass = enc.beginComputePass(desc);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.max(1, nx), Math.max(1, ny), 1);
      pass.end();
      passIdx++;
    };
    // De-Montgomery the scalars once (batch-independent): montmul by 1
    // reduces the Montgomery-form input to raw integers for the recode.
    dispatch(demontPipe, demontBind, nXposePts);
    // Lever G: outer loop over window batches. Each batch runs the full
    // Pippenger prologue + bucket-accumulate for its windows into the
    // per-batch-sized level-0 buffers; bucket_result accumulates globally.
    for (let bi = 0; bi < NUM_BATCHES; bi++) {
      const tbw = Math.min(batchWindows, NUM_WINDOWS - bi * batchWindows);
      const tSlots = tbw * NPTS;
      // Decompose: carry-free Booth recode -> per-(window, point) bucket
      // magnitudes + signs, for this batch's windows.
      dispatch(decomposePipe, decomposeBinds[bi], nXposePts, tbw);
      // Transpose (count / scan / scatter): counting-sort into a per-window
      // CSR. count / scatter atomic-accumulate, so rowPtr / curr are zeroed
      // first. The last batch's empty tail windows stay count-0.
      enc.clearBuffer(rowPtrBuf);
      enc.clearBuffer(currBuf);
      dispatch(xposeCountPipe, xposeCountBind, nXposePts, tbw);
      dispatch(xposeScanPipe, xposeScanBind, batchWindows);
      dispatch(xposeScatterPipe, xposeScatterBind, nXposePts, tbw);
      // csr_to_v2: CSR -> level-0 active_sums (sign-negated) + counts /
      // offsets. meta covers all batchWindows so empty tail windows get
      // count 0; the bufA / bufB pad trios survive untouched.
      dispatch(convActivePipe, convActiveBind, Math.ceil(tSlots / WGI));
      dispatch(convMetaPipe, convMetaBind, nConvMeta);
      if (snap) {
        enc.copyBufferToBuffer(chunksBuf, 0, snap.chunks[bi], 0, batchSlots * 4);
        enc.copyBufferToBuffer(signsBuf, 0, snap.signs[bi], 0, batchSlots * 4);
        enc.copyBufferToBuffer(valIdxBuf, 0, snap.valIdx[bi], 0, batchSlots * 4);
        enc.copyBufferToBuffer(rowPtrBuf, 0, snap.rowPtr[bi], 0, batchWindows * (BW + 1) * 4);
      }
      for (let lv = 0; lv < levels; lv++) {
        const lb = levelBinds[lv];
        // Lever B: level 0 runs the index-mode fused / carry / finalize
        // variants (gather from the pool); levels >= 1 use the full-point
        // kernels.
        const fp = lv === 0 ? fusedPipeL0 : fusedPipe;
        const cp = lv === 0 ? carryPipeL0 : carryPipe;
        const flp = lv === 0 ? finalizePipeL0 : finalizePipe;
        dispatch(plannerPipe, lb.plannerBind, batchWindows);
        // Lever A: each fused tile is its own pass — pref_scratch is shared
        // across tiles, so the inter-pass barrier serialises their reuse.
        for (const tile of lb.fusedTiles) dispatch(fp, tile.bind, tile.nx);
        dispatch(cp, lb.carryBind, lb.nCarry);
        dispatch(flp, lb.finalizeBinds[bi], numWgsFinalize);
      }
    }
    // Bucket reduction over the GLOBAL bucket_result — init repack -> fused
    // 4-phase tree, one dispatch of NUM_WINDOWS workgroups, after every
    // batch has finalized its bucket slice.
    dispatch(reduceInitPipe, reduceInitBind, nReduceInit);
    dispatch(reduceFusedPipe, reduceFusedBind, NUM_WINDOWS);
    if (querySet && tsResolve && tsStaging) {
      enc.resolveQuerySet(querySet, 0, passCount * 2, tsResolve, 0);
      enc.copyBufferToBuffer(tsResolve, 0, tsStaging, 0, passCount * 16);
    }

    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    const wall = performance.now() - t0;

    const tag = snap ? 'valrun' : rep === 0 ? 'cold' : 'warm';
    if (querySet && tsStaging) {
      await tsStaging.mapAsync(GPUMapMode.READ);
      const ts = new BigUint64Array(tsStaging.getMappedRange().slice(0));
      tsStaging.unmap();
      // Structured walk of the timestamps in dispatch order — robust to
      // the variable per-level fused-tile count (lever A) and the outer
      // batch loop (lever G).
      let tsIdx = 0;
      const nextDur = (): number => {
        const d = Number(ts[2 * tsIdx + 1] - ts[2 * tsIdx]);
        tsIdx++;
        return d;
      };
      const byKind = [0, 0, 0, 0]; // planner, fused, carry, finalize
      const demont = nextDur();
      let decompose = 0;
      let transpose = 0;
      let convert = 0;
      const fusedPerLevel: number[] = new Array(levels).fill(0);
      for (let bi = 0; bi < NUM_BATCHES; bi++) {
        decompose += nextDur();
        transpose += nextDur() + nextDur() + nextDur();
        convert += nextDur() + nextDur();
        for (let lv = 0; lv < levels; lv++) {
          byKind[0] += nextDur(); // planner
          let f = 0;
          for (let tt = 0; tt < levelBinds[lv].fusedTiles.length; tt++) f += nextDur();
          byKind[1] += f;
          fusedPerLevel[lv] += f;
          byKind[2] += nextDur(); // carry
          byKind[3] += nextDur(); // finalize
        }
      }
      const redInit = nextDur();
      const redFused = nextDur();
      const sumPasses =
        demont + decompose + transpose + convert + redInit + redFused +
        byKind.reduce((a, b) => a + b, 0);
      const gpuSpan = Number(ts[passCount * 2 - 1] - ts[0]);
      const ms = (x: number): string => (x / 1e6).toFixed(2);
      log(
        'info',
        `rep ${rep} (${tag}): wall=${wall.toFixed(2)}ms | demont ${ms(demont)}  decompose ${ms(decompose)}  ` +
          `transpose ${ms(transpose)}  convert ${ms(convert)}  planner ${ms(byKind[0])}  fused ${ms(byKind[1])}  ` +
          `carry ${ms(byKind[2])}  finalize ${ms(byKind[3])}  red-init ${ms(redInit)}  red-fused ${ms(redFused)}  ` +
          `inter-pass ${ms(gpuSpan - sumPasses)}  submit ${ms(wall * 1e6 - gpuSpan)}  (ms)`,
      );
      log(
        'info',
        `  fused per-level: ` +
          fusedPerLevel
            .map((d, lv) => `L${lv} ${(d / 1e3).toFixed(0)}µs/${(d / levelPlans[lv].tChunks).toFixed(0)}ns-chk`)
            .join('  '),
      );
    } else {
      log('info', `rep ${rep} (${tag}): wall=${wall.toFixed(2)}ms`);
    }
    return wall;
  };

  log('info', `GPU memory: ${(gpuBytesAllocated / (1 << 20)).toFixed(1)} MB resident across all buffers`);

  let lastWall = 0;
  for (let rep = 0; rep < Math.max(1, REPS); rep++) lastWall = await runOnce(rep, null);

  // Validation run: re-run with per-batch prologue snapshots, so the host
  // replay can reassemble the GLOBAL chunks / signs / valIdx / rowPtr even
  // though the GPU level-0 buffers are per-batch sized (lever G).
  let snap: Snapshot | null = null;
  if (VALIDATE) {
    snap = createSnapshot();
    await runOnce(REPS, snap);
  }

  // --- Read back + checks (bucketResult holds the last run's output) ---
  const gpuResult = await readbackU32(device, bucketResult, 2 * PG * B_TOTAL * 4 * 4);
  let sanity = false;
  for (let i = 0; i < gpuResult.length && !sanity; i++) if (gpuResult[i] !== 0) sanity = true;

  let validated = false;
  if (VALIDATE && snap) {
    log('info', 'validating (decompose + transpose checks + host pipeline replay)...');
    // Reassemble the global GPU prologue outputs from the per-batch
    // snapshots: each batch contributes its windows' contiguous slice.
    const gpuChunks = new Uint32Array(N_TOTAL);
    const gpuSigns = new Uint32Array(N_TOTAL);
    const gpuValIdx = new Uint32Array(N_TOTAL);
    const gpuRowPtr = new Uint32Array(NUM_WINDOWS * (BW + 1));
    for (let bi = 0; bi < NUM_BATCHES; bi++) {
      const tbw = Math.min(batchWindows, NUM_WINDOWS - bi * batchWindows);
      const four = [snap.chunks[bi], snap.signs[bi], snap.valIdx[bi], snap.rowPtr[bi]];
      await Promise.all(four.map(b => b.mapAsync(GPUMapMode.READ)));
      gpuChunks.set(new Uint32Array(snap.chunks[bi].getMappedRange()).subarray(0, tbw * NPTS), bi * batchSlots);
      gpuSigns.set(new Uint32Array(snap.signs[bi].getMappedRange()).subarray(0, tbw * NPTS), bi * batchSlots);
      gpuValIdx.set(new Uint32Array(snap.valIdx[bi].getMappedRange()).subarray(0, tbw * NPTS), bi * batchSlots);
      gpuRowPtr.set(
        new Uint32Array(snap.rowPtr[bi].getMappedRange()).subarray(0, tbw * (BW + 1)),
        bi * batchWindows * (BW + 1),
      );
      four.forEach(b => { b.unmap(); b.destroy(); });
    }
    // checkDecompose: GPU Booth digits (chunks + signs) match the host
    // carry-free-Booth recode. checkTranspose: the GPU CSR groups those
    // chunks correctly. The replay then models slot->point from the GPU's
    // actual val_idx (its within-bucket order is atomic-arrival, not host-
    // predictable), negating sign-flagged points — so host and GPU pair-
    // trees share an association and a sign.
    const decompOk = checkDecompose(chunks, signs, gpuChunks, gpuSigns);
    const xposeOk = checkTranspose(chunks, gpuRowPtr, gpuValIdx, NUM_WINDOWS, BW, NPTS);
    let replayOk = false;
    let reduceOk = false;
    if (decompOk && xposeOk) {
      const slotPt: Pt[] = new Array(M);
      for (let s = 0; s < N_TOTAL; s++) {
        const p = gpuValIdx[s];
        const base = poolPt[p];
        const negated = signs[((s / WSTRIDE) | 0) * NPTS + p] === 1;
        slotPt[s] = negated ? { x: base.x, y: (FP - base.y) % FP } : base;
      }
      for (let j = 0; j < 3; j++) slotPt[N_TOTAL + j] = padPts[j];
      replayOk = hostReplayValidate(slotPt, levelPlans, levelCounts, levelOffsets, gpuResult, R, rinv);
      if (replayOk) {
        // Host-replay the 4-phase reduction (same pass list + index math),
        // compare per-window weighted sums, then fold into the final MSM.
        const gpuRedBuf = await readbackU32(device, redBuf, 2 * PG * RED_M * 4 * 4);
        const rr = hostReduceReplay(gpuResult, gpuRedBuf, reducePasses, NUM_WINDOWS, STRIDE, BW, rinv);
        reduceOk = rr.ok;
        if (reduceOk) {
          const msm = hostWindowCombine(rr.hostL, CBITS);
          log('ok', `MSM result (host fold of per-window sums): x=${msm.x}  y=${msm.y}`);
        }
      }
    } else {
      log('err', 'skipping replay — decompose or transpose output is malformed');
    }
    validated = decompOk && xposeOk && replayOk && reduceOk;
  } else {
    log('info', 'validation skipped (add ?validate=1 for a full host-replay check)');
  }

  const nsPerInpt = (lastWall * 1e6) / N_TOTAL;
  log(
    sanity ? 'ok' : 'err',
    `v2 multi-window: ${NUM_WINDOWS}w x ${BW}b, ${levels} levels, warm wall=${lastWall.toFixed(2)}ms, ` +
      `ns/in-pt=${nsPerInpt.toFixed(2)}, sanity=${sanity ? 'OK' : 'FAIL'}` +
      `${VALIDATE ? `, validation=${validated ? 'PASS' : 'FAIL'}` : ''}`,
  );

  bufA.destroy();
  bufB.destroy();
  bucketResult.destroy();
  countsBufs.forEach(b => b.destroy());
  offsetsBufs.forEach(b => b.destroy());
  planMeta.destroy();
  chunkPlanRing.forEach(b => b.destroy());
  scatterPlanRing.forEach(b => b.destroy());
  carryPlanRing.forEach(b => b.destroy());
  padParams0Buf.destroy();
  padParams1Buf.destroy();
  l0IdxBuf.destroy();
  prefScratchBuf.destroy();
  scalarsBuf.destroy();
  scalarsRawBuf.destroy();
  demontParams.destroy();
  chunksBuf.destroy();
  signsBuf.destroy();
  rowPtrBuf.destroy();
  valIdxBuf.destroy();
  currBuf.destroy();
  pointXBuf.destroy();
  pointYBuf.destroy();
  decomposeParams.destroy();
  xposeParams.destroy();
  convActiveParams.destroy();
  convMetaParams.destroy();
  redBuf.destroy();
  isPresentBuf.destroy();
  reducePrefScratch.destroy();
  reduceInitParams.destroy();
  reduceFusedParams.destroy();
  scheduleBuf.destroy();
  querySet?.destroy();
  tsResolve?.destroy();
  tsStaging?.destroy();

  return {
    n: NPTS,
    windows: NUM_WINDOWS,
    buckets_total: B_TOTAL,
    lambda,
    s: S,
    wgi: WGI,
    reps: REPS,
    levels,
    gpu_wall_ms: lastWall,
    ns_per_inpt: nsPerInpt,
    validated,
    sanity_ok: sanity,
  };
}

// Verify the GPU carry-free-Booth decompose: every (window, point)
// bucket index + sign bit matches the host reference recode.
function checkDecompose(
  hostChunks: Uint32Array,
  hostSigns: Uint32Array,
  gpuChunks: Uint32Array,
  gpuSigns: Uint32Array,
): boolean {
  let fails = 0;
  const sample: string[] = [];
  for (let i = 0; i < hostChunks.length; i++) {
    if (gpuChunks[i] !== hostChunks[i] || gpuSigns[i] !== hostSigns[i]) {
      fails++;
      if (sample.length < 8) {
        sample.push(
          `idx ${i}: gpu (bucket ${gpuChunks[i]}, sign ${gpuSigns[i]}) != ` +
            `host (bucket ${hostChunks[i]}, sign ${hostSigns[i]})`,
        );
      }
    }
  }
  if (fails === 0) {
    log('ok', 'decompose: PASS — GPU Booth digits match the host recode');
    return true;
  }
  log('err', `decompose: FAIL — ${fails} digit(s) mismatch:`);
  for (const s of sample) log('err', `  ${s}`);
  return false;
}

// Verify the GPU transpose produced a correct per-window CSR of `chunks`:
// every point sits in the bucket its chunk names, and each window's
// val_idx is a permutation of [0, npts). Order-independent — it catches a
// real count / scan / scatter bug without depending on the (atomic-
// arrival) within-bucket ordering.
function checkTranspose(
  chunks: Uint32Array,
  gpuRowPtr: Uint32Array,
  gpuValIdx: Uint32Array,
  numWindows: number,
  BW: number,
  npts: number,
): boolean {
  let fails = 0;
  const sample: string[] = [];
  const note = (m: string): void => {
    fails++;
    if (sample.length < 8) sample.push(m);
  };
  for (let w = 0; w < numWindows; w++) {
    const rpBase = w * (BW + 1);
    const viBase = w * npts;
    if (gpuRowPtr[rpBase] !== 0 || gpuRowPtr[rpBase + BW] !== npts) {
      note(`window ${w}: rowPtr endpoints [${gpuRowPtr[rpBase]}, ${gpuRowPtr[rpBase + BW]}] != [0, ${npts}]`);
      continue;
    }
    const seen = new Uint8Array(npts);
    for (let b = 0; b < BW; b++) {
      const hi = gpuRowPtr[rpBase + b + 1];
      for (let p = gpuRowPtr[rpBase + b]; p < hi && p < npts; p++) {
        const pt = gpuValIdx[viBase + p];
        if (pt >= npts || seen[pt]) {
          note(`window ${w} bucket ${b} slot ${p}: out-of-range / duplicate point ${pt}`);
          continue;
        }
        seen[pt] = 1;
        if (chunks[viBase + pt] !== b) {
          note(`window ${w}: point ${pt} placed in bucket ${b}, chunk says ${chunks[viBase + pt]}`);
        }
      }
    }
    let unseen = 0;
    for (let i = 0; i < npts; i++) if (!seen[i]) unseen++;
    if (unseen > 0) note(`window ${w}: ${unseen} point(s) missing from val_idx`);
  }
  if (fails === 0) {
    log('ok', 'transpose: PASS — GPU CSR groups chunks correctly (counts, offsets, binning)');
    return true;
  }
  log('err', `transpose: FAIL — ${fails} error(s):`);
  for (const s of sample) log('err', `  ${s}`);
  return false;
}

// Replay the whole pipeline on the host in normal-form field arithmetic
// — bin-pack + affine adds + carries + finalize, in exact GPU order —
// then compare bucket_result byte-for-byte (un-Montgomery'd). Operates
// purely on the global windowed indices, so it is window-agnostic.
function hostReplayValidate(
  slotPt: Pt[],
  levelPlans: LevelPlan[],
  levelCounts: Uint32Array[],
  levelOffsets: Uint32Array[],
  gpuResult: Uint32Array,
  R: bigint,
  rinv: bigint,
): boolean {
  const B = levelCounts[0].length;
  let active: Pt[] = slotPt.slice();
  const result: (Pt | null)[] = new Array(B).fill(null);
  const finalizeLevel: number[] = new Array(B).fill(-1);

  for (let lv = 0; lv < levelPlans.length; lv++) {
    const counts = levelCounts[lv];
    const offsets = levelOffsets[lv];
    const newOffsets = levelOffsets[lv + 1];
    const next: Pt[] = new Array(slotPt.length);
    for (let i = 0; i < next.length; i++) next[i] = { x: 0n, y: 0n };

    for (let b = 0; b < B; b++) {
      const n = counts[b];
      const { pc, cf } = bucketSplit(n);
      for (let j = 0; j < pc; j++) {
        const a = active[offsets[b] + 2 * j];
        const bb = active[offsets[b] + 2 * j + 1];
        next[newOffsets[b] + j] = affineAdd(a, bb);
      }
      if (cf) next[newOffsets[b] + pc] = active[offsets[b] + n - 1];
      if (n === 1) {
        result[b] = active[offsets[b]];
        finalizeLevel[b] = lv;
      }
    }
    // Preserve the pad trio for the next level (the GPU keeps it intact).
    for (let s = slotPt.length - 3; s < slotPt.length; s++) next[s] = slotPt[s];
    active = next;
  }

  // Express the raw GPU value as host * R^k, to localise a Montgomery
  // representation mismatch.
  const rpow = (k: number): bigint => {
    let v = 1n;
    const m = k >= 0 ? R : rinv;
    for (let i = 0; i < Math.abs(k); i++) v = (v * m) % FP;
    return v;
  };
  const probe = (gpu: bigint, host: bigint): string => {
    for (let k = -6; k <= 6; k++) if (gpu === (host * rpow(k)) % FP) return `host*R^${k}`;
    return 'NO-R-POWER';
  };
  log('info', `sanity: (R * rinv) mod p = ${(R * rinv) % FP}  (expect 1)`);

  let fails = 0;
  let firstFail = -1;
  const mismatches: string[] = [];
  for (let b = 0; b < B; b++) {
    if (levelCounts[0][b] === 0) continue; // empty bucket — never harvested
    const ref = result[b];
    if (ref === null) {
      fails++;
      if (mismatches.length < 8) mismatches.push(`bucket ${b}: never finalized on host`);
      continue;
    }
    const xMont = packedU32x8ToBigint(gpuResult, 0 * PG * B * 4 + PG * b * 4);
    const yMont = packedU32x8ToBigint(gpuResult, 1 * PG * B * 4 + PG * b * 4);
    const gx = (xMont * rinv) % FP;
    const gy = (yMont * rinv) % FP;
    if (gx !== ref.x || gy !== ref.y) {
      fails++;
      if (firstFail < 0) firstFail = b;
      if (mismatches.length < 8) {
        mismatches.push(
          `bucket ${b} (finalized L${finalizeLevel[b]}, L0count=${levelCounts[0][b]}): ` +
            `xraw=${probe(xMont, ref.x)} yraw=${probe(yMont, ref.y)}`,
        );
      }
    }
  }
  if (fails === 0) {
    log('ok', 'validation: PASS — bucket_result byte-equivalent to host pipeline replay');
    return true;
  }
  log('err', `validation: FAIL — ${fails} bucket(s) mismatch; diagnostics:`);
  for (const m of mismatches) log('err', `  ${m}`);
  if (firstFail >= 0) {
    const xMont = packedU32x8ToBigint(gpuResult, 0 * PG * B * 4 + PG * firstFail * 4);
    log('err', `  raw bucket ${firstFail}: gpu.xMont = ${xMont}`);
    log('err', `  raw bucket ${firstFail}: host.x    = ${result[firstFail]!.x}`);
  }
  return false;
}

// Host replay of the recursive affine 4-phase bucket reduction. Iterates
// the SAME pass list the GPU runs, recomputing each pass's (src,dst) with
// the same fixed-stride index math and the same identity classification —
// a faithful by-construction mirror. Seeds from the (already validated)
// bucket sums, returns the per-window weighted sums and whether they match
// the GPU's red_buf slot 0.
function hostReduceReplay(
  gpuResult: Uint32Array,
  gpuRedBuf: Uint32Array,
  passes: { isDouble: boolean; shaderPhase: number; p2x: number; p2y: number; ppw: number }[],
  numWindows: number,
  stride: number,
  bw: number,
  rinv: bigint,
): { ok: boolean; hostL: Pt[] } {
  const total = numWindows * stride;
  const bTotal = numWindows * bw;
  const slot: Pt[] = new Array(total);
  const present = new Uint8Array(total);
  // Seed: red_buf slot i of window w <- bucket magnitude (i + 1).
  for (let w = 0; w < numWindows; w++) {
    for (let i = 0; i < stride; i++) {
      const b = w * bw + i + 1;
      const xM = packedU32x8ToBigint(gpuResult, PG * b * 4);
      const yM = packedU32x8ToBigint(gpuResult, PG * bTotal * 4 + PG * b * 4);
      const g = w * stride + i;
      slot[g] = { x: (xM * rinv) % FP, y: (yM * rinv) % FP };
      present[g] = xM !== 0n || yM !== 0n ? 1 : 0;
    }
  }
  // Replay each phase pass.
  for (const p of passes) {
    const tCands = numWindows * p.ppw;
    for (let cand = 0; cand < tCands; cand++) {
      const w = (cand / p.ppw) | 0;
      const j2 = cand % p.ppw;
      const base = w * stride;
      if (p.isDouble) {
        const s = base + (j2 + 1) * p.p2x;
        if (present[s]) slot[s] = affineDouble(slot[s]);
        continue;
      }
      let src: number;
      let dst: number;
      if (p.shaderPhase === 0) {
        src = base + j2 * p.p2x + p.p2y;
        dst = base + j2 * p.p2x + p.p2y - 1;
      } else {
        dst = base + 2 * j2 * p.p2y;
        src = base + (2 * j2 + 1) * p.p2y;
      }
      if (!present[src]) continue; // NOP
      if (!present[dst]) {
        slot[dst] = slot[src]; // COPY
        present[dst] = 1;
        continue;
      }
      // REAL: equal operands (a COPY-duplicated point added to itself)
      // become a double — mirrors the add kernel's dx == 0 branch.
      slot[dst] = slot[dst].x === slot[src].x ? affineDouble(slot[dst]) : affineAdd(slot[dst], slot[src]);
    }
  }
  // Compare host L_w to the GPU's red_buf slot 0 per window.
  const hostL: Pt[] = new Array(numWindows);
  let fails = 0;
  const sample: string[] = [];
  for (let w = 0; w < numWindows; w++) {
    const Lh = slot[w * stride];
    hostL[w] = Lh;
    const g = w * stride;
    const gx = (packedU32x8ToBigint(gpuRedBuf, PG * g * 4) * rinv) % FP;
    const gy = (packedU32x8ToBigint(gpuRedBuf, PG * total * 4 + PG * g * 4) * rinv) % FP;
    if (gx !== Lh.x || gy !== Lh.y) {
      fails++;
      if (sample.length < 6) sample.push(`window ${w}: gpu x=${gx} != host x=${Lh.x}`);
    }
  }
  if (fails === 0) {
    log('ok', 'reduction: PASS — GPU per-window weighted sums match the host 4-phase replay');
    return { ok: true, hostL };
  }
  log('err', `reduction: FAIL — ${fails} window(s) mismatch:`);
  for (const s of sample) log('err', `  ${s}`);
  return { ok: false, hostL };
}

// Window combine: Horner fold of the per-window weighted sums into the
// final MSM point — acc = Σ_w L_w · 2^(w·c).
function hostWindowCombine(L: Pt[], c: number): Pt {
  let acc = L[L.length - 1];
  for (let w = L.length - 2; w >= 0; w--) {
    for (let d = 0; d < c; d++) acc = affineDouble(acc);
    acc = affineAdd(acc, L[w]);
  }
  return acc;
}

function parseParams() {
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('n')) NPTS = parseInt(qp.get('n')!, 10);
  if (qp.get('c')) CBITS = parseInt(qp.get('c')!, 10);
  if (qp.get('numbits')) NUMBITS = parseInt(qp.get('numbits')!, 10);
  if (qp.get('s')) S = parseInt(qp.get('s')!, 10);
  if (qp.get('wgi')) WGI = parseInt(qp.get('wgi')!, 10);
  if (qp.get('reps')) REPS = parseInt(qp.get('reps')!, 10);
  if (qp.get('validate') === '1') VALIDATE = true;
  if (qp.get('inv') === 'loop') INV_VARIANT = 'loop';
  if (qp.get('l0log')) L0_LOG = parseInt(qp.get('l0log')!, 10);
  if (qp.get('redwg')) REDUCE_WG = parseInt(qp.get('redwg')!, 10);
  if (qp.get('batches')) BATCHES = parseInt(qp.get('batches')!, 10);
  return {
    n: NPTS, c: CBITS, numbits: NUMBITS, s: S, wgi: WGI, reps: REPS,
    validate: VALIDATE, inv: INV_VARIANT, l0log: L0_LOG, redwg: REDUCE_WG, batches: BATCHES,
  };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing');
    const params = parseParams();
    benchState.params = params;
    log('info', `params: ${JSON.stringify(params)}`);
    benchState.state = 'running';
    const device = await get_device();
    log('info', 'WebGPU device acquired');
    const misc = compute_misc_params(FP, 13);
    const sm = new ShaderManager(4, NPTS, BN254_CURVE_CONFIG, false);
    const r = await runPipeline(device, sm, misc.r, misc.rinv);
    benchState.results.push(r);
    resultsClient.postProgress({ kind: 'pipeline_done', ns_per_inpt: r.ns_per_inpt, validated: r.validated });
    benchState.state = 'done';
    log('ok', 'done');
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  }
}

main()
  .catch(e => {
    const msg = e instanceof Error ? e.message : String(e);
    log('err', `unhandled: ${msg}`);
    benchState.state = 'error';
    benchState.error = msg;
  })
  .finally(() => {
    postFinal().catch(() => {});
  });
