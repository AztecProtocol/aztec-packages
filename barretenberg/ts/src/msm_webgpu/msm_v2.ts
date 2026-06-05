/// <reference types="@webgpu/types" />
// msm_v2.ts — the memory-bounded v2 pair-tree GPU MSM.
//
// Pipeline: carry-free Booth -> privatized transpose -> csr_to_v2 -> pair-tree
// bucket-accumulate -> branchless 4-phase reduction, with all five memory levers
// (window batching, index-mode level-0, tiled fused dispatch, plan-buffer ring,
// dropped -y plane).
//
// Two pieces, so the SRS point pool is uploaded and converted to Montgomery form
// exactly once and shared by every MSM of the proving session:
//   - MsmV2Pool.create(device, srsCanonicalBytes) — upload the canonical SRS and
//     GPU-convert it to the Montgomery-form 8xu32 point pool. Once per session.
//   - MsmV2.create(device, n, pool, config?) — data-independent: compile the
//     pipelines + bind groups for an n-point MSM, binding a prefix of `pool`.
//   - prepare(scalarsBuf) — UNTIMED: Booth-decode the scalars, plan every level,
//     (re)allocate the data-dependent buffers + bind groups. Cached by identity.
//   - run() -> {x, y} — TIMED: encode + submit the batched pipeline, decode
//     red_buf, host-combine the windows.
//
// Production contract: SRS-backed MSM only. The affine-add pair-tree assumes the
// point pool is free of the point at infinity and of colliding pairs (no P == ±Q
// within a bucket) — both hold for an SRS basis. The C++ webgpu_msm hook enforces
// this by delegating only when handle_edge_cases is false.

import { ShaderManager, type MontMulVariant } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { compute_misc_params } from './cuzk/utils.js';
import { BN254_BASE_FIELD, addBn254Points, type Bn254Point, modInverse } from './cuzk/bn254.js';
import {
  MAX_STREAM_WORKGROUPS,
  STREAM_PLANNER_TPB,
  STREAM_NUM_THREADS,
  STREAM_WALKER_TPB,
  STREAM_S as STREAM_S_PLAN,
} from './cuzk/ba_stream_plan.js';

const PG = 2;
const PLANNER_TPB = 256; // ba_planner_v2 workgroup size (one workgroup per window)
const FP = BN254_BASE_FIELD;
const NUMBITS = 254; // scalar field bit length
const MEM_BUDGET = 248 * (1 << 20); // lever-G batch-count target

// Defaults for the size-independent knobs (see MsmConfig). `c`, `s` and
// `reduceWg` are instead chosen per problem size — by pickC / pickS /
// pickReduceWg below. All values are the bench-msm-v2 sweep optimum.
const DEFAULT_WGI = 128; // generic kernel workgroup size
const DEFAULT_L0_LOG = 1; // reduction leaf-partition log2
const DEFAULT_INV_VARIANT: 'loop' | 'pk' = 'pk';

/**
 * Tuning knobs for {@link MsmV2}. Every field is optional and defaults to the
 * value that reproduces current behaviour, so `{}` (or omitting it) is a no-op
 * — which keeps A/B comparisons honest.
 */
export interface MsmConfig {
  /** Pippenger window bits. Default: `pickC(n)`. */
  c?: number;
  /** Fused-kernel chunk size (pairs batched per thread). Default: `pickS(n)`. */
  s?: number;
  /** Generic kernel workgroup size. Default 128. */
  wgi?: number;
  /** Bucket-reduction workgroup size. Default: `pickReduceWg(c)`. */
  reduceWg?: number;
  /** Reduction leaf-partition log2. Default 1. */
  l0Log?: number;
  /** GPU field-inversion variant. Default 'pk' (2×13-packed safegcd). */
  invVariant?: 'loop' | 'pk';
  /** Base-field Montgomery-multiply body. Default 'karat'; 'cios_unrolled' is the
   *  device-validated register-resident CIOS variant (−26% on Mali-G715, BN254 only). */
  montmul?: MontMulVariant;
  /** Field-arithmetic limb width. Default 13 (20×13-bit). 15 switches the WHOLE
   *  pipeline to 17×15-bit (R=2^255, all R-parameters re-derived, native CIOS-15
   *  multiply; Karatsuba is not compiled). Must match the pool's wordSize. */
  wordSize?: number;
  /** Record per-pass GPU timestamps in `run()` (needs the `timestamp-query` feature). */
  profile?: boolean;
  /** Phase-2 hook — Jacobian-crossover threshold. Accepted but inert in Phase 1. */
  jacobianCrossover?: number;
  /**
   * Discarded warm-up `run()`s in `create()` — they ramp the GPU clock and pay
   * the shader-JIT / command-buffer cold start before the first timed run.
   * Default 5 (benchmark harness); the production bridge passes 0 so the first
   * real MSM is the work, not a throwaway.
   */
  warmupRuns?: number;
  /**
   * Run the Horner window-combine + final modular inverse on the host. Default
   * `true` — the benchmark harness wants the affine `{x, y}`. The production
   * bridge passes `false`: it ships the per-window sums across the bridge and
   * the C++ hook does the combine in native `bb::g1`.
   */
  combineOnHost?: boolean;
}

/** Per-pass GPU time (ms) for one `run()`, returned when `profile` is set. */
export interface ProfileBreakdown {
  decompose: number;
  transpose: number;
  convert: number;
  planner: number;
  fused: number;
  carry: number;
  finalize: number;
  redInit: number;
  redLevel: number;
  wall: number;
}

// --- pure helpers ---

interface Pt {
  x: bigint;
  y: bigint;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
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

// Decode a 32-byte little-endian field element from `buf` at element index i.
function leBytesToBigint(buf: Uint8Array, byteOff: number): bigint {
  let v = 0n;
  for (let k = 31; k >= 0; k--) v = (v << 8n) | BigInt(buf[byteOff + k]);
  return v;
}

const fsub = (a: bigint, b: bigint): bigint => (a - b + FP) % FP;
const fmul = (a: bigint, b: bigint): bigint => (a * b) % FP;

// Per-bucket pair / carry / new-count — matches ba_planner_v2's
// finalize-and-drop (a count-1 bucket finalizes: no carry, nc = 0).
function bucketSplit(n: number): { pc: number; cf: number; nc: number } {
  const pc = n >>> 1;
  const cf = n === 1 ? 0 : n & 1;
  return { pc, cf, nc: pc + cf };
}

// Carry-free signed-Booth recode of window w (c bits) of `scalar` — the host
// mirror of decompose_scalars_booth.template.wgsl.
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

/**
 * Build the level-0 per-bucket histogram by reading each scalar's c-bit
 * windows directly out of the LE byte buffer — no `bigint` shifts, no
 * intermediate `bigint[]` array.
 *
 * For c ≤ 24 (every value pickC returns is ≤ 15) the c+1 bits of a window
 * plus its lookback fit inside a single u32 read (we load 4 bytes starting
 * at the byte containing the window's low bit and mask). Booth uses the
 * lookback bit (top bit of the window below), so we need c+1 bits; with
 * `c+1 ≤ 25 + bitShift ≤ 32`, one u32 load per window is enough.
 *
 * Replaces the host hot path that was doing `n × numWindows` BigInt shifts
 * (~80–200 ms for n=88_899 — the dominant `prepare()` cost on the M4 Pro
 * end-to-end bench before this change).
 */
function buildInitCounts(scalarsBuf: Uint8Array, n: number, c: number, numWindows: number, BW: number): Uint32Array {
  const initCounts = new Uint32Array(numWindows * BW);
  const cMask = (1 << c) - 1;
  for (let i = 0; i < n; i++) {
    const off = i * 32;
    let lookback = 0;
    for (let w = 0; w < numWindows; w++) {
      const lo = w * c;
      const inOff = lo >>> 3;
      const byteOff = off + inOff;
      const bitShift = lo & 7;
      // Load up to 4 bytes covering bits [lo, lo+c). Bytes past index 31 of
      // *this* scalar must read as 0 — otherwise the high windows (e.g. w=19 /
      // c=13 → bits 247..259) pull in the next scalar's low bytes and produce
      // garbage buckets. The mirror WGSL `read_bits` does the same bound check.
      const b0 = scalarsBuf[byteOff];
      const b1 = inOff + 1 < 32 ? scalarsBuf[byteOff + 1] : 0;
      const b2 = inOff + 2 < 32 ? scalarsBuf[byteOff + 2] : 0;
      const b3 = inOff + 3 < 32 ? scalarsBuf[byteOff + 3] : 0;
      const v = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
      const winBits = (v >>> bitShift) & cMask;
      const raw = (winBits << 1) | lookback;
      const neg = (raw >>> c) & 1;
      const negMask = neg ? 0xffffffff : 0;
      const encode = (raw + 1) >>> 1;
      const bucket = (((encode - neg) >>> 0) ^ negMask) & cMask;
      initCounts[w * BW + bucket]++;
      // Lookback for window w+1 is the top bit of window w — i.e. bit (lo+c-1).
      // Same u32 load already covers it; just mask + shift.
      lookback = (v >>> (bitShift + c - 1)) & 1;
    }
  }
  return initCounts;
}

interface LevelPlan {
  // pair_blocks_per_window: the per-window count of "pair_blocks" the fused
  // affine-add kernel runs. One pair_block = S pairs sharing one batched
  // inversion. Taken as the max across all windows so every window's
  // dispatch slot is sized for the heaviest one (the unused tail pads to
  // the self-pad trio so empty slots are no-ops).
  pairBlocksPerWindow: number;
  // carries_per_window: the per-window count of carry slots (odd-count
  // buckets that produce a single leftover point, copied to the next level).
  carriesPerWindow: number;
  // totalPairBlocks = batchWindows × pairBlocksPerWindow — the actual
  // dispatch X-dimension for the fused kernel + tileParams[0] write target.
  totalPairBlocks: number;
  // totalCarries = batchWindows × carriesPerWindow — drives the carry-copy
  // dispatch + carryParams[0] write target.
  totalCarries: number;
}

// Plan one level: per-window pair/carry counts -> next-level counts + the
// per-window pair-block / carry strides (max over all windows).
function planLevel(counts: Uint32Array, s: number, numWindows: number, BW: number) {
  const newCounts = new Uint32Array(numWindows * BW);
  let pairBlocksPerWindow = 1;
  let carriesPerWindow = 1;
  for (let w = 0; w < numWindows; w++) {
    let pairs = 0;
    let carries = 0;
    for (let bl = 0; bl < BW; bl++) {
      const g = w * BW + bl;
      const { pc, cf, nc } = bucketSplit(counts[g]);
      pairs += pc;
      carries += cf;
      newCounts[g] = nc;
    }
    pairBlocksPerWindow = Math.max(pairBlocksPerWindow, Math.ceil(pairs / s));
    carriesPerWindow = Math.max(carriesPerWindow, carries);
  }
  const plan: LevelPlan = { pairBlocksPerWindow, carriesPerWindow, totalPairBlocks: 0, totalCarries: 0 };
  return { plan, newCounts };
}

// Build the pad-trio SoA buffer for an active_sums buffer of element stride Mb:
// the 3 pad slots sit at Mb-3..Mb-1 in Montgomery form.
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

// Window combine: Horner fold of the per-window weighted sums into the final
// MSM point — acc = Σ_w L_w · 2^(w·c). The fold runs in Jacobian coordinates
// (a = 0) so every step is inversion-free; one inverse converts back to affine.
//
// EMPTY-WINDOW HANDLING. A window with no contributing buckets emits L[w] =
// (0, 0) which is our sentinel for "infinity / empty" — (0, 0) is NOT on the
// BN254 curve. Two failure modes the fix addresses:
//   (a) seed window empty: feeding (0, 0) into Jacobian (Z=1) treats it as a
//       valid affine point and the first doubling collapses Z to 0 (infinity);
//       subsequent mixed-adds amplify zeros and the whole MSM returns (0, 0).
//       Profile E (all scalars in [0,16)) is the canonical trigger — only the
//       lowest window has buckets.
//   (b) mid windows empty: the mixed-add formula assumes both operands are
//       valid; skipping it when L[w] is empty leaves acc as the doubled prior
//       window, which is correct.
function hostWindowCombine(L: Pt[], c: number): Pt {
  const fadd = (a: bigint, b: bigint): bigint => (a + b) % FP;
  // Find the highest non-empty window to seed Jacobian acc; any windows
  // above it are pure infinity (skip their doublings — doubling ∞ = ∞).
  let top = L.length - 1;
  while (top >= 0 && L[top].x === 0n && L[top].y === 0n) top--;
  if (top < 0) return { x: 0n, y: 0n };
  let X = L[top].x;
  let Y = L[top].y;
  let Z = 1n;
  for (let w = top - 1; w >= 0; w--) {
    for (let d = 0; d < c; d++) {
      // Jacobian doubling, a = 0 (EFD dbl-2009-l).
      const A = fmul(X, X);
      const B = fmul(Y, Y);
      const Bsq = fmul(B, B);
      const xB = fadd(X, B);
      const s = fsub(fmul(xB, xB), fadd(A, Bsq));
      const D = fadd(s, s);
      const E = fadd(fadd(A, A), A);
      const X3 = fsub(fmul(E, E), fadd(D, D));
      const Bsq4 = fadd(fadd(Bsq, Bsq), fadd(Bsq, Bsq));
      const yz = fmul(Y, Z);
      Y = fsub(fmul(E, fsub(D, X3)), fadd(Bsq4, Bsq4));
      Z = fadd(yz, yz);
      X = X3;
    }
    // Empty window — skip the mixed add. acc stays at the doubled prior state.
    if (L[w].x === 0n && L[w].y === 0n) continue;
    // Jacobian + affine mixed addition (EFD madd-2007-bl).
    const Z1Z1 = fmul(Z, Z);
    const U2 = fmul(L[w].x, Z1Z1);
    const S2 = fmul(fmul(L[w].y, Z), Z1Z1);
    const H = fsub(U2, X);
    const HH = fmul(H, H);
    const I = fadd(fadd(HH, HH), fadd(HH, HH));
    const J = fmul(H, I);
    const r = fadd(fsub(S2, Y), fsub(S2, Y));
    const V = fmul(X, I);
    const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
    const yJ = fmul(Y, J);
    const zH = fadd(Z, H);
    Y = fsub(fmul(r, fsub(V, X3)), fadd(yJ, yJ));
    Z = fsub(fsub(fmul(zH, zH), Z1Z1), HH);
    X = X3;
  }
  if (Z === 0n) return { x: 0n, y: 0n };
  const zInv = modInverse(Z, FP);
  const zInv2 = fmul(zInv, zInv);
  return { x: fmul(X, zInv2), y: fmul(Y, fmul(zInv2, zInv)) };
}

async function compileOne(
  device: GPUDevice,
  code: string,
  key: string,
  layout: GPUBindGroupLayout,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ label: key, code });
  const info = await module.getCompilationInfo();
  const errLines: string[] = [];
  for (const m of info.messages) {
    const line = `[shader ${key}] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
    if (m.type === 'error') {
      console.error(line);
      errLines.push(line);
    } else {
      console.warn(line);
    }
  }
  if (errLines.length) throw new Error(`WGSL compile failed for ${key}: ${errLines.slice(0, 4).join(' | ')}`);
  return device.createComputePipelineAsync({
    label: key,
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

// Window bits per n — fastest c per size, measured by bench-c-sweep /
// bench-msm-v2 on this GPU. Tiny-n entries pick a small c to shrink the
// bucket reduction, which is the dominant fixed cost there.
export function pickC(n: number): number {
  const logN = Math.round(Math.log2(n));
  const table: Record<number, number> = {
    7: 4,
    8: 4,
    9: 5,
    10: 8,
    11: 8,
    12: 8,
    13: 8,
    14: 8,
    15: 10,
    16: 13,
    17: 13,
    18: 15,
    19: 15,
    20: 15,
  };
  return table[logN] ?? 13;
}

// Fused chunk size per n. Small n is occupancy-starved and wants fewer pairs
// per chunk (more chunks -> more workgroups); large n is saturated and
// prefers bigger chunks (better inversion amortisation). bench-msm-v2.
function pickS(n: number): number {
  const logN = Math.round(Math.log2(n));
  return logN <= 11 ? 2 : logN <= 13 ? 4 : 8;
}

// Bucket-reduction workgroup size per c. Tracks the reduction stride: small c
// stays near the GPU subgroup width (32); large c needs the full 128 to cover
// its wide phases. bench-msm-v2 (c=8 -> 32, c=10 -> 64, c=13 -> 128).
function pickReduceWg(c: number): number {
  return c <= 9 ? 32 : c <= 12 ? 64 : 128;
}

// Per-level GPU dispatch wiring for one prepared scalar set.
interface LevelBind {
  plannerABind: GPUBindGroup;
  plannerBBind: GPUBindGroup;
  fusedTiles: { bind: GPUBindGroup; nx: number }[];
  carryBind: GPUBindGroup;
  finalizeBinds: GPUBindGroup[]; // one per window-batch
  nCarry: number;
}

/**
 * Per-pool memoization of bind-group layouts + compiled compute pipelines.
 *
 * Compiling a WGSL shader to a GPU pipeline is the dominant per-MsmV2.create
 * cost (~10–100 ms × ~17 pipelines × every distinct n a Chonk batch hits).
 * The cache keys on the rendered WGSL source for pipelines (deterministic
 * from generator args, so two equivalent calls share the cached pipeline)
 * and on the layout shape for bind-group layouts. Values are stored as
 * `Promise<GPUComputePipeline>` so concurrent compilation requests for the
 * same shader collapse onto one compile.
 *
 * Lifetime is tied to the pool — pipelines and layouts hold no references
 * to MsmV2 instances and survive their destruction. Released when the
 * `GPUDevice` is destroyed (host calls `pool.destroy()`).
 */
class PipelineCache {
  private layouts = new Map<string, GPUBindGroupLayout>();
  private pipelines = new Map<string, Promise<GPUComputePipeline>>();

  constructor(private readonly device: GPUDevice) {}

  /** Idempotent: same `types` array → same cached `GPUBindGroupLayout`. */
  getLayout(types: GPUBufferBindingType[]): GPUBindGroupLayout {
    const key = types.join('|');
    let layout = this.layouts.get(key);
    if (layout) return layout;
    layout = this.device.createBindGroupLayout({
      entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
    this.layouts.set(key, layout);
    return layout;
  }

  /**
   * Idempotent: same `code` string → same cached `GPUComputePipeline`. The
   * caller passes `layout`, which itself should come from `getLayout` so the
   * cached layout is reused; otherwise the pipeline layout objects differ
   * and the WebGPU implementation has to revalidate.
   *
   * `key` is a short label included in WGSL compile errors only — not part
   * of the cache key.
   */
  getPipeline(code: string, layout: GPUBindGroupLayout, key: string): Promise<GPUComputePipeline> {
    let p = this.pipelines.get(code);
    if (p) return p;
    p = compileOne(this.device, code, key, layout);
    this.pipelines.set(code, p);
    return p;
  }
}

/**
 * The shared SRS point pool: the base points uploaded to the GPU and converted
 * to Montgomery-form 8×u32 layout exactly once, then bound (as a prefix) by
 * every {@link MsmV2} instance. Build it once per proving session from the
 * canonical SRS; `MsmV2.create` references its buffers without re-uploading or
 * re-converting.
 *
 * Hosts the per-pool layout / pipeline cache (see {@link PipelineCache}) so
 * MsmV2 instances bound to the same pool never recompile a shader they've
 * collectively seen before.
 */
/**
 * The shared per-MSM scratch buffers, owned by {@link MsmV2Pool}. Sized to
 * the high-water mark of every dimension `MsmV2.prepare` has asked for
 * across all instances. Doubling-growth: any buffer reallocates only when
 * its dimension exceeds the current size. After a reallocation the pool's
 * `scratchEpoch` advances; MsmV2 instances detect a stale epoch and rebuild
 * their bind groups against the new buffer identities.
 *
 * Replaces the old per-instance buffer ownership where every cached MsmV2
 * in the bridge LRU held its own 200+ MB of scratch. With the shared pool
 * the aggregate GPU memory is `one max-N copy + KB-sized bind groups per
 * instance`, regardless of LRU size. Cold N-switch goes from ~150 ms
 * (buffer alloc) to ~2 ms (bind-group rebuild).
 */
interface SharedScratch {
  bufA: GPUBuffer;
  bufB: GPUBuffer;
  l0IdxBuf: GPUBuffer;
  bucketAndSignBuf: GPUBuffer;
  valIdxBuf: GPUBuffer;
  rowPtrBuf: GPUBuffer;
  planMeta: GPUBuffer;
  pairBlockPlanRing: [GPUBuffer, GPUBuffer];
  scatterPlanRing: [GPUBuffer, GPUBuffer];
  carryPlanRing: [GPUBuffer, GPUBuffer];
  countsBufs: [GPUBuffer, GPUBuffer];
  offsetsBufs: [GPUBuffer, GPUBuffer];
  prefScratchBuf: GPUBuffer;
  scalarsRawBuf: GPUBuffer;
  redBuf: GPUBuffer;
  isPresentBuf: GPUBuffer;
  reducePrefScratch: GPUBuffer;
  // Streaming planner + accumulator buffers (Phase 1-4).
  streamPlannerMeta: GPUBuffer;
  size1BucketList: GPUBuffer;
  denseBucketList: GPUBuffer;
  denseCountList: GPUBuffer;
  sortedBucketList: GPUBuffer;
  sortedCountList: GPUBuffer;
  radixHist: GPUBuffer;
  cumulativeAdds: GPUBuffer;
  wgCuts: GPUBuffer;
  threadCuts: GPUBuffer;
  queueBuf: GPUBuffer;
  partialsBuf: GPUBuffer;
  partialBucketsList: GPUBuffer;
  accBuf: GPUBuffer;
  streamPrefScratch: GPUBuffer;
  // Stream-walker buffers (Plan §3.1 + C's KNOB 2 variant).
  taskCuts: GPUBuffer;              // (S+1) cut points/thread × 2 u32
  walkerPartials: GPUBuffer;        // 2*S partial slots/thread (split-start + task-end)
  walkerPartialDest: GPUBuffer;     // bucket_id per partial slot (NO_BUCKET if unused)
  // Task #19 — per-bucket linked-list index for the indexed walker_combine.
  bucketHead: GPUBuffer;            // bTotal × atomic<u32>, 0=NO_NODE, otherwise 1-indexed handle
  walkerNodesSlot: GPUBuffer;       // node_idx → partial slot index
  walkerNodesNext: GPUBuffer;       // node_idx → next node handle
  walkerNodeCounter: GPUBuffer;     // single atomic<u32> counter
  // Optimal walker_combine pipeline buffers.
  partialCount: GPUBuffer;          // bTotal × atomic<u32> — partials per bucket
  partialOffset: GPUBuffer;         // (bTotal+1) × u32 — exclusive prefix sum
  partialWritePos: GPUBuffer;       // bTotal × atomic<u32> — scatter scratch
  partialLayout: GPUBuffer;         // max_partials × u32 — dense per-bucket slot indices
  activeBuckets: GPUBuffer;         // bTotal × u32 — filtered list of count>=2 bucket_ids
  activeCount: GPUBuffer;           // 1 × atomic<u32> — size of active_buckets
  // Counting-sort prepass: groups active_buckets by partial_count so each
  // combine_batched thread's S=8 slots have matching N → zero tail divergence.
  // MAX_N = 64 bins (sized in ba_walker_combine_sort_*.template.wgsl).
  countHistogram: GPUBuffer;        // MAX_N × atomic<u32>
  binOffsets: GPUBuffer;            // MAX_N × u32 — exclusive prefix sum
  binWritePos: GPUBuffer;           // MAX_N × atomic<u32>
  sortedActiveBuckets: GPUBuffer;   // bTotal × u32 — active_buckets in N order
  // Pair-tree hot-bucket combine. pt_scratch holds intermediate level
  // partials per hot bucket; pt_alloc is a single atomic claim counter
  // reset each MSM. Sized for the worst case where every emitted partial
  // is in a hot bucket — sum(2N over hot) ≤ 2 × total_partials.
  ptScratch: GPUBuffer;             // shared by old pt kernel and new pt_buf (16 MB)
  ptAlloc: GPUBuffer;               // 1 × atomic<u32> — legacy, kept to avoid bind churn
  ptDispatchArgs: GPUBuffer;        // 3 × u32 — sort_scan writes (ceil(hot_count/TPB),1,1); used by pt_init_copy/build/finalize
  ptCombineDispatchArgs: GPUBuffer; // 3 × u32 — pt_dispatch_compute writes per-level (ceil(total_tasks/S/TPB),1,1)
  ptBuildLoopArgs: GPUBuffer;       // 3 × u32 — dispatch_chain writes hot_wgs while any pair-tasks remain, else 0; build's level-by-level indirect dispatch reads this
  cbDispatchArgs: GPUBuffer;        // 3 × u32 — sort_scan writes (ceil(cb_active / (CB_TPB*CB_S)), 1, 1); combine_batched indirect-dispatched off it
  ptPersistentDispatchArgs: GPUBuffer; // 3 × u32 — packer writes (NUM_WGS, 1, 1)
  ptBucketWg: GPUBuffer;               // sBTotal × u32 — per-bucket WG assignment (packer intermediate)
  ptWgMeta: GPUBuffer;                 // MAX_WGS × 4 × u32 — (scratch_off, count, total_partials, _) per WG
  ptWgBucketList: GPUBuffer;           // sBTotal × u32 — bids packed by WG
  ptWgBucketStarts: GPUBuffer;         // (MAX_WGS + 1) × u32 — prefix sum into pt_wg_bucket_list
  // Chunk-pass (stream_walker-shaped reducer).
  ptChunks: GPUBuffer;                 // vec4<u32> × max_chunks — (in_off, count, out_off, bid)
  ptChunksTotal: GPUBuffer;            // 1 × atomic<u32> — chunks emitted in current pass
  // Pair-tree v2 (multi-dispatch). Per-bucket level state, task list, counters.
  ptOff: GPUBuffer;                 // sBTotal × u32 — bucket's current start in pt_buf
  ptCount: GPUBuffer;               // sBTotal × u32 — bucket's current level count
  ptMeta: GPUBuffer;                // 4 × u32 — NUM_HOT, total partials, _, _
  ptTasks: GPUBuffer;               // max tasks per level × vec4<u32>
  ptTotalTasks: GPUBuffer;          // 1 × atomic<u32>
  // Pad-trio layout in bufA/bufB (depends on the M1 the buffers were
  // sized for). Re-derived whenever bufA grows.
  planeBytes: number;
  padBytesPerPlane: number;
  padXOffset: number;
  padYOffset: number;
  // The M1 the pool's bufA/bufB are sized to (in elements, not bytes).
  // ALL MSMs binding to this pool MUST reference pad slots at element
  // indices [poolM1-3, poolM1-2, poolM1-1] regardless of their own M1 —
  // those are the only slots that contain the pad-trio data. The pool
  // re-writes the pad bytes there whenever it grows bufA/bufB.
  poolM1: number;
}

/** Dimensions a single MSM prepare asks the pool to fit. */
interface ScratchDims {
  M1: number;
  batchSlots: number;
  batchBuckets: number;
  numWindows: number;
  BW: number;
  l0Slots: number;
  rowPtrLen: number;
  planMetaLen: number;
  totalPairBlocks: number;
  totalCarries: number;
  fusedTile: number;
  S: number;
  scalarsBytes: number;
  redM: number;
  reducePrefBytes: number;
  bTotal: number;
  // Streaming planner dimensions.
  streamNumThreads: number;
  streamS: number;
  streamQueueEntries: number;
  streamRadixTiles: number;
}

export class MsmV2Pool {
  /** @internal — used by MsmV2.create to share compiled pipelines. */
  readonly cache: PipelineCache;
  /**
   * Pool-level upper bound on per-bucket pair count. Baked into the
   * `ba_planner_v2_emit` shader as a compile-time PAIR_CAP loop bound;
   * pinned to the pool (`ceil(srsN/2)+16`) so the shader source is
   * pool-invariant and the planner pipeline can be cached across every n
   * the pool serves. The shader's inner loop early-breaks at the real
   * per-bucket pair count, so over-bounding here costs nothing.
   */
  readonly pairCap: number;

  // Shared scratch state — allocated lazily on first MsmV2.prepare call,
  // grown by doubling whenever a dimension exceeds the current size.
  // See SharedScratch above.
  private _scratch: SharedScratch | null = null;
  private _maxDims: ScratchDims = {
    M1: 0,
    batchSlots: 0,
    batchBuckets: 0,
    numWindows: 0,
    BW: 0,
    l0Slots: 0,
    rowPtrLen: 0,
    planMetaLen: 0,
    totalPairBlocks: 0,
    totalCarries: 0,
    fusedTile: 0,
    S: 0,
    scalarsBytes: 0,
    redM: 0,
    reducePrefBytes: 0,
    bTotal: 0,
    streamNumThreads: 0,
    streamS: 0,
    streamQueueEntries: 0,
    streamRadixTiles: 0,
  };
  private _scratchEpoch = 0;
  private _device: GPUDevice;

  /** Bumped whenever `ensureScratch` reallocates any buffer. MsmV2
   * instances cache the value at bind-group build time and rebuild when
   * it advances. */
  get scratchEpoch(): number {
    return this._scratchEpoch;
  }
  /** Current shared scratch buffers. Null until first ensureScratch call. */
  get scratch(): SharedScratch | null {
    return this._scratch;
  }

  private constructor(
    /** Number of base points held by the pool. */
    readonly srsN: number,
    /** Montgomery-form x coordinates — `srsN` × 8×u32. */
    readonly poolX: GPUBuffer,
    /** Montgomery-form y coordinates — `srsN` × 8×u32. */
    readonly poolY: GPUBuffer,
    device: GPUDevice,
  ) {
    this.cache = new PipelineCache(device);
    this.pairCap = Math.ceil(srsN / 2) + 16;
    this._device = device;
  }

  /**
   * GPU bytes the pool itself owns — the SRS point coordinates `poolX` +
   * `poolY` (the user's "points memory" line item) PLUS the shared scratch
   * buffers (the per-MSM working set, shared across all MsmV2 instances).
   * Pipelines and bind-group layouts cached in `this.cache` aren't counted
   * here; they're driver-managed shader objects, not allocated storage.
   */
  statsBytes(): number {
    let total = this.poolX.size + this.poolY.size;
    if (this._scratch) {
      const s = this._scratch;
      total += s.bufA.size + s.bufB.size;
      total += s.l0IdxBuf.size + s.bucketAndSignBuf.size + s.valIdxBuf.size;
      total += s.rowPtrBuf.size + s.planMeta.size;
      total += s.pairBlockPlanRing[0].size + s.pairBlockPlanRing[1].size;
      total += s.scatterPlanRing[0].size + s.scatterPlanRing[1].size;
      total += s.carryPlanRing[0].size + s.carryPlanRing[1].size;
      total += s.countsBufs[0].size + s.countsBufs[1].size;
      total += s.offsetsBufs[0].size + s.offsetsBufs[1].size;
      total += s.prefScratchBuf.size + s.scalarsRawBuf.size;
      total += s.redBuf.size + s.isPresentBuf.size + s.reducePrefScratch.size;
      total += s.streamPlannerMeta.size + s.size1BucketList.size;
      total += s.denseBucketList.size + s.denseCountList.size;
      total += s.sortedBucketList.size + s.sortedCountList.size;
      total += s.radixHist.size + s.cumulativeAdds.size;
      total += s.wgCuts.size + s.threadCuts.size;
      total += s.queueBuf.size + s.partialsBuf.size + s.partialBucketsList.size;
      total += s.accBuf.size + s.streamPrefScratch.size;
      total += s.taskCuts.size + s.walkerPartials.size + s.walkerPartialDest.size;
      total += s.bucketHead.size + s.walkerNodesSlot.size + s.walkerNodesNext.size + s.walkerNodeCounter.size;
    }
    return total;
  }

  /**
   * Grow shared scratch buffers as needed to fit `dims`. Idempotent — if
   * every dimension already fits, no buffer is touched and `scratchEpoch`
   * stays put. If any dimension grows, the underlying buffers are destroyed
   * and reallocated at the new max, the pad-trio is re-written into the
   * fresh bufA/bufB, and `scratchEpoch` advances. Caller must consult
   * `scratchEpoch` afterward to detect when bind groups need rebuilding.
   *
   * `padPts` and `R` are the pad-trio point coordinates + Montgomery R
   * needed to refresh the pad slots on a bufA/bufB realloc.
   */
  ensureScratch(dims: ScratchDims, padPts: Pt[], R: bigint): SharedScratch {
    const device = this._device;
    const cur = this._maxDims;
    let grew = false;
    const grow = (cond: boolean, name: keyof ScratchDims): boolean => {
      if (cond) {
        cur[name] = dims[name];
        return true;
      }
      return false;
    };
    const sbuf = (bytes: number): GPUBuffer =>
      device.createBuffer({
        size: Math.max(bytes, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
    const soaSize = (M: number): number => 2 * PG * M * 4 * 4;
    const soaBuf = (M: number): GPUBuffer => sbuf(soaSize(M));

    const s = this._scratch;
    let bufA = s?.bufA;
    let bufB = s?.bufB;
    let l0IdxBuf = s?.l0IdxBuf;
    let bucketAndSignBuf = s?.bucketAndSignBuf;
    let valIdxBuf = s?.valIdxBuf;
    let rowPtrBuf = s?.rowPtrBuf;
    let planMeta = s?.planMeta;
    let pairBlockPlanRing = s?.pairBlockPlanRing;
    let scatterPlanRing = s?.scatterPlanRing;
    let carryPlanRing = s?.carryPlanRing;
    let countsBufs = s?.countsBufs;
    let offsetsBufs = s?.offsetsBufs;
    let prefScratchBuf = s?.prefScratchBuf;
    let scalarsRawBuf = s?.scalarsRawBuf;
    let redBuf = s?.redBuf;
    let isPresentBuf = s?.isPresentBuf;
    let reducePrefScratch = s?.reducePrefScratch;

    // bufA/bufB depend on M1. They also need a pad-trio re-write whenever
    // they realloc, so we handle them together.
    if (!bufA || dims.M1 > cur.M1) {
      bufA?.destroy();
      bufB?.destroy();
      grow(true, 'M1');
      // Step 9 (Plan §14): pair-tree V2 buffers shrunk to 4 B — no longer
      // dispatched. ba_fused_super / ba_carry / ba_finalize bind groups
      // still reference them so the type/binding system stays happy, but
      // none of those pipelines run on the walker path.
      bufA = sbuf(4);
      bufB = sbuf(4);
      grew = true;
    }
    // l0IdxBuf must hold both the L0 input (l0Slots × 4) AND the transpose
    // partials matrix (batchWindows × num_point_tiles × BW × 4). Its size
    // is the max of those — caller passes the larger as `l0Slots`.
    if (!l0IdxBuf || dims.l0Slots > cur.l0Slots) {
      l0IdxBuf?.destroy();
      grow(true, 'l0Slots');
      l0IdxBuf = sbuf(cur.l0Slots * 4);
      grew = true;
    }
    if (!bucketAndSignBuf || dims.batchSlots > cur.batchSlots) {
      bucketAndSignBuf?.destroy();
      valIdxBuf?.destroy();
      grow(true, 'batchSlots');
      bucketAndSignBuf = sbuf(cur.batchSlots * 4);
      valIdxBuf = sbuf(cur.batchSlots * 4);
      grew = true;
    }
    if (!rowPtrBuf || dims.rowPtrLen > cur.rowPtrLen) {
      rowPtrBuf?.destroy();
      grow(true, 'rowPtrLen');
      rowPtrBuf = sbuf(cur.rowPtrLen * 4);
      grew = true;
    }
    if (!planMeta || dims.planMetaLen > cur.planMetaLen) {
      planMeta?.destroy();
      grow(true, 'planMetaLen');
      planMeta = sbuf(cur.planMetaLen * 4);
      grew = true;
    }
    if (!pairBlockPlanRing || !scatterPlanRing || dims.totalPairBlocks > cur.totalPairBlocks) {
      pairBlockPlanRing?.forEach(b => b.destroy());
      scatterPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalPairBlocks');
      const SmaxS = Math.max(cur.S, dims.S);
      cur.S = SmaxS;
      // Step 9: pair-tree V2 ring buffers shrunk — only the dead fused_super
      // pipeline reads them.
      pairBlockPlanRing = [sbuf(4), sbuf(4)];
      scatterPlanRing = [sbuf(4), sbuf(4)];
      grew = true;
    }
    if (!carryPlanRing || dims.totalCarries > cur.totalCarries) {
      carryPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalCarries');
      // Step 9: shrunk — only the dead carry pipeline reads it.
      carryPlanRing = [sbuf(4), sbuf(4)];
      grew = true;
    }
    if (!countsBufs || !offsetsBufs || dims.batchBuckets > cur.batchBuckets) {
      countsBufs?.forEach(b => b.destroy());
      offsetsBufs?.forEach(b => b.destroy());
      grow(true, 'batchBuckets');
      countsBufs = [sbuf(cur.batchBuckets * 4), sbuf(cur.batchBuckets * 4)];
      offsetsBufs = [sbuf(cur.batchBuckets * 4), sbuf(cur.batchBuckets * 4)];
      grew = true;
    }
    if (!prefScratchBuf || dims.fusedTile > cur.fusedTile || dims.S > cur.S) {
      prefScratchBuf?.destroy();
      grow(true, 'fusedTile');
      const SmaxS = Math.max(cur.S, dims.S);
      cur.S = SmaxS;
      // Step 9: shrunk — only the dead fused_super pipeline reads it.
      prefScratchBuf = sbuf(4);
      grew = true;
    }
    if (!scalarsRawBuf || dims.scalarsBytes > cur.scalarsBytes) {
      scalarsRawBuf?.destroy();
      grow(true, 'scalarsBytes');
      scalarsRawBuf = sbuf(cur.scalarsBytes);
      grew = true;
    }
    if (!redBuf || dims.redM > cur.redM) {
      redBuf?.destroy();
      isPresentBuf?.destroy();
      grow(true, 'redM');
      redBuf = soaBuf(cur.redM);
      isPresentBuf = sbuf(cur.redM * 4);
      grew = true;
    }
    if (!reducePrefScratch || dims.reducePrefBytes > cur.reducePrefBytes) {
      reducePrefScratch?.destroy();
      grow(true, 'reducePrefBytes');
      reducePrefScratch = sbuf(cur.reducePrefBytes);
      grew = true;
    }

    // Streaming planner + accumulator buffers.
    const sT = dims.streamNumThreads || STREAM_NUM_THREADS;
    const sS = dims.streamS || 8;
    const sBTotal = dims.bTotal || 1;
    const sRadixTiles = dims.streamRadixTiles || 1;
    const sMaxQ = dims.streamQueueEntries || 1;
    const sQHeaderLen = 2 * sT;
    const ibuf = (bytes: number): GPUBuffer =>
      device.createBuffer({
        size: Math.max(bytes, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.INDIRECT,
      });
    let streamPlannerMeta = s?.streamPlannerMeta;
    let size1BucketList = s?.size1BucketList;
    let denseBucketList = s?.denseBucketList;
    let denseCountList = s?.denseCountList;
    let sortedBucketList = s?.sortedBucketList;
    let sortedCountList = s?.sortedCountList;
    let radixHist = s?.radixHist;
    let cumulativeAdds = s?.cumulativeAdds;
    let wgCuts = s?.wgCuts;
    let threadCuts = s?.threadCuts;
    let queueBuf = s?.queueBuf;
    let partialsBuf = s?.partialsBuf;
    let partialBucketsList = s?.partialBucketsList;
    let accBuf = s?.accBuf;
    let streamPrefScratch = s?.streamPrefScratch;
    // Stream-walker buffers (Plan §3.1 + KNOB 2).
    let taskCuts = s?.taskCuts;
    let walkerPartials = s?.walkerPartials;
    let walkerPartialDest = s?.walkerPartialDest;
    // Task #19: per-bucket linked-list index.
    let bucketHead = s?.bucketHead;
    let walkerNodesSlot = s?.walkerNodesSlot;
    let walkerNodesNext = s?.walkerNodesNext;
    let walkerNodeCounter = s?.walkerNodeCounter;
    let partialCount = s?.partialCount;
    let partialOffset = s?.partialOffset;
    let partialWritePos = s?.partialWritePos;
    let partialLayout = s?.partialLayout;
    let activeBuckets = s?.activeBuckets;
    let activeCount = s?.activeCount;
    let countHistogram = s?.countHistogram;
    let binOffsets = s?.binOffsets;
    let binWritePos = s?.binWritePos;
    let sortedActiveBuckets = s?.sortedActiveBuckets;
    let ptScratch = s?.ptScratch;
    let ptAlloc = s?.ptAlloc;
    let ptDispatchArgs = s?.ptDispatchArgs;
    let ptOff = s?.ptOff;
    let ptCount = s?.ptCount;
    let ptMeta = s?.ptMeta;
    let ptTasks = s?.ptTasks;
    let ptTotalTasks = s?.ptTotalTasks;
    let ptCombineDispatchArgs = s?.ptCombineDispatchArgs;
    let ptBuildLoopArgs = s?.ptBuildLoopArgs;
    let cbDispatchArgs = s?.cbDispatchArgs;
    let ptPersistentDispatchArgs = s?.ptPersistentDispatchArgs;
    let ptBucketWg = s?.ptBucketWg;
    let ptWgMeta = s?.ptWgMeta;
    let ptWgBucketList = s?.ptWgBucketList;
    let ptWgBucketStarts = s?.ptWgBucketStarts;
    let ptChunks = s?.ptChunks;
    let ptChunksTotal = s?.ptChunksTotal;
    if (!streamPlannerMeta || dims.bTotal > cur.bTotal || dims.streamNumThreads > cur.streamNumThreads) {
      streamPlannerMeta?.destroy();
      size1BucketList?.destroy();
      denseBucketList?.destroy();
      denseCountList?.destroy();
      sortedBucketList?.destroy();
      sortedCountList?.destroy();
      radixHist?.destroy();
      cumulativeAdds?.destroy();
      wgCuts?.destroy();
      threadCuts?.destroy();
      queueBuf?.destroy();
      partialsBuf?.destroy();
      partialBucketsList?.destroy();
      accBuf?.destroy();
      streamPrefScratch?.destroy();
      taskCuts?.destroy();
      walkerPartials?.destroy();
      walkerPartialDest?.destroy();
      bucketHead?.destroy();
      walkerNodesSlot?.destroy();
      walkerNodesNext?.destroy();
      walkerNodeCounter?.destroy();
      partialCount?.destroy();
      partialOffset?.destroy();
      partialWritePos?.destroy();
      partialLayout?.destroy();
      activeBuckets?.destroy();
      activeCount?.destroy();
      countHistogram?.destroy();
      binOffsets?.destroy();
      binWritePos?.destroy();
      sortedActiveBuckets?.destroy();
      ptScratch?.destroy();
      ptAlloc?.destroy();
      ptDispatchArgs?.destroy();
      ptOff?.destroy();
      ptCount?.destroy();
      ptMeta?.destroy();
      ptTasks?.destroy();
      ptTotalTasks?.destroy();
      ptCombineDispatchArgs?.destroy();
      ptBuildLoopArgs?.destroy();
      cbDispatchArgs?.destroy();
      ptPersistentDispatchArgs?.destroy();
      ptBucketWg?.destroy();
      ptWgMeta?.destroy();
      ptWgBucketList?.destroy();
      ptWgBucketStarts?.destroy();
      ptChunks?.destroy();
      ptChunksTotal?.destroy();
      grow(dims.streamNumThreads > cur.streamNumThreads, 'streamNumThreads');
      grow(dims.streamS > cur.streamS, 'streamS');
      grow(dims.streamQueueEntries > cur.streamQueueEntries, 'streamQueueEntries');
      grow(dims.streamRadixTiles > cur.streamRadixTiles, 'streamRadixTiles');
      streamPlannerMeta = ibuf(Math.max((20 + sT) * 4, 256));
      size1BucketList = sbuf(sBTotal * 2 * 4);
      denseBucketList = sbuf(sBTotal * 4);
      denseCountList = sbuf(sBTotal * 4);
      sortedBucketList = sbuf(sBTotal * 4);
      sortedCountList = sbuf(sBTotal * 4);
      radixHist = sbuf(sRadixTiles * 256 * 4);
      cumulativeAdds = sbuf(sBTotal * 4);
      wgCuts = sbuf(MAX_STREAM_WORKGROUPS * 2 * 4);
      threadCuts = sbuf(sT * 2 * 4);
      // Step 9: legacy stream-accum buffers shrunk — only the dead
      // ba_stream_accum / ba_partial_sum / ba_planner_emit / ba_emit_fixup /
      // ba_debug_accum / ba_recompute_split pipelines reference these.
      // Walker uses taskCuts + walkerPartials + walkerPartialDest instead.
      queueBuf = sbuf(4);
      partialsBuf = sbuf(4);
      partialBucketsList = sbuf(4);
      accBuf = sbuf(4);
      streamPrefScratch = sbuf(4);
      // Stream-walker allocations (KNOB 2 — per C's variant).
      //   taskCuts:   (S+1) cut points/thread × 2 u32 = (sS+1) × 2 × 4 B/thread
      //   walkerPartials: 2*S slots/thread × PG × 2 vec4 (split-start + task-end)
      //   walkerPartialDest: 2*S u32/thread (bucket_id per partial slot)
      taskCuts = sbuf(sT * (sS + 1) * 2 * 4);
      // walkerPartials = partials region (8*sT*sS vec4) + pref tail (2*sT*sS vec4)
      // + acc tail (acc_x 2*sT*sS + acc_y 2*sT*sS vec4). The per-slot running
      // partial sums acc_x/acc_y are streamed from this global region (one slot
      // at a time in the peel) instead of held in per-thread private arrays —
      // that private array was being unrolled into S simultaneously-live 256-bit
      // values and spilling KB/thread. Total = 14*sT*sS vec4 × 16 B.
      //   partials [0,8) · pref [8,10) · acc_x [10,12) · acc_y [12,14)  (×sT*sS vec4)
      // + inv_state tail: f,g,d,e + d-scratch (50 u32/thread, padded to 52 =
      //   13 vec4/thread for vec4-alignment) at [14*sT*sS, 14*sT*sS + 13*sT) vec4 —
      //   the safegcd state in global memory. The d-scratch (+40) double-buffers the
      //   two-pass apply_matrix_de so the e-pass still sees old-d.
      walkerPartials = sbuf((14 * sT * sS + 13 * sT) * 16);
      // [0,2) partial-slot bucket ids + per-slot scalar state moved out of
      // private regs into global: cursor[2,3), bucket_end[3,4), task_end_sort
      // [4,5), task_end_cur[5,6), cur_sorted[6,7)  (each region sT*sS u32).
      walkerPartialDest = sbuf(7 * sT * sS * 4);
      // Task #19 — per-bucket linked-list index for walker_combine.
      //   bucketHead:  bTotal × atomic<u32>, cleared to 0 (NO_NODE) per MSM.
      //   walkerNodesSlot/Next: one node per partial slot = 2*sT*sS u32 each.
      //   walkerNodeCounter: single atomic<u32>, cleared to 0 per MSM.
      bucketHead = sbuf(sBTotal * 4);
      walkerNodesSlot = sbuf(2 * sT * sS * 4);
      walkerNodesNext = sbuf(2 * sT * sS * 4);
      walkerNodeCounter = sbuf(4);
      // Optimal combine pipeline buffers.
      partialCount = sbuf(sBTotal * 4);
      partialOffset = sbuf((sBTotal + 1) * 4);
      partialWritePos = sbuf(sBTotal * 4);
      partialLayout = sbuf(2 * sT * sS * 4);
      activeBuckets = sbuf(sBTotal * 4);
      activeCount = sbuf(4);
      // Counting-sort buffers. MAX_N = 64 (mirrors WGSL const).
      countHistogram = sbuf(64 * 4);
      binOffsets = sbuf(64 * 4);
      binWritePos = sbuf(64 * 4);
      sortedActiveBuckets = sbuf(sBTotal * 4);
      // Pair-tree scratch. Worst-case sum(2N over hot) = 2 × total partials
      // emitted = 2 × (2 * T * S). Each scratch slot stores 1 partial = 2
      // vec4 X + 2 vec4 Y (plane-separated, M_scratch = max slots).
      //   buffer bytes = 2 (planes) × M_scratch × PG × 16 bytes
      //   M_scratch    = 2 × (2 * T * S)
      // → buffer = 2 × 4 * T * S × 2 × 16 = 256 * T * S bytes.
      // For T=8192, S=8 → 16 MB.
      // pt_buf: pair-tree v2 holds level-k partials past level-(k-1)'s in a
      // shift layout. Per-bucket exact slots = N + ceil(N/2) + ceil(N/4) +
      // ... ≤ 2N + log2(N). Sum across hot buckets ≤ 2·total + NUM_HOT·17.
      // 4× M_partials_walker is the safe ceiling — bumping past 16 MB to 32.
      ptScratch = sbuf(512 * sT * sS);
      ptAlloc = sbuf(4);
      // Indirect dispatch args (x, y, z) written by sortScan and consumed by
      // the pair-tree dispatchWorkgroupsIndirect. Needs INDIRECT usage.
      ptDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      // Pair-tree v2 state buffers.
      ptOff = sbuf(sBTotal * 4);
      ptCount = sbuf(sBTotal * 4);
      ptMeta = sbuf(16);
      // pt_tasks: bound by max tasks at level 0 = sum(ceil(N_i / 2)) ≤
      // total_partials/2 + NUM_HOT ≤ M_partials_walker. Each task = vec4<u32>.
      ptTasks = sbuf(2 * sT * sS * 16); // M_partials_walker × 16 bytes
      ptTotalTasks = sbuf(4);
      ptCombineDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      ptBuildLoopArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      cbDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      ptPersistentDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      // Packer outputs. MAX_WGS = 64 caps the bin-packing.
      ptBucketWg = sbuf(sBTotal * 4);
      ptWgMeta = sbuf(64 * 4 * 4);
      ptWgBucketList = sbuf(sBTotal * 4);
      ptWgBucketStarts = sbuf((64 + 1) * 4);
      // Chunk-pass scratch. Max chunks at pass 0 ≤ M_partials_walker /
      // CHUNK_SIZE; subsequent passes shrink by CHUNK_SIZE each step.
      // Allocate 2 × that for safety. Per-chunk descriptor = vec4<u32> = 16 B.
      ptChunks = sbuf(2 * sT * sS * 2);
      ptChunksTotal = sbuf(4);
      grew = true;
    }

    // Pad-trio layout in bufA/bufB. Recompute whenever bufA's size changed.
    const planeBytes = cur.M1 * PG * 16;
    const padBytesPerPlane = 3 * PG * 16;
    const padXOffset = planeBytes - padBytesPerPlane;
    const padYOffset = planeBytes + planeBytes - padBytesPerPlane;

    const newScratch: SharedScratch = {
      bufA: bufA!,
      bufB: bufB!,
      l0IdxBuf: l0IdxBuf!,
      bucketAndSignBuf: bucketAndSignBuf!,
      valIdxBuf: valIdxBuf!,
      rowPtrBuf: rowPtrBuf!,
      planMeta: planMeta!,
      pairBlockPlanRing: pairBlockPlanRing!,
      scatterPlanRing: scatterPlanRing!,
      carryPlanRing: carryPlanRing!,
      countsBufs: countsBufs!,
      offsetsBufs: offsetsBufs!,
      prefScratchBuf: prefScratchBuf!,
      scalarsRawBuf: scalarsRawBuf!,
      redBuf: redBuf!,
      isPresentBuf: isPresentBuf!,
      reducePrefScratch: reducePrefScratch!,
      streamPlannerMeta: streamPlannerMeta!,
      size1BucketList: size1BucketList!,
      denseBucketList: denseBucketList!,
      denseCountList: denseCountList!,
      sortedBucketList: sortedBucketList!,
      sortedCountList: sortedCountList!,
      radixHist: radixHist!,
      cumulativeAdds: cumulativeAdds!,
      wgCuts: wgCuts!,
      threadCuts: threadCuts!,
      queueBuf: queueBuf!,
      partialsBuf: partialsBuf!,
      partialBucketsList: partialBucketsList!,
      accBuf: accBuf!,
      streamPrefScratch: streamPrefScratch!,
      taskCuts: taskCuts!,
      walkerPartials: walkerPartials!,
      walkerPartialDest: walkerPartialDest!,
      bucketHead: bucketHead!,
      walkerNodesSlot: walkerNodesSlot!,
      walkerNodesNext: walkerNodesNext!,
      walkerNodeCounter: walkerNodeCounter!,
      partialCount: partialCount!,
      partialOffset: partialOffset!,
      partialWritePos: partialWritePos!,
      partialLayout: partialLayout!,
      activeBuckets: activeBuckets!,
      activeCount: activeCount!,
      countHistogram: countHistogram!,
      binOffsets: binOffsets!,
      binWritePos: binWritePos!,
      sortedActiveBuckets: sortedActiveBuckets!,
      ptScratch: ptScratch!,
      ptAlloc: ptAlloc!,
      ptDispatchArgs: ptDispatchArgs!,
      ptOff: ptOff!,
      ptCount: ptCount!,
      ptMeta: ptMeta!,
      ptTasks: ptTasks!,
      ptTotalTasks: ptTotalTasks!,
      ptCombineDispatchArgs: ptCombineDispatchArgs!,
      ptBuildLoopArgs: ptBuildLoopArgs!,
      cbDispatchArgs: cbDispatchArgs!,
      ptPersistentDispatchArgs: ptPersistentDispatchArgs!,
      ptBucketWg: ptBucketWg!,
      ptWgMeta: ptWgMeta!,
      ptWgBucketList: ptWgBucketList!,
      ptWgBucketStarts: ptWgBucketStarts!,
      ptChunks: ptChunks!,
      ptChunksTotal: ptChunksTotal!,
      planeBytes,
      padBytesPerPlane,
      padXOffset,
      padYOffset,
      poolM1: cur.M1,
    };

    if (grew) {
      // Step 9: pad-trio writeBuffer to bufA/bufB removed. Those writes
      // populated the V2 pair-tree's IDLE-anchor slots at [M1-3..M1-1] of
      // each plane in bufA, read by the dead fused_super / carry / finalize
      // pipelines. The walker reads its IDLE anchor through
      // l0_index[batchSlots] → point_x/point_y[pt_idx] instead, and
      // batchSlots is written by MsmV2.prepare on every run.
      this._scratch = newScratch;
      this._scratchEpoch++;
    } else {
      this._scratch = newScratch;
    }
    return newScratch;
  }

  /**
   * Upload the canonical SRS and GPU-convert it into the Montgomery point pool.
   * `srsCanonicalBytes` is `srsN × 64` little-endian bytes —
   * `[x0[32] || y0[32] || x1[32] || ...]`, non-Montgomery affine. `srsN` may be
   * any positive integer; the conversion is one `convert_points_only` dispatch
   * (same canonical→Montgomery field multiply MsmV2's pipeline expects, run
   * once for the whole SRS), and its bounds guard discards threads whose
   * `id >= srsN`.
   */
  static async create(device: GPUDevice, srsCanonicalBytes: Uint8Array, wordSize = 13): Promise<MsmV2Pool> {
    const srsN = srsCanonicalBytes.byteLength / 64;
    if (!Number.isInteger(srsN) || srsN <= 0) {
      throw new Error(`MsmV2Pool.create: byte length ${srsCanonicalBytes.byteLength} is not a positive multiple of 64`);
    }

    // convert_points_only reads the raw input from two storage buffers (its
    // first_half / second_half bindings); split by point count. For odd
    // srsN the two halves are floor(srsN/2) and ceil(srsN/2) entries.
    const halfBytes = (srsN >> 1) * 64;
    const firstHalf = device.createBuffer({
      size: Math.max(4, halfBytes),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const secondHalf = device.createBuffer({
      size: Math.max(4, srsCanonicalBytes.byteLength - halfBytes),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(firstHalf, 0, srsCanonicalBytes as BufferSource, 0, halfBytes);
    device.queue.writeBuffer(
      secondHalf,
      0,
      srsCanonicalBytes as BufferSource,
      halfBytes,
      srsCanonicalBytes.byteLength - halfBytes,
    );

    // Montgomery-form pool: 8×u32 (32 bytes) per coordinate. Exactly srsN
    // slots — no over-allocation for non-power-of-two srsN.
    const poolBytes = srsN * 32;
    const poolUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const poolX = device.createBuffer({ size: poolBytes, usage: poolUsage });
    const poolY = device.createBuffer({ size: poolBytes, usage: poolUsage });

    // Workgroup shape: pick (workgroup_size, numXWorkgroups) on the same
    // tier table as before for occupancy; numYWorkgroups rounds up to cover
    // srsN with extra threads no-oping via the shader's bounds guard. Same
    // exact totals on power-of-two srsN (no regression); the only overshoot
    // is on non-PoT inputs, where it's at most one extra y-row.
    let workgroupSize: number;
    let numXWorkgroups: number;
    if (srsN <= 256) {
      workgroupSize = 256;
      numXWorkgroups = 1;
    } else if (srsN <= 32768) {
      workgroupSize = 64;
      numXWorkgroups = 4;
    } else {
      workgroupSize = 256;
      numXWorkgroups = srsN <= 131072 ? 8 : 32;
    }
    const numYWorkgroups = Math.max(1, Math.ceil(srsN / (workgroupSize * numXWorkgroups)));

    // The pool's one-shot convert pipeline doesn't go through the cache —
    // it's only run once per pool, and its dispatch shape is data-dependent
    // (workgroup_size / numYWorkgroups), so caching wouldn't help.
    const pool = new MsmV2Pool(srsN, poolX, poolY, device);

    // wordSize must match the MsmV2 instances that consume this pool: the
    // canonical→Montgomery conversion here bakes in R=2^(num_words·wordSize),
    // and the kernels' arithmetic + readback rinv assume the same R.
    const sm = new ShaderManager(4, srsN, BN254_CURVE_CONFIG, false, 'karat', wordSize);
    const code = sm.gen_convert_points_only_shader(workgroupSize, numYWorkgroups, /* packed */ true);
    const layout = pool.cache.getLayout(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    const pipeline = await pool.cache.getPipeline(code, layout, 'convert-points-pool');

    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(params, 0, new Uint32Array([srsN, 0, 0, 0]));
    const bind = device.createBindGroup({
      layout,
      entries: [firstHalf, secondHalf, poolX, poolY, params].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(numXWorkgroups, numYWorkgroups, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();

    firstHalf.destroy();
    secondHalf.destroy();
    params.destroy();
    return pool;
  }

  /** Free the pool's GPU buffers — the SRS (poolX/Y) and the shared
   * scratch (every buffer in `_scratch`, if allocated). */
  destroy(): void {
    this.poolX.destroy();
    this.poolY.destroy();
    if (this._scratch) {
      const s = this._scratch;
      s.bufA.destroy();
      s.bufB.destroy();
      s.l0IdxBuf.destroy();
      s.bucketAndSignBuf.destroy();
      s.valIdxBuf.destroy();
      s.rowPtrBuf.destroy();
      s.planMeta.destroy();
      s.pairBlockPlanRing[0].destroy();
      s.pairBlockPlanRing[1].destroy();
      s.scatterPlanRing[0].destroy();
      s.scatterPlanRing[1].destroy();
      s.carryPlanRing[0].destroy();
      s.carryPlanRing[1].destroy();
      s.countsBufs[0].destroy();
      s.countsBufs[1].destroy();
      s.offsetsBufs[0].destroy();
      s.offsetsBufs[1].destroy();
      s.prefScratchBuf.destroy();
      s.scalarsRawBuf.destroy();
      s.redBuf.destroy();
      s.isPresentBuf.destroy();
      s.reducePrefScratch.destroy();
      this._scratch = null;
    }
  }
}

/**
 * The memory-bounded v2 pair-tree GPU MSM. See the file header for the
 * create / prepare / run lifecycle.
 */
export class MsmV2 {
  // --- create-time (data-independent) state ---
  private device!: GPUDevice;
  // The pool that owns the SRS, the pipeline cache, and the shared scratch
  // buffers this instance binds against. Held by reference; not destroyed
  // by MsmV2.destroy() (the pool outlives any individual instance).
  private pool!: MsmV2Pool;
  private n!: number;
  /** Pippenger window bit width, picked by `pickC(n)`. Public so the
   *  bridge can ship it back to the C++ Horner combine. */
  c!: number;
  /** Number of Pippenger windows = ceil(NUMBITS / c). Public — the bridge
   *  reads it when packing per-MSM staging buffers. */
  numWindows!: number;
  private BW!: number;
  private bTotal!: number;
  private R!: bigint;
  private rinv!: bigint;
  // --- tuning knobs (from MsmConfig; resolved in create) ---
  private s!: number;
  private wgi!: number;
  private l0Log!: number;
  private reduceWg!: number;
  private invVariant!: 'loop' | 'pk';
  private montmul!: MontMulVariant;
  private wordSize = 13;
  private profile = false;
  private jacobianCrossover = 0;
  private combineOnHost = true;
  private stride!: number; // reduction STRIDE = 2^(c-1)
  private redM!: number;
  private pointXBuf!: GPUBuffer;
  private pointYBuf!: GPUBuffer;
  private padPts!: Pt[];
  private reducePasses!: { isDouble: boolean; shaderPhase: number; p2x: number; p2y: number; ppw: number }[];
  // pipelines
  private plannerAPipe!: GPUComputePipeline;
  private plannerBPipe!: GPUComputePipeline;
  private fusedPipe!: GPUComputePipeline;
  private carryPipe!: GPUComputePipeline;
  private finalizePipe!: GPUComputePipeline;
  private fusedPipeL0!: GPUComputePipeline;
  private carryPipeL0!: GPUComputePipeline;
  private finalizePipeL0!: GPUComputePipeline;
  private decomposePipe!: GPUComputePipeline;
  private xposeCountPipe!: GPUComputePipeline;
  private xposeReducePipe!: GPUComputePipeline;
  private xposeScanPipe!: GPUComputePipeline;
  private xposeScatterPipe!: GPUComputePipeline;
  private convActivePipe!: GPUComputePipeline;
  private convMetaPipe!: GPUComputePipeline;
  private reduceLevelPipes: GPUComputePipeline[] = [];
  // Streaming planner + accumulator pipelines
  private classifyPipe!: GPUComputePipeline;
  private metaFixupPipe!: GPUComputePipeline;
  private radixCountPipe!: GPUComputePipeline;
  private radixScanPipe!: GPUComputePipeline;
  private radixScatterPipe!: GPUComputePipeline;
  private cumsumPipe!: GPUComputePipeline;
  private partitionWgPipe!: GPUComputePipeline;
  private partitionThreadPipe!: GPUComputePipeline;
  private size1Pipe!: GPUComputePipeline;
  // Streaming bind groups (built in prepare, rebuilt on epoch change)
  private classifyBind!: GPUBindGroup;
  private metaFixupBind!: GPUBindGroup;
  private radixCountBinds!: [GPUBindGroup, GPUBindGroup, GPUBindGroup]; // ping-pong per pass
  private radixScanBind!: GPUBindGroup;
  private radixScatterBinds!: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
  private cumsumBind!: GPUBindGroup;
  private partitionWgBind!: GPUBindGroup;
  private partitionThreadBind!: GPUBindGroup;
  private size1Bind!: GPUBindGroup;
  private streamNumThreads = STREAM_NUM_THREADS;
  private streamS = 8;
  private numRadixTiles = 1;
  // layouts (needed by prepare to build bind groups)
  private plannerALayout!: GPUBindGroupLayout;
  private plannerBLayout!: GPUBindGroupLayout;
  private fusedLayout!: GPUBindGroupLayout;
  private fusedLayoutL0!: GPUBindGroupLayout;
  private carryLayout!: GPUBindGroupLayout;
  private carryLayoutL0!: GPUBindGroupLayout;
  private finalizeLayout!: GPUBindGroupLayout;
  private finalizeLayoutL0!: GPUBindGroupLayout;
  private decomposeLayout!: GPUBindGroupLayout;
  private xposeCountLayout!: GPUBindGroupLayout;
  private xposeReduceLayout!: GPUBindGroupLayout;
  private xposeScanLayout!: GPUBindGroupLayout;
  private xposeScatterLayout!: GPUBindGroupLayout;
  private convActiveLayout!: GPUBindGroupLayout;
  private convMetaLayout!: GPUBindGroupLayout;
  private reduceLevelLayout!: GPUBindGroupLayout;
  // Streaming layouts
  private classifyLayout!: GPUBindGroupLayout;
  private metaFixupLayout!: GPUBindGroupLayout;
  private radixCountLayout!: GPUBindGroupLayout;
  private radixScanLayout!: GPUBindGroupLayout;
  private radixScatterLayout!: GPUBindGroupLayout;
  private cumsumLayout!: GPUBindGroupLayout;
  private partitionWgLayout!: GPUBindGroupLayout;
  private partitionThreadLayout!: GPUBindGroupLayout;
  private size1Layout!: GPUBindGroupLayout;
  // Stream-walker (Plan §6 + C's KNOB 2 variant).
  private partitionTaskPipe!: GPUComputePipeline;
  private partitionTaskLayout!: GPUBindGroupLayout;
  private partitionTaskBind!: GPUBindGroup;
  private streamWalkerPipe!: GPUComputePipeline;
  private streamWalkerLayout!: GPUBindGroupLayout;
  private streamWalkerBinds: GPUBindGroup[] = [];
  // Optimal walker_combine pipeline (5 kernels).
  private combineCountPipe!: GPUComputePipeline;
  private combineCountLayout!: GPUBindGroupLayout;
  private combineCountBind!: GPUBindGroup;
  private combineScanPipe!: GPUComputePipeline;
  private combineScanLayout!: GPUBindGroupLayout;
  private combineScanBind!: GPUBindGroup;
  private combineScatterPipe!: GPUComputePipeline;
  private combineScatterLayout!: GPUBindGroupLayout;
  private combineScatterBind!: GPUBindGroup;
  private combineFilterPipe!: GPUComputePipeline;
  private combineFilterLayout!: GPUBindGroupLayout;
  private combineFilterBinds: GPUBindGroup[] = [];
  private combineBatchedPipe!: GPUComputePipeline;
  private combineBatchedLayout!: GPUBindGroupLayout;
  private combineBatchedBinds: GPUBindGroup[] = [];
  private sortCountPipe!: GPUComputePipeline;
  private sortCountLayout!: GPUBindGroupLayout;
  private sortCountBind!: GPUBindGroup;
  private sortScanPipe!: GPUComputePipeline;
  private sortScanLayout!: GPUBindGroupLayout;
  private sortScanBind!: GPUBindGroup;
  private sortScatterPipe!: GPUComputePipeline;
  private sortScatterLayout!: GPUBindGroupLayout;
  private sortScatterBind!: GPUBindGroup;
  private ptInitScanPipe!: GPUComputePipeline;
  private ptInitScanLayout!: GPUBindGroupLayout;
  private ptInitScanBind!: GPUBindGroup;
  private ptInitCopyPipe!: GPUComputePipeline;
  private ptInitCopyLayout!: GPUBindGroupLayout;
  private ptInitCopyBind!: GPUBindGroup;
  private ptBuildPipe!: GPUComputePipeline;
  private ptBuildLayout!: GPUBindGroupLayout;
  private ptBuildBind!: GPUBindGroup;
  private ptDispatchChainPipe!: GPUComputePipeline;
  private ptDispatchChainLayout!: GPUBindGroupLayout;
  private ptDispatchChainBind!: GPUBindGroup;
  private ptCombinePipe!: GPUComputePipeline;
  private ptCombineLayout!: GPUBindGroupLayout;
  private ptCombineBind!: GPUBindGroup;
  private ptFinalizePipe!: GPUComputePipeline;
  private ptFinalizeLayout!: GPUBindGroupLayout;
  private ptFinalizeBinds: GPUBindGroup[] = [];

  // --- prepare-time (data-dependent) state ---
  private prepBuffers: GPUBuffer[] = []; // every uniform buffer prepare() allocated (storage buffers live in pool.scratch)
  // Bumped by MsmV2Pool.scratchEpoch when the pool's shared scratch
  // reallocates. We compare against pool.scratchEpoch on every prepare; if
  // they differ, our bind groups point to dead buffers and we re-enter the
  // slow path even when the data-dependent caps would have allowed a fast-
  // path uniform rewrite. -1 = no scratch yet bound.
  private boundEpoch: number = -1;
  private preparedFor: Uint8Array | null = null; // scalarsBuf identity cache key
  private preparedSrsOffset: number = -1; // srsOffset used by the last prepare

  // Saved state from the first prepare() — used to detect "fits in the
  // already-allocated buffers" on subsequent calls. When a later prepare's
  // plan is bounded above by every one of these values, the fast-path
  // rewrites scalars + per-level / per-tile uniforms in-place instead of
  // destroying and re-creating every GPU buffer and bind group (which
  // dominates wall time at ~150 ms per MSM on M4 Pro). Reset to null on
  // destroy() and on a fit-failure rebuild.
  private capM1: number = 0;
  private capTotalPairBlocks: number = 0;
  private capTotalCarries: number = 0;
  private capLevels: number = 0;
  private capNumBatches: number = 0;
  private capMAXC: number = 0;
  // Pair-block tile size (derived from capTotalPairBlocks); persists so run()
  // can skip dispatching tiles past the current plan's totalPairBlocks.
  private fusedTileSize: number = 0;
  private numBatches = 1;
  private batchWindows = 0;
  private levels = 0;
  private nXposePts = 0;
  // Number of point-tiles the transpose dispatches across (the X dimension
  // of the count/scatter dispatches). The n points of each window are
  // partitioned into `transposeNumPointTiles` tiles of ~`pointsPerTile` each
  // so the count/scatter kernels saturate the GPU instead of running one
  // workgroup per window.
  private transposeNumPointTiles = 1;
  private nConvMeta = 0;
  private nReduceInit = 0;
  private numWgsFinalize = 0;
  private rowPtrBuf!: GPUBuffer; // cleared each batch by run()
  private redBuf!: GPUBuffer; // gathered + decoded by run()
  private redStaging!: GPUBuffer; // small mappable L_w gather target
  // profiling (created in prepare when this.profile)
  private querySet: GPUQuerySet | null = null;
  private tsResolveBuf: GPUBuffer | null = null;
  private tsStagingBuf: GPUBuffer | null = null;
  private passCount = 0;
  private passPhases: string[] = [];
  private decomposeBinds!: GPUBindGroup[];
  private xposeCountBind!: GPUBindGroup;
  private xposeReduceBind!: GPUBindGroup;
  private xposeScanBind!: GPUBindGroup;
  private xposeScatterBind!: GPUBindGroup;
  private convActiveBind!: GPUBindGroup;
  // Uniform buffer for csr_to_v2_active_sums; reused across prepare() calls
  // so a single MsmV2 instance can serve different SRS offsets. Layout:
  // [total_slots, base_offset, wstride, input_size].
  private convActiveParamsBuf!: GPUBuffer;
  // Scalars storage buffer — sized by `n × 32` bytes. Reused across prepare()
  // calls on the same MsmV2 instance: the cache check on (preparedScalars,
  // srsOffset) lets the bridge serve repeated MSMs of the same n by just
  // rewriting this one buffer + the offset uniform, instead of tearing down
  // and re-creating every per-prepare buffer.
  private scalarsRawBuf!: GPUBuffer;
  // Active-sums double-buffer for the pair-tree level loop. Reset at the top
  // of every run() — different scalar distributions produce different
  // per-bucket pair counts, and stale slots from the previous run would be
  // read by subsequent levels and corrupt the accumulation.
  private bufA!: GPUBuffer;
  private bufB!: GPUBuffer;
  // Pad-trio reset state. The planner's lever-E self-pad relies on 3
  // sentinel points sitting at slots [M1-3, M1-2, M1-1] of each plane of
  // every active_sums buffer. Slow-path setup writes those 192 bytes (96
  // per plane × 2 planes) directly into bufA + bufB once and never again;
  // each `encodeIntoBatch` reset uses two `clearBuffer` calls per buffer
  // to wipe the NON-pad regions, leaving the pad slots intact across runs.
  // This replaces the 64×M1-byte `padTemplateBuf` (~52 MB at n=131k) that
  // used to be copied into both bufA and bufB on every run.
  private planeBytes: number = 0; // bytes per plane = M1 × PG × 16
  private padBytesPerPlane: number = 0; // 3 × PG × 16 = 96
  private padXOffset: number = 0; // X plane pad start = planeBytes - padBytesPerPlane
  private padYOffset: number = 0; // Y plane pad start = 2*planeBytes - padBytesPerPlane
  private convMetaBind!: GPUBindGroup;
  private reduceInitBind!: GPUBindGroup;
  private reduceLevelBinds: GPUBindGroup[] = [];
  private levelBinds: LevelBind[] = [];

  private constructor() {}

  /**
   * Build the data-independent half of the pipeline — pipelines and layouts —
   * for an `n`-point MSM, binding a prefix of the shared {@link MsmV2Pool} as
   * the point pool (`n` must be `<= pool.srsN`). `config` tunes the pipeline
   * knobs; every field defaults to current behaviour (see {@link MsmConfig}).
   */
  static async create(device: GPUDevice, n: number, pool: MsmV2Pool, config?: MsmConfig): Promise<MsmV2> {
    const m = new MsmV2();
    m.device = device;
    m.pool = pool;
    m.n = n;
    m.c = config?.c ?? pickC(n);
    m.s = config?.s ?? pickS(n);
    m.wgi = config?.wgi ?? DEFAULT_WGI;
    m.l0Log = config?.l0Log ?? DEFAULT_L0_LOG;
    m.reduceWg = config?.reduceWg ?? pickReduceWg(m.c);
    m.invVariant = config?.invVariant ?? DEFAULT_INV_VARIANT;
    m.montmul = config?.montmul ?? 'karat';
    m.wordSize = config?.wordSize ?? 13;
    m.jacobianCrossover = config?.jacobianCrossover ?? 0;
    m.combineOnHost = config?.combineOnHost ?? true;
    const wantProfile = config?.profile ?? false;
    m.profile = wantProfile && device.features.has('timestamp-query');
    if (wantProfile && !m.profile) {
      console.warn('[MsmV2] profile requested but timestamp-query unavailable — disabled');
    }
    // Pull the knobs into the local names the rest of create() uses.
    const { s: S, wgi: WGI, l0Log: L0_LOG, reduceWg: REDUCE_WG, invVariant: INV_VARIANT } = m;
    m.numWindows = Math.ceil(NUMBITS / m.c);
    m.BW = Math.ceil((2 ** (m.c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
    m.bTotal = m.numWindows * m.BW;
    m.stride = 2 ** (m.c - 1);
    m.redM = m.numWindows * m.stride;
    // R (and its inverse, applied at result readback) MUST match the limb
    // width: 20×13 ⇒ R=2^260, 17×15 ⇒ R=2^255. Derive from m.wordSize so
    // encode (pool), kernel arithmetic and decode all share one Montgomery R.
    const misc = compute_misc_params(FP, m.wordSize);
    m.R = misc.r;
    m.rinv = misc.rinv;
    const sm = new ShaderManager(4, n, BN254_CURVE_CONFIG, false, m.montmul, m.wordSize);

    // Bind a prefix of the shared, already-Montgomery-converted SRS pool. The
    // level-0 kernels index points by `val_idx < n`, so a pool with srsN >= n
    // entries is consumed as its first-n prefix — no per-instance upload or
    // Montgomery conversion.
    if (n > pool.srsN) {
      throw new Error(`MsmV2.create: n (${n}) exceeds the pool's srsN (${pool.srsN})`);
    }
    m.pointXBuf = pool.poolX;
    m.pointYBuf = pool.poolY;

    // Pad trio — 3 distinct-x points (a dx==0 pad pair would poison a chunk's
    // batched inversion). Deterministic, so every instance is reproducible.
    const rng = makeRng(0x9111);
    m.padPts = [];
    for (let j = 0; j < 3; j++) m.padPts.push({ x: randomBelow(FP, rng), y: randomBelow(FP, rng) });
    if (m.padPts[0].x === m.padPts[1].x) m.padPts[1].x = (m.padPts[1].x + 1n) % FP;

    // The reduction's data-independent 4-phase schedule.
    const STRIDE = m.stride;
    const C0 = Math.max(1, Math.min(L0_LOG, Math.log2(STRIDE) - 1));
    const L0 = 1 << C0;
    const D = STRIDE / L0;
    m.reducePasses = [];
    const push = (isDouble: boolean, shaderPhase: number, p2x: number, p2y: number, ppw: number) =>
      m.reducePasses.push({ isDouble, shaderPhase, p2x, p2y, ppw });
    for (let l = L0 - 1; l >= 1; l--) push(false, 0, L0, l, D);
    for (let L1 = L0; L1 < STRIDE; L1 *= 2) push(false, 1, L0, L1, STRIDE / (2 * L1));
    for (let j = 0; j < C0; j++) push(true, 2, L0, 0, D - 1);
    for (let L1 = 2 * L0; L1 < STRIDE; L1 *= 2) push(true, 2, L1, 0, STRIDE / L1 - 1);
    for (let mm = 1; mm < STRIDE; mm *= 2) push(false, 2, L0, mm, STRIDE / (2 * mm));
    if (m.reducePasses.length > 64) throw new Error(`reduction schedule too long: ${m.reducePasses.length} > 64`);
    // --- Layouts (pool-cached: same `types` shape → same GPUBindGroupLayout
    // across every MsmV2 instance bound to this pool) ---
    const lt = (types: GPUBufferBindingType[]): GPUBindGroupLayout => pool.cache.getLayout(types);
    m.plannerALayout = lt(['read-only-storage', 'storage', 'storage', 'storage', 'storage', 'uniform']);
    m.plannerBLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'uniform',
      'uniform',
    ]);
    m.fusedLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
    ]);
    m.fusedLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
      'read-only-storage',
      'read-only-storage',
    ]);
    m.carryLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.carryLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    m.finalizeLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.finalizeLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    // 4 bindings: scalars (read), bucket_and_sign (write), params, batch.
    // (Previously 5 — separate signs buffer collapsed into the bucket_and_sign pack.)
    m.decomposeLayout = lt(['read-only-storage', 'storage', 'uniform', 'uniform']);
    m.xposeCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.xposeReduceLayout = lt(['storage', 'storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform']);
    m.xposeScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    m.convMetaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceLevelLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform']);
    // Streaming planner + accumulator layouts
    m.classifyLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'storage', 'uniform']);
    m.metaFixupLayout = lt(['storage']);
    m.radixCountLayout = lt(['read-only-storage', 'storage', 'read-only-storage', 'uniform']);
    m.radixScanLayout = lt(['storage', 'read-only-storage', 'uniform']);
    m.radixScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'read-only-storage', 'uniform']);
    m.cumsumLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.partitionWgLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.partitionThreadLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.size1Layout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'read-only-storage', 'uniform', 'storage']);
    // Stream-walker layouts (C's KNOB 2 variant).
    //   partition_task: sorted_count_list, cumulative_adds, thread_cuts, planner_meta(rw), task_cuts(rw), params(uniform)
    m.partitionTaskLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    //   stream_walker: sorted_bucket_list, sorted_count_list, offsets, task_cuts, l0_index, point_x, point_y, bucket_sums(rw), partials(rw), partial_dest(rw), params(uniform)
    m.streamWalkerLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'uniform', 'uniform']);
    // === Optimal walker_combine pipeline layouts ===
    //   count: partial_dest, partial_count(rw), params
    m.combineCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    //   scan: partial_count, partial_offset(rw), params
    m.combineScanLayout = lt(['read-only-storage', 'storage', 'uniform']);
    //   scatter: partial_dest, partial_offset, partial_write_pos(rw), partial_layout(rw), params
    m.combineScatterLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    //   filter: sorted_bucket_list, partial_count, partial_offset, partial_layout, partials_buf, bucket_sums(rw), active_buckets(rw), active_count(rw), params, planner_meta
    m.combineFilterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'uniform', 'read-only-storage', 'storage', 'uniform']);
    //   batched: active_buckets, active_count, partial_count, partial_offset, partial_layout, l0_index, point_x, point_y, partials_buf(rw), bucket_sums(rw), params
    m.combineBatchedLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform', 'uniform']);
    //   sort-count:   active_buckets, active_count, partial_count, count_histogram(rw)
    m.sortCountLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage']);
    //   sort-scan:    count_histogram, bin_offsets(rw), bin_write_pos(rw), pt_dispatch_args(rw), pt_persistent_args(rw)
    m.sortScanLayout = lt(['read-only-storage', 'storage', 'storage', 'storage', 'storage', 'storage']);
    //   sort-scatter: active_buckets, active_count, partial_count, bin_offsets, bin_write_pos(rw), sorted_active_buckets(rw)
    m.sortScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage']);
    // === Pair-tree v2 (multi-dispatch). ===
    //   pt-init-scan: sorted_active, bin_offsets, active_count, partial_count, pt_off(rw), pt_count(rw), pt_meta(rw)
    m.ptInitScanLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage']);
    //   pt-init-copy: sorted_active, bin_offsets, active_count, partial_count, partial_offset, partial_layout, partials_buf, pt_off, pt_buf(rw), params
    m.ptInitCopyLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    //   pt-build: bin_offsets, active_count, pt_off(rw), pt_count(rw), pt_tasks(rw), pt_total_tasks(rw)
    m.ptBuildLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'storage']);
    //   pt-dispatch-chain: pt_total_tasks(ro), pt_combine_args(rw), pt_build_args(rw), pt_hot_args(ro)
    m.ptDispatchChainLayout = lt(['read-only-storage', 'storage', 'storage', 'read-only-storage']);
    //   pt-combine: pt_tasks, pt_total_tasks, pt_buf(rw), params
    m.ptCombineLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    //   pt-finalize: sorted_active, bin_offsets, active_count, pt_off, pt_buf, bucket_sums(rw), params
    m.ptFinalizeLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'storage', 'uniform']);
    // --- Pipelines (data-independent: shape is fixed by c / S / WGI for
    // every shader except planner-b's PAIR_CAP, which we pin to the pool
    // via `pool.pairCap = ceil(srsN/2) + 16`. The shader's PAIR_CAP loop
    // is `break`-bounded so an over-bounded cap is free; pinning it to
    // the pool makes the emit shader source pool-invariant and lets the
    // cache reuse it across every n the pool serves. Every compileOne()
    // here routes through `pool.cache.getPipeline()` keyed on the WGSL
    // source; identical sources collapse to one compile per pool. ---
    const compile = (code: string, label: string, layout: GPUBindGroupLayout) =>
      pool.cache.getPipeline(code, layout, label);
    m.decomposePipe = await compile(sm.gen_decompose_scalars_booth_shader(WGI), `decompose`, m.decomposeLayout);
    // Tiled counting-sort transpose: count + scatter dispatch across point-
    // chunks (not just windows) so the GPU stays saturated; reduce folds the
    // per-chunk partials; scan is the unchanged per-window prefix sum. Only
    // on-chip shared atomics — no contended global atomics. tile is the
    // shared histogram/cursor capacity (<= 8192 entries = 32KB).
    m.xposeCountPipe = await compile(
      sm.gen_transpose_count_tiled_shader(256, Math.min(m.BW, 8192)),
      `xpose-count`,
      m.xposeCountLayout,
    );
    m.xposeReducePipe = await compile(sm.gen_transpose_reduce_tiled_shader(256), `xpose-reduce`, m.xposeReduceLayout);
    m.xposeScanPipe = await compile(sm.gen_transpose_scan_shader(m.numWindows), `xpose-scan`, m.xposeScanLayout);
    m.xposeScatterPipe = await compile(
      sm.gen_transpose_scatter_tiled_shader(256, Math.min(m.BW, 8192)),
      `xpose-scatter`,
      m.xposeScatterLayout,
    );
    m.convActivePipe = await compile(
      sm.gen_csr_to_v2_active_sums_shader(WGI, true, true),
      `csr2v2-active`,
      m.convActiveLayout,
    );
    m.convMetaPipe = await compile(sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta`, m.convMetaLayout);
    // Phase 5: ONE reduction pipeline drives every schedule level. The
    // `kind` (0 suffix / 1 tree / 2 double) lives in lparams.w — uniform
    // across the workgroup, so the compiler specialises per-dispatch with
    // no SIMT divergence. Replaces the three kind-specialised pipelines.
    m.reduceLevelPipes[0] = await compile(
      sm.gen_ba_reduce_level_bench_shader(REDUCE_WG, INV_VARIANT),
      `reduce-level`,
      m.reduceLevelLayout,
    );

    // --- Streaming planner + accumulator pipelines ---
    // All walker dispatch geometry derives from constants in ba_stream_plan.ts.
    // Do not introduce literals for the cap, the planner TPB, or NUM_THREADS
    // here — change them at the source so every kernel and buffer stays
    // consistent. STREAM_NUM_THREADS = MAX_STREAM_WORKGROUPS * STREAM_PLANNER_TPB.
    const STREAM_T = STREAM_NUM_THREADS;
    const STREAM_S = STREAM_S_PLAN;
    const RADIX_TILE = 2048;
    m.streamNumThreads = STREAM_T;
    m.streamS = STREAM_S;
    m.numRadixTiles = Math.ceil(m.bTotal / RADIX_TILE);
    const qHeaderLen = 2 * STREAM_T;
    m.classifyPipe = await compile(
      sm.gen_ba_planner_classify_shader(256, m.bTotal, m.BW, m.stride), `classify`, m.classifyLayout);
    m.metaFixupPipe = await compile(
      sm.gen_ba_planner_meta_fixup_shader(), `meta-fixup`, m.metaFixupLayout);
    m.radixCountPipe = await compile(
      sm.gen_ba_planner_radix_count_shader(RADIX_TILE), `radix-count`, m.radixCountLayout);
    m.radixScanPipe = await compile(
      sm.gen_ba_planner_radix_scan_shader(), `radix-scan`, m.radixScanLayout);
    m.radixScatterPipe = await compile(
      sm.gen_ba_planner_radix_scatter_shader(RADIX_TILE), `radix-scatter`, m.radixScatterLayout);
    m.cumsumPipe = await compile(
      sm.gen_ba_planner_cumsum_shader(STREAM_T, STREAM_S, 1, MAX_STREAM_WORKGROUPS, STREAM_PLANNER_TPB),
      `cumsum`, m.cumsumLayout);
    m.partitionWgPipe = await compile(
      sm.gen_ba_planner_partition_wg_shader(MAX_STREAM_WORKGROUPS), `partition-wg`, m.partitionWgLayout);
    m.partitionThreadPipe = await compile(
      sm.gen_ba_planner_partition_thread_shader(STREAM_PLANNER_TPB), `partition-thread`, m.partitionThreadLayout);
    m.size1Pipe = await compile(
      sm.gen_ba_size1_shader(m.BW, m.stride, m.redM), `size1`, m.size1Layout);
    // Stream-walker (Plan §6 + C's KNOB 2 variant). STREAM_WALKER_TPB per
    // KNOB 1 (16 KB pref_scratch fits Mali Bifrost at TPB=64). NUM_THREADS =
    // nwg * STREAM_PLANNER_TPB (partition_thread's grain); the walker
    // dispatches ceil(num_active/STREAM_WALKER_TPB) workgroups via
    // planner_meta[15..17] written by partition_task.
    m.partitionTaskPipe = await compile(
      sm.gen_ba_planner_partition_task_shader(STREAM_WALKER_TPB, STREAM_S, STREAM_PLANNER_TPB),
      `partition-task`, m.partitionTaskLayout);
    m.streamWalkerPipe = await compile(
      sm.gen_ba_stream_walker_shader(STREAM_WALKER_TPB, STREAM_S, m.BW, m.stride, m.redM, INV_VARIANT),
      `stream-walker`, m.streamWalkerLayout);
    // === Optimal walker_combine pipeline. ===
    m.combineCountPipe = await compile(
      sm.gen_ba_walker_combine_count_shader(256),
      `combine-count`, m.combineCountLayout);
    m.combineScanPipe = await compile(
      sm.gen_ba_walker_combine_scan_shader(256),
      `combine-scan`, m.combineScanLayout);
    m.combineScatterPipe = await compile(
      sm.gen_ba_walker_combine_scatter_shader(256),
      `combine-scatter`, m.combineScatterLayout);
    m.combineFilterPipe = await compile(
      sm.gen_ba_walker_combine_filter_shader(256, m.BW, m.stride, m.redM),
      `combine-filter`, m.combineFilterLayout);
    m.combineBatchedPipe = await compile(
      sm.gen_ba_walker_combine_batched_shader(STREAM_WALKER_TPB, STREAM_S, m.BW, m.stride, m.redM, INV_VARIANT),
      `combine-batched`, m.combineBatchedLayout);
    m.sortCountPipe = await compile(
      sm.gen_ba_walker_combine_sort_count_shader(256),
      `sort-count`, m.sortCountLayout);
    m.sortScanPipe = await compile(
      sm.gen_ba_walker_combine_sort_scan_shader(),
      `sort-scan`, m.sortScanLayout);
    m.sortScatterPipe = await compile(
      sm.gen_ba_walker_combine_sort_scatter_shader(256),
      `sort-scatter`, m.sortScatterLayout);
    m.ptInitScanPipe = await compile(
      sm.gen_ba_walker_pt_init_scan_shader(),
      `pt-init-scan`, m.ptInitScanLayout);
    // TPB = 64. With indirect dispatch from sort-scan's NUM_HOT-based args,
    // pt_init_copy/build/finalize launch ceil(NUM_HOT/64) WGs — no idle
    // workgroups. pt_combine launches ceil(total_tasks/S/64) per level.
    m.ptInitCopyPipe = await compile(
      sm.gen_ba_walker_pt_init_copy_shader(64),
      `pt-init-copy`, m.ptInitCopyLayout);
    m.ptBuildPipe = await compile(
      sm.gen_ba_walker_pt_build_shader(64),
      `pt-build`, m.ptBuildLayout);
    m.ptDispatchChainPipe = await compile(
      sm.gen_ba_walker_pt_dispatch_chain_shader(),
      `pt-dispatch-chain`, m.ptDispatchChainLayout);
    m.ptCombinePipe = await compile(
      sm.gen_ba_unified_combine_shader(64, STREAM_S, INV_VARIANT),
      `pt-combine`, m.ptCombineLayout);
    m.ptFinalizePipe = await compile(
      sm.gen_ba_walker_pt_finalize_shader(64, m.BW, m.stride, m.redM),
      `pt-finalize`, m.ptFinalizeLayout);
    // Warm-up: prepare + dispatch a few times so the first timed run pays no
    // shader JIT / command-buffer cold start and sees ramped GPU clocks. The
    // bridge passes warmupRuns: 0 — production wants the first MSM to be real
    // work.
    const warmupRuns = config?.warmupRuns ?? 5;
    if (warmupRuns > 0) {
      try {
        // Warm-up scalars: a deterministic pseudo-random spread. They must
        // not be all-identical — identical scalars collapse every window sum
        // onto the one-dimensional subgroup ⟨Σ Pᵢ⟩, where hostWindowCombine's
        // incomplete Jacobian addition hits a collision / the point at
        // infinity and throws "value is not invertible". A varied spread
        // keeps the combine generic, matching a real MSM's input.
        const dummy = new Uint8Array(n * 32);
        let rng = 0x9e3779b9 >>> 0;
        for (let i = 0; i < dummy.length; i += 4) {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
          dummy[i] = rng & 0xff;
          dummy[i + 1] = (rng >>> 8) & 0xff;
          dummy[i + 2] = (rng >>> 16) & 0xff;
          dummy[i + 3] = (rng >>> 24) & 0xff;
        }
        // Keep each 32-byte scalar's top byte below the Fr modulus's leading
        // byte (0x30) so every warm-up scalar is a valid field element.
        for (let k = 0; k < n; k++) {
          dummy[k * 32 + 31] &= 0x1f;
        }
        m.prepare(dummy);
        for (let w = 0; w < warmupRuns; w++) await m.run();
      } catch (e) {
        console.warn(`[MsmV2] warm-up run threw (ignored): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return m;
  }

  /**
   * Plan every level for `scalarsBuf` (`n × 32` LE non-Montgomery Fr) and
   * (re)build the data-dependent buffers + bind groups. Untimed setup;
   * cached by `scalarsBuf` identity, so the benchmark's repeated reps over
   * one input pay this once.
   *
   * `srsOffset` is the point-index offset into the bound pool — every L0
   * point lookup is shifted by it, so a single MsmV2 instance can serve
   * commits whose `start_index` differs. Defaults to 0 for callers that
   * bind a pool already aligned to their MSM (the dev page) — that path
   * stays byte-identical to the no-offset behavior.
   */
  prepare(scalarsBuf: Uint8Array, srsOffset: number = 0): void {
    // Cache key includes srsOffset so a re-prepare with same scalars but
    // different offset rewrites the uniform.
    if (this.preparedFor === scalarsBuf && this.preparedSrsOffset === srsOffset) return;

    const device = this.device;
    const n = this.n;
    const c = this.c;
    const NUM_WINDOWS = this.numWindows;
    const BW = this.BW;
    const B_TOTAL = this.bTotal;
    const R = this.R;
    const { s: S, wgi: WGI, reduceWg: REDUCE_WG } = this;

    // --- Host: scalars (canonical) -> 8×u32 + Booth-decode -> level-0 counts.
    // The Booth decompose + per-level planLevel walk is cheap (~1 ms for
    // n=88_899). We run it on every prepare to compute dispatch sizes, then
    // either reuse the existing GPU buffers (fast path) or rebuild.
    // Reinterpret the LE byte buffer as a packed u32 array — same data, no
    // copy and no per-scalar BigInt construction. Browsers guarantee
    // little-endian byte order in TypedArray views, so byte [0..4) reads back
    // as u32[0]. The byteOffset is always 4-byte aligned for the
    // wasmSliceCopy/Booth buffers we ever pass here (Uint8Array.slice and
    // ArrayBuffer allocations land on 8-byte boundaries), but fall back to a
    // memcpy if some caller hands us a misaligned view.
    let scalars: Uint32Array;
    if (scalarsBuf.byteOffset % 4 === 0) {
      scalars = new Uint32Array(scalarsBuf.buffer, scalarsBuf.byteOffset, n * 8);
    } else {
      scalars = new Uint32Array(n * 8);
      new Uint8Array(scalars.buffer).set(scalarsBuf);
    }
    // Level-0 histogram from the raw bytes — no BigInt in the hot path.
    const initCounts = buildInitCounts(scalarsBuf, n, c, NUM_WINDOWS, BW);

    // Ping-pong two pre-allocated count buffers and fold the wstride1
    // computation into the same walk. Avoids ~18 × ~333 KB allocations per
    // prepare (>5 ms of GC churn for n=88_899) and removes the second pass
    // over `levelCounts` that wstride1 used to do.
    const levelPlans: LevelPlan[] = [];
    let wstride1 = 1;
    {
      // Two scratch arrays, indexed by inIdx = lv & 1. Level 0 reads
      // initCounts directly; subsequent levels write into and read from
      // the ping-pong slots.
      let countsCur: Uint32Array = initCounts;
      const countsAlt = new Uint32Array(B_TOTAL);
      const countsPing = new Uint32Array(B_TOTAL);
      // Slot allocation: level lv reads `countsCur` and writes `countsNext`.
      // lv=0 reads initCounts, writes countsAlt.
      // lv=1 reads countsAlt, writes countsPing.
      // lv=2 reads countsPing, writes countsAlt.
      // …
      let countsNext: Uint32Array = countsAlt;
      const swap = (): void => {
        const tmp = countsCur;
        countsCur = countsNext;
        countsNext = tmp === initCounts ? countsPing : tmp;
      };
      for (let lv = 0; lv < 64; lv++) {
        // Check active + compute next-level counts + per-window stride in
        // a single fused pass over the bucket grid.
        let anyActive = false;
        let pairBlocksPerWindow = 1;
        let carriesPerWindow = 1;
        for (let w = 0; w < NUM_WINDOWS; w++) {
          let pairs = 0;
          let carries = 0;
          let strideCnt = 0;
          const base = w * BW;
          for (let bl = 0; bl < BW; bl++) {
            const g = base + bl;
            const cnt = countsCur[g];
            if (cnt > 0) anyActive = true;
            // bucketSplit inlined: pc = floor(cnt/2), cf = (cnt===1?0:cnt&1),
            // nc = pc + cf.
            const pc = cnt >>> 1;
            const cf = cnt === 1 ? 0 : cnt & 1;
            const nc = pc + cf;
            countsNext[g] = nc;
            pairs += pc;
            carries += cf;
            strideCnt += nc;
          }
          const blocks = Math.ceil(pairs / S);
          if (blocks > pairBlocksPerWindow) pairBlocksPerWindow = blocks;
          if (carries > carriesPerWindow) carriesPerWindow = carries;
          if (strideCnt > wstride1) wstride1 = strideCnt;
        }
        if (!anyActive) break;
        levelPlans.push({ pairBlocksPerWindow, carriesPerWindow, totalPairBlocks: 0, totalCarries: 0 });
        swap();
      }
    }
    const levels = levelPlans.length;

    // --- Lever G: budget-driven window-batch count.
    const maxPairBlocksPerWindow = Math.max(1, ...levelPlans.map(p => p.pairBlocksPerWindow));
    const maxCarriesPerWindow = Math.max(1, ...levelPlans.map(p => p.carriesPerWindow));
    const RED_M = this.redM;
    const estimateMem = (nb: number): number => {
      const bw = Math.ceil(NUM_WINDOWS / nb);
      const m1 = bw * wstride1 + 3;
      const bSlots = bw * n;
      const bBuckets = bw * BW;
      const tc = bw * maxPairBlocksPerWindow;
      const tile = Math.min(Math.ceil((1 << 16) / WGI) * WGI, Math.max(WGI, Math.ceil(tc / WGI) * WGI));
      return (
        2 * 64 * m1 +
        64 * B_TOTAL +
        4 * 4 * bBuckets +
        4 * (bSlots + 3) +
        2 * (3 * tc * S + 2 * bw * maxCarriesPerWindow) * 4 +
        tile * S * 8 * 4 +
        3 * 4 * bSlots +
        4 * bw * (BW + 1) +
        4 * bBuckets +
        4 * 32 * n +
        68 * RED_M
      );
    };
    const wgFits = (nb: number): boolean => Math.ceil((Math.ceil(NUM_WINDOWS / nb) * n) / WGI) < 65000;
    let numBatches = 1;
    while (numBatches < NUM_WINDOWS && !wgFits(numBatches)) numBatches++;
    const batchWindows = Math.ceil(NUM_WINDOWS / numBatches);
    const batchBuckets = batchWindows * BW;
    const batchSlots = batchWindows * n;
    for (const p of levelPlans) {
      p.totalPairBlocks = batchWindows * p.pairBlocksPerWindow;
      p.totalCarries = batchWindows * p.carriesPerWindow;
    }
    // `let` so the slow path can apply OVERSIZE_FACTOR padding without
    // re-binding through a parallel set of names.
    let M1 = batchWindows * wstride1 + 3;
    let maxTotalPairBlocks = Math.max(...levelPlans.map(p => p.totalPairBlocks));
    let maxTotalCarries = Math.max(1, ...levelPlans.map(p => p.totalCarries));

    // Reduction: compute MAXC up-front (needed for fit-check and uniform write).
    let MAXC = 1;
    for (const p of this.reducePasses) {
      MAXC = Math.max(MAXC, Math.ceil(p.ppw / REDUCE_WG));
    }

    // --- Fast path: subsequent prepare() with a plan that fits in the
    // already-allocated buffers + bind groups. Skips the destroy+realloc of
    // ~40 GPU buffers (the dominant per-MSM cost on M4 Pro; ~150 ms each).
    // Only rewrites the data-dependent uniforms in place. Also requires
    // that the pool's shared scratch hasn't grown since we last bound to
    // it — if it has, our bind groups reference dead buffers and we MUST
    // rebuild them.
    const fits =
      this.preparedFor !== null &&
      this.capM1 > 0 &&
      M1 <= this.capM1 &&
      maxTotalPairBlocks <= this.capTotalPairBlocks &&
      maxTotalCarries <= this.capTotalCarries &&
      levels <= this.capLevels &&
      numBatches === this.capNumBatches &&
      MAXC <= this.capMAXC &&
      this.boundEpoch === this.pool.scratchEpoch;
    if (fits) {
      this.fastPathRewrite(scalars, srsOffset, levelPlans, levels);
      this.preparedFor = scalarsBuf;
      this.preparedSrsOffset = srsOffset;
      return;
    }

    // --- Slow path: first prepare on this instance, OR new plan exceeds
    // the cached caps. Destroy everything and rebuild.
    //
    // OVERSIZE_FACTOR pads buffers so subsequent prepares with slightly
    // different scalar distributions (yielding slightly different per-
    // bucket pair/carry counts → different M1/totalPairBlocks/totalCarries) stay on
    // the fast path. Without padding the fits-check rejects ~30% of
    // follow-up prepares — see [phase] traces showing alternating 9 ms /
    // 80 ms prepares for the same n. Padding by 30% leaves room for
    // typical scalar-distribution variance without growing buffers so
    // much that the planner pays for indexing empty slots.
    //
    // wstride1 is the per-window stride the planner uses to index
    // buckets. Padding it spreads buckets further apart in memory;
    // intervening slots stay zero (no-op for level shaders). M1 is
    // derived from the padded wstride1 so pad-trio indices (M1-3/-2/-1)
    // sit at the tail of the padded region and stay consistent across
    // all fast-path runs against this instance.
    const OVERSIZE_FACTOR = 1.3;
    wstride1 = Math.ceil(wstride1 * OVERSIZE_FACTOR);
    M1 = batchWindows * wstride1 + 3;
    maxTotalPairBlocks = Math.ceil(maxTotalPairBlocks * OVERSIZE_FACTOR);
    maxTotalCarries = Math.ceil(maxTotalCarries * OVERSIZE_FACTOR);
    for (const b of this.prepBuffers) b.destroy();
    this.prepBuffers = [];
    this.levelBinds = [];
    this.levels = levels;
    this.numBatches = numBatches;
    this.batchWindows = batchWindows;
    this.capM1 = M1;
    this.capTotalPairBlocks = maxTotalPairBlocks;
    this.capTotalCarries = maxTotalCarries;
    this.capLevels = levels;
    this.capNumBatches = numBatches;
    this.capMAXC = MAXC;

    // Only uniform buffers are per-instance now — the big storage buffers
    // live in `pool.scratch` and are shared across every MsmV2 bound to
    // this pool. `prepBuffers` tracks only the uniforms we own and must
    // destroy in destroy(); ensureScratch's buffers belong to the pool.
    const ubuf = (data: Uint32Array): GPUBuffer => {
      const b = device.createBuffer({
        size: Math.max(16, Math.ceil(data.byteLength / 16) * 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(b, 0, data as BufferSource);
      this.prepBuffers.push(b);
      return b;
    };
    const mkBind = (layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup =>
      device.createBindGroup({
        layout,
        entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
      });

    const l0Slots = batchSlots + 3;
    const WSTRIDE = n;

    // Tiled-transpose geometry: split each window's n points into
    // `transposeNumPointTiles` tiles of ~`pointsPerTile` each so the
    // count/scatter dispatch saturates the GPU instead of running one
    // workgroup per window. The tile count is capped at floor(n/BW) so the
    // partials matrix (transposeNumPointTiles*BW per window) is <= batchSlots
    // and fits the borrowed l0IdxBuf buffer.
    const transposeNumPointTiles = Math.max(1, Math.floor(n / BW));
    const pointsPerTile = Math.ceil(n / transposeNumPointTiles);
    const partialStride = transposeNumPointTiles * BW;
    if (l0Slots < batchWindows * partialStride) {
      throw new Error(
        `tiled transpose: l0IdxBuf (${l0Slots}) too small for the ` +
          `partials matrix (${batchWindows * partialStride})`,
      );
    }
    this.transposeNumPointTiles = transposeNumPointTiles;

    const FUSED_TILE = Math.min(
      Math.ceil((1 << 16) / WGI) * WGI,
      Math.max(WGI, Math.ceil(this.capTotalPairBlocks / WGI) * WGI),
    );
    this.fusedTileSize = FUSED_TILE;

    // Ask the pool to grow its shared scratch to fit this MSM's plan. Most
    // prepares hit no growth (after the first MSM saturates max-N); growth
    // bumps pool.scratchEpoch and our cached `boundEpoch` becomes stale.
    const scratch = this.pool.ensureScratch(
      {
        M1,
        batchSlots,
        batchBuckets,
        numWindows: NUM_WINDOWS,
        BW,
        l0Slots,
        rowPtrLen: batchWindows * (BW + 1),
        planMetaLen: 3 * NUM_WINDOWS + 6,
        totalPairBlocks: maxTotalPairBlocks,
        totalCarries: maxTotalCarries,
        fusedTile: FUSED_TILE,
        S,
        scalarsBytes: scalars.byteLength,
        redM: RED_M,
        reducePrefBytes: NUM_WINDOWS * REDUCE_WG * this.capMAXC * 2 * 16,
        bTotal: B_TOTAL,
        streamNumThreads: this.streamNumThreads,
        streamS: this.streamS,
        streamQueueEntries: B_TOTAL + this.streamNumThreads * (2 * this.streamS - 1),
        streamRadixTiles: this.numRadixTiles,
      },
      this.padPts,
      R,
    );
    this.boundEpoch = this.pool.scratchEpoch;

    // Pad-trio layout from pool. Pool re-wrote the pad bytes into bufA/B if
    // it grew them; otherwise we inherit pad bytes from the previous owner.
    // Either way, the per-run reset's clearBuffer ranges avoid these slots.
    this.planeBytes = scratch.planeBytes;
    this.padBytesPerPlane = scratch.padBytesPerPlane;
    this.padXOffset = scratch.padXOffset;
    this.padYOffset = scratch.padYOffset;

    // Local aliases so the per-level / per-tile bind-group setup below
    // reads the same identifiers it always has. Each is a reference to
    // pool.scratch.X — destroyed and re-created by the pool, not by us.
    const bufA = scratch.bufA;
    const bufB = scratch.bufB;
    this.bufA = bufA;
    this.bufB = bufB;
    const l0IdxBuf = scratch.l0IdxBuf;
    // L0 seed pad-trio — three index slots at [batchSlots, batchSlots+1,
    // batchSlots+2] that l0-mode shaders use as a "self-pad anchor". The
    // pool's ensureScratch sizes l0IdxBuf to fit l0Slots = batchSlots+3
    // but doesn't initialize these slots (varies per N), so we write them
    // here at the per-prepare batchSlots offset.
    device.queue.writeBuffer(l0IdxBuf, batchSlots * 4, new Uint32Array([0, 1, 2]));
    const countsBufs = scratch.countsBufs;
    const offsetsBufs = scratch.offsetsBufs;
    const planMeta = scratch.planMeta;
    const pairBlockPlanRing = scratch.pairBlockPlanRing;
    const scatterPlanRing = scratch.scatterPlanRing;
    const carryPlanRing = scratch.carryPlanRing;
    const prefScratchBuf = scratch.prefScratchBuf;
    const scalarsRawBuf = scratch.scalarsRawBuf;
    device.queue.writeBuffer(scalarsRawBuf, 0, scalars as BufferSource);
    this.scalarsRawBuf = scalarsRawBuf;
    const bucketAndSignBuf = scratch.bucketAndSignBuf;
    const rowPtrBuf = scratch.rowPtrBuf;
    const valIdxBuf = scratch.valIdxBuf;
    // ALL active-sums indices must reference the POOL's M1, not this MSM's.
    // The pool's bufA/bufB are sized to its max-M1 (across all MSMs that
    // have ever bound to it), and the pad-trio sits at [poolM1-3, poolM1-2,
    // poolM1-1]. This MSM's planner writes into [0, batchWindows*wstride1)
    // which is always < poolM1, so the pad slots don't get clobbered.
    const poolM1 = scratch.poolM1;
    const padParams0Buf = ubuf(new Uint32Array([batchSlots, batchSlots + 1, poolM1 - 1, 0]));
    const padParams1Buf = ubuf(new Uint32Array([poolM1 - 3, poolM1 - 2, poolM1 - 1, 0]));
    const decomposeParams = ubuf(new Uint32Array([n, batchWindows, c, 8]));
    // Uniform layout: [num_point_tiles, BW, n, points_per_tile]; consumed by
    // transpose_count_tiled, transpose_reduce_tiled (only [0] [1]),
    // transpose_scatter_tiled (all four).
    const xposeParams = ubuf(new Uint32Array([transposeNumPointTiles, BW, n, pointsPerTile]));
    // params[1] = base_offset, written per-prepare() via writeBuffer below.
    // Default 0 — non-bridge callers (the dev page) bind a per-MSM pool
    // starting at index 0 and need no offset.
    const convActiveParams = ubuf(new Uint32Array([batchSlots, 0, WSTRIDE, n]));
    this.convActiveParamsBuf = convActiveParams;
    const convMetaParams = ubuf(new Uint32Array([BW, batchBuckets, n, 0]));
    const batchWindowBaseBufs: GPUBuffer[] = [];
    for (let bi = 0; bi < numBatches; bi++) {
      batchWindowBaseBufs.push(ubuf(new Uint32Array([bi * batchWindows, 0, 0, 0])));
    }

    this.decomposeBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.decomposeLayout, [scalarsRawBuf, bucketAndSignBuf, decomposeParams, bwb]),
    );
    // The transpose borrows l0IdxBuf as the per-chunk partials matrix. Its
    // [0, batchSlots) region is dormant until convActive (which runs strictly
    // after the transpose, per batch) overwrites it; the level-0 seed trio
    // sits above batchSlots and is never touched by the partials region.
    const partialsBuf = l0IdxBuf;
    this.xposeCountBind = mkBind(this.xposeCountLayout, [bucketAndSignBuf, partialsBuf, xposeParams]);
    this.xposeReduceBind = mkBind(this.xposeReduceLayout, [partialsBuf, rowPtrBuf, xposeParams]);
    this.xposeScanBind = mkBind(this.xposeScanLayout, [rowPtrBuf, xposeParams]);
    this.xposeScatterBind = mkBind(this.xposeScatterLayout, [
      bucketAndSignBuf,
      rowPtrBuf,
      partialsBuf,
      valIdxBuf,
      xposeParams,
    ]);
    this.convActiveBind = mkBind(this.convActiveLayout, [valIdxBuf, l0IdxBuf, convActiveParams, bucketAndSignBuf]);
    this.convMetaBind = mkBind(this.convMetaLayout, [rowPtrBuf, countsBufs[0], offsetsBufs[0], convMetaParams]);
    this.rowPtrBuf = rowPtrBuf;
    this.nXposePts = Math.ceil(n / WGI);
    this.nConvMeta = Math.ceil(batchBuckets / WGI);

    // --- Reduction ---
    // MAXC was already computed above (needed for the fits-check) and saved
    // into capMAXC; the schedule is purely a function of reducePasses so it's
    // also instance-invariant.
    const schedule = new Uint32Array(64 * 4);
    this.reducePasses.forEach((p, i) => {
      const kind = p.isDouble ? 2 : p.shaderPhase === 0 ? 0 : 1;
      const a = !p.isDouble && p.shaderPhase !== 0 ? p.p2y : p.p2x;
      const b = !p.isDouble && p.shaderPhase === 0 ? p.p2y : 0;
      schedule[i * 4 + 0] = kind;
      schedule[i * 4 + 1] = a;
      schedule[i * 4 + 2] = b;
      schedule[i * 4 + 3] = p.ppw;
    });
    const redBuf = scratch.redBuf;
    const isPresentBuf = scratch.isPresentBuf;
    const reducePrefScratch = scratch.reducePrefScratch;
    // Phase 5: lparams now carries the kind as the 4th slot so the unified
    // reduce kernel can branch on it at runtime. cparams are level-invariant.
    const cparams = ubuf(new Uint32Array([RED_M, this.capMAXC, this.stride, 0]));
    this.reduceLevelBinds = this.reducePasses.map((_, i) => {
      const lparams = ubuf(new Uint32Array([
        schedule[i * 4 + 1], // pa
        schedule[i * 4 + 2], // pb
        schedule[i * 4 + 3], // ppw
        schedule[i * 4 + 0], // kind (was 0/unused before Phase 5)
      ]));
      return mkBind(this.reduceLevelLayout, [redBuf, isPresentBuf, reducePrefScratch, cparams, lparams]);
    });
    this.redBuf = redBuf;

    // --- Streaming planner + accumulator bind groups ---
    {
      const sp = scratch.streamPlannerMeta;
      const s1 = scratch.size1BucketList;
      const db = scratch.denseBucketList;
      const dc = scratch.denseCountList;
      const sb = scratch.sortedBucketList;
      const sc = scratch.sortedCountList;
      const rh = scratch.radixHist;
      const ca = scratch.cumulativeAdds;
      const wc = scratch.wgCuts;
      const tc = scratch.threadCuts;
      const qb = scratch.queueBuf;
      const pb = scratch.partialsBuf;
      const pbl = scratch.partialBucketsList;
      const ab = scratch.accBuf;
      const sps = scratch.streamPrefScratch;
      const classifyParams = ubuf(new Uint32Array([B_TOTAL, 0, 0, 0]));
      this.classifyBind = mkBind(this.classifyLayout, [countsBufs[0], offsetsBufs[0], s1, db, dc, sp, classifyParams]);
      this.metaFixupBind = mkBind(this.metaFixupLayout, [sp]);
      const radixParams = [
        ubuf(new Uint32Array([0, 0, 0, 0])),
        ubuf(new Uint32Array([1, 0, 0, 0])),
        ubuf(new Uint32Array([2, 0, 0, 0])),
      ];
      this.radixCountBinds = [
        mkBind(this.radixCountLayout, [dc, rh, sp, radixParams[0]]),
        mkBind(this.radixCountLayout, [sc, rh, sp, radixParams[1]]),
        mkBind(this.radixCountLayout, [dc, rh, sp, radixParams[2]]),
      ];
      const scanParams = ubuf(new Uint32Array([this.numRadixTiles, 0, 0, 0]));
      this.radixScanBind = mkBind(this.radixScanLayout, [rh, sp, scanParams]);
      this.radixScatterBinds = [
        mkBind(this.radixScatterLayout, [db, dc, rh, sb, sc, sp, radixParams[0]]),
        mkBind(this.radixScatterLayout, [sb, sc, rh, db, dc, sp, radixParams[1]]),
        mkBind(this.radixScatterLayout, [db, dc, rh, sb, sc, sp, radixParams[2]]),
      ];
      const cumsumParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.cumsumBind = mkBind(this.cumsumLayout, [sc, ca, sp, cumsumParams]);
      const pwgParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionWgBind = mkBind(this.partitionWgLayout, [sc, ca, sp, wc, pwgParams]);
      const ptParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionThreadBind = mkBind(this.partitionThreadLayout, [sc, ca, wc, sp, tc, ptParams]);
      const size1Params = ubuf(new Uint32Array([B_TOTAL, 0, 0, 0]));
      this.size1Bind = mkBind(this.size1Layout, [s1, l0IdxBuf, this.pointXBuf, this.pointYBuf, scratch.redBuf, sp, size1Params, scratch.isPresentBuf]);
      // Stream-walker bind groups (Plan §6 + C's KNOB 2 variant).
      const taskc = scratch.taskCuts;
      const wp = scratch.walkerPartials;
      const pdest = scratch.walkerPartialDest;
      const ptaskParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionTaskBind = mkBind(this.partitionTaskLayout, [sc, ca, tc, sp, taskc, ptaskParams]);
      // Walker params: (NUM_THREADS, IDLE_ANCHOR, M_buckets, M_partials).
      const M_partials_walker = 2 * this.streamNumThreads * this.streamS;
      const walkerParams = ubuf(new Uint32Array([this.streamNumThreads, batchSlots, B_TOTAL, M_partials_walker]));
      this.streamWalkerBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.streamWalkerLayout, [
          sb, sc, offsetsBufs[0], taskc, l0IdxBuf, this.pointXBuf, this.pointYBuf,
          scratch.redBuf, wp, pdest, walkerParams, bwb,
        ]),
      );
      // Walker partials indexer (Task #19): one thread per partial slot,
      // builds the per-bucket linked-list head/nodes that walker_combine
      // walks. params.x = num_partial_slots, params.y = max_nodes
      // (overflow guard — same as the array size).
      const bh = scratch.bucketHead;
      const wns = scratch.walkerNodesSlot;
      const wnn = scratch.walkerNodesNext;
      const wnc = scratch.walkerNodeCounter;
      const numPartialSlots = M_partials_walker;
      const idxParams = ubuf(new Uint32Array([numPartialSlots, numPartialSlots, 0, 0]));
      // === Optimal walker_combine bind groups. ===
      const pcount = scratch.partialCount;
      const poffset = scratch.partialOffset;
      const pwpos = scratch.partialWritePos;
      const playout = scratch.partialLayout;
      const abkts = scratch.activeBuckets;
      const acnt = scratch.activeCount;
      // count: params.x = num_partial_slots = M_partials_walker.
      const countParams = ubuf(new Uint32Array([numPartialSlots, 0, 0, 0]));
      this.combineCountBind = mkBind(this.combineCountLayout, [pdest, pcount, countParams]);
      // scan: params.x = num_dense (read from planner_meta at dispatch time? we use B_TOTAL as upper bound)
      const combineScanParams = ubuf(new Uint32Array([B_TOTAL, 0, 0, 0]));
      this.combineScanBind = mkBind(this.combineScanLayout, [pcount, poffset, combineScanParams]);
      // scatter: params.x = num_partial_slots
      this.combineScatterBind = mkBind(this.combineScatterLayout, [pdest, poffset, pwpos, playout, countParams]);
      // filter: params = (num_dense, M_buckets, M_partials, _)
      const filterParams = ubuf(new Uint32Array([B_TOTAL, batchSlots, M_partials_walker, 0]));
      this.combineFilterBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.combineFilterLayout, [sb, pcount, poffset, playout, wp, scratch.redBuf, abkts, acnt, filterParams, scratch.streamPlannerMeta, scratch.isPresentBuf, bwb]),
      );
      // batched: params = (NUM_ACTIVE — dynamic, set at runtime, IDLE_ANCHOR, M_buckets, M_partials)
      // For now, we'll use 0 for NUM_ACTIVE here and update before dispatch (or dispatch ceil(B_TOTAL/S) and gate internally).
      // Walker params include IDLE_ANCHOR at param.y of the walker uniform — reuse the same value (batchSlots).
      // Counting-sort prepass binds. Reads active_buckets/active_count from
      // filter's output; writes sorted_active_buckets which combine_batched
      // reads at binding 0 (in place of the unsorted active_buckets).
      const chist = scratch.countHistogram;
      const boffs = scratch.binOffsets;
      const bwpos = scratch.binWritePos;
      const sabkts = scratch.sortedActiveBuckets;
      this.sortCountBind = mkBind(this.sortCountLayout, [abkts, acnt, pcount, chist]);
      this.sortScanBind = mkBind(this.sortScanLayout, [chist, boffs, bwpos, scratch.ptDispatchArgs, scratch.ptPersistentDispatchArgs, scratch.cbDispatchArgs]);
      this.sortScatterBind = mkBind(this.sortScatterLayout, [abkts, acnt, pcount, boffs, bwpos, sabkts]);
      // Pair-tree: handles hot buckets (N > HOT_THRESHOLD=8). Reads sorted
      // active list + bin_offsets to locate the hot tail; allocates scratch
      // slices via atomicAdd on pt_alloc; writes directly to bucket_sums.
      //   params.x = M_partials, .y = M_buckets, .z = M_scratch, .w = HOT_THRESHOLD
      // === Pair-tree v2 (multi-dispatch). pt_buf reuses ptScratch (32 MB
      // after the bump to 4× M_partials_walker). M_pt is the plane stride
      // for pt_buf; must equal exactly the per-plane slot capacity.
      //   ptScratch bytes  = 512 * sT * sS = 512 * T * S
      //   slots/plane      = bytes / (2 planes × PG × sizeof(vec4))
      //                    = bytes / 64
      //                    = 8 * T * S = 4 * M_partials_walker
      const M_pt = 4 * M_partials_walker;
      const ptBuf = scratch.ptScratch;
      const ptOffBuf = scratch.ptOff;
      const ptCountBuf = scratch.ptCount;
      const ptMetaBuf = scratch.ptMeta;
      const ptTasksBuf = scratch.ptTasks;
      const ptTotalBuf = scratch.ptTotalTasks;
      const ptDispatchBuf = scratch.ptDispatchArgs;
      // pt_init_copy params: (M_partials, M_pt)
      const ptInitCopyParams = ubuf(new Uint32Array([M_partials_walker, M_pt, 0, 0]));
      // pt_combine params: (M_pt)
      const ptCombineParams = ubuf(new Uint32Array([M_pt, 0, 0, 0]));
      // pt_finalize params: (M_pt, M_buckets=B_TOTAL)
      const ptFinalizeParams = ubuf(new Uint32Array([M_pt, B_TOTAL, 0, 0]));

      this.ptInitScanBind = mkBind(this.ptInitScanLayout, [sabkts, boffs, acnt, pcount, ptOffBuf, ptCountBuf, ptMetaBuf]);
      this.ptInitCopyBind = mkBind(this.ptInitCopyLayout, [sabkts, boffs, acnt, pcount, poffset, playout, wp, ptOffBuf, ptBuf, ptInitCopyParams]);
      this.ptBuildBind = mkBind(this.ptBuildLayout, [boffs, acnt, ptOffBuf, ptCountBuf, ptTasksBuf, ptTotalBuf]);
      // chain dispatch reads previous level's total and the hot_wgs source,
      // writes combine + build args. Build's level-loop indirect dispatch
      // turns into a no-op once total hits zero, so dead late levels cost
      // ~1 µs (dispatch_compute alone) instead of ~150 µs.
      this.ptDispatchChainBind = mkBind(this.ptDispatchChainLayout, [ptTotalBuf, scratch.ptCombineDispatchArgs, scratch.ptBuildLoopArgs, scratch.ptDispatchArgs]);
      this.ptCombineBind = mkBind(this.ptCombineLayout, [ptTasksBuf, ptTotalBuf, ptBuf, ptCombineParams]);
      this.ptFinalizeBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.ptFinalizeLayout, [sabkts, boffs, acnt, ptOffBuf, ptBuf, scratch.redBuf, ptFinalizeParams, scratch.isPresentBuf, bwb]),
      );
      // combine_batched now reads sorted_active_buckets at binding 0 → zero
      // tail divergence per S=8 thread group.
      this.combineBatchedBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.combineBatchedLayout, [sabkts, acnt, pcount, poffset, playout, l0IdxBuf, this.pointXBuf, this.pointYBuf, wp, scratch.redBuf, walkerParams, bwb]),
      );
    }

    this.redStaging = device.createBuffer({
      size: NUM_WINDOWS * 64,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.prepBuffers.push(this.redStaging);
    this.nReduceInit = Math.ceil(RED_M / WGI);

    // --- Per-level bind groups ---
    const finalizeParamsBufs: GPUBuffer[] = [];
    for (let bi = 0; bi < numBatches; bi++) {
      // active_sums element stride is poolM1, not this MSM's M1 (the
      // buffer is sized to the pool's max; see padParams comment above).
      finalizeParamsBufs.push(ubuf(new Uint32Array([batchBuckets, poolM1, bi * batchBuckets, B_TOTAL])));
    }
    // --- Profiling: (re)create the timestamp query set, sized to the pass
    // count of the run() this prepare() set up. ---
    this.querySet?.destroy();
    this.querySet = null;
    this.tsResolveBuf = null;
    this.tsStagingBuf = null;
    if (this.profile) {
      let passes = 0;
      for (let bi = 0; bi < numBatches; bi++) {
        // 7 preprocess + 16 planner + 3 walker (size1+stream_walker+walker_index marker)
        // + 5 combine kernels (count, scan, scatter, filter, batched)
        // + 3 counting-sort prepass kernels (sort_count, sort_scan, sort_scatter)
        // + pair-tree multi-dispatch: 2 (init) + 17 × 3 (build + dispatch + combine) + 1 (finalize) = 54
        passes += 7 + 16 + 3 + 3 + 3 + (2 + 17 * 3 + 1);
      }
      passes += 1 + this.reducePasses.length;
      this.passCount = passes;
      this.querySet = device.createQuerySet({ type: 'timestamp', count: passes * 2 });
      this.tsResolveBuf = device.createBuffer({
        size: passes * 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.tsStagingBuf = device.createBuffer({
        size: passes * 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      this.prepBuffers.push(this.tsResolveBuf, this.tsStagingBuf);
    }

    // Write the per-prepare base_offset into the conv-active uniform at
    // params[1]. The other three fields ([total_slots, _, wstride, input_size])
    // were initialized in create() and are MSM-instance-invariant; only the
    // offset varies per call. 4-byte write at offset 4 in the buffer.
    this.device.queue.writeBuffer(this.convActiveParamsBuf, 4, new Uint32Array([srsOffset]));

    this.preparedFor = scalarsBuf;
    this.preparedSrsOffset = srsOffset;
  }

  /**
   * Fast path: the new plan's data-dependent sizes are all bounded by the
   * caps recorded on the first prepare for this instance, so we keep every
   * GPU buffer and bind group alive and only:
   *   1. re-upload the n×32 scalar bytes into the cached scalarsRawBuf,
   *   2. rewrite the SRS base_offset slot of the conv-active uniform,
   *   3. rewrite each level's plannerParams (pairBlocksPerWindow /
   *      carriesPerWindow) + carryParams (totalCarries) + every cached
   *      tileParams (totalPairBlocks),
   *   4. update the JS-side dispatch counts (`tile.nx`, `levelBinds[lv]
   *      .nCarry`) that run() reads.
   * On the M4 Pro this collapses the per-MSM setup from ~150 ms (drives
   * ~40 createBuffer calls + dozens of createBindGroup) to ~1 ms.
   *
   * Caller has already verified `fits` (M1, maxTotalPairBlocks, maxTotalCarries,
   * levels, numBatches, MAXC all ≤ the saved caps).
   */
  private fastPathRewrite(scalars: Uint32Array, srsOffset: number, _levelPlans: LevelPlan[], _levels: number): void {
    const device = this.device;
    device.queue.writeBuffer(this.scalarsRawBuf, 0, scalars as BufferSource);
    if (srsOffset !== this.preparedSrsOffset) {
      device.queue.writeBuffer(this.convActiveParamsBuf, 4, new Uint32Array([srsOffset]));
    }
  }

  /**
   * Encode + submit the whole batched pipeline, then decode `red_buf` and
   * host-combine the windows into the affine MSM result (normal form). Must
   * be called after `prepare`. This is the timed phase. When the instance was
   * created with `profile`, the result carries a per-pass GPU breakdown;
   * otherwise `profile` is `null`.
   */
  /**
   * Number of bytes this MSM's per-window sums occupy in the dst staging
   * buffer when encoded via `encodeIntoBatch`. `numWindows × 64` (one 32-byte
   * x + 32-byte y per window).
   */
  get windowSumsByteLength(): number {
    return this.numWindows * 64;
  }

  /**
   * Encode this MSM's full pipeline (active-sums reset → decompose → transpose
   * → conv → level loop → bucket reduction → per-window result gather) into a
   * **caller-owned** encoder, writing the per-window sums to `dstStaging`
   * starting at byte `dstByteOff`. Does not submit. Used by the bridge to
   * collapse N MSMs into one `submit` + one `mapAsync` (the dominant
   * end-to-end cost — Chrome's polling latency on each `mapAsync` is the
   * single biggest per-MSM overhead).
   */
  encodeIntoBatch(
    enc: GPUCommandEncoder,
    dstStaging: GPUBuffer,
    dstByteOff: number,
    scalarsSrcBuf?: GPUBuffer,
    scalarsSrcByteOff: number = 0,
  ): void {
    if (this.preparedFor === null) throw new Error('MsmV2.encodeIntoBatch: call prepare() first');
    const { wgi: WGI } = this;
    let passIdx = 0;
    const profEnabled = this.profile && this.querySet;
    if (profEnabled) this.passPhases = [];
    let curPhase = 'misc';
    const setPhase = (p: string) => { curPhase = p; };
    const dispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, nx: number, ny = 1): void => {
      const desc: GPUComputePassDescriptor = {};
      if (profEnabled) {
        desc.timestampWrites = {
          querySet: this.querySet!,
          beginningOfPassWriteIndex: 2 * passIdx,
          endOfPassWriteIndex: 2 * passIdx + 1,
        };
        this.passPhases.push(curPhase);
        passIdx++;
      }
      const pass = enc.beginComputePass(desc);
      pass.pushDebugGroup(curPhase);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.max(1, nx), Math.max(1, ny), 1);
      pass.popDebugGroup();
      pass.end();
    };

    // Per-MSM scalars upload INTO the encoder. When two same-N MSMs share an
    // MsmV2 instance in one batched submit, prepare()'s queue-ordered
    // writeBuffer races (the second prepare's writeBuffer overwrites
    // scalarsRawBuf before submit runs). copyBufferToBuffer in the encoder
    // is order-correct: copyA → passA → copyB → passB executes sequentially
    // on the GPU, so passA reads A and passB reads B. The bridge stages all
    // batch scalars into one source buffer with one writeBuffer; each MSM's
    // encode copies its slice.
    if (scalarsSrcBuf) {
      enc.copyBufferToBuffer(scalarsSrcBuf, scalarsSrcByteOff, this.scalarsRawBuf, 0, this.n * 32);
    }

    // Stream-walker buffers (Plan §6 + C's KNOB 2 variant).
    // walkerPartialDest is cleared INSIDE the batch loop instead — see note
    // there. Cleared once here too would just be redundant.
    enc.clearBuffer(this.pool.scratch!.threadCuts);
    enc.clearBuffer(this.pool.scratch!.walkerPartials);
    enc.clearBuffer(this.pool.scratch!.taskCuts);
    // Task #19 — clear linked-list state so bucket_head=NO_NODE (0)
    // and node_counter=0 at the start of each MSM.
    enc.clearBuffer(this.pool.scratch!.bucketHead);
    enc.clearBuffer(this.pool.scratch!.walkerNodeCounter);
    // Pair-tree alloc counter — claims start from 0 each MSM (legacy v1 buf).
    enc.clearBuffer(this.pool.scratch!.ptAlloc);
    // Pair-tree v2 task counter — pt_dispatch_compute resets it each level,
    // but the very first level needs it zeroed too.
    enc.clearBuffer(this.pool.scratch!.ptTotalTasks);
    // red_buf / is_present span ALL windows globally — each batch writes its
    // own [bi*batchWindows*STRIDE, (bi+1)*batchWindows*STRIDE) slice via the
    // batch_offset uniform. Clearing once per encode (not per batch) lets
    // batches accumulate side-by-side without overwriting one another.
    enc.clearBuffer(this.pool.scratch!.redBuf);
    enc.clearBuffer(this.pool.scratch!.isPresentBuf);
    // NOTE: partialCount, partialWritePos, activeCount, countHistogram are
    // cleared INSIDE the batch loop (below) — they are all atomicAdd'd per
    // batch, so leaving them cumulative across batches makes sortScatter
    // place batch-N bids using a histogram that double-counts batch-N-1's
    // entries. The mismatch leaves stale zeros in sortedActiveBuckets that
    // combine_batched then reads as bid=0, partial_count[0]=0, cnt=0, and
    // the pos >= cnt-1 termination underflows. (Capped at 1024 iters now,
    // but the underlying state is wrong.)

    for (let bi = 0; bi < this.numBatches; bi++) {
      const tbw = Math.min(this.batchWindows, this.numWindows - bi * this.batchWindows);
      const tSlots = tbw * this.n;
      setPhase('preprocess');
      dispatch(this.decomposePipe, this.decomposeBinds[bi], this.nXposePts, tbw);
      enc.clearBuffer(this.rowPtrBuf);
      dispatch(this.xposeCountPipe, this.xposeCountBind, this.transposeNumPointTiles, tbw);
      dispatch(this.xposeReducePipe, this.xposeReduceBind, Math.ceil(this.BW / 256), tbw);
      dispatch(this.xposeScanPipe, this.xposeScanBind, this.batchWindows, 1);
      dispatch(this.xposeScatterPipe, this.xposeScatterBind, this.transposeNumPointTiles, tbw);
      dispatch(this.convActivePipe, this.convActiveBind, Math.ceil(tSlots / WGI), 1);
      dispatch(this.convMetaPipe, this.convMetaBind, this.nConvMeta, 1);
      setPhase('planner');
      const spMeta = this.pool.scratch!.streamPlannerMeta;
      enc.clearBuffer(spMeta);
      // cumulative_adds is read by partition_thread / partition_task at
      // index 0 (and via OOB-returns-0 at num_dense-1u when num_dense==0).
      // It is written by ba_planner_cumsum only over [0, num_dense). For a
      // batch whose every covered window has zero scalars (profile D/E at
      // logn>=20), num_dense==0, cumsum writes nothing, and the prior
      // batch's value at index 0 leaks into partition_task's start_adds.
      // The resulting wraparound in (end_adds - start_adds) produces HUGE
      // task_cuts cut_offsets, which drive ba_stream_walker into an
      // infinite loop (cur_sorted advances past task_end_sort and never
      // returns; task_done never fires).
      enc.clearBuffer(this.pool.scratch!.cumulativeAdds);
      // walker_combine atomic counters — must be per-batch, not per-MSM.
      // See note above the batch loop for the failure mode if cumulative.
      enc.clearBuffer(this.pool.scratch!.partialCount);
      enc.clearBuffer(this.pool.scratch!.partialWritePos);
      enc.clearBuffer(this.pool.scratch!.activeCount);
      enc.clearBuffer(this.pool.scratch!.countHistogram);
      // walkerPartialDest must also be per-batch. Walker only initializes its
      // own dispatched slots to NO_BUCKET (=0xFFFFFFFF); slots beyond that
      // would otherwise leak the previous batch's partial mapping into
      // combine_count/scatter. clearBuffer writes zeros — combine_count and
      // combine_scatter accept both 0 and NO_BUCKET as "no partial here"
      // since the classifier's magnitude filter guarantees no real bid is 0.
      enc.clearBuffer(this.pool.scratch!.walkerPartialDest);
      dispatch(this.classifyPipe, this.classifyBind, Math.ceil(this.bTotal / 256), 1);
      dispatch(this.metaFixupPipe, this.metaFixupBind, 1, 1);
      for (let rpass = 0; rpass < 3; rpass++) {
        dispatch(this.radixCountPipe, this.radixCountBinds[rpass], this.numRadixTiles, 1);
        dispatch(this.radixScanPipe, this.radixScanBind, 1, 1);
        dispatch(this.radixScatterPipe, this.radixScatterBinds[rpass], this.numRadixTiles, 1);
      }
      dispatch(this.cumsumPipe, this.cumsumBind, 1, 1);
      dispatch(this.partitionWgPipe, this.partitionWgBind, 1, 1);
      dispatch(this.partitionThreadPipe, this.partitionThreadBind, MAX_STREAM_WORKGROUPS, 1);
      // Stream-walker KNOB 2 planner: precompute per-thread task cuts +
      // emit walker's indirect dispatch args at planner_meta[15..17].
      dispatch(this.partitionTaskPipe, this.partitionTaskBind, MAX_STREAM_WORKGROUPS, 1);
      setPhase('accumulate');
      // NOTE: redBuf and isPresentBuf are cleared ONCE per encode (above
      // the batch loop), not per batch. Each batch writes its own global
      // window range — red_slot now includes batch_offset.x = bi * batchWindows
      // — so batches accumulate side-by-side without overwriting one another.
      // Indirect-dispatched accumulation kernels.
      const indirectDispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, buf: GPUBuffer, off: number): void => {
        const desc: GPUComputePassDescriptor = {};
        if (profEnabled) {
          desc.timestampWrites = {
            querySet: this.querySet!,
            beginningOfPassWriteIndex: 2 * passIdx,
            endOfPassWriteIndex: 2 * passIdx + 1,
          };
          this.passPhases.push(curPhase);
          passIdx++;
        }
        const pass = enc.beginComputePass(desc);
        pass.pushDebugGroup(curPhase);
        pass.setPipeline(pipe);
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroupsIndirect(buf, off);
        pass.popDebugGroup();
        pass.end();
      };
      setPhase('size1');
      indirectDispatch(this.size1Pipe, this.size1Bind, spMeta, 8 * 4);
      // Stream-walker replaces stream_accum + partial_sum + emit + emit_fixup.
      // partition_task wrote the walker's indirect args to planner_meta[15..17]
      // (= byte offset 60 = 15 * 4).
      setPhase('stream_walker');
      indirectDispatch(this.streamWalkerPipe, this.streamWalkerBinds[bi], spMeta, 15 * 4);
      // === Optimal walker_combine: cross-bucket batched-inversion pipeline. ===
      // Phase A: count partials per bucket.
      // Phase B: prefix-sum partial_count → partial_offset; scatter dense layout.
      // Phase C: filter into active_buckets, copy 1-partial buckets straight to sums.
      // Phase D: batched-inversion combine for count>=2 buckets.
      setPhase('walker_index');
      const M_partials_walker = 2 * this.streamNumThreads * this.streamS;
      dispatch(this.combineCountPipe, this.combineCountBind, Math.ceil(M_partials_walker / 256), 1);
      dispatch(this.combineScanPipe, this.combineScanBind, 1, 1);
      dispatch(this.combineScatterPipe, this.combineScatterBind, Math.ceil(M_partials_walker / 256), 1);
      dispatch(this.combineFilterPipe, this.combineFilterBinds[bi], Math.ceil(this.bTotal / 256), 1);
      // Counting-sort prepass: group active_buckets by partial_count so each
      // combine_batched thread's S=8 slots have matching N (zero tail
      // divergence). Validated to claw back ~6.5 ms at logn=17 / M2.
      dispatch(this.sortCountPipe, this.sortCountBind, Math.ceil(this.bTotal / 256), 1);
      dispatch(this.sortScanPipe, this.sortScanBind, 1, 1);
      dispatch(this.sortScatterPipe, this.sortScatterBind, Math.ceil(this.bTotal / 256), 1);
      setPhase('combine_batched');
      // combine_batched handles cool (N≤8) buckets. Pair-tree handles hot.
      indirectDispatch(this.combineBatchedPipe, this.combineBatchedBinds[bi], this.pool.scratch!.cbDispatchArgs, 0);
      // === Pair-tree v2: multi-dispatch with cross-thread fan-out. ===
      // Each level is its own dispatch over a flat pair-task list spanning
      // ALL hot buckets, so a single giant bucket (e.g. profile E's N=131K
      // case) parallelizes across thousands of threads instead of
      // serializing inside one thread.
      //
      // pt_init_scan (1 thread): compute per-hot-bucket slice_base in
      //   pt_buf via exclusive prefix-sum of 2*N (the 2× reserves the
      //   per-level shift region). Seeds pt_off, pt_count for level 0.
      // pt_init_copy: parallel copy of level-0 partials into pt_buf at
      //   slice_base.
      // For each of MAX_LEVELS levels:
      //   pt_build (1 thread/hot bucket): emit pair-tasks into pt_tasks
      //     via workgroup-aggregated atomicAdd, advance (pt_off, pt_count)
      //     to next level's region.
      //   pt_dispatch (1 thread): convert pt_total_tasks → indirect
      //     dispatch args, reset pt_total_tasks for the next level.
      //   pt_combine (indirect): each thread = S=8 pair-tasks → 1 safegcd
      //     amortised across S adds. Cross-thread fan-out at this stage
      //     is the whole point.
      // pt_finalize: write each hot bucket's converged partial to
      //   bucket_sums.
      //
      // MAX_LEVELS = 17 covers up to N = 2^17 (= every input collapsed
      // into one bucket at logn=17).
      // Multi-dispatch pair-tree with skip-dead-levels chaining.
      setPhase('pt_init');
      const PT_LEVELS = 17;
      const ptHotArgs = this.pool.scratch!.ptDispatchArgs;
      const ptCombineArgs = this.pool.scratch!.ptCombineDispatchArgs;
      const ptBuildArgs = this.pool.scratch!.ptBuildLoopArgs;
      dispatch(this.ptInitScanPipe, this.ptInitScanBind, 1, 1);
      indirectDispatch(this.ptInitCopyPipe, this.ptInitCopyBind, ptHotArgs, 0);
      enc.copyBufferToBuffer(ptHotArgs, 0, ptBuildArgs, 0, 12);
      setPhase('pt_loop');
      for (let lvl = 0; lvl < PT_LEVELS; lvl++) {
        enc.clearBuffer(this.pool.scratch!.ptTotalTasks);
        indirectDispatch(this.ptBuildPipe, this.ptBuildBind, ptBuildArgs, 0);
        dispatch(this.ptDispatchChainPipe, this.ptDispatchChainBind, 1, 1);
        indirectDispatch(this.ptCombinePipe, this.ptCombineBind, ptCombineArgs, 0);
      }
      setPhase('pt_finalize');
      indirectDispatch(this.ptFinalizePipe, this.ptFinalizeBinds[bi], ptHotArgs, 0);
    }
    setPhase('reduce');
    // Phase 2: reduce_init is gone — walker kernels write red_buf + is_present
    // directly via the bid → red_slot mapping. See UNIFIED_COMBINE_PLAN.md.
    // Phase 5: ONE pipeline drives every level (kind branched at runtime
    // off lparams.w). reduceLevelKinds is no longer consulted.
    const reducePipe = this.reduceLevelPipes[0];
    for (let lv = 0; lv < this.reduceLevelBinds.length; lv++) {
      setPhase(`reduce_L${lv}`);
      dispatch(reducePipe, this.reduceLevelBinds[lv], this.numWindows, 1);
    }
    // Per-window weighted sum gather. Same SoA stride math as run(), just
    // targeting an external staging buffer at an external offset.
    const yPlane = 32 * this.redM;
    for (let w = 0; w < this.numWindows; w++) {
      const g = 32 * w * this.stride;
      enc.copyBufferToBuffer(this.redBuf, g, dstStaging, dstByteOff + w * 64, 32);
      enc.copyBufferToBuffer(this.redBuf, yPlane + g, dstStaging, dstByteOff + w * 64 + 32, 32);
    }
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf) {
      enc.resolveQuerySet(this.querySet, 0, this.passCount * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, this.passCount * 16);
    }
  }

  /**
   * Read this MSM's per-pass GPU timestamps (in nanoseconds) and sum them
   * to return total GPU compute time in milliseconds. Returns 0 when profile
   * mode is disabled. Caller must ensure the encoder that ran this MSM has
   * already been submitted and either `device.queue.onSubmittedWorkDone()`
   * or the staging buffer's `mapAsync` has resolved.
   */
  async readProfileGpuMs(): Promise<number> {
    if (!this.profile || !this.tsStagingBuf) return 0;
    try {
      await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
    } catch {
      return 0;
    }
    const ts = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
    this.tsStagingBuf.unmap();
    let totalNs = 0n;
    for (let p = 0; p < this.passCount; p++) totalNs += ts[2 * p + 1] - ts[2 * p];
    return Number(totalNs) / 1e6;
  }

  /**
   * Decode this MSM's per-window sums from a previously-mapped staging
   * buffer's bytes (`numWindows × 64` LE Montgomery-form bytes starting
   * at `byteOff`). Pure JS; no GPU ops. The Montgomery → canonical
   * conversion happens here (multiply by `rinv`).
   */
  decodeWindowSumsFromBytes(bytes: Uint8Array, byteOff: number): Pt[] {
    // The mapped range is u32-aligned (256-aligned) since GPU staging buffers
    // are aligned to the queue's transfer alignment. Read as Uint32Array view
    // — zero-copy.
    const red = new Uint32Array(bytes.buffer, bytes.byteOffset + byteOff, this.numWindows * 16);
    const out: Pt[] = new Array(this.numWindows);
    for (let w = 0; w < this.numWindows; w++) {
      const x = (packedU32x8ToBigint(red, w * 16) * this.rinv) % FP;
      const y = (packedU32x8ToBigint(red, w * 16 + 8) * this.rinv) % FP;
      out[w] = { x, y };
    }
    return out;
  }


  async run(): Promise<{ x: bigint; y: bigint; profile: ProfileBreakdown | null; windowSums: Pt[]; c: number }> {
    if (this.preparedFor === null) throw new Error('MsmV2.run: call prepare() first');
    const device = this.device;
    const wallT0 = performance.now();
    const enc = device.createCommandEncoder();
    this.encodeIntoBatch(enc, this.redStaging, 0);
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf) {
      enc.resolveQuerySet(this.querySet, 0, this.passCount * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, this.passCount * 16);
    }
    device.queue.submit([enc.finish()]);
    // walker_combine runs the split-bucket reduce on the GPU within the
    // same encoder, so there's no host fixup to interleave any more.
    await this.redStaging.mapAsync(GPUMapMode.READ);
    const stagingBytes = new Uint8Array(this.redStaging.getMappedRange());
    const L = this.decodeWindowSumsFromBytes(stagingBytes, 0);
    this.redStaging.unmap();
    this.windowSums = L;
    // The bridge ships these per-window sums to the C++ hook for a native
    // bb::g1 combine; the benchmark harness (combineOnHost) does it here.
    const result = this.combineOnHost ? hostWindowCombine(L, this.c) : { x: 0n, y: 0n };


    // Per-pass GPU timestamps were tracked here pre-refactor; the new
    // encodeIntoBatch path doesn't capture category labels (the dev page's
    // profile-mode breakdown is no longer reconstructed from this code path
    // — use the dev sweep page directly for that). Wall time still works.
    let profile: ProfileBreakdown | null = null;
    if (this.profile && this.tsStagingBuf) {
      const phaseNs: Record<string, bigint> = {};
      let totalNs = 0n;
      try {
        await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
        const tsArr = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
        this.tsStagingBuf.unmap();
        const passTimes: Array<[string, string, string]> = [];
        for (let p = 0; p < this.passCount; p++) {
          const dur = tsArr[2 * p + 1] - tsArr[2 * p];
          totalNs += dur;
          const phase = this.passPhases[p] ?? 'misc';
          phaseNs[phase] = (phaseNs[phase] ?? 0n) + dur;
          // Absolute GPU-timestamp pair (CLOCK_MONOTONIC_RAW ns) — the same clock
          // the Mali gpu.counters use, so these align directly on the counter timeline.
          passTimes.push([phase, tsArr[2 * p].toString(), tsArr[2 * p + 1].toString()]);
        }
        if (typeof window !== 'undefined') {
          // Accumulate across the warm-up + measured run() calls within one rep
          // (runWebGpuOnce resets this before the warm-up) so the aligned trace
          // labels BOTH GPU MSMs and leaves no unlabeled compute in the gaps.
          const w = window as unknown as { __lastPassTimes?: Array<[string, string, string]> };
          (w.__lastPassTimes ??= []).push(...passTimes);
        }
      } catch {
        // mapAsync raced (already-mapped from a prior run); skip this sample.
      }
      const phaseMs: Record<string, number> = {};
      for (const key of Object.keys(phaseNs)) phaseMs[key] = Number(phaseNs[key]) / 1e6;
      if (typeof window !== 'undefined') {
        (window as unknown as { __lastPhaseMs?: Record<string, number> }).__lastPhaseMs = phaseMs;
      }
      const totalMs = Number(totalNs) / 1e6;
      profile = {
        decompose: totalMs,
        transpose: 0,
        convert: 0,
        planner: 0,
        fused: 0,
        carry: 0,
        finalize: 0,
        redInit: 0,
        redLevel: 0,
        wall: performance.now() - wallT0,
      };
    }
    return { x: result.x, y: result.y, profile, windowSums: L, c: this.c };
  }

  /**
   * Profiling-only kernel isolation. After a normal run() has populated every
   * data-dependent buffer + indirect-arg buffer, re-dispatch ONE kernel in a
   * tight loop for ~durationMs. It reads the same valid inputs each iteration,
   * so the GPU does only that kernel's representative work — an external Mali
   * counter capture then attributes SFU/util to exactly this kernel with zero
   * timestamp reconstruction (WebGPU timestamp-query is quantized + coalesced
   * and useless here; the counters are not). The output is meaningless; the
   * counters measured over the window are the result. Returns dispatch count.
   */
  async profileKernel(name: string, durationMs = 5000, perSubmit = 16): Promise<number> {
    if (this.preparedFor === null) throw new Error('profileKernel: call prepare()+run() first');
    const device = this.device;
    const sc = this.pool.scratch!;
    const one = (enc: GPUCommandEncoder): void => {
      const pass = enc.beginComputePass();
      switch (name) {
        case 'stream_walker':
          pass.setPipeline(this.streamWalkerPipe); pass.setBindGroup(0, this.streamWalkerBinds[0]);
          pass.dispatchWorkgroupsIndirect(sc.streamPlannerMeta, 15 * 4); break;
        case 'combine_batched':
          pass.setPipeline(this.combineBatchedPipe); pass.setBindGroup(0, this.combineBatchedBinds[0]);
          pass.dispatchWorkgroupsIndirect(sc.cbDispatchArgs, 0); break;
        case 'pt_combine':
          pass.setPipeline(this.ptCombinePipe); pass.setBindGroup(0, this.ptCombineBind);
          pass.dispatchWorkgroupsIndirect(sc.ptCombineDispatchArgs, 0); break;
        case 'reduce':
          pass.setPipeline(this.reduceLevelPipes[0]); pass.setBindGroup(0, this.reduceLevelBinds[0]);
          pass.dispatchWorkgroups(this.numWindows, 1, 1); break;
        case 'size1':
          pass.setPipeline(this.size1Pipe); pass.setBindGroup(0, this.size1Bind);
          pass.dispatchWorkgroupsIndirect(sc.streamPlannerMeta, 8 * 4); break;
        default:
          pass.end(); throw new Error('profileKernel: unknown kernel ' + name);
      }
      pass.end();
    };
    const t0 = performance.now();
    let iters = 0;
    while (performance.now() - t0 < durationMs) {
      const enc = device.createCommandEncoder();
      for (let i = 0; i < perSubmit; i++) one(enc);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      iters += perSubmit;
    }
    return iters;
  }

  /** Per-window weighted sums L_w (normal form), set by the last run(). */
  windowSums: Pt[] = [];

  /**
   * GPU bytes the instance itself owns — every buffer in `prepBuffers`,
   * which the slow-path setup pushes every allocation into. Excludes the
   * shared point pool (count that via `MsmV2Pool.statsBytes()`). Used by
   * the bench harness to track per-phase memory savings as the memory-
   * reduction plan lands. Sums after destroy() are 0.
   */
  statsBytes(): number {
    let total = 0;
    for (const b of this.prepBuffers) total += b.size;
    return total;
  }

  /**
   * Release every GPU buffer owned by this instance. The shared point pool is
   * owned by the {@link MsmV2Pool}, not by an instance, and is not freed here.
   */
  destroy(): void {
    for (const b of this.prepBuffers) b.destroy();
    this.prepBuffers = [];
    this.preparedFor = null;
    this.querySet?.destroy();
    this.querySet = null;
  }
}
