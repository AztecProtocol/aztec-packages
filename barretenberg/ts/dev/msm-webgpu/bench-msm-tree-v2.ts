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
// Field-inversion variant used by the fused super-kernel: 'a' =
// fr_inv_by_a (Option A, BATCH=26), 'loop' = fr_inv_by_loop
// (register-minimal, BATCH=12). Toggle with ?inv=loop.
let INV_VARIANT: 'a' | 'loop' = 'a';

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
// the buckets into a per-window CSR; csr_to_v2 materialises level-0
// active_sums (negating sign-flagged points) + counts/offsets. active_sums
// is numWindows windows of wstride (= n) slots; a [pad_l, pad_r, discard]
// trio sits at the end.
//
// Scalars enter in Montgomery form (s * R mod p) — the representation the
// prover hands over — and a GPU de-Montgomery pass reduces them to raw
// integers before the bit-slicing recode. Points enter in Montgomery form
// and stay so; pointYNeg is their precomputed field negation, selected
// per slot by the sign bit.
//
// Returns the synthetic scalars + the Montgomery point pool (pointX,
// pointY, pointYNeg for the GPU; poolPt + padPts for the replay model);
// the pad-only SoA buffer; the host carry-free-Booth reference (chunks,
// signs) the GPU decompose must reproduce; and the host counts/offsets
// the planner uses. The slot->point model is built post-run from the
// GPU's actual val_idx.
function buildL0(numWindows: number, BW: number, npw: number, c: number, R: bigint, rng: () => number) {
  const wstride = npw;
  const inputSize = npw; // points (and scalars) per window/subtask
  const M = numWindows * wstride + 3;
  const totalSlots = numWindows * inputSize;

  // Montgomery point pool + its precomputed field negation -y.
  const poolPt: Pt[] = new Array(inputSize);
  for (let i = 0; i < inputSize; i++) poolPt[i] = { x: randomBelow(FP, rng), y: randomBelow(FP, rng) };
  const pointX = new Uint32Array(inputSize * 8);
  const pointY = new Uint32Array(inputSize * 8);
  const pointYNeg = new Uint32Array(inputSize * 8);
  for (let i = 0; i < inputSize; i++) {
    const ym = (poolPt[i].y * R) % FP;
    pointX.set(bigintToPackedU32x8((poolPt[i].x * R) % FP), i * 8);
    pointY.set(bigintToPackedU32x8(ym), i * 8);
    pointYNeg.set(bigintToPackedU32x8((FP - ym) % FP), i * 8);
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

  // padBuf: a full-M SoA buffer with only the 3 pad slots set (Montgomery).
  // Written once to bufA/bufB; the converter / level loop fill the real
  // region, the pad trio survives.
  const padBuf = new Uint32Array(2 * PG * M * 4);
  for (let j = 0; j < 3; j++) {
    const slot = totalSlots + j;
    const xw = bigintToPackedU32x8((padPts[j].x * R) % FP);
    const yw = bigintToPackedU32x8((padPts[j].y * R) % FP);
    for (let q = 0; q < PG; q++) {
      const xb = (PG * slot + q) * 4;
      const yb = (PG * M + PG * slot + q) * 4;
      for (let k = 0; k < 4; k++) {
        padBuf[xb + k] = xw[4 * q + k];
        padBuf[yb + k] = yw[4 * q + k];
      }
    }
  }

  return {
    scalars, pointX, pointY, pointYNeg, padBuf, poolPt, padPts,
    chunks, signs, initCounts, initOffsets, M, maxCount,
  };
}

function makeSoABuf(device: GPUDevice, M: number): GPUBuffer {
  return device.createBuffer({
    size: 2 * PG * M * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
}

interface LevelPlan {
  cpw: number; // chunks per window (per-window output stride)
  carpw: number; // carries per window
  tChunks: number; // numWindows * cpw
  tCarries: number; // numWindows * carpw
}

// Plan one level: per-window pair/carry counts → next-level counts and
// global windowed offsets, plus the per-window chunk/carry strides. The
// GPU planner re-derives the plan on-device; the host needs only these
// sizes (for dispatch / buffers) and counts/offsets (for the replay).
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
  const plan: LevelPlan = { cpw, carpw, tChunks: numWindows * cpw, tCarries: numWindows * carpw };
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
  return device.createBuffer({
    size: Math.max(bytes, 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
}

function uniformBuf(device: GPUDevice, data: Uint32Array<ArrayBuffer>): GPUBuffer {
  const b = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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

  const rng = makeRng(0x9111);
  const {
    scalars, pointX, pointY, pointYNeg, padBuf, poolPt, padPts,
    chunks, signs, initCounts, initOffsets, M, maxCount,
  } = buildL0(NUM_WINDOWS, BW, NPTS, CBITS, R, rng);
  const padL = M - 3;
  const padR = M - 2;
  const discard = M - 1;
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

  // --- GPU buffers (created once, reused across reps) ---
  const bufA = makeSoABuf(device, M);
  const bufB = makeSoABuf(device, M);
  // Pad trio: written once into both ping-pong buffers. The converter and
  // the level loop only ever touch the real region, so the trio survives.
  device.queue.writeBuffer(bufA, 0, padBuf);
  device.queue.writeBuffer(bufB, 0, padBuf);
  const bucketResult = makeSoABuf(device, B_TOTAL);

  const countsBufs = [storageBuf(device, B_TOTAL * 4), storageBuf(device, B_TOTAL * 4)];
  const offsetsBufs = [storageBuf(device, B_TOTAL * 4), storageBuf(device, B_TOTAL * 4)];
  const planMeta = storageBuf(device, (3 * NUM_WINDOWS + 6) * 4);

  // Per-level plan buffers, host-pre-padded uniformly. The GPU planner
  // overwrites window w's real slots; per-window tails keep the padding.
  const chunkPlanBufs: GPUBuffer[] = [];
  const scatterPlanBufs: GPUBuffer[] = [];
  const carryPlanBufs: GPUBuffer[] = [];
  for (let lv = 0; lv < levels; lv++) {
    const { tChunks, tCarries } = levelPlans[lv];
    const chunkPad = new Uint32Array(2 * tChunks * S);
    const scatterPad = new Uint32Array(tChunks * S);
    const carryPad = new Uint32Array(2 * tCarries);
    for (let i = 0; i < tChunks * S; i++) {
      chunkPad[2 * i] = padL;
      chunkPad[2 * i + 1] = padR;
      scatterPad[i] = discard;
    }
    for (let i = 0; i < tCarries; i++) {
      carryPad[2 * i] = padL;
      carryPad[2 * i + 1] = discard;
    }
    const cpb = storageBuf(device, chunkPad.byteLength);
    const spb = storageBuf(device, scatterPad.byteLength);
    const cyb = storageBuf(device, carryPad.byteLength);
    device.queue.writeBuffer(cpb, 0, chunkPad);
    device.queue.writeBuffer(spb, 0, scatterPad);
    device.queue.writeBuffer(cyb, 0, carryPad);
    chunkPlanBufs.push(cpb);
    scatterPlanBufs.push(spb);
    carryPlanBufs.push(cyb);
  }

  // pref_scratch: the fused kernel's forward prefix products, moved out of
  // per-thread private memory into a storage buffer so occupancy no longer
  // scales with S. Sized for the largest level; smaller levels use a prefix.
  const maxTChunks = Math.max(...levelPlans.map(p => p.tChunks));
  const prefScratchBuf = storageBuf(device, maxTChunks * S * 8 * 4);

  // --- Layouts ---
  const plannerLayout = device.createBindGroupLayout({
    entries: [0, 1, 2, 3, 4, 5, 6, 7]
      .map(binding => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: (binding <= 1 ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
      }))
      .concat([{ binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as GPUBufferBindingType } }]),
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

  const pairCap = Math.max(64, Math.ceil(maxCount / 2) + 16);
  const plannerPipe = await compileOne(
    device,
    sm.gen_ba_planner_v2_bench_shader(PLANNER_TPB, CBITS, NUMBITS, S, pairCap, BW),
    `planner-v2-c${CBITS}-w${NUM_WINDOWS}`,
    plannerLayout,
  );
  const fusedPipe = await compileOne(device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT), `fused-W${WGI}-S${S}-${INV_VARIANT}`, fusedLayout);
  const carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry-W${WGI}`, carryLayout);
  const finalizePipe = await compileOne(device, sm.gen_ba_finalize_copy_bench_shader(WGI), `finalize-W${WGI}`, finalizeLayout);
  log('info', '4 pipelines compiled');

  // --- Pippenger pre-steps: decompose -> transpose -> csr_to_v2.
  // The carry-free Booth decompose recodes scalars into per-(window,point)
  // bucket magnitudes (chunks) + signs; the transpose counting-sorts the
  // buckets into a per-window CSR; csr_to_v2 materialises level-0
  // active_sums (negating sign-flagged points) + counts/offsets. ---
  const scalarsBuf = storageBuf(device, scalars.byteLength);
  const scalarsRawBuf = storageBuf(device, scalars.byteLength);
  const pointXBuf = storageBuf(device, pointX.byteLength);
  const pointYBuf = storageBuf(device, pointY.byteLength);
  const pointYNegBuf = storageBuf(device, pointYNeg.byteLength);
  device.queue.writeBuffer(scalarsBuf, 0, scalars);
  device.queue.writeBuffer(pointXBuf, 0, pointX);
  device.queue.writeBuffer(pointYBuf, 0, pointY);
  device.queue.writeBuffer(pointYNegBuf, 0, pointYNeg);
  // Decompose outputs (chunks -> transpose, signs -> csr_to_v2), transpose
  // outputs, and curr = scatter cursors. rowPtr / curr are atomic-
  // accumulated, so both are zeroed before the count / scatter each rep.
  const chunksBuf = storageBuf(device, N_TOTAL * 4);
  const signsBuf = storageBuf(device, N_TOTAL * 4);
  const rowPtrBuf = storageBuf(device, NUM_WINDOWS * (BW + 1) * 4);
  const valIdxBuf = storageBuf(device, N_TOTAL * 4);
  const currBuf = storageBuf(device, NUM_WINDOWS * BW * 4);
  const demontParams = uniformBuf(device, new Uint32Array([NPTS, 0, 0, 0]));
  const decomposeParams = uniformBuf(device, new Uint32Array([NPTS, NUM_WINDOWS, CBITS, 8]));
  const xposeParams = uniformBuf(device, new Uint32Array([Math.ceil(NPTS / BW), BW, NPTS, 0]));
  const convActiveParams = uniformBuf(device, new Uint32Array([N_TOTAL, M, WSTRIDE, NPTS]));
  const convMetaParams = uniformBuf(device, new Uint32Array([BW, B_TOTAL, NPTS, 0]));

  const bgl = (types: GPUBufferBindingType[]): GPUBindGroupLayout =>
    device.createBindGroupLayout({
      entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
  const mkBind = (layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup =>
    device.createBindGroup({ layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });

  const demontLayout = bgl(['read-only-storage', 'storage', 'uniform']);
  const decomposeLayout = bgl(['read-only-storage', 'storage', 'storage', 'uniform']);
  const xposeCountLayout = bgl(['read-only-storage', 'storage', 'uniform']);
  const xposeScanLayout = bgl(['storage', 'uniform']);
  const xposeScatterLayout = bgl(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
  const convActiveLayout = bgl([
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform',
    'read-only-storage', 'read-only-storage',
  ]);
  const convMetaLayout = bgl(['read-only-storage', 'storage', 'storage', 'uniform']);

  const demontPipe = await compileOne(device, sm.gen_demont_scalars_shader(WGI), `demont-W${WGI}`, demontLayout);
  const decomposePipe = await compileOne(device, sm.gen_decompose_scalars_booth_shader(WGI), `decompose-W${WGI}`, decomposeLayout);
  const xposeCountPipe = await compileOne(device, sm.gen_transpose_count_shader(WGI), `xpose-count-W${WGI}`, xposeCountLayout);
  const xposeScanPipe = await compileOne(device, sm.gen_transpose_scan_shader(NUM_WINDOWS), 'xpose-scan', xposeScanLayout);
  const xposeScatterPipe = await compileOne(device, sm.gen_transpose_scatter_shader(WGI), `xpose-scatter-W${WGI}`, xposeScatterLayout);
  const convActivePipe = await compileOne(device, sm.gen_csr_to_v2_active_sums_shader(WGI, true), `csr2v2-active-W${WGI}`, convActiveLayout);
  const convMetaPipe = await compileOne(device, sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta-W${WGI}`, convMetaLayout);

  const demontBind = mkBind(demontLayout, [scalarsBuf, scalarsRawBuf, demontParams]);
  const decomposeBind = mkBind(decomposeLayout, [scalarsRawBuf, chunksBuf, signsBuf, decomposeParams]);
  const xposeCountBind = mkBind(xposeCountLayout, [chunksBuf, rowPtrBuf, xposeParams]);
  const xposeScanBind = mkBind(xposeScanLayout, [rowPtrBuf, xposeParams]);
  const xposeScatterBind = mkBind(xposeScatterLayout, [chunksBuf, rowPtrBuf, valIdxBuf, currBuf, xposeParams]);
  const convActiveBind = mkBind(convActiveLayout, [valIdxBuf, pointXBuf, pointYBuf, bufA, convActiveParams, pointYNegBuf, signsBuf]);
  const convMetaBind = mkBind(convMetaLayout, [rowPtrBuf, countsBufs[0], offsetsBufs[0], convMetaParams]);

  const nXposePts = Math.ceil(NPTS / WGI);
  const nConvActive = Math.ceil(N_TOTAL / WGI);
  const nConvMeta = Math.ceil(B_TOTAL / WGI);
  log('info', '7 pre-step pipelines compiled (demont + decompose + transpose x3 + csr_to_v2 x2)');

  // --- Per-level bind groups + uniforms (built once, reused each rep) ---
  const finalizeParams = uniformBuf(device, new Uint32Array([B_TOTAL, M, 0, 0]));
  const numWgsFinalize = Math.ceil(B_TOTAL / WGI);
  interface LevelBind {
    plannerBind: GPUBindGroup;
    fusedBind: GPUBindGroup;
    carryBind: GPUBindGroup;
    finalizeBind: GPUBindGroup;
    nFused: number;
    nCarry: number;
  }
  const levelBinds: LevelBind[] = [];
  for (let lv = 0; lv < levels; lv++) {
    const plan = levelPlans[lv];
    const inIdx = lv & 1;
    const outIdx = inIdx ^ 1;
    const activeIn = inIdx === 0 ? bufA : bufB;
    const activeOut = inIdx === 0 ? bufB : bufA;
    const plannerParams = uniformBuf(device, new Uint32Array([plan.cpw, plan.carpw, WGI, WSTRIDE]));
    const fusedParams = uniformBuf(device, new Uint32Array([plan.tChunks, M, M, 0]));
    const carryParams = uniformBuf(device, new Uint32Array([plan.tCarries, M, M, 0]));
    levelBinds.push({
      plannerBind: device.createBindGroup({
        layout: plannerLayout,
        entries: [
          { binding: 0, resource: { buffer: countsBufs[inIdx] } },
          { binding: 1, resource: { buffer: offsetsBufs[inIdx] } },
          { binding: 2, resource: { buffer: chunkPlanBufs[lv] } },
          { binding: 3, resource: { buffer: scatterPlanBufs[lv] } },
          { binding: 4, resource: { buffer: carryPlanBufs[lv] } },
          { binding: 5, resource: { buffer: countsBufs[outIdx] } },
          { binding: 6, resource: { buffer: offsetsBufs[outIdx] } },
          { binding: 7, resource: { buffer: planMeta } },
          { binding: 8, resource: { buffer: plannerParams } },
        ],
      }),
      fusedBind: device.createBindGroup({
        layout: fusedLayout,
        entries: [
          { binding: 0, resource: { buffer: chunkPlanBufs[lv] } },
          { binding: 1, resource: { buffer: scatterPlanBufs[lv] } },
          { binding: 2, resource: { buffer: activeIn } },
          { binding: 3, resource: { buffer: activeOut } },
          { binding: 4, resource: { buffer: fusedParams } },
          { binding: 5, resource: { buffer: prefScratchBuf } },
        ],
      }),
      carryBind: device.createBindGroup({
        layout: carryLayout,
        entries: [
          { binding: 0, resource: { buffer: carryPlanBufs[lv] } },
          { binding: 1, resource: { buffer: activeIn } },
          { binding: 2, resource: { buffer: activeOut } },
          { binding: 3, resource: { buffer: carryParams } },
        ],
      }),
      finalizeBind: device.createBindGroup({
        layout: finalizeLayout,
        entries: [
          { binding: 0, resource: { buffer: countsBufs[inIdx] } },
          { binding: 1, resource: { buffer: offsetsBufs[inIdx] } },
          { binding: 2, resource: { buffer: activeIn } },
          { binding: 3, resource: { buffer: bucketResult } },
          { binding: 4, resource: { buffer: finalizeParams } },
        ],
      }),
      nFused: Math.ceil(plan.tChunks / WGI),
      nCarry: Math.ceil(plan.tCarries / WGI),
    });
  }

  // --- Timestamp query set (reused across reps) ---
  const KINDS = ['planner', 'fused', 'carry', 'finalize'];
  // Per rep, a prologue of Pippenger pre-steps (de-Montgomery, decompose,
  // then 3 transpose: count / scan / scatter, then 2 csr_to_v2) followed
  // by KINDS passes per level.
  const PRE_DEMONT = 1;
  const PRE_DECOMP = 1;
  const PRE_XPOSE = 3;
  const PRE = PRE_DEMONT + PRE_DECOMP + PRE_XPOSE + 2;
  const passCount = PRE + levels * KINDS.length;
  const tsEnabled = device.features.has('timestamp-query');
  if (!tsEnabled) log('warn', 'timestamp-query unavailable — per-component timing skipped');
  const querySet = tsEnabled ? device.createQuerySet({ type: 'timestamp', count: passCount * 2 }) : null;
  const tsResolve = tsEnabled
    ? device.createBuffer({ size: passCount * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
    : null;
  const tsStaging = tsEnabled
    ? device.createBuffer({ size: passCount * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    : null;

  // One pipeline run: re-initialise the mutable buffers, encode all
  // passes, time the single submit, read the per-pass timestamps.
  const runOnce = async (rep: number): Promise<number> => {
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
    // Pippenger pre-steps, each timed as its own kind.
    // De-Montgomery: reduce the Montgomery-form input scalars to raw
    // integers (montmul by 1) so the Booth recode can bit-slice them.
    dispatch(demontPipe, demontBind, nXposePts);
    // Decompose: carry-free Booth recode of the scalars -> per-(window,
    // point) bucket magnitudes (chunks) + sign bits.
    dispatch(decomposePipe, decomposeBind, nXposePts, NUM_WINDOWS);
    // Transpose (count / scan / scatter): counting-sort the buckets into a
    // per-window CSR. count accumulates into rowPtr and scatter into curr,
    // so both are zeroed first.
    enc.clearBuffer(rowPtrBuf);
    enc.clearBuffer(currBuf);
    dispatch(xposeCountPipe, xposeCountBind, nXposePts, NUM_WINDOWS);
    dispatch(xposeScanPipe, xposeScanBind, NUM_WINDOWS);
    dispatch(xposeScatterPipe, xposeScatterBind, nXposePts, NUM_WINDOWS);
    // csr_to_v2: CSR -> level-0 active_sums (sign-negated) + counts /
    // offsets. The bufA / bufB pad trios were written once and survive.
    dispatch(convActivePipe, convActiveBind, nConvActive);
    dispatch(convMetaPipe, convMetaBind, nConvMeta);
    for (let lv = 0; lv < levels; lv++) {
      const lb = levelBinds[lv];
      dispatch(plannerPipe, lb.plannerBind, NUM_WINDOWS);
      dispatch(fusedPipe, lb.fusedBind, lb.nFused);
      dispatch(carryPipe, lb.carryBind, lb.nCarry);
      dispatch(finalizePipe, lb.finalizeBind, numWgsFinalize);
    }
    if (querySet && tsResolve && tsStaging) {
      enc.resolveQuerySet(querySet, 0, passCount * 2, tsResolve, 0);
      enc.copyBufferToBuffer(tsResolve, 0, tsStaging, 0, passCount * 16);
    }

    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    const wall = performance.now() - t0;

    const tag = rep === 0 ? 'cold' : 'warm';
    if (querySet && tsStaging) {
      await tsStaging.mapAsync(GPUMapMode.READ);
      const ts = new BigUint64Array(tsStaging.getMappedRange().slice(0));
      tsStaging.unmap();
      const byKind = [0, 0, 0, 0];
      let demont = 0;
      let decompose = 0;
      let transpose = 0;
      let convert = 0;
      const fusedPerLevel: number[] = [];
      for (let i = 0; i < passCount; i++) {
        const dur = Number(ts[2 * i + 1] - ts[2 * i]);
        if (i < PRE_DEMONT) {
          demont += dur;
          continue;
        }
        if (i < PRE_DEMONT + PRE_DECOMP) {
          decompose += dur;
          continue;
        }
        if (i < PRE_DEMONT + PRE_DECOMP + PRE_XPOSE) {
          transpose += dur; // count / scan / scatter
          continue;
        }
        if (i < PRE) {
          convert += dur; // csr_to_v2 active_sums + meta
          continue;
        }
        const k = (i - PRE) % KINDS.length;
        byKind[k] += dur;
        if (k === 1) fusedPerLevel[((i - PRE) / KINDS.length) | 0] = dur;
      }
      const sumPasses = demont + decompose + transpose + convert + byKind.reduce((a, b) => a + b, 0);
      const gpuSpan = Number(ts[passCount * 2 - 1] - ts[0]);
      const ms = (x: number): string => (x / 1e6).toFixed(2);
      log(
        'info',
        `rep ${rep} (${tag}): wall=${wall.toFixed(2)}ms | demont ${ms(demont)}  decompose ${ms(decompose)}  ` +
          `transpose ${ms(transpose)}  convert ${ms(convert)}  planner ${ms(byKind[0])}  fused ${ms(byKind[1])}  ` +
          `carry ${ms(byKind[2])}  finalize ${ms(byKind[3])}  inter-pass ${ms(gpuSpan - sumPasses)}  ` +
          `submit ${ms(wall * 1e6 - gpuSpan)}  (ms)`,
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

  let lastWall = 0;
  for (let rep = 0; rep < Math.max(1, REPS); rep++) lastWall = await runOnce(rep);

  // --- Read back + checks (bucketResult holds the last rep's output) ---
  const gpuResult = await readbackU32(device, bucketResult, 2 * PG * B_TOTAL * 4 * 4);
  let sanity = false;
  for (let i = 0; i < gpuResult.length && !sanity; i++) if (gpuResult[i] !== 0) sanity = true;

  let validated = false;
  if (VALIDATE) {
    log('info', 'validating (decompose + transpose checks + host pipeline replay)...');
    // checkDecompose: GPU Booth digits (chunks + signs) match the host
    // carry-free-Booth recode. checkTranspose: the GPU CSR groups those
    // chunks correctly. The replay then models slot->point from the GPU's
    // actual val_idx (its within-bucket order is atomic-arrival, not host-
    // predictable), negating sign-flagged points — so host and GPU pair-
    // trees share an association and a sign.
    const gpuChunks = await readbackU32(device, chunksBuf, N_TOTAL * 4);
    const gpuSigns = await readbackU32(device, signsBuf, N_TOTAL * 4);
    const decompOk = checkDecompose(chunks, signs, gpuChunks, gpuSigns);
    const gpuRowPtr = await readbackU32(device, rowPtrBuf, NUM_WINDOWS * (BW + 1) * 4);
    const gpuValIdx = await readbackU32(device, valIdxBuf, N_TOTAL * 4);
    const xposeOk = checkTranspose(chunks, gpuRowPtr, gpuValIdx, NUM_WINDOWS, BW, NPTS);
    let replayOk = false;
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
    } else {
      log('err', 'skipping replay — decompose or transpose output is malformed');
    }
    validated = decompOk && xposeOk && replayOk;
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
  chunkPlanBufs.forEach(b => b.destroy());
  scatterPlanBufs.forEach(b => b.destroy());
  carryPlanBufs.forEach(b => b.destroy());
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
  pointYNegBuf.destroy();
  decomposeParams.destroy();
  xposeParams.destroy();
  convActiveParams.destroy();
  convMetaParams.destroy();
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
  return { n: NPTS, c: CBITS, numbits: NUMBITS, s: S, wgi: WGI, reps: REPS, validate: VALIDATE, inv: INV_VARIANT };
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
