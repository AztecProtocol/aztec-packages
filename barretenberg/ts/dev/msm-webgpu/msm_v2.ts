/// <reference types="@webgpu/types" />
// msm_v2.ts — the memory-bounded v2 pair-tree GPU MSM as a reusable class.
//
// Extracted from `bench-msm-tree-v2.ts` (`runPipeline` / `runOnce`): the same
// carry-free Booth -> transpose -> csr_to_v2 -> pair-tree bucket-accumulate ->
// fused 4-phase reduction, with all five memory levers (window batching,
// index-mode level-0, tiled fused dispatch, plan-buffer ring, dropped -y plane).
//
// The bench drove this with synthetic inputs, a reps loop and host-replay
// validation; `MsmV2` instead consumes a host's real points + scalars and
// returns the affine MSM result. Three phases keep the data-dependent host
// planner out of the timed window:
//   - create(device, n, pointsBuf, c?) — data-independent: compile pipelines,
//     convert + upload the point pool. Once per problem size.
//   - prepare(scalarsBuf)              — UNTIMED: Booth-decode the scalars,
//     plan every level, (re)allocate the data-dependent buffers + bind groups,
//     upload the Montgomery scalars. Cached by scalarsBuf identity.
//   - run() -> {x, y}                  — TIMED: encode + submit the whole
//     batched pipeline, decode red_buf, host-combine the windows.
//
// The math helpers below are copied verbatim from `bench-msm-tree-v2.ts` — that
// file runs a bench on import, so it cannot be imported from. A future cleanup
// could hoist the shared math into its own module.
//
// Known limitations (fine for this benchmark — random scalars over distinct
// SRS bases — but not a production path): the affine-add pair-tree has no
// point-at-infinity handling and no dx==0 fallback-to-double; a colliding pair
// (P == ±Q) would corrupt its chunk's batched inversion.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { BN254_BASE_FIELD, modInverse } from '../../src/msm_webgpu/cuzk/bn254.js';

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
const DEFAULT_INV_VARIANT: 'a' | 'loop' | 'pk' = 'pk';

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
  invVariant?: 'a' | 'loop' | 'pk';
  /** Record per-pass GPU timestamps in `run()` (needs the `timestamp-query` feature). */
  profile?: boolean;
  /** Phase-2 hook — Jacobian-crossover threshold. Accepted but inert in Phase 1. */
  jacobianCrossover?: number;
}

/** Per-pass GPU time (ms) for one `run()`, returned when `profile` is set. */
export interface ProfileBreakdown {
  demont: number;
  decompose: number;
  transpose: number;
  convert: number;
  planner: number;
  fused: number;
  carry: number;
  finalize: number;
  redInit: number;
  redFused: number;
  wall: number;
}

// --- pure helpers (copied from bench-msm-tree-v2.ts) ---

interface Pt {
  x: bigint;
  y: bigint;
}

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

interface LevelPlan {
  cpw: number;
  carpw: number;
  tChunks: number;
  tCarries: number;
}

// Plan one level: per-window pair/carry counts -> next-level counts + the
// per-window chunk/carry strides (cpw/carpw, the max over all windows).
function planLevel(counts: Uint32Array, s: number, numWindows: number, BW: number) {
  const newCounts = new Uint32Array(numWindows * BW);
  let cpw = 1;
  let carpw = 1;
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
    cpw = Math.max(cpw, Math.ceil(pairs / s));
    carpw = Math.max(carpw, carries);
  }
  const plan: LevelPlan = { cpw, carpw, tChunks: 0, tCarries: 0 };
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
    7: 4, 8: 4, 9: 5,
    10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 10, 16: 13, 17: 13, 18: 15, 19: 15, 20: 15,
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
  plannerBind: GPUBindGroup;
  fusedTiles: { bind: GPUBindGroup; nx: number }[];
  carryBind: GPUBindGroup;
  finalizeBinds: GPUBindGroup[]; // one per window-batch
  nCarry: number;
}

/**
 * The memory-bounded v2 pair-tree GPU MSM. See the file header for the
 * create / prepare / run lifecycle.
 */
export class MsmV2 {
  // --- create-time (data-independent) state ---
  private device!: GPUDevice;
  private n!: number;
  private c!: number;
  private numWindows!: number;
  private BW!: number;
  private bTotal!: number;
  private R!: bigint;
  private rinv!: bigint;
  // --- tuning knobs (from MsmConfig; resolved in create) ---
  private s!: number;
  private wgi!: number;
  private l0Log!: number;
  private reduceWg!: number;
  private invVariant!: 'a' | 'loop' | 'pk';
  private profile = false;
  private jacobianCrossover = 0;
  private stride!: number; // reduction STRIDE = 2^(c-1)
  private redM!: number;
  private pointXBuf!: GPUBuffer;
  private pointYBuf!: GPUBuffer;
  private padPts!: Pt[];
  private reducePasses!: { isDouble: boolean; shaderPhase: number; p2x: number; p2y: number; ppw: number }[];
  // pipelines
  private plannerPipe!: GPUComputePipeline;
  private fusedPipe!: GPUComputePipeline;
  private carryPipe!: GPUComputePipeline;
  private finalizePipe!: GPUComputePipeline;
  private fusedPipeL0!: GPUComputePipeline;
  private carryPipeL0!: GPUComputePipeline;
  private finalizePipeL0!: GPUComputePipeline;
  private demontPipe!: GPUComputePipeline;
  private decomposePipe!: GPUComputePipeline;
  private xposeCountPipe!: GPUComputePipeline;
  private xposeScanPipe!: GPUComputePipeline;
  private xposeScatterPipe!: GPUComputePipeline;
  private convActivePipe!: GPUComputePipeline;
  private convMetaPipe!: GPUComputePipeline;
  private reduceInitPipe!: GPUComputePipeline;
  private reduceFusedPipe!: GPUComputePipeline;
  // layouts (needed by prepare to build bind groups)
  private plannerLayout!: GPUBindGroupLayout;
  private fusedLayout!: GPUBindGroupLayout;
  private fusedLayoutL0!: GPUBindGroupLayout;
  private carryLayout!: GPUBindGroupLayout;
  private carryLayoutL0!: GPUBindGroupLayout;
  private finalizeLayout!: GPUBindGroupLayout;
  private finalizeLayoutL0!: GPUBindGroupLayout;
  private demontLayout!: GPUBindGroupLayout;
  private decomposeLayout!: GPUBindGroupLayout;
  private xposeCountLayout!: GPUBindGroupLayout;
  private xposeScanLayout!: GPUBindGroupLayout;
  private xposeScatterLayout!: GPUBindGroupLayout;
  private convActiveLayout!: GPUBindGroupLayout;
  private convMetaLayout!: GPUBindGroupLayout;
  private reduceInitLayout!: GPUBindGroupLayout;
  private reduceFusedLayout!: GPUBindGroupLayout;

  // --- prepare-time (data-dependent) state ---
  private prepBuffers: GPUBuffer[] = []; // every buffer prepare() allocated
  private preparedFor: Uint8Array | null = null; // scalarsBuf identity cache key
  private numBatches = 1;
  private batchWindows = 0;
  private levels = 0;
  private nXposePts = 0;
  private nConvMeta = 0;
  private nReduceInit = 0;
  private numWgsFinalize = 0;
  private rowPtrBuf!: GPUBuffer; // cleared each batch by run()
  private currBuf!: GPUBuffer; // cleared each batch by run()
  private redBuf!: GPUBuffer; // gathered + decoded by run()
  private redStaging!: GPUBuffer; // small mappable L_w gather target
  private bucketResultBuf!: GPUBuffer; // diagnostic readback
  // profiling (created in prepare when this.profile)
  private querySet: GPUQuerySet | null = null;
  private tsResolveBuf: GPUBuffer | null = null;
  private tsStagingBuf: GPUBuffer | null = null;
  private passCount = 0;
  private demontBind!: GPUBindGroup;
  private decomposeBinds!: GPUBindGroup[];
  private xposeCountBind!: GPUBindGroup;
  private xposeScanBind!: GPUBindGroup;
  private xposeScatterBind!: GPUBindGroup;
  private convActiveBind!: GPUBindGroup;
  private convMetaBind!: GPUBindGroup;
  private reduceInitBind!: GPUBindGroup;
  private reduceFusedBind!: GPUBindGroup;
  private levelBinds: LevelBind[] = [];

  private constructor() {}

  /**
   * Build the data-independent half of the pipeline: pipelines, layouts and
   * the Montgomery-form point pool. `pointsBuf` is `n × 64` little-endian
   * bytes — `[x0[32] || y0[32] || x1[32] || ...]`, non-Montgomery affine
   * (the harness / SRS layout). `config` tunes the pipeline knobs; every field
   * defaults to current behaviour (see {@link MsmConfig}).
   */
  static async create(device: GPUDevice, n: number, pointsBuf: Uint8Array, config?: MsmConfig): Promise<MsmV2> {
    const m = new MsmV2();
    m.device = device;
    m.n = n;
    m.c = config?.c ?? pickC(n);
    m.s = config?.s ?? pickS(n);
    m.wgi = config?.wgi ?? DEFAULT_WGI;
    m.l0Log = config?.l0Log ?? DEFAULT_L0_LOG;
    m.reduceWg = config?.reduceWg ?? pickReduceWg(m.c);
    m.invVariant = config?.invVariant ?? DEFAULT_INV_VARIANT;
    m.jacobianCrossover = config?.jacobianCrossover ?? 0;
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
    const misc = compute_misc_params(FP, 13);
    m.R = misc.r;
    m.rinv = misc.rinv;
    const sm = new ShaderManager(4, n, BN254_CURVE_CONFIG, false);

    // Host point conversion: harness affine LE -> Montgomery SoA 8xu32 LE.
    const pointX = new Uint32Array(n * 8);
    const pointY = new Uint32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const x = leBytesToBigint(pointsBuf, i * 64);
      const y = leBytesToBigint(pointsBuf, i * 64 + 32);
      pointX.set(bigintToPackedU32x8((x * m.R) % FP), i * 8);
      pointY.set(bigintToPackedU32x8((y * m.R) % FP), i * 8);
    }
    m.pointXBuf = device.createBuffer({
      size: pointX.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    m.pointYBuf = device.createBuffer({
      size: pointY.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    device.queue.writeBuffer(m.pointXBuf, 0, pointX);
    device.queue.writeBuffer(m.pointYBuf, 0, pointY);

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

    // --- Layouts ---
    const lt = (types: GPUBufferBindingType[]): GPUBindGroupLayout =>
      device.createBindGroupLayout({
        entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
      });
    m.plannerLayout = device.createBindGroupLayout({
      entries: [0, 1, 2, 3, 4, 5, 6, 7]
        .map(binding => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: (binding <= 1 ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
        }))
        .concat(
          [8, 9].map(binding => ({
            binding,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' as GPUBufferBindingType },
          })),
        ),
    });
    m.fusedLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'storage']);
    m.fusedLayoutL0 = lt([
      'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'storage',
      'read-only-storage', 'read-only-storage',
    ]);
    m.carryLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.carryLayoutL0 = lt([
      'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'read-only-storage', 'read-only-storage',
    ]);
    m.finalizeLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.finalizeLayoutL0 = lt([
      'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform',
      'read-only-storage', 'read-only-storage',
    ]);
    m.demontLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.decomposeLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform', 'uniform']);
    m.xposeCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform']);
    m.xposeScatterLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    m.convMetaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceInitLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceFusedLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform']);

    // --- Pipelines (data-independent: shape is fixed by c / S / WGI). The
    // planner's PAIR_CAP loop is `break`-bounded, so a generous data-
    // independent bound (max per-bucket pairs <= ceil(n/2)) is free. ---
    const pairCap = Math.ceil(n / 2) + 16;
    m.plannerPipe = await compileOne(
      device, sm.gen_ba_planner_v2_bench_shader(PLANNER_TPB, m.c, NUMBITS, S, pairCap, m.BW, true),
      `planner-c${m.c}`, m.plannerLayout,
    );
    m.fusedPipe = await compileOne(
      device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true), `fused`, m.fusedLayout,
    );
    m.carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry`, m.carryLayout);
    m.finalizePipe = await compileOne(device, sm.gen_ba_finalize_copy_bench_shader(WGI), `finalize`, m.finalizeLayout);
    m.fusedPipeL0 = await compileOne(
      device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true, true), `fused-l0`, m.fusedLayoutL0,
    );
    m.carryPipeL0 = await compileOne(
      device, sm.gen_ba_carry_copy_bench_shader(WGI, true), `carry-l0`, m.carryLayoutL0,
    );
    m.finalizePipeL0 = await compileOne(
      device, sm.gen_ba_finalize_copy_bench_shader(WGI, true), `finalize-l0`, m.finalizeLayoutL0,
    );
    m.demontPipe = await compileOne(device, sm.gen_demont_scalars_shader(WGI), `demont`, m.demontLayout);
    m.decomposePipe = await compileOne(device, sm.gen_decompose_scalars_booth_shader(WGI), `decompose`, m.decomposeLayout);
    m.xposeCountPipe = await compileOne(device, sm.gen_transpose_count_shader(WGI), `xpose-count`, m.xposeCountLayout);
    m.xposeScanPipe = await compileOne(device, sm.gen_transpose_scan_shader(m.numWindows), `xpose-scan`, m.xposeScanLayout);
    m.xposeScatterPipe = await compileOne(
      device, sm.gen_transpose_scatter_shader(WGI), `xpose-scatter`, m.xposeScatterLayout,
    );
    m.convActivePipe = await compileOne(
      device, sm.gen_csr_to_v2_active_sums_shader(WGI, true, true), `csr2v2-active`, m.convActiveLayout,
    );
    m.convMetaPipe = await compileOne(device, sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta`, m.convMetaLayout);
    m.reduceInitPipe = await compileOne(device, sm.gen_ba_reduce_init_bench_shader(WGI), `reduce-init`, m.reduceInitLayout);
    m.reduceFusedPipe = await compileOne(
      device, sm.gen_ba_reduce_fused_bench_shader(REDUCE_WG, INV_VARIANT), `reduce-fused`, m.reduceFusedLayout,
    );

    // Warm-up: prepare + dispatch several times so the first timed run pays
    // no shader JIT / command-buffer cold start and sees ramped GPU clocks.
    // Dummy scalars (0x01..) give a representative bucket distribution.
    try {
      const dummy = new Uint8Array(n * 32).fill(1);
      m.prepare(dummy);
      for (let w = 0; w < 5; w++) await m.run();
    } catch (e) {
      console.warn(`[MsmV2] warm-up run threw (ignored): ${e instanceof Error ? e.message : String(e)}`);
    }
    return m;
  }

  /**
   * Plan every level for `scalarsBuf` (`n × 32` LE non-Montgomery Fr) and
   * (re)build the data-dependent buffers + bind groups. Untimed setup;
   * cached by `scalarsBuf` identity, so the benchmark's repeated reps over
   * one input pay this once.
   */
  prepare(scalarsBuf: Uint8Array): void {
    if (this.preparedFor === scalarsBuf) return;
    // Drop the previous prepared buffers (a re-prepare with new scalars).
    for (const b of this.prepBuffers) b.destroy();
    this.prepBuffers = [];
    this.levelBinds = [];

    const device = this.device;
    const n = this.n;
    const c = this.c;
    const NUM_WINDOWS = this.numWindows;
    const BW = this.BW;
    const B_TOTAL = this.bTotal;
    const R = this.R;
    const { s: S, wgi: WGI, reduceWg: REDUCE_WG } = this;
    const soa = (M: number): GPUBuffer => {
      const b = device.createBuffer({
        size: 2 * PG * M * 4 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      this.prepBuffers.push(b);
      return b;
    };
    const sbuf = (bytes: number): GPUBuffer => {
      const b = device.createBuffer({
        size: Math.max(bytes, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      this.prepBuffers.push(b);
      return b;
    };
    const ubuf = (data: Uint32Array): GPUBuffer => {
      const b = device.createBuffer({
        size: Math.max(16, Math.ceil(data.byteLength / 16) * 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(b, 0, data);
      this.prepBuffers.push(b);
      return b;
    };
    const mkBind = (layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup =>
      device.createBindGroup({ layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });

    // --- Host: scalars -> Montgomery + Booth-decode -> level-0 counts ---
    const scalars = new Uint32Array(n * 8);
    const scalarBig: bigint[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = leBytesToBigint(scalarsBuf, i * 32);
      scalarBig[i] = s;
      // Host *R; the GPU demont pass divides it back out — the prover hands
      // over Montgomery-form scalars, so the pipeline models that path.
      scalars.set(bigintToPackedU32x8((s * R) % FP), i * 8);
    }
    const initCounts = new Uint32Array(B_TOTAL);
    for (let w = 0; w < NUM_WINDOWS; w++) {
      for (let i = 0; i < n; i++) initCounts[w * BW + boothDigit(scalarBig[i], w, c).bucket]++;
    }

    // --- Host: plan every level ---
    const levelPlans: LevelPlan[] = [];
    const levelCounts: Uint32Array[] = [initCounts];
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
        const { plan, newCounts } = planLevel(counts, S, NUM_WINDOWS, BW);
        levelPlans.push(plan);
        levelCounts.push(newCounts);
        counts = newCounts;
      }
    }
    const levels = levelPlans.length;
    this.levels = levels;

    // wstride1 — tightest per-window active_sums stride for levels >= 1.
    let wstride1 = 1;
    for (let lv = 1; lv <= levels; lv++) {
      const lc = levelCounts[lv];
      for (let w = 0; w < NUM_WINDOWS; w++) {
        let cnt = 0;
        for (let b = 0; b < BW; b++) cnt += lc[w * BW + b];
        if (cnt > wstride1) wstride1 = cnt;
      }
    }

    // --- Lever G: budget-driven window-batch count ---
    const maxCpw = Math.max(1, ...levelPlans.map(p => p.cpw));
    const maxCarpw = Math.max(1, ...levelPlans.map(p => p.carpw));
    const RED_M = this.redM;
    const estimateMem = (nb: number): number => {
      const bw = Math.ceil(NUM_WINDOWS / nb);
      const m1 = bw * wstride1 + 3;
      const bSlots = bw * n;
      const bBuckets = bw * BW;
      const tc = bw * maxCpw;
      const tile = Math.min(Math.ceil((1 << 16) / WGI) * WGI, Math.max(WGI, Math.ceil(tc / WGI) * WGI));
      return (
        2 * 64 * m1 + 64 * B_TOTAL + 4 * 4 * bBuckets + 4 * (bSlots + 3) +
        2 * (3 * tc * S + 2 * bw * maxCarpw) * 4 + tile * S * 8 * 4 + 3 * 4 * bSlots +
        4 * bw * (BW + 1) + 4 * bBuckets + 4 * 32 * n + 68 * RED_M
      );
    };
    const wgFits = (nb: number): boolean => Math.ceil((Math.ceil(NUM_WINDOWS / nb) * n) / WGI) < 65000;
    let numBatches = 1;
    while (numBatches < NUM_WINDOWS && (estimateMem(numBatches) > MEM_BUDGET || !wgFits(numBatches))) numBatches++;
    this.numBatches = numBatches;
    const batchWindows = Math.ceil(NUM_WINDOWS / numBatches);
    this.batchWindows = batchWindows;
    const batchBuckets = batchWindows * BW;
    const batchSlots = batchWindows * n;
    for (const p of levelPlans) {
      p.tChunks = batchWindows * p.cpw;
      p.tCarries = batchWindows * p.carpw;
    }
    const M1 = batchWindows * wstride1 + 3;
    const l0Slots = batchSlots + 3;
    const WSTRIDE = n;

    // --- GPU buffers ---
    const padBuf = buildPadBuf(M1, this.padPts, R);
    const bufA = soa(M1);
    const bufB = soa(M1);
    device.queue.writeBuffer(bufA, 0, padBuf);
    device.queue.writeBuffer(bufB, 0, padBuf);
    const bucketResult = soa(B_TOTAL);
    this.bucketResultBuf = bucketResult;
    const l0IdxBuf = sbuf(l0Slots * 4);
    device.queue.writeBuffer(l0IdxBuf, batchSlots * 4, new Uint32Array([0, 1, 2]));
    const countsBufs = [sbuf(batchBuckets * 4), sbuf(batchBuckets * 4)];
    const offsetsBufs = [sbuf(batchBuckets * 4), sbuf(batchBuckets * 4)];
    const planMeta = sbuf((3 * NUM_WINDOWS + 6) * 4);

    const maxTChunks = Math.max(...levelPlans.map(p => p.tChunks));
    const maxTCarries = Math.max(1, ...levelPlans.map(p => p.tCarries));
    const chunkPlanRing: GPUBuffer[] = [];
    const scatterPlanRing: GPUBuffer[] = [];
    const carryPlanRing: GPUBuffer[] = [];
    for (let r = 0; r < 2; r++) {
      chunkPlanRing.push(sbuf(2 * maxTChunks * S * 4));
      scatterPlanRing.push(sbuf(maxTChunks * S * 4));
      carryPlanRing.push(sbuf(2 * maxTCarries * 4));
    }
    const padParams0Buf = ubuf(new Uint32Array([batchSlots, batchSlots + 1, M1 - 1, 0]));
    const padParams1Buf = ubuf(new Uint32Array([M1 - 3, M1 - 2, M1 - 1, 0]));
    const FUSED_TILE = Math.min(
      Math.ceil((1 << 16) / WGI) * WGI,
      Math.max(WGI, Math.ceil(maxTChunks / WGI) * WGI),
    );
    const prefScratchBuf = sbuf(FUSED_TILE * S * 8 * 4);

    // Pre-step buffers.
    const scalarsGpuBuf = sbuf(scalars.byteLength);
    const scalarsRawBuf = sbuf(scalars.byteLength);
    device.queue.writeBuffer(scalarsGpuBuf, 0, scalars);
    const chunksBuf = sbuf(batchSlots * 4);
    const signsBuf = sbuf(batchSlots * 4);
    const rowPtrBuf = sbuf(batchWindows * (BW + 1) * 4);
    const valIdxBuf = sbuf(batchSlots * 4);
    const currBuf = sbuf(batchBuckets * 4);
    const demontParams = ubuf(new Uint32Array([n, 0, 0, 0]));
    const decomposeParams = ubuf(new Uint32Array([n, batchWindows, c, 8]));
    const xposeParams = ubuf(new Uint32Array([Math.ceil(n / BW), BW, n, 0]));
    const convActiveParams = ubuf(new Uint32Array([batchSlots, M1, WSTRIDE, n]));
    const convMetaParams = ubuf(new Uint32Array([BW, batchBuckets, n, 0]));
    const batchWindowBaseBufs: GPUBuffer[] = [];
    for (let bi = 0; bi < numBatches; bi++) {
      batchWindowBaseBufs.push(ubuf(new Uint32Array([bi * batchWindows, 0, 0, 0])));
    }

    this.demontBind = mkBind(this.demontLayout, [scalarsGpuBuf, scalarsRawBuf, demontParams]);
    this.decomposeBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.decomposeLayout, [scalarsRawBuf, chunksBuf, signsBuf, decomposeParams, bwb]));
    this.xposeCountBind = mkBind(this.xposeCountLayout, [chunksBuf, rowPtrBuf, xposeParams]);
    this.xposeScanBind = mkBind(this.xposeScanLayout, [rowPtrBuf, xposeParams]);
    this.xposeScatterBind = mkBind(this.xposeScatterLayout, [chunksBuf, rowPtrBuf, valIdxBuf, currBuf, xposeParams]);
    this.convActiveBind = mkBind(this.convActiveLayout, [valIdxBuf, l0IdxBuf, convActiveParams, signsBuf]);
    this.convMetaBind = mkBind(this.convMetaLayout, [rowPtrBuf, countsBufs[0], offsetsBufs[0], convMetaParams]);
    this.rowPtrBuf = rowPtrBuf;
    this.currBuf = currBuf;
    this.nXposePts = Math.ceil(n / WGI);
    this.nConvMeta = Math.ceil(batchBuckets / WGI);

    // --- Reduction ---
    let MAXC = 1;
    const schedule = new Uint32Array(64 * 4);
    this.reducePasses.forEach((p, i) => {
      const kind = p.isDouble ? 2 : p.shaderPhase === 0 ? 0 : 1;
      const a = !p.isDouble && p.shaderPhase !== 0 ? p.p2y : p.p2x;
      const b = !p.isDouble && p.shaderPhase === 0 ? p.p2y : 0;
      schedule[i * 4 + 0] = kind;
      schedule[i * 4 + 1] = a;
      schedule[i * 4 + 2] = b;
      schedule[i * 4 + 3] = p.ppw;
      MAXC = Math.max(MAXC, Math.ceil(p.ppw / REDUCE_WG));
    });
    const redBuf = soa(RED_M);
    const isPresentBuf = sbuf(RED_M * 4);
    const reducePrefScratch = sbuf(NUM_WINDOWS * REDUCE_WG * MAXC * 2 * 16);
    const reduceInitParams = ubuf(new Uint32Array([RED_M, this.stride, BW, B_TOTAL]));
    const reduceFusedParams = ubuf(new Uint32Array([this.reducePasses.length, RED_M, MAXC, this.stride]));
    const scheduleBuf = ubuf(schedule);
    this.reduceInitBind = mkBind(this.reduceInitLayout, [bucketResult, redBuf, isPresentBuf, reduceInitParams]);
    this.reduceFusedBind = mkBind(this.reduceFusedLayout, [
      redBuf, isPresentBuf, reducePrefScratch, reduceFusedParams, scheduleBuf,
    ]);
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
      finalizeParamsBufs.push(ubuf(new Uint32Array([batchBuckets, M1, bi * batchBuckets, B_TOTAL])));
    }
    this.numWgsFinalize = Math.ceil(batchBuckets / WGI);
    for (let lv = 0; lv < levels; lv++) {
      const plan = levelPlans[lv];
      const isL0 = lv === 0;
      const inIdx = lv & 1;
      const outIdx = inIdx ^ 1;
      const ring = lv & 1;
      const activeOut = inIdx === 0 ? bufB : bufA;
      const activeIn = isL0 ? l0IdxBuf : inIdx === 0 ? bufA : bufB;
      const plannerParams = ubuf(new Uint32Array([plan.cpw, plan.carpw, WGI, wstride1]));
      const carryParams = ubuf(new Uint32Array([plan.tCarries, M1, M1, 0]));
      const fusedTiles: { bind: GPUBindGroup; nx: number }[] = [];
      for (let tileBase = 0; tileBase < plan.tChunks; tileBase += FUSED_TILE) {
        const tileThreads = Math.min(FUSED_TILE, plan.tChunks - tileBase);
        const tileParams = ubuf(new Uint32Array([plan.tChunks, M1, M1, tileBase]));
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
            { binding: 6, resource: { buffer: this.pointXBuf } },
            { binding: 7, resource: { buffer: this.pointYBuf } },
          );
        }
        fusedTiles.push({
          bind: device.createBindGroup({ layout: isL0 ? this.fusedLayoutL0 : this.fusedLayout, entries }),
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
          { binding: 4, resource: { buffer: this.pointXBuf } },
          { binding: 5, resource: { buffer: this.pointYBuf } },
        );
      }
      this.levelBinds.push({
        plannerBind: device.createBindGroup({
          layout: this.plannerLayout,
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
        nCarry: Math.ceil(plan.tCarries / WGI),
      });
    }

    // --- Profiling: (re)create the timestamp query set, sized to the pass
    // count of the run() this prepare() set up. ---
    this.querySet?.destroy();
    this.querySet = null;
    this.tsResolveBuf = null;
    this.tsStagingBuf = null;
    if (this.profile) {
      let passes = 1; // demont
      for (let bi = 0; bi < numBatches; bi++) {
        passes += 6; // decompose + xpose x3 + conv x2
        for (let lv = 0; lv < levels; lv++) passes += 3 + this.levelBinds[lv].fusedTiles.length;
      }
      passes += 2; // reduceInit + reduceFused
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

    this.preparedFor = scalarsBuf;
  }

  /**
   * Encode + submit the whole batched pipeline, then decode `red_buf` and
   * host-combine the windows into the affine MSM result (normal form). Must
   * be called after `prepare`. This is the timed phase. When the instance was
   * created with `profile`, the result carries a per-pass GPU breakdown;
   * otherwise `profile` is `null`.
   */
  async run(): Promise<{ x: bigint; y: bigint; profile: ProfileBreakdown | null }> {
    if (this.preparedFor === null) throw new Error('MsmV2.run: call prepare() first');
    const { wgi: WGI } = this;
    const device = this.device;
    const wallT0 = performance.now();
    const enc = device.createCommandEncoder();
    const cats: string[] = [];
    let passIdx = 0;
    const dispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, nx: number, ny = 1, cat = '') => {
      const desc: GPUComputePassDescriptor = {};
      if (this.profile && this.querySet) {
        desc.timestampWrites = {
          querySet: this.querySet,
          beginningOfPassWriteIndex: 2 * passIdx,
          endOfPassWriteIndex: 2 * passIdx + 1,
        };
        cats.push(cat);
        passIdx++;
      }
      const pass = enc.beginComputePass(desc);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.max(1, nx), Math.max(1, ny), 1);
      pass.end();
    };

    // De-Montgomery the scalars once (batch-independent).
    dispatch(this.demontPipe, this.demontBind, this.nXposePts, 1, 'demont');
    // Lever G: outer loop over window batches.
    for (let bi = 0; bi < this.numBatches; bi++) {
      const tbw = Math.min(this.batchWindows, this.numWindows - bi * this.batchWindows);
      const tSlots = tbw * this.n;
      dispatch(this.decomposePipe, this.decomposeBinds[bi], this.nXposePts, tbw, 'decompose');
      enc.clearBuffer(this.rowPtrBuf);
      enc.clearBuffer(this.currBuf);
      dispatch(this.xposeCountPipe, this.xposeCountBind, this.nXposePts, tbw, 'transpose');
      dispatch(this.xposeScanPipe, this.xposeScanBind, this.batchWindows, 1, 'transpose');
      dispatch(this.xposeScatterPipe, this.xposeScatterBind, this.nXposePts, tbw, 'transpose');
      dispatch(this.convActivePipe, this.convActiveBind, Math.ceil(tSlots / WGI), 1, 'convert');
      dispatch(this.convMetaPipe, this.convMetaBind, this.nConvMeta, 1, 'convert');
      for (let lv = 0; lv < this.levels; lv++) {
        const lb = this.levelBinds[lv];
        const fp = lv === 0 ? this.fusedPipeL0 : this.fusedPipe;
        const cp = lv === 0 ? this.carryPipeL0 : this.carryPipe;
        const flp = lv === 0 ? this.finalizePipeL0 : this.finalizePipe;
        dispatch(this.plannerPipe, lb.plannerBind, this.batchWindows, 1, 'planner');
        for (const tile of lb.fusedTiles) dispatch(fp, tile.bind, tile.nx, 1, 'fused');
        dispatch(cp, lb.carryBind, lb.nCarry, 1, 'carry');
        dispatch(flp, lb.finalizeBinds[bi], this.numWgsFinalize, 1, 'finalize');
      }
    }
    // Bucket reduction over the global bucket_result.
    dispatch(this.reduceInitPipe, this.reduceInitBind, this.nReduceInit, 1, 'redInit');
    dispatch(this.reduceFusedPipe, this.reduceFusedBind, this.numWindows, 1, 'redFused');
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf) {
      enc.resolveQuerySet(this.querySet, 0, passIdx * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, passIdx * 16);
    }
    // Gather each window's weighted sum L_w (slot w*STRIDE of red_buf's
    // x-plane||y-plane SoA) into a small staging buffer, encoded into the
    // same command list — the whole run is then one submit + one map.
    const yPlane = 32 * this.redM;
    for (let w = 0; w < this.numWindows; w++) {
      const g = 32 * w * this.stride;
      enc.copyBufferToBuffer(this.redBuf, g, this.redStaging, w * 64, 32);
      enc.copyBufferToBuffer(this.redBuf, yPlane + g, this.redStaging, w * 64 + 32, 32);
    }
    device.queue.submit([enc.finish()]);
    await this.redStaging.mapAsync(GPUMapMode.READ);

    // Decode L_w (Montgomery form) and Horner-combine the windows.
    const red = new Uint32Array(this.redStaging.getMappedRange());
    const L: Pt[] = new Array(this.numWindows);
    for (let w = 0; w < this.numWindows; w++) {
      const x = (packedU32x8ToBigint(red, w * 16) * this.rinv) % FP;
      const y = (packedU32x8ToBigint(red, w * 16 + 8) * this.rinv) % FP;
      L[w] = { x, y };
    }
    this.redStaging.unmap();
    this.windowSums = L;
    const result = hostWindowCombine(L, this.c);

    // Per-pass GPU timestamps -> category breakdown (profiling mode only).
    let profile: ProfileBreakdown | null = null;
    if (this.profile && this.tsStagingBuf) {
      await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
      const ts = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
      this.tsStagingBuf.unmap();
      profile = {
        demont: 0, decompose: 0, transpose: 0, convert: 0, planner: 0,
        fused: 0, carry: 0, finalize: 0, redInit: 0, redFused: 0, wall: 0,
      };
      const acc = profile as unknown as Record<string, number>;
      for (let i = 0; i < cats.length; i++) {
        acc[cats[i]] += Number(ts[2 * i + 1] - ts[2 * i]) / 1e6;
      }
      profile.wall = performance.now() - wallT0;
    }
    return { x: result.x, y: result.y, profile };
  }

  /** Per-window weighted sums L_w (normal form), set by the last run(). */
  windowSums: Pt[] = [];

  /** Diagnostic: read back bucket_result. Element b's coords (Montgomery)
   * are at u32 offsets [PG*b*4] (x) and [PG*B_TOTAL*4 + PG*b*4] (y). */
  async debugBucketResult(): Promise<{ buf: Uint32Array; BW: number; numWindows: number; stride: number; rinv: bigint }> {
    const buf = await readbackU32(this.device, this.bucketResultBuf, 2 * PG * this.bTotal * 4 * 4);
    return { buf, BW: this.BW, numWindows: this.numWindows, stride: this.stride, rinv: this.rinv };
  }

  /** Release every GPU buffer owned by this instance. */
  destroy(): void {
    for (const b of this.prepBuffers) b.destroy();
    this.prepBuffers = [];
    this.preparedFor = null;
    this.querySet?.destroy();
    this.querySet = null;
    this.pointXBuf?.destroy();
    this.pointYBuf?.destroy();
  }
}
