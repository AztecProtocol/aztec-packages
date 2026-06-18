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

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { compute_misc_params } from './cuzk/utils.js';
import { BN254_BASE_FIELD, modInverse } from './cuzk/bn254.js';

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
  /** ba_fused_super 8×u32 fr_add/fr_sub: 'native' or 'unpack'-repack. Default 'native'. */
  addsub?: 'native' | 'unpack';
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
  /** A/B knob for diagnosing whether the GPU bucket-histogram pass causes
   *  `fused` to slow down via system-level-cache eviction. When `true`,
   *  `prepare()` runs the level-0 histogram on the host (via the
   *  `buildInitCounts` JS loop — ~250 ms at n=2^20) and skips the GPU
   *  dispatch + readback. Everything else (writeBuffer of scalars,
   *  per-level walk, fits-check, fast/slow path) is identical. Default
   *  `false` (use GPU histogram). */
  useHostHistogram?: boolean;
  /**
   * Tier 2 same-N batch mode. When `B > 1`, this MsmV2 dispatches one
   * pipeline that handles B MSMs as B·W virtual windows over the same n
   * points. The caller passes a `B × n × 32`-byte scalar buffer to
   * `prepare()` (slot 0 first), and `run()` returns B·W per-window sums in
   * encode order (slot 0's W sums first); the caller does the per-MSM
   * Horner combine over each contiguous group of W. Default 1 (single-
   * MSM behaviour byte-identical to pre-Tier-2).
   *
   * `combineOnHost` is incompatible with `batchSize > 1` (the built-in
   * combine assumes one MSM's worth of windows) — set it to false when
   * using batch mode and run the combine in the caller.
   */
  batchSize?: number;
  /**
   * Additive scalar masking. When set, `prepare()` runs a pre-pass that
   * rewrites every uploaded scalar to `(s + R[srsOffset + p]) mod r` before
   * the histogram, where `R` is this buffer: a per-SRS-position random vector
   * laid out as `8 × u32` little-endian limbs per entry (same form/length as
   * the pool's point buffers, indexed by absolute pool position). Masking
   * turns the structured scalars (small / sparse / repeated) the bucket
   * pair-tree mishandles into uniform full-width scalars — the MSM's known-
   * good case. The caller is responsible for subtracting the matching offset
   * `O = Σ R_i P_i` (per `(srsOffset, n)` point set) from the result; see the
   * bridge's `WebGpuMsmHost` masking path. Default: undefined (no masking).
   */
  maskBuf?: GPUBuffer;
}

/** One timestamped GPU compute pass within a `run()`. `label` is the stage
 *  name with a `#<batchIdx>` suffix for passes inside the per-batch loop
 *  (e.g. `decompose#0`); reduction passes that live outside the batch loop
 *  carry no suffix (e.g. `reduce_init`). `ms` is `end - begin` of the pass's
 *  timestamp pair, converted to milliseconds. */
export interface PassSample {
  label: string;
  ms: number;
}

/** Per-pass GPU timestamps (nanoseconds) for aligned timeline tracing.
 *  `beginNs`/`endNs` are relative to the first pass's begin in the same `run()`,
 *  so they share one GPU clock and a caller can anchor `beginNs = 0` to the CPU
 *  submit time to place GPU work on the host timeline. */
export interface PassTiming {
  label: string;
  beginNs: number;
  endNs: number;
}

/** A run's per-pass timeline plus the raw GPU-clock begin of its first pass.
 *  `passes[*].beginNs/endNs` are relative to `epochNs`, so two runs that were
 *  submitted into the same command buffer (sharing the device GPU clock) can be
 *  laid out on a common timeline by offsetting each by `epochNs - minEpochNs`. */
export interface RawPassTimeline {
  /** Raw GPU timestamp (device clock, ns) of the first pass's begin. */
  epochNs: bigint;
  passes: PassTiming[];
}

/** Host-side wall-clock breakdown of one `run()`, plus the matching `prepare()`
 *  that immediately preceded it. */
export interface HostPhases {
  /** Wall time spent in the last `prepare()` call on this instance. */
  host_prepare: number;
  /** Which `prepare()` branch ran: `fast` = uniform rewrite only,
   *  `slow` = full buffer + bind-group rebuild. */
  prepare_kind: 'fast' | 'slow';
  /** Wall time from encoder open through `enc.finish()`. */
  host_encode: number;
  /** Wall time between `queue.submit` and `redStaging.mapAsync` resolution —
   *  the GPU compute window from the host's perspective. */
  host_submit_wait: number;
  /** Wall time spent decoding the mapped window-sums staging and host-combining
   *  (if `combineOnHost`). */
  host_decode: number;
  /** Total wall time of the `run()` call (encode + submit_wait + decode + the
   *  small overhead of reading the timestamp staging buffer). */
  wall: number;
  /** Wall time of the per-MSM scalar `writeBuffer` inside `prepare()`. */
  scalar_upload_wall: number;
  /** Bytes uploaded by `scalar_upload_wall` (`n × 32`). */
  scalar_upload_bytes: number;
  /** Sub-phase of `host_prepare`: the GPU-histogram phase — encoder build +
   *  dispatch + submit + `mapAsync` wait + 2 MB readback memcpy. Excludes
   *  the `writeBuffer` upload (that is its own `scalar_upload_wall` sibling)
   *  and the host level walk below. */
  prep_booth_decode: number;
  /** Sub-phase of `host_prepare`: the host-side per-level walk over the
   *  bucket grid that computes the next-level counts + per-window
   *  pair/carry totals. Pure JS loop, no GPU calls. */
  prep_level_plan: number;
  /** Sub-phase of `prep_booth_decode`: the GPU dispatch time for the
   *  bucket-histogram pass (from `timestamp-query`). The rest of
   *  `prep_booth_decode` is the host `mapAsync` wait + staging memcpy.
   *  Knowing the split tells us whether the cost is GPU work or host idle.
   *  Zero when profile is off. */
  bucket_histogram_gpu: number;
  /** Sub-phase of `host_prepare`: everything not captured by the other
   *  prepare sub-phases — fits-check, `ensureScratch`, bind-group rebuild,
   *  per-level uniform writes on the fast path, etc.
   *  Equals `host_prepare − scalar_upload_wall − prep_booth_decode −
   *  prep_level_plan` and is stamped directly to avoid clamping a
   *  near-zero residual to zero on the fast path. */
  prep_other: number;
}

/** Per-MSM profile returned by `MsmV2.run()` when `profile` is set. */
export interface ProfileBreakdown {
  /** One entry per timestamped compute pass, in encode order. */
  passes: PassSample[];
  /** Host wall-clock decomposition of this `run()` + the matching `prepare()`. */
  host: HostPhases;
  /** Window-batch count for this MSM (= number of `decompose#i` passes). */
  numBatches: number;
  /** Windows per batch (= the `numWindows / numBatches` slice). */
  batchWindows: number;
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
 * Host-side per-bucket histogram of carry-free signed-Booth digits. Reads
 * each scalar's c-bit windows directly out of the LE byte buffer (one u32
 * load per window, no `bigint` shifts) and increments
 * `counts[w * BW + bucket]`. Mirrors the GPU `bucket_histogram` kernel
 * exactly — preserved here as the bypass path for the `useHostHistogram`
 * config flag (A/B experiment for the GPU-dispatch cache-thrash hypothesis).
 *
 * Tier 2 batch mode (`batchSize > 1`): scans the concatenated
 * `B × n × 32`-byte scalar buffer as B contiguous slot regions and emits a
 * `B × W × BW` count grid, indexed by `(b * W + w) * BW + bucket` — exactly
 * what the GPU shader's virtual-window split `(gid.y → b, w)` produces.
 * `numWindows` is the *total* B·W effective windows; `windowsPerMsm` is the
 * per-MSM W. For single-MSM (`batchSize === 1`) the two are equal and the
 * loops collapse to the pre-Tier-2 single-MSM behaviour.
 *
 * Single-threaded JS — ~250 ms at n=2^20 × B=1.
 */
export function buildInitCounts(
  scalarsBuf: Uint8Array,
  n: number,
  c: number,
  numWindows: number,
  BW: number,
  windowsPerMsm: number = numWindows,
): Uint32Array {
  const initCounts = new Uint32Array(numWindows * BW);
  const cMask = (1 << c) - 1;
  const batchSize = numWindows / windowsPerMsm;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(
      `buildInitCounts: numWindows (${numWindows}) is not a positive multiple of windowsPerMsm (${windowsPerMsm})`,
    );
  }
  for (let b = 0; b < batchSize; b++) {
    const slotByteBase = b * n * 32;
    const windowGlobalBase = b * windowsPerMsm;
    for (let i = 0; i < n; i++) {
      const off = slotByteBase + i * 32;
      let lookback = 0;
      for (let w = 0; w < windowsPerMsm; w++) {
        const lo = w * c;
        const inOff = lo >>> 3;
        const byteOff = off + inOff;
        const bitShift = lo & 7;
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
        initCounts[(windowGlobalBase + w) * BW + bucket]++;
        lookback = (v >>> (bitShift + c - 1)) & 1;
      }
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
function hostWindowCombine(L: Pt[], c: number): Pt {
  const fadd = (a: bigint, b: bigint): bigint => (a + b) % FP;
  // acc in Jacobian (X, Y, Z); the seed window is affine, so Z = 1.
  let X = L[L.length - 1].x;
  let Y = L[L.length - 1].y;
  let Z = 1n;
  for (let w = L.length - 2; w >= 0; w--) {
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
  const module = device.createShaderModule({ code });
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
  bucketResultBuf: GPUBuffer;
  l0IdxBuf: GPUBuffer;
  bucketAndSignBuf: GPUBuffer;
  valIdxBuf: GPUBuffer;
  /** Per-bucket carry-prefix array consumed by the planner. Sized `bTotal`
   *  u32 (numWindows × BW). Previously aliased onto valIdxBuf when
   *  `batchSlots >= bTotal`, but Tier 2 batch mode at large n violates that
   *  invariant (memory budget forces numBatches up, batchWindows down, and
   *  valIdxBuf is then too small for the B·W·BW carry-off table). Owning
   *  it directly costs `bTotal × 4` bytes — ~3-11 MB across the production
   *  size range — and removes a constraint from the numBatches search. */
  carryOffBuf: GPUBuffer;
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
  };
  private _scratchEpoch = 0;
  private _device: GPUDevice;

  // Holds a `scalarsRawBuf` between `ensureScalarsRawBuf()` (called early
  // in prepare so the GPU Booth-histogram has a buffer to read) and the
  // matching `ensureScratch()` (called later in the same prepare to grow
  // the rest of the scratch). On `ensureScratch`, the pending buffer is
  // adopted into `_scratch.scalarsRawBuf` and this field cleared.
  private _pendingScalarsRawBuf: GPUBuffer | null = null;

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

  /**
   * Lazy grow of the pool's `scalarsRawBuf` BEFORE the rest of the scratch
   * is sized. The Booth-histogram pass needs an input buffer at the very
   * start of `MsmV2.prepare()`, but the histogram's counts are themselves
   * an input to the per-level plan that decides how large the rest of the
   * scratch needs to be. So we split scalars-buffer growth out: this
   * method allocates (or grows) just that one buffer, and the matching
   * `ensureScratch` call later in the same prepare() picks it up.
   *
   * Returns the buffer. Caller writeBuffer's the scalar bytes into it.
   * Bumps `scratchEpoch` iff the buffer identity changed (so bind groups
   * referencing it know to rebuild).
   */
  ensureScalarsRawBuf(scalarsBytes: number): GPUBuffer {
    const cur = this._maxDims;
    // Case 1: scratch already exists and its scalarsRawBuf is big enough.
    if (this._scratch && cur.scalarsBytes >= scalarsBytes) {
      return this._scratch.scalarsRawBuf;
    }
    // Case 2: scratch exists but the buffer is too small. Replace in place.
    if (this._scratch) {
      this._scratch.scalarsRawBuf.destroy();
      const buf = this._device.createBuffer({
        size: Math.max(scalarsBytes, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      this._scratch.scalarsRawBuf = buf;
      cur.scalarsBytes = scalarsBytes;
      this._scratchEpoch++;
      return buf;
    }
    // Case 3: no scratch yet — stash in the pending field and let the next
    // `ensureScratch` adopt it. Same growth-by-doubling protocol as the
    // rest of the buffers.
    if (this._pendingScalarsRawBuf && cur.scalarsBytes >= scalarsBytes) {
      return this._pendingScalarsRawBuf;
    }
    this._pendingScalarsRawBuf?.destroy();
    const buf = this._device.createBuffer({
      size: Math.max(scalarsBytes, 4),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this._pendingScalarsRawBuf = buf;
    cur.scalarsBytes = scalarsBytes;
    return buf;
  }

  // When false, `destroy()` does NOT release `poolX` / `poolY` — they are
  // borrowed (e.g. set up by `BatchMsmV2` so several pools share one SRS
  // upload). Defaults to true (this pool owns its SRS) for the public
  // `MsmV2Pool.create` path.
  private _ownsSrs: boolean = true;

  private constructor(
    /** Number of base points held by the pool. */
    readonly srsN: number,
    /** Montgomery-form x coordinates — `srsN` × 8×u32. */
    readonly poolX: GPUBuffer,
    /** Montgomery-form y coordinates — `srsN` × 8×u32. */
    readonly poolY: GPUBuffer,
    device: GPUDevice,
    sharedCache?: PipelineCache,
  ) {
    this.cache = sharedCache ?? new PipelineCache(device);
    this.pairCap = Math.ceil(srsN / 2) + 16;
    this._device = device;
  }

  /**
   * Build a pool that BORROWS its SRS GPU buffers from another pool. Used by
   * {@link BatchMsmV2} so the B batch slots share one Montgomery-converted
   * SRS upload but each gets its own scratch (bufA / bufB / scalarsRawBuf /
   * histogramBuf / …), letting B same-N MSMs prepare and run without
   * clobbering each other's state.
   *
   * `poolX` and `poolY` MUST be the Montgomery-form 8×u32 SRS coords from an
   * already-created `MsmV2Pool` (`master.poolX` / `master.poolY`). Sharing
   * the pipeline cache too means slot-N MsmV2 instances skip shader compile.
   * `destroy()` on the borrowing pool will release its scratch and
   * pipeline-cache-local state but leave the SRS buffers alone.
   */
  static fromSharedSrs(
    device: GPUDevice,
    srsN: number,
    poolX: GPUBuffer,
    poolY: GPUBuffer,
    sharedCache?: PipelineCache,
  ): MsmV2Pool {
    const pool = new MsmV2Pool(srsN, poolX, poolY, device, sharedCache);
    pool._ownsSrs = false;
    return pool;
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
      total += s.bufA.size + s.bufB.size + s.bucketResultBuf.size;
      total += s.l0IdxBuf.size + s.bucketAndSignBuf.size + s.valIdxBuf.size + s.carryOffBuf.size;
      total += s.rowPtrBuf.size + s.planMeta.size;
      total += s.pairBlockPlanRing[0].size + s.pairBlockPlanRing[1].size;
      total += s.scatterPlanRing[0].size + s.scatterPlanRing[1].size;
      total += s.carryPlanRing[0].size + s.carryPlanRing[1].size;
      total += s.countsBufs[0].size + s.countsBufs[1].size;
      total += s.offsetsBufs[0].size + s.offsetsBufs[1].size;
      total += s.prefScratchBuf.size + s.scalarsRawBuf.size;
      total += s.redBuf.size + s.isPresentBuf.size + s.reducePrefScratch.size;
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
    let bucketResultBuf = s?.bucketResultBuf;
    let l0IdxBuf = s?.l0IdxBuf;
    let bucketAndSignBuf = s?.bucketAndSignBuf;
    let valIdxBuf = s?.valIdxBuf;
    let carryOffBuf = s?.carryOffBuf;
    let rowPtrBuf = s?.rowPtrBuf;
    let planMeta = s?.planMeta;
    let pairBlockPlanRing = s?.pairBlockPlanRing;
    let scatterPlanRing = s?.scatterPlanRing;
    let carryPlanRing = s?.carryPlanRing;
    let countsBufs = s?.countsBufs;
    let offsetsBufs = s?.offsetsBufs;
    let prefScratchBuf = s?.prefScratchBuf;
    // Adopt the pending scalarsRawBuf (allocated by an earlier
    // `ensureScalarsRawBuf` call in this same prepare). The growth check
    // below stays a no-op if the pending buffer already fits `dims.scalarsBytes`
    // — `ensureScalarsRawBuf` updates `cur.scalarsBytes` so the check correctly
    // sees an up-to-date max.
    let scalarsRawBuf = s?.scalarsRawBuf ?? this._pendingScalarsRawBuf ?? undefined;
    this._pendingScalarsRawBuf = null;
    let redBuf = s?.redBuf;
    let isPresentBuf = s?.isPresentBuf;
    let reducePrefScratch = s?.reducePrefScratch;

    // bufA/bufB depend on M1. They also need a pad-trio re-write whenever
    // they realloc, so we handle them together.
    if (!bufA || dims.M1 > cur.M1) {
      bufA?.destroy();
      bufB?.destroy();
      grow(true, 'M1');
      bufA = soaBuf(cur.M1);
      bufB = soaBuf(cur.M1);
      grew = true;
    }
    if (!bucketResultBuf || dims.bTotal > cur.bTotal) {
      bucketResultBuf?.destroy();
      carryOffBuf?.destroy();
      grow(true, 'bTotal');
      bucketResultBuf = soaBuf(cur.bTotal);
      // carryOffBuf is sized to bTotal u32 — see SharedScratch comment.
      carryOffBuf = sbuf(cur.bTotal * 4);
      grew = true;
    } else if (!carryOffBuf) {
      carryOffBuf = sbuf(cur.bTotal * 4);
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
      pairBlockPlanRing = [sbuf(2 * cur.totalPairBlocks * SmaxS * 4), sbuf(2 * cur.totalPairBlocks * SmaxS * 4)];
      scatterPlanRing = [sbuf(cur.totalPairBlocks * SmaxS * 4), sbuf(cur.totalPairBlocks * SmaxS * 4)];
      grew = true;
    }
    if (!carryPlanRing || dims.totalCarries > cur.totalCarries) {
      carryPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalCarries');
      carryPlanRing = [sbuf(2 * cur.totalCarries * 4), sbuf(2 * cur.totalCarries * 4)];
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
      prefScratchBuf = sbuf(cur.fusedTile * SmaxS * 8 * 4);
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

    // Pad-trio layout in bufA/bufB. Recompute whenever bufA's size changed.
    const planeBytes = cur.M1 * PG * 16;
    const padBytesPerPlane = 3 * PG * 16;
    const padXOffset = planeBytes - padBytesPerPlane;
    const padYOffset = planeBytes + planeBytes - padBytesPerPlane;

    const newScratch: SharedScratch = {
      bufA: bufA!,
      bufB: bufB!,
      bucketResultBuf: bucketResultBuf!,
      l0IdxBuf: l0IdxBuf!,
      bucketAndSignBuf: bucketAndSignBuf!,
      valIdxBuf: valIdxBuf!,
      carryOffBuf: carryOffBuf!,
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
      planeBytes,
      padBytesPerPlane,
      padXOffset,
      padYOffset,
      poolM1: cur.M1,
    };

    if (grew) {
      // Re-write the pad-trio into the (possibly new) bufA/bufB. Other
      // buffers are zero-initialized by WebGPU on creation, which is the
      // correct starting state for them too.
      const padBuf = buildPadBuf(cur.M1, padPts, R);
      const padBytes = new Uint8Array(padBuf.buffer);
      const xPadSlice = padBytes.subarray(padXOffset, padXOffset + padBytesPerPlane);
      const yPadSlice = padBytes.subarray(padYOffset, padYOffset + padBytesPerPlane);
      device.queue.writeBuffer(newScratch.bufA, padXOffset, xPadSlice as BufferSource);
      device.queue.writeBuffer(newScratch.bufA, padYOffset, yPadSlice as BufferSource);
      device.queue.writeBuffer(newScratch.bufB, padXOffset, xPadSlice as BufferSource);
      device.queue.writeBuffer(newScratch.bufB, padYOffset, yPadSlice as BufferSource);
      // Re-write the l0IdxBuf seed pad-trio at slots [batchSlots,
      // batchSlots+1, batchSlots+2]. These positions move when batchSlots
      // grows; the caller (MsmV2.prepare) writes the per-N value at its
      // own batchSlots offset on every prepare. Nothing to do here.
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
  /** One-time setup timings populated by `MsmV2Pool.create` when called with
   *  `{ profile: true }`. The pool-convert pass uses a `timestamp-query`
   *  query set when available; if the device lacks the feature, `convert_ms`
   *  falls back to the host wall-clock around `onSubmittedWorkDone()`. */
  createProfile: { upload_ms: number; upload_bytes: number; convert_ms: number } | null = null;

  static async create(
    device: GPUDevice,
    srsCanonicalBytes: Uint8Array,
    opts?: { profile?: boolean },
  ): Promise<MsmV2Pool> {
    const srsN = srsCanonicalBytes.byteLength / 64;
    if (!Number.isInteger(srsN) || srsN <= 0) {
      throw new Error(`MsmV2Pool.create: byte length ${srsCanonicalBytes.byteLength} is not a positive multiple of 64`);
    }
    const wantProfile = opts?.profile === true;

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
    const tUpload0 = wantProfile ? performance.now() : 0;
    device.queue.writeBuffer(firstHalf, 0, srsCanonicalBytes as BufferSource, 0, halfBytes);
    device.queue.writeBuffer(
      secondHalf,
      0,
      srsCanonicalBytes as BufferSource,
      halfBytes,
      srsCanonicalBytes.byteLength - halfBytes,
    );
    const uploadMs = wantProfile ? performance.now() - tUpload0 : 0;

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

    const sm = new ShaderManager(4, srsN, BN254_CURVE_CONFIG, false);
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

    const tsAvailable = wantProfile && device.features.has('timestamp-query');
    const querySet: GPUQuerySet | null = tsAvailable ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
    const tsResolveBuf: GPUBuffer | null = tsAvailable
      ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
      : null;
    const tsStagingBuf: GPUBuffer | null = tsAvailable
      ? device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
      : null;
    const enc = device.createCommandEncoder();
    const passDesc: GPUComputePassDescriptor = {};
    if (querySet !== null) {
      passDesc.timestampWrites = { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
    }
    const pass = enc.beginComputePass(passDesc);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(numXWorkgroups, numYWorkgroups, 1);
    pass.end();
    if (querySet !== null && tsResolveBuf !== null && tsStagingBuf !== null) {
      enc.resolveQuerySet(querySet, 0, 2, tsResolveBuf, 0);
      enc.copyBufferToBuffer(tsResolveBuf, 0, tsStagingBuf, 0, 16);
    }
    const tConvert0 = wantProfile ? performance.now() : 0;
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    const convertWallMs = wantProfile ? performance.now() - tConvert0 : 0;

    let convertMs = convertWallMs;
    if (tsStagingBuf !== null) {
      try {
        await tsStagingBuf.mapAsync(GPUMapMode.READ);
        const ts = new BigUint64Array(tsStagingBuf.getMappedRange().slice(0));
        tsStagingBuf.unmap();
        convertMs = Number(ts[1] - ts[0]) / 1e6;
      } catch {
        // Fall through to convertWallMs (mapAsync raced or was unavailable).
      }
    }
    if (wantProfile) {
      pool.createProfile = { upload_ms: uploadMs, upload_bytes: srsCanonicalBytes.byteLength, convert_ms: convertMs };
    }

    firstHalf.destroy();
    secondHalf.destroy();
    params.destroy();
    querySet?.destroy();
    tsResolveBuf?.destroy();
    tsStagingBuf?.destroy();
    return pool;
  }

  /** Free the pool's GPU buffers — the SRS (poolX/Y) and the shared
   * scratch (every buffer in `_scratch`, if allocated). A pool built via
   * {@link fromSharedSrs} leaves poolX/Y alone (the master pool owns them). */
  destroy(): void {
    if (this._ownsSrs) {
      this.poolX.destroy();
      this.poolY.destroy();
    }
    if (this._scratch) {
      const s = this._scratch;
      s.bufA.destroy();
      s.bufB.destroy();
      s.bucketResultBuf.destroy();
      s.l0IdxBuf.destroy();
      s.bucketAndSignBuf.destroy();
      s.valIdxBuf.destroy();
      s.carryOffBuf.destroy();
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
    this._pendingScalarsRawBuf?.destroy();
    this._pendingScalarsRawBuf = null;
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
  /** Number of Pippenger windows the pipeline sees. For single-MSM this is
   *  ceil(NUMBITS / c) = `windowsPerMsm`. For Tier 2 batch mode it is
   *  `batchSize × windowsPerMsm` — B copies of the per-MSM W virtual
   *  windows. Public — the bridge / dev page reads it when packing
   *  per-MSM staging buffers; the per-MSM W is exposed as
   *  `windowsPerMsm` below. */
  numWindows!: number;
  /** Per-MSM Pippenger window count = ceil(NUMBITS / c). Equal to
   *  `numWindows` when `batchSize === 1`. Public — `BatchMsmV2` reads it
   *  to slice the B·W window sums into B per-MSM groups for the host
   *  Horner combine. */
  windowsPerMsm!: number;
  /** Same-N batch factor (Tier 2). 1 for single-MSM behaviour byte-
   *  identical to pre-Tier-2; B for `batchSize × windowsPerMsm` virtual
   *  windows over the same n base points. */
  batchSize!: number;
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
  private addsub: 'native' | 'unpack' = 'native';
  private profile = false;
  private jacobianCrossover = 0;
  private combineOnHost = true;
  // A/B knob: when true, prepare() does the level-0 histogram on the host
  // (buildInitCounts) and skips the GPU dispatch. See MsmConfig.
  private useHostHistogram = false;
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
  // Booth-recoded per-bucket histogram pipeline. Dispatched at the very
  // start of `prepare()` to feed the level walk with GPU-computed counts —
  // replaces the 250 ms host Booth-decode walk at n=2^20.
  private histogramPipe!: GPUComputePipeline;
  // Additive-masking pre-pass: rewrites scalarsRawBuf in place to
  // (s + R[srsOffset+p]) mod r before the histogram. Only built when
  // `config.maskBuf` is set; `maskBuf` is the per-pool R vector.
  private maskPipe: GPUComputePipeline | null = null;
  private maskBuf: GPUBuffer | null = null;
  private maskParamsBuf: GPUBuffer | null = null;
  private maskBind: GPUBindGroup | null = null;
  private maskBindScalarsBuf: GPUBuffer | null = null;
  private xposeCountPipe!: GPUComputePipeline;
  private xposeReducePipe!: GPUComputePipeline;
  private xposeScanPipe!: GPUComputePipeline;
  private xposeScatterPipe!: GPUComputePipeline;
  private convActivePipe!: GPUComputePipeline;
  private convMetaPipe!: GPUComputePipeline;
  private reduceInitPipe!: GPUComputePipeline;
  private reduceLevelPipes: GPUComputePipeline[] = [];
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
  private maskLayout: GPUBindGroupLayout | null = null;
  private histogramLayout!: GPUBindGroupLayout;
  private xposeCountLayout!: GPUBindGroupLayout;
  private xposeReduceLayout!: GPUBindGroupLayout;
  private xposeScanLayout!: GPUBindGroupLayout;
  private xposeScatterLayout!: GPUBindGroupLayout;
  private convActiveLayout!: GPUBindGroupLayout;
  private convMetaLayout!: GPUBindGroupLayout;
  private reduceInitLayout!: GPUBindGroupLayout;
  private reduceLevelLayout!: GPUBindGroupLayout;

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
  // Per-level uniform buffers, kept alive across prepares. Indexed by level.
  // `tileParamsBufs[lv]` is the parallel array of per-tile uniforms.
  private plannerParamsBufs: GPUBuffer[] = [];
  private carryParamsBufs: GPUBuffer[] = [];
  private tileParamsBufs: GPUBuffer[][] = [];
  // Per-level pair-block / carry totals (= batchWindows × per-window count),
  // updated on every prepare; consumed by run() for dispatch counts (saves a
  // re-walk of the LevelBind tile array).
  private levelTotalPairBlocks: number[] = [];
  private levelTotalCarries: number[] = [];
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
  // GPU-side Booth-recoded per-bucket histogram. Sized to `bTotal` u32; reused
  // across prepares on this instance (cleared at the top of each dispatch).
  private histogramBuf!: GPUBuffer;
  // CPU-visible staging that `histogramBuf` is copied into; mapped for read
  // each prepare so the host can run the per-level plan walk.
  private histogramStagingBuf!: GPUBuffer;
  // (n, num_windows, c, scalar_words) uniform — fixed for this instance's
  // lifetime, written once in create().
  private histogramParamsBuf!: GPUBuffer;
  // Bind group for the histogram pass. Re-built when the pool's
  // `scalarsRawBuf` identity changes (scratchEpoch advance).
  private histogramBind: GPUBindGroup | null = null;
  private histogramBindScalarsBuf: GPUBuffer | null = null;
  // Reusable host-side Uint32Array holding the latest histogram readback;
  // sized to `bTotal` and overwritten on each prepare (allocated lazily in
  // prepare on first call).
  private histogramHost: Uint32Array | null = null;
  // Timestamp-query plumbing for the prepare()-time bucket-histogram pass.
  // Lets us split `prep_booth_decode` into "GPU dispatch time" vs "host
  // mapAsync wait + memcpy" so we know whether the bottleneck is GPU work
  // or host idle. Allocated in create() when profile is enabled.
  private histogramQuerySet: GPUQuerySet | null = null;
  private histogramTsResolveBuf: GPUBuffer | null = null;
  private histogramTsStagingBuf: GPUBuffer | null = null;
  private rowPtrBuf!: GPUBuffer; // cleared each batch by run()
  private redBuf!: GPUBuffer; // gathered + decoded by run()
  private redStaging!: GPUBuffer; // small mappable L_w gather target
  private bucketResultBuf!: GPUBuffer; // diagnostic readback
  // profiling (created in prepare when this.profile)
  private querySet: GPUQuerySet | null = null;
  private tsResolveBuf: GPUBuffer | null = null;
  private tsStagingBuf: GPUBuffer | null = null;
  private passCount = 0;
  // Per-pass label written by encodeIntoBatch on every `dispatch()` call, in
  // the same order as the timestamp-query pairs. Populated only when
  // `this.profile` is true; otherwise stays empty and the push is bypassed
  // (so the bridge path with `profile: false` pays nothing). Reset at the top
  // of each encodeIntoBatch.
  private passLabels: string[] = [];
  // Host-side prepare() instrumentation — populated by every prepare() call,
  // consumed by run() to build ProfileBreakdown.host. The dev page profile
  // mode reads these to surface per-MSM scalar upload bandwidth.
  private lastPrepareMs = 0;
  private lastPrepareKind: 'fast' | 'slow' = 'slow';
  private lastScalarUploadMs = 0;
  private lastScalarUploadBytes = 0;
  /** Synchronous `writeBuffer` time for scalar upload during the most recent
   *  `prepare()`. Read by the bridge to attribute host-critical-path cost
   *  per MSM in a batch. */
  get scalarUploadMs(): number {
    return this.lastScalarUploadMs;
  }
  /** Timestamp-measured GPU time for the most recent prepare()'s level-0
   *  bucket-histogram dispatch (ms). 0 when profile is off. */
  get bucketHistogramGpuMs(): number {
    return this.lastBucketHistogramGpuMs;
  }
  /** Wall time of the histogram block (dispatch + the host-blocking mapAsync
   *  readback) in the most recent prepare(). The readback stall ≈ this minus
   *  `bucketHistogramGpuMs`; it serializes behind any prior queued GPU work. */
  get prepHistogramWallMs(): number {
    return this.lastPrepBoothDecodeMs;
  }
  /** Wall time of the host-side per-level planning walk in the most recent
   *  prepare(). */
  get prepLevelPlanMs(): number {
    return this.lastPrepLevelPlanMs;
  }
  // Residual host_prepare time that isn't accounted for by scalar_upload_wall,
  // prep_booth_decode, or prep_level_plan — i.e. fits-check + ensureScratch +
  // bind-group creation (slow path) or per-level uniform writes (fast path).
  // Stamped at the bottom of prepare() in both branches.
  private lastPrepOtherMs = 0;
  private lastPrepBoothDecodeMs = 0;
  // GPU dispatch time of the prepare()-time bucket-histogram pass, in ms,
  // measured via `timestamp-query`. 0 when profile is off.
  private lastBucketHistogramGpuMs = 0;
  private lastPrepLevelPlanMs = 0;
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
  private reduceLevelKinds: number[] = [];
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
    m.addsub = config?.addsub ?? 'native';
    m.jacobianCrossover = config?.jacobianCrossover ?? 0;
    m.combineOnHost = config?.combineOnHost ?? true;
    m.useHostHistogram = config?.useHostHistogram ?? false;
    const wantProfile = config?.profile ?? false;
    m.profile = wantProfile && device.features.has('timestamp-query');
    if (wantProfile && !m.profile) {
      console.warn('[MsmV2] profile requested but timestamp-query unavailable — disabled');
    }
    // Pull the knobs into the local names the rest of create() uses.
    const { s: S, wgi: WGI, l0Log: L0_LOG, reduceWg: REDUCE_WG, invVariant: INV_VARIANT, addsub: ADDSUB } = m;
    // Per-MSM W, used both as the shader-side virtual-window split factor and
    // as the caller's per-MSM window count for the Horner combine. For B=1
    // it equals m.numWindows and the shaders' `(gid.y → b, w)` math
    // collapses to single-MSM behaviour (b == 0 always).
    m.batchSize = config?.batchSize ?? 1;
    if (!Number.isInteger(m.batchSize) || m.batchSize < 1) {
      throw new Error(`MsmV2.create: batchSize (${m.batchSize}) must be a positive integer`);
    }
    if (m.batchSize > 1 && m.combineOnHost) {
      throw new Error(
        'MsmV2.create: batchSize > 1 is incompatible with combineOnHost — set combineOnHost: false and run the Horner combine per-slot in the caller',
      );
    }
    m.windowsPerMsm = Math.ceil(NUMBITS / m.c);
    m.BW = Math.ceil((2 ** (m.c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
    // Virtual total: B copies of W effective windows. The whole pipeline
    // (planner, transpose, fused, reduce) operates over numWindows
    // obliviously — only the two leaf shaders know the (b, w) split.
    m.numWindows = m.batchSize * m.windowsPerMsm;
    m.bTotal = m.numWindows * m.BW;
    m.stride = 2 ** (m.c - 1);
    m.redM = m.numWindows * m.stride;
    const misc = compute_misc_params(FP, 13);
    m.R = misc.r;
    m.rinv = misc.rinv;
    const sm = new ShaderManager(4, n, BN254_CURVE_CONFIG, false);

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
    // Per-level kind (0 phase-A add / 1 phase-B/D tree-add / 2 phase-C
    // double) — picks the kind-specialized pipeline for the unfused path.
    m.reduceLevelKinds = m.reducePasses.map(p => (p.isDouble ? 2 : p.shaderPhase === 0 ? 0 : 1));

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
    // 3 bindings: scalars (read), counts (atomic<u32> storage), params.
    m.histogramLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.xposeCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.xposeReduceLayout = lt(['storage', 'storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform']);
    m.xposeScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    m.convMetaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceInitLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceLevelLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform']);

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
    m.plannerAPipe = await compile(
      sm.gen_ba_planner_v2_offsets_shader(PLANNER_TPB, m.c, m.numWindows, m.BW),
      `planner-a-c${m.c}`,
      m.plannerALayout,
    );
    m.plannerBPipe = await compile(
      sm.gen_ba_planner_v2_emit_shader(PLANNER_TPB, m.c, m.numWindows, S, pool.pairCap, m.BW),
      `planner-b-c${m.c}`,
      m.plannerBLayout,
    );
    m.fusedPipe = await compile(
      sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true, false, ADDSUB),
      `fused`,
      m.fusedLayout,
    );
    m.carryPipe = await compile(sm.gen_ba_carry_copy_bench_shader(WGI), `carry`, m.carryLayout);
    m.finalizePipe = await compile(sm.gen_ba_finalize_copy_bench_shader(WGI), `finalize`, m.finalizeLayout);
    m.fusedPipeL0 = await compile(
      sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true, true, ADDSUB),
      `fused-l0`,
      m.fusedLayoutL0,
    );
    m.carryPipeL0 = await compile(sm.gen_ba_carry_copy_bench_shader(WGI, true), `carry-l0`, m.carryLayoutL0);
    m.finalizePipeL0 = await compile(
      sm.gen_ba_finalize_copy_bench_shader(WGI, true),
      `finalize-l0`,
      m.finalizeLayoutL0,
    );
    m.decomposePipe = await compile(
      sm.gen_decompose_scalars_booth_shader(WGI, m.windowsPerMsm),
      `decompose`,
      m.decomposeLayout,
    );
    m.histogramPipe = await compile(
      sm.gen_bucket_histogram_shader(WGI, m.BW, m.windowsPerMsm),
      `bucket-histogram-c${m.c}`,
      m.histogramLayout,
    );

    // Allocate the per-instance histogram + staging buffers and the fixed
    // params uniform. These are sized by `bTotal = NUM_WINDOWS × BW` (c is
    // fixed for the life of the instance), so they never grow and stay
    // pinned. The bind group is built lazily inside prepare() because
    // `scalarsRawBuf` doesn't exist until the first `ensureScalarsRawBuf`
    // call.
    const histogramBytes = m.bTotal * 4;
    m.histogramBuf = device.createBuffer({
      size: histogramBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    m.histogramStagingBuf = device.createBuffer({
      size: histogramBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    m.histogramParamsBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // params = (n, num_windows, c, scalar_words). Fixed for this instance.
    device.queue.writeBuffer(m.histogramParamsBuf, 0, new Uint32Array([n, m.numWindows, m.c, 8]));

    // Optional additive-masking pre-pass. Built only when the caller supplied
    // an R buffer; binds (scalarsRawBuf read_write, maskBuf read, params). The
    // bind group is rebuilt lazily in prepare() when scalarsRawBuf's identity
    // changes (same signal the histogram bind group uses). The params uniform
    // (total_scalars, n, srsOffset, scalar_words) is written per prepare()
    // because srsOffset varies per call.
    if (config?.maskBuf) {
      if (m.useHostHistogram) {
        throw new Error(
          'MsmV2.create: maskBuf is incompatible with useHostHistogram — the host histogram reads the un-masked host scalar bytes, not the GPU-masked buffer',
        );
      }
      m.maskBuf = config.maskBuf;
      m.maskLayout = lt(['storage', 'read-only-storage', 'uniform']);
      m.maskPipe = await compile(sm.gen_mask_scalars_shader(WGI), `mask-scalars`, m.maskLayout);
      m.maskParamsBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    // Profile mode: a dedicated 2-slot timestamp-query for the prepare-time
    // histogram pass so we can split `prep_booth_decode` into "GPU dispatch
    // wall" vs "host mapAsync wait + readback".
    if (m.profile) {
      m.histogramQuerySet = device.createQuerySet({ type: 'timestamp', count: 2 });
      m.histogramTsResolveBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      m.histogramTsStagingBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    }
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
    m.reduceInitPipe = await compile(sm.gen_ba_reduce_init_bench_shader(WGI), `reduce-init`, m.reduceInitLayout);
    // Three kind-specialized per-level reduction pipelines (one dispatch per
    // schedule level); binding 4 is a per-level uniform.
    for (const kind of [0, 1, 2]) {
      m.reduceLevelPipes[kind] = await compile(
        sm.gen_ba_reduce_level_bench_shader(REDUCE_WG, kind, INV_VARIANT, ADDSUB),
        `reduce-level-k${kind}`,
        m.reduceLevelLayout,
      );
    }

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
        // For Tier 2 batch mode the dispatch reads B*n scalars; size the
        // warm-up dummy accordingly. The top-byte mask below keeps every
        // 32-byte chunk below the Fr modulus, so the entire `batchSize * n`
        // dummy array is a valid concatenated batch.
        const dummy = new Uint8Array(m.batchSize * n * 32);
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
        for (let k = 0; k < m.batchSize * n; k++) {
          dummy[k * 32 + 31] &= 0x1f;
        }
        await m.prepare(dummy);
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
  async prepare(scalarsBuf: Uint8Array, srsOffset: number = 0): Promise<void> {
    // Cache key includes srsOffset so a re-prepare with same scalars but
    // different offset rewrites the uniform.
    if (this.preparedFor === scalarsBuf && this.preparedSrsOffset === srsOffset) return;
    const tPrepStart = performance.now();

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
    // Total scalars across the (possibly batched) MSM: B copies of n scalars
    // for Tier 2 batch mode, or just n for single-MSM. The shader's virtual-
    // window split reads scalar `b * input_size + p` for thread (p, y_eff
    // with b = y_eff / WINDOWS_PER_MSM), so the buffer layout must be
    // `[slot0_scalars (n×32) ‖ slot1_scalars ‖ ...]`.
    const totalScalars = this.batchSize * n;
    const expectedScalarBytes = totalScalars * 32;
    if (scalarsBuf.byteLength !== expectedScalarBytes) {
      throw new Error(
        `MsmV2.prepare: scalars buffer is ${scalarsBuf.byteLength} bytes, ` +
          `expected ${expectedScalarBytes} (batchSize=${this.batchSize} × n=${n} × 32)`,
      );
    }
    let scalars: Uint32Array;
    if (scalarsBuf.byteOffset % 4 === 0) {
      scalars = new Uint32Array(scalarsBuf.buffer, scalarsBuf.byteOffset, totalScalars * 8);
    } else {
      scalars = new Uint32Array(totalScalars * 8);
      new Uint8Array(scalars.buffer).set(scalarsBuf);
    }
    // One writeBuffer for the whole prepare — both the histogram pass and the
    // run-time pipeline read this same buffer, so the fast/slow paths below
    // skip their own writeBuffer. Chrome's `writeBuffer` is host-blocking on
    // large buffers (a synchronous memcpy from the JS-side TypedArray into a
    // driver-managed staging area before returning), so its wall is a real
    // sub-phase of host_prepare worth tracking separately from the
    // GPU-histogram phase below — `tBooth0` is therefore stamped AFTER the
    // upload so `prep_booth_decode` reflects only the histogram dispatch +
    // readback, not the upload.
    const scalarsRawBuf = this.pool.ensureScalarsRawBuf(scalars.byteLength);
    this.scalarsRawBuf = scalarsRawBuf;
    const tScalarUpload0 = performance.now();
    device.queue.writeBuffer(scalarsRawBuf, 0, scalars as BufferSource);
    this.lastScalarUploadMs = performance.now() - tScalarUpload0;
    this.lastScalarUploadBytes = scalars.byteLength;

    // Additive-masking pre-pass: rewrite the just-uploaded scalars in place to
    // (s + R[srsOffset + p]) mod r BEFORE the histogram reads them, so every
    // downstream stage (histogram, level plan, decompose) sees uniform full-
    // width scalars. Indexed by absolute pool position (srsOffset + p), so all
    // batch slots share R and the single offset O the caller subtracts. The
    // submit is ordered before the histogram submit below, so the histogram
    // reads the masked values. Incompatible with the host-histogram bypass,
    // which would read the un-masked host bytes (guarded in create()).
    if (this.maskPipe && this.maskBuf && this.maskParamsBuf && this.maskLayout) {
      if (this.maskBind === null || this.maskBindScalarsBuf !== scalarsRawBuf) {
        this.maskBind = device.createBindGroup({
          layout: this.maskLayout,
          entries: [
            { binding: 0, resource: { buffer: scalarsRawBuf } },
            { binding: 1, resource: { buffer: this.maskBuf } },
            { binding: 2, resource: { buffer: this.maskParamsBuf } },
          ],
        });
        this.maskBindScalarsBuf = scalarsRawBuf;
      }
      // params = (total_scalars, input_size, srs_offset, scalar_words).
      device.queue.writeBuffer(this.maskParamsBuf, 0, new Uint32Array([totalScalars, n, srsOffset, 8]));
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(this.maskPipe);
      pass.setBindGroup(0, this.maskBind);
      pass.dispatchWorkgroups(Math.ceil(totalScalars / this.wgi), 1, 1);
      pass.end();
      device.queue.submit([enc.finish()]);
    }
    // Level-0 histogram. Default path: GPU dispatch. Bypass path
    // (`useHostHistogram`): host JS loop via `buildInitCounts`, no GPU
    // dispatch, no mapAsync, no readback memcpy. The bypass is an A/B
    // diagnostic — it isolates whether the GPU histogram pass (which
    // touches ~34 MB and likely evicts SLC) is the cause of the per-pass
    // GPU regression observed when the GPU path is enabled.
    const tBooth0 = performance.now();
    let initCounts: Uint32Array;
    if (this.useHostHistogram) {
      // No GPU work in this block — write `lastBucketHistogramGpuMs = 0`
      // and let the rest of the pipeline run as normal. For Tier 2 batch
      // mode the buildInitCounts overload knows about the per-MSM W and
      // produces the same B·W × BW grid the GPU shader's `(gid.y → b, w)`
      // split writes.
      this.lastBucketHistogramGpuMs = 0;
      initCounts = buildInitCounts(scalarsBuf, n, c, NUM_WINDOWS, BW, this.windowsPerMsm);
    } else {
      // Rebuild the histogram bind group when scalarsRawBuf's identity changes —
      // ensureScalarsRawBuf bumped scratchEpoch in that case, which is the
      // same signal the run-time bind groups consult.
      if (this.histogramBind === null || this.histogramBindScalarsBuf !== scalarsRawBuf) {
        this.histogramBind = device.createBindGroup({
          layout: this.histogramLayout,
          entries: [
            { binding: 0, resource: { buffer: scalarsRawBuf } },
            { binding: 1, resource: { buffer: this.histogramBuf } },
            { binding: 2, resource: { buffer: this.histogramParamsBuf } },
          ],
        });
        this.histogramBindScalarsBuf = scalarsRawBuf;
      }
      {
        const enc = device.createCommandEncoder();
        enc.clearBuffer(this.histogramBuf);
        const passDesc: GPUComputePassDescriptor = {};
        if (this.profile && this.histogramQuerySet) {
          passDesc.timestampWrites = {
            querySet: this.histogramQuerySet,
            beginningOfPassWriteIndex: 0,
            endOfPassWriteIndex: 1,
          };
        }
        const pass = enc.beginComputePass(passDesc);
        pass.setPipeline(this.histogramPipe);
        pass.setBindGroup(0, this.histogramBind);
        pass.dispatchWorkgroups(Math.ceil(n / this.wgi), NUM_WINDOWS, 1);
        pass.end();
        enc.copyBufferToBuffer(this.histogramBuf, 0, this.histogramStagingBuf, 0, B_TOTAL * 4);
        if (this.profile && this.histogramQuerySet && this.histogramTsResolveBuf && this.histogramTsStagingBuf) {
          enc.resolveQuerySet(this.histogramQuerySet, 0, 2, this.histogramTsResolveBuf, 0);
          enc.copyBufferToBuffer(this.histogramTsResolveBuf, 0, this.histogramTsStagingBuf, 0, 16);
        }
        device.queue.submit([enc.finish()]);
        // Map the histogram counts and the timestamp staging in parallel.
        // Counts is 2 MB; timestamps are 16 bytes — they resolve effectively
        // together, so no extra round-trip cost.
        if (this.profile && this.histogramTsStagingBuf) {
          await Promise.all([
            this.histogramStagingBuf.mapAsync(GPUMapMode.READ),
            this.histogramTsStagingBuf.mapAsync(GPUMapMode.READ),
          ]);
          const tsBytes = this.histogramTsStagingBuf.getMappedRange();
          const ts = new BigUint64Array(tsBytes.slice(0));
          this.histogramTsStagingBuf.unmap();
          this.lastBucketHistogramGpuMs = Number(ts[1] - ts[0]) / 1e6;
        } else {
          await this.histogramStagingBuf.mapAsync(GPUMapMode.READ);
          this.lastBucketHistogramGpuMs = 0;
        }
      }
      if (this.histogramHost === null || this.histogramHost.length !== B_TOTAL) {
        this.histogramHost = new Uint32Array(B_TOTAL);
      }
      this.histogramHost.set(new Uint32Array(this.histogramStagingBuf.getMappedRange()));
      this.histogramStagingBuf.unmap();
      initCounts = this.histogramHost;
    }
    this.lastPrepBoothDecodeMs = performance.now() - tBooth0;

    // Ping-pong two pre-allocated count buffers and fold the wstride1
    // computation into the same walk. Avoids ~18 × ~333 KB allocations per
    // prepare (>5 ms of GC churn for n=88_899) and removes the second pass
    // over `levelCounts` that wstride1 used to do.
    const tLevelPlan0 = performance.now();
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
    this.lastPrepLevelPlanMs = performance.now() - tLevelPlan0;

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
    while (numBatches < NUM_WINDOWS && (estimateMem(numBatches) > MEM_BUDGET || !wgFits(numBatches))) numBatches++;
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

    // `prep_other` is computed at each path's exit point as the residual
    // `lastPrepareMs − scalar_upload − booth_decode − level_plan`. That
    // catches the Uint32Array view setup at the top, this estimateMem +
    // numBatches walk, the fits-check, ensureScratch + bind-group creation
    // on the slow path, and the per-level uniform rewrites on the fast
    // path — everything in `host_prepare` not in a named sub-phase.

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
      // Scalars are already uploaded at the top of prepare(); fastPathRewrite
      // just rewrites the per-level uniforms.
      this.fastPathRewrite(srsOffset, levelPlans, levels);
      this.preparedFor = scalarsBuf;
      this.preparedSrsOffset = srsOffset;
      this.lastPrepareKind = 'fast';
      this.lastPrepareMs = performance.now() - tPrepStart;
      this.lastPrepOtherMs = Math.max(
        0,
        this.lastPrepareMs - this.lastScalarUploadMs - this.lastPrepBoothDecodeMs - this.lastPrepLevelPlanMs,
      );
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
    this.plannerParamsBufs = [];
    this.carryParamsBufs = [];
    this.tileParamsBufs = [];
    this.levelTotalPairBlocks = [];
    this.levelTotalCarries = [];
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
    this.bucketResultBuf = scratch.bucketResultBuf;
    const bucketResult = scratch.bucketResultBuf;
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
    // Scalars are already uploaded and timed at the top of prepare(); the
    // pool adopted our pending scalarsRawBuf, so scratch.scalarsRawBuf is
    // the same identity we already cached on `this`.
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
      mkBind(this.decomposeLayout, [scratch.scalarsRawBuf, bucketAndSignBuf, decomposeParams, bwb]),
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
    const reduceInitParams = ubuf(new Uint32Array([RED_M, this.stride, BW, B_TOTAL]));
    this.reduceInitBind = mkBind(this.reduceInitLayout, [bucketResult, redBuf, isPresentBuf, reduceInitParams]);
    // One kind-specialized dispatch per level: the schedule's (a, b, ppw)
    // ride a per-level uniform, the (M, maxc, stride) constants a shared one.
    const cparams = ubuf(new Uint32Array([RED_M, this.capMAXC, this.stride, 0]));
    this.reduceLevelBinds = this.reducePasses.map((_, i) => {
      const lparams = ubuf(new Uint32Array([schedule[i * 4 + 1], schedule[i * 4 + 2], schedule[i * 4 + 3], 0]));
      return mkBind(this.reduceLevelLayout, [redBuf, isPresentBuf, reducePrefScratch, cparams, lparams]);
    });
    this.redBuf = redBuf;
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
    this.numWgsFinalize = Math.ceil(batchBuckets / WGI);
    // Pool-owned `carryOffBuf` (B_TOTAL u32 — the per-bucket carry-prefix
    // table the two-pass planner needs). Previously this was aliased onto
    // valIdxBuf (which is dead by the time the planner runs), saving
    // ~bTotal × 4 bytes when batchSlots >= bTotal, but Tier 2 batch mode
    // at large n violates that invariant: MEM_BUDGET forces numBatches up,
    // batchWindows down, and batchSlots = batchWindows×n drops below
    // B_TOTAL = B·W·BW. Owning the buffer directly costs a few MB and
    // removes the constraint from the numBatches search.
    const carryOffBuf = scratch.carryOffBuf;
    // Pre-size per-level state so fast-path rewrite has a stable index.
    this.levelTotalPairBlocks = new Array(levels).fill(0);
    this.levelTotalCarries = new Array(levels).fill(0);
    for (let lv = 0; lv < levels; lv++) {
      const plan = levelPlans[lv];
      this.levelTotalPairBlocks[lv] = plan.totalPairBlocks;
      this.levelTotalCarries[lv] = plan.totalCarries;
      const isL0 = lv === 0;
      const inIdx = lv & 1;
      const outIdx = inIdx ^ 1;
      const ring = lv & 1;
      const activeOut = inIdx === 0 ? bufB : bufA;
      const activeIn = isL0 ? l0IdxBuf : inIdx === 0 ? bufA : bufB;
      // Per-level uniform buffers cached on the instance so fastPathRewrite()
      // can rewrite their contents in place on subsequent prepares (avoiding
      // ~40 createBuffer calls per MSM that today dominate wall time).
      const plannerParams = ubuf(new Uint32Array([plan.pairBlocksPerWindow, plan.carriesPerWindow, WGI, wstride1]));
      // carryParams[1] = M_old (stride of bufA/bufB) — must use pool's M1.
      const carryParams = ubuf(new Uint32Array([plan.totalCarries, poolM1, poolM1, 0]));
      this.plannerParamsBufs[lv] = plannerParams;
      this.carryParamsBufs[lv] = carryParams;
      const fusedTiles: { bind: GPUBindGroup; nx: number }[] = [];
      const levelTileBufs: GPUBuffer[] = [];
      for (let tileBase = 0; tileBase < plan.totalPairBlocks; tileBase += FUSED_TILE) {
        const tileThreads = Math.min(FUSED_TILE, plan.totalPairBlocks - tileBase);
        // tileParams[1] = M_old, [2] = M_new (both = bufA/bufB stride) — pool's M1.
        const tileParams = ubuf(new Uint32Array([plan.totalPairBlocks, poolM1, poolM1, tileBase]));
        levelTileBufs.push(tileParams);
        const entries: GPUBindGroupEntry[] = [
          { binding: 0, resource: { buffer: pairBlockPlanRing[ring] } },
          { binding: 1, resource: { buffer: scatterPlanRing[ring] } },
          { binding: 2, resource: { buffer: activeIn } },
          { binding: 3, resource: { buffer: activeOut } },
          { binding: 4, resource: { buffer: tileParams } },
          { binding: 5, resource: { buffer: prefScratchBuf } },
        ];
        if (isL0) {
          entries.push(
            { binding: 6, resource: { buffer: this.pointXBuf } },
            { binding: 7, resource: { buffer: this.pointYBuf } },
          );
        }
        fusedTiles.push({
          bind: device.createBindGroup({ layout: isL0 ? this.fusedLayoutL0 : this.fusedLayout, entries }),
          nx: Math.ceil(tileThreads / WGI),
        });
      }
      this.tileParamsBufs[lv] = levelTileBufs;
      const carryEntries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: carryPlanRing[ring] } },
        { binding: 1, resource: { buffer: activeIn } },
        { binding: 2, resource: { buffer: activeOut } },
        { binding: 3, resource: { buffer: carryParams } },
      ];
      if (isL0) {
        carryEntries.push(
          { binding: 4, resource: { buffer: this.pointXBuf } },
          { binding: 5, resource: { buffer: this.pointYBuf } },
        );
      }
      this.levelBinds.push({
        plannerABind: device.createBindGroup({
          layout: this.plannerALayout,
          entries: [
            { binding: 0, resource: { buffer: countsBufs[inIdx] } },
            { binding: 1, resource: { buffer: carryOffBuf } },
            { binding: 2, resource: { buffer: countsBufs[outIdx] } },
            { binding: 3, resource: { buffer: offsetsBufs[outIdx] } },
            { binding: 4, resource: { buffer: planMeta } },
            { binding: 5, resource: { buffer: plannerParams } },
          ],
        }),
        plannerBBind: device.createBindGroup({
          layout: this.plannerBLayout,
          entries: [
            { binding: 0, resource: { buffer: countsBufs[inIdx] } },
            { binding: 1, resource: { buffer: offsetsBufs[inIdx] } },
            { binding: 2, resource: { buffer: carryOffBuf } },
            { binding: 3, resource: { buffer: offsetsBufs[outIdx] } },
            { binding: 4, resource: { buffer: planMeta } },
            { binding: 5, resource: { buffer: pairBlockPlanRing[ring] } },
            { binding: 6, resource: { buffer: scatterPlanRing[ring] } },
            { binding: 7, resource: { buffer: carryPlanRing[ring] } },
            { binding: 8, resource: { buffer: plannerParams } },
            { binding: 9, resource: { buffer: isL0 ? padParams0Buf : padParams1Buf } },
          ],
        }),
        fusedTiles,
        carryBind: device.createBindGroup({
          layout: isL0 ? this.carryLayoutL0 : this.carryLayout,
          entries: carryEntries,
        }),
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
              { binding: 5, resource: { buffer: this.pointXBuf } },
              { binding: 6, resource: { buffer: this.pointYBuf } },
            );
          }
          return device.createBindGroup({ layout: isL0 ? this.finalizeLayoutL0 : this.finalizeLayout, entries: fe });
        }),
        nCarry: Math.ceil(plan.totalCarries / WGI),
      });
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
        passes += 7; // decompose + xpose x4 + conv x2
        for (let lv = 0; lv < levels; lv++) passes += 4 + this.levelBinds[lv].fusedTiles.length;
      }
      // reduceInit + one dispatch per reduction level.
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
    this.lastPrepareKind = 'slow';
    this.lastPrepareMs = performance.now() - tPrepStart;
    this.lastPrepOtherMs = Math.max(
      0,
      this.lastPrepareMs - this.lastScalarUploadMs - this.lastPrepBoothDecodeMs - this.lastPrepLevelPlanMs,
    );
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
  private fastPathRewrite(srsOffset: number, levelPlans: LevelPlan[], levels: number): void {
    const device = this.device;
    const WGI = this.wgi;
    const FUSED_TILE = this.fusedTileSize;
    // Scalars were uploaded (and timed into `lastScalarUploadMs`) at the
    // top of prepare(), before the GPU histogram dispatch. Nothing to do
    // here for the scalars buffer — the histogram pass and the run-time
    // pipeline both consume the same buffer.
    if (srsOffset !== this.preparedSrsOffset) {
      device.queue.writeBuffer(this.convActiveParamsBuf, 4, new Uint32Array([srsOffset]));
    }
    // Per-level uniforms. We loop over `levels` (the new plan's level count
    // ≤ cap) — extra cached levels past `this.levels` are simply skipped at
    // run() time below via the updated this.levels.
    for (let lv = 0; lv < levels; lv++) {
      const plan = levelPlans[lv];
      // plannerParams = [pairBlocksPerWindow, carriesPerWindow, WGI, wstride1].
      // WGI is constant per instance; wstride1 was baked at slow-path setup
      // as an upper bound and remains valid (M1 ≤ capM1 implies wstride1
      // ≤ capWstride1). Write only the first two u32s; the rest are untouched.
      device.queue.writeBuffer(
        this.plannerParamsBufs[lv],
        0,
        new Uint32Array([plan.pairBlocksPerWindow, plan.carriesPerWindow]),
      );
      // carryParams = [totalCarries, M1, M1, 0]; only totalCarries changes.
      device.queue.writeBuffer(this.carryParamsBufs[lv], 0, new Uint32Array([plan.totalCarries]));
      // tileParams = [totalPairBlocks, M1, M1, tileBase]; only
      // totalPairBlocks changes (tileBase is the cached tile slot's
      // bake-in). Cached tile slots past plan.totalPairBlocks/FUSED_TILE
      // are kept in the cache; the run loop skips them via the new
      // `fts[t].nx = 0` set below.
      const tileBufs = this.tileParamsBufs[lv];
      for (let t = 0; t < tileBufs.length; t++) {
        device.queue.writeBuffer(tileBufs[t], 0, new Uint32Array([plan.totalPairBlocks]));
      }
      // Update dispatch count for this level's carry pass.
      this.levelBinds[lv].nCarry = Math.ceil(plan.totalCarries / WGI);
      // Update each fused tile's dispatch count. Tiles past the new
      // plan.totalPairBlocks naturally dispatch 0 workgroups; we skip them entirely
      // in run() to save the encoder overhead.
      const fts = this.levelBinds[lv].fusedTiles;
      for (let t = 0; t < fts.length; t++) {
        const tileBase = t * FUSED_TILE;
        const tileThreads = Math.max(0, Math.min(FUSED_TILE, plan.totalPairBlocks - tileBase));
        fts[t].nx = Math.ceil(tileThreads / WGI);
      }
      this.levelTotalPairBlocks[lv] = plan.totalPairBlocks;
      this.levelTotalCarries[lv] = plan.totalCarries;
    }
    // run() iterates `levels` levels; the per-call value comes from this.levels.
    this.levels = levels;
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
    // Reset labels at the top of every encode. Bound to the same instance,
    // so a second encodeIntoBatch on the same MSM (rare but legal) overwrites
    // the prior batch's labels — matching what the query set itself does.
    if (profEnabled) this.passLabels.length = 0;
    const dispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, nx: number, ny: number, label: string): void => {
      const desc: GPUComputePassDescriptor = {};
      if (profEnabled) {
        desc.timestampWrites = {
          querySet: this.querySet!,
          beginningOfPassWriteIndex: 2 * passIdx,
          endOfPassWriteIndex: 2 * passIdx + 1,
        };
        this.passLabels.push(label);
        passIdx++;
      }
      const pass = enc.beginComputePass(desc);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.max(1, nx), Math.max(1, ny), 1);
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

    // Reset active-sums + bucket-result buffers. The pad-trio at slots
    // [M1-3, M1-2, M1-1] of each plane must survive (planner anchor) —
    // so we clearBuffer only the NON-pad regions of each plane. The 192
    // bytes of pad data were written once at slow-path setup and never
    // touched again. Two clearBuffer calls per buffer = 4 total, each
    // negligible on every driver. Replaces the old 64×M1 byte
    // copyBufferToBuffer from a persistent padTemplateBuf — saves
    // 64×M1 bytes of GPU memory (~52 MB at n=131k).
    enc.clearBuffer(this.bufA, 0, this.padXOffset);
    enc.clearBuffer(this.bufA, this.planeBytes, this.padXOffset);
    enc.clearBuffer(this.bufB, 0, this.padXOffset);
    enc.clearBuffer(this.bufB, this.planeBytes, this.padXOffset);
    enc.clearBuffer(this.bucketResultBuf);

    for (let bi = 0; bi < this.numBatches; bi++) {
      const tbw = Math.min(this.batchWindows, this.numWindows - bi * this.batchWindows);
      const tSlots = tbw * this.n;
      const bsfx = `#${bi}`;
      dispatch(this.decomposePipe, this.decomposeBinds[bi], this.nXposePts, tbw, `decompose${bsfx}`);
      enc.clearBuffer(this.rowPtrBuf);
      dispatch(this.xposeCountPipe, this.xposeCountBind, this.transposeNumPointTiles, tbw, `xpose_count${bsfx}`);
      dispatch(this.xposeReducePipe, this.xposeReduceBind, Math.ceil(this.BW / 256), tbw, `xpose_reduce${bsfx}`);
      dispatch(this.xposeScanPipe, this.xposeScanBind, this.batchWindows, 1, `xpose_scan${bsfx}`);
      dispatch(this.xposeScatterPipe, this.xposeScatterBind, this.transposeNumPointTiles, tbw, `xpose_scatter${bsfx}`);
      dispatch(this.convActivePipe, this.convActiveBind, Math.ceil(tSlots / WGI), 1, `csr2v2_active${bsfx}`);
      dispatch(this.convMetaPipe, this.convMetaBind, this.nConvMeta, 1, `csr2v2_meta${bsfx}`);
      for (let lv = 0; lv < this.levels; lv++) {
        const lb = this.levelBinds[lv];
        const fp = lv === 0 ? this.fusedPipeL0 : this.fusedPipe;
        const cp = lv === 0 ? this.carryPipeL0 : this.carryPipe;
        const flp = lv === 0 ? this.finalizePipeL0 : this.finalizePipe;
        dispatch(this.plannerAPipe, lb.plannerABind, this.batchWindows, 1, `planner_a${bsfx}`);
        dispatch(this.plannerBPipe, lb.plannerBBind, Math.ceil(this.BW / 256), this.batchWindows, `planner_b${bsfx}`);
        for (const tile of lb.fusedTiles) {
          if (tile.nx > 0) dispatch(fp, tile.bind, tile.nx, 1, `fused${bsfx}`);
        }
        dispatch(cp, lb.carryBind, lb.nCarry, 1, `carry${bsfx}`);
        dispatch(flp, lb.finalizeBinds[bi], this.numWgsFinalize, 1, `finalize${bsfx}`);
      }
    }
    dispatch(this.reduceInitPipe, this.reduceInitBind, this.nReduceInit, 1, 'reduce_init');
    for (let lv = 0; lv < this.reduceLevelBinds.length; lv++) {
      const pipe = this.reduceLevelPipes[this.reduceLevelKinds[lv]];
      dispatch(pipe, this.reduceLevelBinds[lv], this.numWindows, 1, 'reduce_level');
    }
    // Per-window weighted sum gather. Same SoA stride math as run(), just
    // targeting an external staging buffer at an external offset.
    const yPlane = 32 * this.redM;
    for (let w = 0; w < this.numWindows; w++) {
      const g = 32 * w * this.stride;
      enc.copyBufferToBuffer(this.redBuf, g, dstStaging, dstByteOff + w * 64, 32);
      enc.copyBufferToBuffer(this.redBuf, yPlane + g, dstStaging, dstByteOff + w * 64 + 32, 32);
    }
    if (profEnabled && this.tsResolveBuf && this.tsStagingBuf) {
      // Resolve only the slots we actually wrote (fast-path rewrites can
      // skip fused tiles whose dispatch count fell to zero, so passIdx ≤
      // this.passCount). Reading the unused tail would deliver zeros and
      // pollute the per-pass breakdown.
      const usedPairs = passIdx;
      enc.resolveQuerySet(this.querySet!, 0, usedPairs * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, usedPairs * 16);
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
    // Iterate only the passes actually written by the last encodeIntoBatch
    // (this.passLabels.length), not the slow-path cap (this.passCount). On a
    // fast-path rewrite some fused tiles fall to nx=0 and skip dispatch.
    const actual = this.passLabels.length;
    for (let p = 0; p < actual; p++) totalNs += ts[2 * p + 1] - ts[2 * p];
    return Number(totalNs) / 1e6;
  }

  /**
   * Read the per-pass GPU timestamps and pair them with the labels pushed by
   * the last encodeIntoBatch. Same staging-buffer contract as
   * {@link readProfileGpuMs}: caller must ensure the encoder has been
   * submitted and either `device.queue.onSubmittedWorkDone()` or the staging
   * buffer's `mapAsync` has resolved. Returns `[]` when profile mode is off.
   */
  async readProfilePassSamples(): Promise<PassSample[]> {
    if (!this.profile || !this.tsStagingBuf) return [];
    try {
      await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
    } catch {
      return [];
    }
    const ts = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
    this.tsStagingBuf.unmap();
    const labels = this.passLabels;
    const out: PassSample[] = new Array(labels.length);
    for (let p = 0; p < labels.length; p++) {
      out[p] = { label: labels[p], ms: Number(ts[2 * p + 1] - ts[2 * p]) / 1e6 };
    }
    return out;
  }

  /**
   * Like {@link readProfilePassSamples}, but returns each pass's raw GPU
   * begin/end timestamps (nanoseconds, rebased to the run's first begin) rather
   * than just the duration — the input to aligned CPU+GPU tracing. The caller
   * anchors `beginNs = 0` to the CPU submit time. Same staging-buffer contract:
   * the encoder must be submitted and drained before calling.
   */
  async readProfilePassTimeline(): Promise<PassTiming[]> {
    const raw = await this.readProfilePassTimelineRaw();
    return raw ? raw.passes : [];
  }

  /**
   * Like {@link readProfilePassTimeline}, but also returns the raw GPU-clock
   * begin of the first pass (`epochNs`). When several MSMs are encoded into one
   * command buffer they share the device GPU clock, so a caller can place them
   * on a common timeline by offsetting each MSM's passes by
   * `epochNs - min(epochNs)` across the batch. Returns `null` when there is no
   * profile data. Same staging-buffer contract: the encoder must be submitted
   * and drained before calling.
   */
  async readProfilePassTimelineRaw(): Promise<RawPassTimeline | null> {
    if (!this.profile || !this.tsStagingBuf) return null;
    try {
      await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
    } catch {
      return null;
    }
    const ts = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
    this.tsStagingBuf.unmap();
    const labels = this.passLabels;
    if (labels.length === 0) return null;
    // Passes execute in submission order within one command buffer, so ts[0]
    // (first pass begin) is the earliest timestamp; rebasing keeps the values
    // small enough to be exact as Number.
    const t0 = ts[0];
    const passes: PassTiming[] = new Array(labels.length);
    for (let p = 0; p < labels.length; p++) {
      passes[p] = {
        label: labels[p],
        beginNs: Number(ts[2 * p] - t0),
        endNs: Number(ts[2 * p + 1] - t0),
      };
    }
    return { epochNs: t0, passes };
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
    const cb = enc.finish();
    const encT1 = performance.now();
    device.queue.submit([cb]);
    await this.redStaging.mapAsync(GPUMapMode.READ);
    const submitWaitT1 = performance.now();

    const stagingBytes = new Uint8Array(this.redStaging.getMappedRange());
    const L = this.decodeWindowSumsFromBytes(stagingBytes, 0);
    this.redStaging.unmap();
    this.windowSums = L;
    // The bridge ships these per-window sums to the C++ hook for a native
    // bb::g1 combine; the benchmark harness (combineOnHost) does it here.
    const result = this.combineOnHost ? hostWindowCombine(L, this.c) : { x: 0n, y: 0n };
    const decodeT1 = performance.now();

    let profile: ProfileBreakdown | null = null;
    if (this.profile && this.tsStagingBuf) {
      const passes = await this.readProfilePassSamples();
      profile = {
        passes,
        host: {
          host_prepare: this.lastPrepareMs,
          prepare_kind: this.lastPrepareKind,
          host_encode: encT1 - wallT0,
          host_submit_wait: submitWaitT1 - encT1,
          host_decode: decodeT1 - submitWaitT1,
          // Stamp at `decodeT1`, NOT `performance.now()` — `readProfilePassSamples`
          // above adds another mapAsync wait that exists only in profile mode.
          // Including it in `wall` would make profile-mode `wall` strictly
          // larger than non-profile `wall` and inflate `gpu_other` in the
          // per-pass table.
          wall: decodeT1 - wallT0,
          scalar_upload_wall: this.lastScalarUploadMs,
          scalar_upload_bytes: this.lastScalarUploadBytes,
          prep_booth_decode: this.lastPrepBoothDecodeMs,
          prep_level_plan: this.lastPrepLevelPlanMs,
          bucket_histogram_gpu: this.lastBucketHistogramGpuMs,
          prep_other: this.lastPrepOtherMs,
        },
        numBatches: this.numBatches,
        batchWindows: this.batchWindows,
      };
    }
    return { x: result.x, y: result.y, profile, windowSums: L, c: this.c };
  }

  /** True iff this MSM was built with `profile: true` and the device supports
   *  `timestamp-query` — i.e. `run()` will return a non-null `ProfileBreakdown`
   *  and `readProfilePassSamples()` returns real samples. */
  get profileEnabled(): boolean {
    return this.profile;
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

  /** Diagnostic: read back bucket_result. Element b's coords (Montgomery)
   * are at u32 offsets [PG*b*4] (x) and [PG*B_TOTAL*4 + PG*b*4] (y). */
  async debugBucketResult(): Promise<{
    buf: Uint32Array;
    BW: number;
    numWindows: number;
    stride: number;
    rinv: bigint;
  }> {
    const buf = await readbackU32(this.device, this.bucketResultBuf, 2 * PG * this.bTotal * 4 * 4);
    return { buf, BW: this.BW, numWindows: this.numWindows, stride: this.stride, rinv: this.rinv };
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
    this.histogramBuf?.destroy();
    this.histogramStagingBuf?.destroy();
    this.histogramParamsBuf?.destroy();
    this.histogramBind = null;
    this.histogramBindScalarsBuf = null;
    this.histogramHost = null;
    this.histogramQuerySet?.destroy();
    this.histogramQuerySet = null;
    this.histogramTsResolveBuf?.destroy();
    this.histogramTsResolveBuf = null;
    this.histogramTsStagingBuf?.destroy();
    this.histogramTsStagingBuf = null;
    // maskParamsBuf is instance-owned; maskBuf is caller-owned (pool/bridge)
    // and is intentionally NOT destroyed here.
    this.maskParamsBuf?.destroy();
    this.maskParamsBuf = null;
    this.maskBind = null;
    this.maskBindScalarsBuf = null;
    this.maskBuf = null;
  }
}
