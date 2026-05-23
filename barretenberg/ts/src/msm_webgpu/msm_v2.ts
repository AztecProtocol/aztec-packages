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
  plannerABind: GPUBindGroup;
  plannerBBind: GPUBindGroup;
  fusedTiles: { bind: GPUBindGroup; nx: number }[];
  carryBind: GPUBindGroup;
  finalizeBinds: GPUBindGroup[]; // one per window-batch
  nCarry: number;
}

/**
 * The shared SRS point pool: the base points uploaded to the GPU and converted
 * to Montgomery-form 8×u32 layout exactly once, then bound (as a prefix) by
 * every {@link MsmV2} instance. Build it once per proving session from the
 * canonical SRS; `MsmV2.create` references its buffers without re-uploading or
 * re-converting.
 */
export class MsmV2Pool {
  private constructor(
    /** Number of base points held by the pool. */
    readonly srsN: number,
    /** Montgomery-form x coordinates — `srsN` × 8×u32. */
    readonly poolX: GPUBuffer,
    /** Montgomery-form y coordinates — `srsN` × 8×u32. */
    readonly poolY: GPUBuffer,
  ) {}

  /**
   * Upload the canonical SRS and GPU-convert it into the Montgomery point pool.
   * `srsCanonicalBytes` is `srsN × 64` little-endian bytes —
   * `[x0[32] || y0[32] || x1[32] || ...]`, non-Montgomery affine. `srsN` must be
   * a power of two (every SRS is). The conversion is one `convert_points_only`
   * dispatch — the same canonical→Montgomery field multiply MsmV2's pipeline
   * expects, run once for the whole SRS.
   */
  static async create(device: GPUDevice, srsCanonicalBytes: Uint8Array): Promise<MsmV2Pool> {
    const srsN = srsCanonicalBytes.byteLength / 64;
    if (!Number.isInteger(srsN) || srsN <= 0) {
      throw new Error(`MsmV2Pool.create: byte length ${srsCanonicalBytes.byteLength} is not a positive multiple of 64`);
    }

    // convert_points_only reads the raw input from two storage buffers (its
    // first_half / second_half bindings); split by point count.
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

    // Montgomery-form pool: 8×u32 (32 bytes) per coordinate.
    const poolBytes = srsN * 32;
    const poolUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const poolX = device.createBuffer({ size: poolBytes, usage: poolUsage });
    const poolY = device.createBuffer({ size: poolBytes, usage: poolUsage });

    // Workgroup shape that covers srsN exactly — convert_points_only has no
    // bounds guard, so the dispatch must land exactly on srsN threads.
    let workgroupSize: number;
    let numXWorkgroups: number;
    if (srsN <= 256) {
      workgroupSize = srsN;
      numXWorkgroups = 1;
    } else if (srsN <= 32768) {
      workgroupSize = 64;
      numXWorkgroups = 4;
    } else {
      workgroupSize = 256;
      numXWorkgroups = srsN <= 131072 ? 8 : 32;
    }
    const numYWorkgroups = srsN / workgroupSize / numXWorkgroups;
    if (!Number.isInteger(numYWorkgroups) || numYWorkgroups < 1) {
      throw new Error(`MsmV2Pool.create: srsN ${srsN} does not tile — expected a power-of-two SRS size`);
    }

    const sm = new ShaderManager(4, srsN, BN254_CURVE_CONFIG, false);
    const code = sm.gen_convert_points_only_shader(workgroupSize, numYWorkgroups, /* packed */ true);
    const layout = device.createBindGroupLayout({
      entries: (['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform'] as GPUBufferBindingType[]).map(
        (type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } }),
      ),
    });
    const pipeline = await compileOne(device, code, 'convert-points-pool', layout);

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
    return new MsmV2Pool(srsN, poolX, poolY);
  }

  /** Free the pool's two GPU buffers. */
  destroy(): void {
    this.poolX.destroy();
    this.poolY.destroy();
  }
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
  private invVariant!: 'loop' | 'pk';
  private addsub: 'native' | 'unpack' = 'native';
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
  private xposeCountLayout!: GPUBindGroupLayout;
  private xposeReduceLayout!: GPUBindGroupLayout;
  private xposeScanLayout!: GPUBindGroupLayout;
  private xposeScatterLayout!: GPUBindGroupLayout;
  private convActiveLayout!: GPUBindGroupLayout;
  private convMetaLayout!: GPUBindGroupLayout;
  private reduceInitLayout!: GPUBindGroupLayout;
  private reduceLevelLayout!: GPUBindGroupLayout;

  // --- prepare-time (data-dependent) state ---
  private prepBuffers: GPUBuffer[] = []; // every buffer prepare() allocated
  private preparedFor: Uint8Array | null = null; // scalarsBuf identity cache key
  private numBatches = 1;
  private batchWindows = 0;
  private levels = 0;
  private nXposePts = 0;
  private xposeNumChunks = 1;
  private nConvMeta = 0;
  private nReduceInit = 0;
  private numWgsFinalize = 0;
  private rowPtrBuf!: GPUBuffer; // cleared each batch by run()
  private redBuf!: GPUBuffer; // gathered + decoded by run()
  private redStaging!: GPUBuffer; // small mappable L_w gather target
  private bucketResultBuf!: GPUBuffer; // diagnostic readback
  // profiling (created in prepare when this.profile)
  private querySet: GPUQuerySet | null = null;
  private tsResolveBuf: GPUBuffer | null = null;
  private tsStagingBuf: GPUBuffer | null = null;
  private passCount = 0;
  private decomposeBinds!: GPUBindGroup[];
  private xposeCountBind!: GPUBindGroup;
  private xposeReduceBind!: GPUBindGroup;
  private xposeScanBind!: GPUBindGroup;
  private xposeScatterBind!: GPUBindGroup;
  private convActiveBind!: GPUBindGroup;
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
    const wantProfile = config?.profile ?? false;
    m.profile = wantProfile && device.features.has('timestamp-query');
    if (wantProfile && !m.profile) {
      console.warn('[MsmV2] profile requested but timestamp-query unavailable — disabled');
    }
    // Pull the knobs into the local names the rest of create() uses.
    const { s: S, wgi: WGI, l0Log: L0_LOG, reduceWg: REDUCE_WG, invVariant: INV_VARIANT, addsub: ADDSUB } = m;
    m.numWindows = Math.ceil(NUMBITS / m.c);
    m.BW = Math.ceil((2 ** (m.c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
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

    // --- Layouts ---
    const lt = (types: GPUBufferBindingType[]): GPUBindGroupLayout =>
      device.createBindGroupLayout({
        entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
      });
    m.plannerALayout = lt(['read-only-storage', 'storage', 'storage', 'storage', 'storage', 'uniform']);
    m.plannerBLayout = lt([
      'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage',
      'storage', 'storage', 'storage', 'uniform', 'uniform',
    ]);
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
    m.decomposeLayout = lt(['read-only-storage', 'storage', 'uniform', 'uniform']);
    m.xposeCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.xposeReduceLayout = lt(['storage', 'storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform']);
    m.xposeScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    m.convMetaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceInitLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.reduceLevelLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform']);

    // --- Pipelines (data-independent: shape is fixed by c / S / WGI). The
    // planner's PAIR_CAP loop is `break`-bounded, so a generous data-
    // independent bound (max per-bucket pairs <= ceil(n/2)) is free. ---
    const pairCap = Math.ceil(n / 2) + 16;
    m.plannerAPipe = await compileOne(
      device, sm.gen_ba_planner_v2_offsets_shader(PLANNER_TPB, m.c, NUMBITS, m.BW),
      `planner-a-c${m.c}`, m.plannerALayout,
    );
    m.plannerBPipe = await compileOne(
      device, sm.gen_ba_planner_v2_emit_shader(PLANNER_TPB, m.c, NUMBITS, S, pairCap, m.BW),
      `planner-b-c${m.c}`, m.plannerBLayout,
    );
    m.fusedPipe = await compileOne(
      device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true, false, ADDSUB), `fused`, m.fusedLayout,
    );
    m.carryPipe = await compileOne(device, sm.gen_ba_carry_copy_bench_shader(WGI), `carry`, m.carryLayout);
    m.finalizePipe = await compileOne(device, sm.gen_ba_finalize_copy_bench_shader(WGI), `finalize`, m.finalizeLayout);
    m.fusedPipeL0 = await compileOne(
      device, sm.gen_ba_fused_super_bench_shader(WGI, S, INV_VARIANT, true, true, ADDSUB), `fused-l0`, m.fusedLayoutL0,
    );
    m.carryPipeL0 = await compileOne(
      device, sm.gen_ba_carry_copy_bench_shader(WGI, true), `carry-l0`, m.carryLayoutL0,
    );
    m.finalizePipeL0 = await compileOne(
      device, sm.gen_ba_finalize_copy_bench_shader(WGI, true), `finalize-l0`, m.finalizeLayoutL0,
    );
    m.decomposePipe = await compileOne(device, sm.gen_decompose_scalars_booth_shader(WGI), `decompose`, m.decomposeLayout);
    // Tiled counting-sort transpose: count + scatter dispatch across point-
    // chunks (not just windows) so the GPU stays saturated; reduce folds the
    // per-chunk partials; scan is the unchanged per-window prefix sum. Only
    // on-chip shared atomics — no contended global atomics. tile is the
    // shared histogram/cursor capacity (<= 8192 entries = 32KB).
    m.xposeCountPipe = await compileOne(
      device,
      sm.gen_transpose_count_tiled_shader(256, Math.min(m.BW, 8192)),
      `xpose-count`,
      m.xposeCountLayout,
    );
    m.xposeReducePipe = await compileOne(
      device, sm.gen_transpose_reduce_tiled_shader(256), `xpose-reduce`, m.xposeReduceLayout,
    );
    m.xposeScanPipe = await compileOne(device, sm.gen_transpose_scan_shader(m.numWindows), `xpose-scan`, m.xposeScanLayout);
    m.xposeScatterPipe = await compileOne(
      device,
      sm.gen_transpose_scatter_tiled_shader(256, Math.min(m.BW, 8192)),
      `xpose-scatter`,
      m.xposeScatterLayout,
    );
    m.convActivePipe = await compileOne(
      device, sm.gen_csr_to_v2_active_sums_shader(WGI, true, true), `csr2v2-active`, m.convActiveLayout,
    );
    m.convMetaPipe = await compileOne(device, sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta`, m.convMetaLayout);
    m.reduceInitPipe = await compileOne(device, sm.gen_ba_reduce_init_bench_shader(WGI), `reduce-init`, m.reduceInitLayout);
    // Three kind-specialized per-level reduction pipelines (one dispatch per
    // schedule level); binding 4 is a per-level uniform.
    for (const kind of [0, 1, 2]) {
      m.reduceLevelPipes[kind] = await compileOne(
        device,
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
      device.queue.writeBuffer(b, 0, data as BufferSource);
      this.prepBuffers.push(b);
      return b;
    };
    const mkBind = (layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup =>
      device.createBindGroup({ layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });

    // --- Host: scalars (canonical) -> 8×u32 + Booth-decode -> level-0 counts ---
    const scalars = new Uint32Array(n * 8);
    const scalarBig: bigint[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = leBytesToBigint(scalarsBuf, i * 32);
      scalarBig[i] = s;
      // The carry-free Booth decompose bit-slices the raw integer, so the GPU
      // consumes canonical scalars directly — no Montgomery round-trip.
      scalars.set(bigintToPackedU32x8(s), i * 8);
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

    // wstride_lv_out(lv) = max per-window active-sum count at the output of
    // level `lv`. bufB holds outputs of even levels (lv=0, 2, …) — max is
    // lv=0; bufA holds outputs of odd levels (lv=1, 3, …) — max is lv=1.
    // Both are bounded by the max over ALL levels, but odd-level outputs
    // are ~1/2× even-level outputs because the pair-tree halves at each
    // step. Sizing bufA separately to its actual width halves its footprint.
    let wstride1 = 1;        // max over lv>=1 (= bufA width upper bound when both buffers share M1)
    let wstride_evenOut = 1; // max over even-level outputs (bufB width)
    let wstride_oddOut = 1;  // max over odd-level outputs (bufA width)
    for (let lv = 1; lv <= levels; lv++) {
      const lc = levelCounts[lv];
      for (let w = 0; w < NUM_WINDOWS; w++) {
        let cnt = 0;
        for (let b = 0; b < BW; b++) cnt += lc[w * BW + b];
        if (cnt > wstride1) wstride1 = cnt;
        // levelCounts[lv] is the output of level lv-1 in the pair-tree.
        // outIdx parity for lv (in run()) = (lv & 1) ^ 1, so:
        //   lv=0 writes outIdx=1 (bufB); lv=1 writes outIdx=0 (bufA); ...
        const wroteIdx = ((lv - 1) & 1) ^ 1;
        if (wroteIdx === 1 /* bufB */ && cnt > wstride_evenOut) wstride_evenOut = cnt;
        if (wroteIdx === 0 /* bufA */ && cnt > wstride_oddOut) wstride_oddOut = cnt;
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
    const M1_A = M1;
    const M1_B = M1;
    const l0Slots = batchSlots + 3;
    const WSTRIDE = n;

    // --- GPU buffers ---
    const padBuf = buildPadBuf(M1, this.padPts, R);
    const bufA = soa(M1);
    const bufB = soa(M1);
    device.queue.writeBuffer(bufA, 0, padBuf as BufferSource);
    device.queue.writeBuffer(bufB, 0, padBuf as BufferSource);
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
    {
      const cp = sbuf(2 * maxTChunks * S * 4);
      const sp = sbuf(maxTChunks * S * 4);
      const yp = sbuf(2 * maxTCarries * 4);
      chunkPlanRing.push(cp, cp);
      scatterPlanRing.push(sp, sp);
      carryPlanRing.push(yp, yp);
    }
    const padParams0Buf = ubuf(new Uint32Array([batchSlots, batchSlots + 1, M1 - 1, 0]));
    const padParams1Buf = ubuf(new Uint32Array([M1 - 3, M1 - 2, M1 - 1, 0]));
    const FUSED_TILE = Math.min(
      Math.ceil((1 << 16) / WGI) * WGI,
      Math.max(WGI, Math.ceil(maxTChunks / WGI) * WGI),
    );
    const prefScratchBuf = sbuf(FUSED_TILE * S * 8 * 4);

    // Pre-step buffers. Scalars are canonical — uploaded straight into the
    // buffer the Booth-decompose pass reads (no demont pass).
    const scalarsRawBuf = sbuf(scalars.byteLength);
    device.queue.writeBuffer(scalarsRawBuf, 0, scalars);
    // One packed buffer carries both bucket and sign for each (point, window)
    // slot: bucket in low c bits, sign in bit c. Consumed by transpose-count,
    // transpose-scatter (read low c bits as bucket) and csr_to_v2_active_sums
    // (read bit c as sign). Replaces the prior pair of `chunksBuf`+`signsBuf`.
    const chunksBuf = sbuf(batchSlots * 4);
    const signsBuf = chunksBuf;
    const rowPtrBuf = sbuf(batchWindows * (BW + 1) * 4);
    const valIdxBuf = sbuf(batchSlots * 4);
    const decomposeParams = ubuf(new Uint32Array([n, batchWindows, c, 8]));
    // Tiled-transpose geometry: split each window's n points into numChunks
    // chunks so the count/scatter dispatch saturates the GPU. numChunks is
    // capped at floor(n/BW), so the partials matrix (numChunks*BW per window)
    // is <= batchSlots and fits the borrowed l0IdxBuf buffer.
    const xposeNumChunks = Math.max(1, Math.floor(n / BW));
    const xposeChunk = Math.ceil(n / xposeNumChunks);
    const partialStride = xposeNumChunks * BW;
    if (l0Slots < batchWindows * partialStride) {
      throw new Error(
        `tiled transpose: l0IdxBuf (${l0Slots}) too small for the ` +
          `partials matrix (${batchWindows * partialStride})`,
      );
    }
    this.xposeNumChunks = xposeNumChunks;
    const xposeParams = ubuf(new Uint32Array([xposeNumChunks, BW, n, xposeChunk]));
    const convActiveParams = ubuf(new Uint32Array([batchSlots, M1, WSTRIDE, n]));
    const convMetaParams = ubuf(new Uint32Array([BW, batchBuckets, n, 0]));
    const batchWindowBaseBufs: GPUBuffer[] = [];
    for (let bi = 0; bi < numBatches; bi++) {
      batchWindowBaseBufs.push(ubuf(new Uint32Array([bi * batchWindows, 0, 0, 0])));
    }

    this.decomposeBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.decomposeLayout, [scalarsRawBuf, chunksBuf, decomposeParams, bwb]));
    // The transpose borrows l0IdxBuf as the per-chunk partials matrix. Its
    // [0, batchSlots) region is dormant until convActive (which runs strictly
    // after the transpose, per batch) overwrites it; the level-0 seed trio
    // sits above batchSlots and is never touched by the partials region.
    const partialsBuf = l0IdxBuf;
    this.xposeCountBind = mkBind(this.xposeCountLayout, [chunksBuf, partialsBuf, xposeParams]);
    this.xposeReduceBind = mkBind(this.xposeReduceLayout, [partialsBuf, rowPtrBuf, xposeParams]);
    this.xposeScanBind = mkBind(this.xposeScanLayout, [rowPtrBuf, xposeParams]);
    this.xposeScatterBind = mkBind(this.xposeScatterLayout, [chunksBuf, rowPtrBuf, partialsBuf, valIdxBuf, xposeParams]);
    this.convActiveBind = mkBind(this.convActiveLayout, [valIdxBuf, l0IdxBuf, convActiveParams, signsBuf]);
    this.convMetaBind = mkBind(this.convMetaLayout, [rowPtrBuf, countsBufs[0], offsetsBufs[0], convMetaParams]);
    this.rowPtrBuf = rowPtrBuf;    this.nXposePts = Math.ceil(n / WGI);
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
    // Reduction-only buffers alias into batch-loop buffers that are dead
    // by the time reduction runs. redBuf slices the head of bufA, isPresentBuf
    // slices valIdxBuf, reducePrefScratch slices bufB. Per-kernel sizes are
    // dimensioned by params, so the slice size only needs to be >= what the
    // kernel reads/writes (which `soa(RED_M)` and friends already capture).
    const redBufBytes = 2 * PG * RED_M * 4 * 4;
    const isPresentBufBytes = RED_M * 4;
    const reducePrefScratchBytes = NUM_WINDOWS * REDUCE_WG * MAXC * 2 * 16;
    if (bufA.size < redBufBytes) throw new Error(`bufA (${bufA.size}) < redBuf (${redBufBytes})`);
    if (valIdxBuf.size < isPresentBufBytes) throw new Error(`valIdxBuf (${valIdxBuf.size}) < isPresentBuf (${isPresentBufBytes})`);
    if (bufB.size < reducePrefScratchBytes) throw new Error(`bufB (${bufB.size}) < reducePrefScratch (${reducePrefScratchBytes})`);
    const redBufEntry = { buffer: bufA, offset: 0, size: redBufBytes };
    const isPresentBufEntry = { buffer: valIdxBuf, offset: 0, size: isPresentBufBytes };
    const reducePrefScratchEntry = { buffer: bufB, offset: 0, size: reducePrefScratchBytes };
    const reduceInitParams = ubuf(new Uint32Array([RED_M, this.stride, BW, B_TOTAL]));
    this.reduceInitBind = device.createBindGroup({
      layout: this.reduceInitLayout,
      entries: [
        { binding: 0, resource: { buffer: bucketResult } },
        { binding: 1, resource: redBufEntry },
        { binding: 2, resource: isPresentBufEntry },
        { binding: 3, resource: { buffer: reduceInitParams } },
      ],
    });
    // One kind-specialized dispatch per level: the schedule's (a, b, ppw)
    // ride a per-level uniform, the (M, maxc, stride) constants a shared one.
    const cparams = ubuf(new Uint32Array([RED_M, MAXC, this.stride, 0]));
    this.reduceLevelBinds = this.reducePasses.map((_, i) => {
      const lparams = ubuf(new Uint32Array([schedule[i * 4 + 1], schedule[i * 4 + 2], schedule[i * 4 + 3], 0]));
      return device.createBindGroup({
        layout: this.reduceLevelLayout,
        entries: [
          { binding: 0, resource: redBufEntry },
          { binding: 1, resource: isPresentBufEntry },
          { binding: 2, resource: reducePrefScratchEntry },
          { binding: 3, resource: { buffer: cparams } },
          { binding: 4, resource: { buffer: lparams } },
        ],
      });
    });
    // redBuf is consumed by run()'s final copyBufferToBuffer; keep a handle.
    const redBuf = bufA;
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
    // The two-pass planner borrows valIdxBuf as the per-bucket carry-prefix
    // array. valIdxBuf (batchSlots) is dead once convActive has consumed it,
    // strictly before the planner runs; B_TOTAL = numWindows*BW <= batchSlots.
    if (batchSlots < B_TOTAL) {
      throw new Error(`planner: valIdxBuf (${batchSlots}) too small for carry_off (${B_TOTAL})`);
    }
    const carryOffBuf = valIdxBuf;
    for (let lv = 0; lv < levels; lv++) {
      const plan = levelPlans[lv];
      const isL0 = lv === 0;
      const inIdx = lv & 1;
      const outIdx = inIdx ^ 1;
      const ring = lv & 1;
      const activeOut = inIdx === 0 ? bufB : bufA;
      const activeIn = isL0 ? l0IdxBuf : inIdx === 0 ? bufA : bufB;
      // bufA holds odd-level outputs (M1_A); bufB holds even-level outputs
      // (M1_B). For lv >= 1, activeIn = activeOut of lv-1, which has the
      // OPPOSITE parity — so M_in == M of the "other" buffer.
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
            { binding: 5, resource: { buffer: chunkPlanRing[ring] } },
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

    this.preparedFor = scalarsBuf;
    const totalBytes = this.prepBuffers.reduce((a, b) => a + b.size, 0);
    (globalThis as unknown as { __msm_mem_last?: Record<string, number> }).__msm_mem_last = {
      prepBufferCount: this.prepBuffers.length,
      totalBytes,
      totalMiB: totalBytes / (1 << 20),
      numBatches: this.numBatches,
      batchWindows,
      M1,
    };
    console.log(`[msm.mem] prepBuffers=${this.prepBuffers.length} totalBytes=${totalBytes} (${(totalBytes / (1 << 20)).toFixed(1)} MiB) numBatches=${this.numBatches} batchWindows=${batchWindows} M1=${M1}`);
  }

  /**
   * Encode + submit the whole batched pipeline, then decode `red_buf` and
   * host-combine the windows into the affine MSM result (normal form). Must
   * be called after `prepare`. This is the timed phase. When the instance was
   * created with `profile`, the result carries a per-pass GPU breakdown;
   * otherwise `profile` is `null`.
   */
  async run(): Promise<{ x: bigint; y: bigint; profile: ProfileBreakdown | null; windowSums: Pt[]; c: number }> {
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

    // Lever G: outer loop over window batches.
    for (let bi = 0; bi < this.numBatches; bi++) {
      const tbw = Math.min(this.batchWindows, this.numWindows - bi * this.batchWindows);
      const tSlots = tbw * this.n;
      dispatch(this.decomposePipe, this.decomposeBinds[bi], this.nXposePts, tbw, 'decompose');
      enc.clearBuffer(this.rowPtrBuf);
      // Tiled counting sort: count + scatter parallelize across point-chunks;
      // reduce folds the per-chunk partials; scan is the per-window prefix sum.
      dispatch(this.xposeCountPipe, this.xposeCountBind, this.xposeNumChunks, tbw, 'transpose');
      dispatch(this.xposeReducePipe, this.xposeReduceBind, Math.ceil(this.BW / 256), tbw, 'transpose');
      dispatch(this.xposeScanPipe, this.xposeScanBind, this.batchWindows, 1, 'transpose');
      dispatch(this.xposeScatterPipe, this.xposeScatterBind, this.xposeNumChunks, tbw, 'transpose');
      dispatch(this.convActivePipe, this.convActiveBind, Math.ceil(tSlots / WGI), 1, 'convert');
      dispatch(this.convMetaPipe, this.convMetaBind, this.nConvMeta, 1, 'convert');
      for (let lv = 0; lv < this.levels; lv++) {
        const lb = this.levelBinds[lv];
        const fp = lv === 0 ? this.fusedPipeL0 : this.fusedPipe;
        const cp = lv === 0 ? this.carryPipeL0 : this.carryPipe;
        const flp = lv === 0 ? this.finalizePipeL0 : this.finalizePipe;
        dispatch(this.plannerAPipe, lb.plannerABind, this.batchWindows, 1, 'planner');
        dispatch(this.plannerBPipe, lb.plannerBBind, Math.ceil(this.BW / 256), this.batchWindows, 'planner');
        for (const tile of lb.fusedTiles) dispatch(fp, tile.bind, tile.nx, 1, 'fused');
        dispatch(cp, lb.carryBind, lb.nCarry, 1, 'carry');
        dispatch(flp, lb.finalizeBinds[bi], this.numWgsFinalize, 1, 'finalize');
      }
    }
    // Bucket reduction over the global bucket_result.
    dispatch(this.reduceInitPipe, this.reduceInitBind, this.nReduceInit, 1, 'redInit');
    for (let lv = 0; lv < this.reduceLevelBinds.length; lv++) {
      const pipe = this.reduceLevelPipes[this.reduceLevelKinds[lv]];
      dispatch(pipe, this.reduceLevelBinds[lv], this.numWindows, 1, 'redLevel');
    }
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
    // The bridge ships these per-window sums to the C++ hook for a native
    // bb::g1 combine; the benchmark harness (combineOnHost) does it here.
    const result = this.combineOnHost ? hostWindowCombine(L, this.c) : { x: 0n, y: 0n };

    // Per-pass GPU timestamps -> category breakdown (profiling mode only).
    let profile: ProfileBreakdown | null = null;
    if (this.profile && this.tsStagingBuf) {
      await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
      const ts = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
      this.tsStagingBuf.unmap();
      profile = {
        decompose: 0, transpose: 0, convert: 0, planner: 0,
        fused: 0, carry: 0, finalize: 0, redInit: 0, redLevel: 0, wall: 0,
      };
      const acc = profile as unknown as Record<string, number>;
      for (let i = 0; i < cats.length; i++) {
        acc[cats[i]] += Number(ts[2 * i + 1] - ts[2 * i]) / 1e6;
      }
      profile.wall = performance.now() - wallT0;
    }
    return { x: result.x, y: result.y, profile, windowSums: L, c: this.c };
  }

  /** Per-window weighted sums L_w (normal form), set by the last run(). */
  windowSums: Pt[] = [];

  /** Diagnostic: read back bucket_result. Element b's coords (Montgomery)
   * are at u32 offsets [PG*b*4] (x) and [PG*B_TOTAL*4 + PG*b*4] (y). */
  async debugBucketResult(): Promise<{ buf: Uint32Array; BW: number; numWindows: number; stride: number; rinv: bigint }> {
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
  }
}
