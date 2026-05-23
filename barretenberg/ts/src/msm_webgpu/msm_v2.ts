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

// Per-window L_w as a Jacobian point (a = 0). Z = 0 is the point at infinity.
interface Jac {
  x: bigint;
  y: bigint;
  z: bigint;
}

// Jacobian doubling, a = 0 (EFD dbl-2009-l).
function jacDouble(P: Jac): Jac {
  const fadd = (a: bigint, b: bigint): bigint => (a + b) % FP;
  const A = fmul(P.x, P.x);
  const B = fmul(P.y, P.y);
  const Bsq = fmul(B, B);
  const xB = fadd(P.x, B);
  const s = fsub(fmul(xB, xB), fadd(A, Bsq));
  const D = fadd(s, s);
  const E = fadd(fadd(A, A), A);
  const X3 = fsub(fmul(E, E), fadd(D, D));
  const Bsq4 = fadd(fadd(Bsq, Bsq), fadd(Bsq, Bsq));
  const yz = fmul(P.y, P.z);
  const Y3 = fsub(fmul(E, fsub(D, X3)), fadd(Bsq4, Bsq4));
  const Z3 = fadd(yz, yz);
  return { x: X3, y: Y3, z: Z3 };
}

// Jacobian + Jacobian add, a = 0 (EFD add-2007-bl). Caller guarantees neither
// operand is the point at infinity and no x-collision.
function jacAdd(P: Jac, Q: Jac): Jac {
  const fadd = (a: bigint, b: bigint): bigint => (a + b) % FP;
  const Z1Z1 = fmul(P.z, P.z);
  const Z2Z2 = fmul(Q.z, Q.z);
  const U1 = fmul(P.x, Z2Z2);
  const U2 = fmul(Q.x, Z1Z1);
  const S1 = fmul(fmul(P.y, Q.z), Z2Z2);
  const S2 = fmul(fmul(Q.y, P.z), Z1Z1);
  const H = fsub(U2, U1);
  const twoH = fadd(H, H);
  const I = fmul(twoH, twoH);
  const J = fmul(H, I);
  const r = fadd(fsub(S2, S1), fsub(S2, S1));
  const V = fmul(U1, I);
  const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
  const Y3 = fsub(fmul(r, fsub(V, X3)), fadd(fmul(S1, J), fmul(S1, J)));
  const zSum = fadd(P.z, Q.z);
  const Z3 = fmul(fsub(fsub(fmul(zSum, zSum), Z1Z1), Z2Z2), H);
  return { x: X3, y: Y3, z: Z3 };
}

const JAC_INF: Jac = { x: 0n, y: 0n, z: 0n };

// Variants that propagate the Z = 0 (point at infinity) sentinel. Used by
// the host-side Horner — the per-window L_w from the GPU is Jacobian, and
// any window whose buckets are all empty arrives as JAC_INF.
function jacDoubleSafe(P: Jac): Jac {
  return P.z === 0n ? JAC_INF : jacDouble(P);
}
function jacAddSafe(P: Jac, Q: Jac): Jac {
  if (P.z === 0n) return Q;
  if (Q.z === 0n) return P;
  return jacAdd(P, Q);
}

// Window combine: Horner fold of the per-window Jacobian L_w into the final
// MSM point — acc = Σ_w L_w · 2^(w·c). The fold runs in Jacobian (a = 0) so
// every step is inversion-free; one inverse converts back to affine. The
// safe variants make all-empty windows (Z = 0) inert.
function hostWindowCombine(L: Jac[], c: number): Pt {
  let acc: Jac = JAC_INF;
  for (let w = L.length - 1; w >= 0; w--) {
    for (let d = 0; d < c; d++) acc = jacDoubleSafe(acc);
    acc = jacAddSafe(acc, L[w]);
  }
  if (acc.z === 0n) return { x: 0n, y: 0n };
  const zInv = modInverse(acc.z, FP);
  const zInv2 = fmul(zInv, zInv);
  return { x: fmul(acc.x, zInv2), y: fmul(acc.y, fmul(zInv2, zInv)) };
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

// Bucket-reduction workgroup size. Flat 128 — the JBR dispatch is
// "one thread per merge across all windows × buckets", so workgroup size
// is decoupled from c. 128 = 4 SIMD groups on Apple/Adreno, lets one
// workgroup occupy a core fully even when the round has few merges; the
// remaining cores still pick up the next workgroup. Smaller WG (32-64)
// leaves cores idle on late rounds where the dispatch has only ~32 threads.
function pickReduceWg(_c: number): number {
  return 128;
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
  // Jacobian bucket reduction schedule:
  //   round 0 is the AA -> J leaf merge (one thread per (window, pair));
  //   rounds 1..(c-2) are JJ -> J merges, each thread doing 3 JJ adds + r
  //   doublings (where r = round index = number of doublings for that round).
  //   `jbrRounds` is c-2 (= number of JJ rounds), or 0 when c <= 2.
  private jbrRounds!: number;
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
  private jbrAaPipe!: GPUComputePipeline; // round 0: AA -> J (S, W) leaf merge
  private jbrJjPipe!: GPUComputePipeline; // rounds 1..(c-2): JJ -> J merge
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
  private jbrAaLayout!: GPUBindGroupLayout;
  private jbrJjLayout!: GPUBindGroupLayout;

  // --- prepare-time (data-dependent) state ---
  private prepBuffers: GPUBuffer[] = []; // every buffer prepare() allocated
  private preparedFor: Uint8Array | null = null; // scalarsBuf identity cache key
  private numBatches = 1;
  private batchWindows = 0;
  private levels = 0;
  private nXposePts = 0;
  private xposeNumChunks = 1;
  private nConvMeta = 0;
  private numWgsFinalize = 0;
  private rowPtrBuf!: GPUBuffer; // cleared each batch by run()
  // jbrBufs[0] is the round 0 -> 1 destination (also round 1 input); subsequent
  // rounds ping-pong between jbrBufs[0] and jbrBufs[1]. After the last round
  // (count = c-2 + 1 = c-1 dispatches in total) the final NW (S, W) pairs sit
  // in jbrFinalBuf — its plane stride is numWindows so the per-window gather
  // is a contiguous 3-plane copy into redStaging.
  //
  // jbrPresence parallels the (S, W) buffers — 1 u32 per tree node tracking
  // whether the subtree contains at least one non-empty bucket. The AA -> J
  // round writes it from bucket_result emptiness; subsequent JJ -> J rounds
  // OR the children's bits to produce the merged node's bit. The final
  // per-window presence ends up in jbrPresenceFinal and rides back to the
  // host so Horner can skip Z = 0 windows.
  private jbrBufs: GPUBuffer[] = [];
  private jbrFinalBuf!: GPUBuffer; // numWindows (S, W) pairs after the last round
  private jbrPlaneStrides: number[] = []; // per-buffer plane stride in field-elements
  private jbrFinalPlaneStride = 0;
  private jbrPresenceBufs: GPUBuffer[] = [];
  private jbrPresenceFinal!: GPUBuffer;
  private jbrPresenceStaging!: GPUBuffer;
  private redStaging!: GPUBuffer; // small mappable L_w gather target (3 planes × NW × 32B)
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
  // Jacobian bucket reduction dispatches:
  //   jbrAaBind: round 0 (AA -> J)
  //   jbrJjBinds[r]: round r+1 (JJ -> J), for r = 0 .. jbrRounds - 1
  //   jbrDispatchOutCount[i]: output node count for dispatch i (1 + jbrRounds total)
  private jbrAaBind!: GPUBindGroup;
  private jbrJjBinds: GPUBindGroup[] = [];
  private jbrDispatchOutCount: number[] = [];
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
    const { s: S, wgi: WGI, reduceWg: REDUCE_WG, invVariant: INV_VARIANT, addsub: ADDSUB } = m;
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

    // Jacobian (S, W) tree reduction: a single AA -> J dispatch (round 0)
    // followed by c - 2 JJ -> J dispatches (one per tree level). Together
    // they reduce the NW × 2^(c-1) weighted affine buckets to NW Jacobian
    // (S, W) pairs; the W of each pair is L_w.
    if (m.c < 2) {
      throw new Error(`MsmV2.create: c (${m.c}) must be >= 2`);
    }
    m.jbrRounds = m.c - 2;

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
    m.decomposeLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform', 'uniform']);
    m.xposeCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    m.xposeReduceLayout = lt(['storage', 'storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform']);
    m.xposeScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    m.convMetaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.jbrAaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.jbrJjLayout = lt(['read-only-storage', 'storage', 'read-only-storage', 'storage', 'uniform']);

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
    // Jacobian bucket reduction pipelines: one shared AA -> J kernel (round 0)
    // and one shared JJ -> J kernel (rounds 1..c-2, parameterized by
    // num_doublings via the per-round uniform).
    m.jbrAaPipe = await compileOne(device, sm.gen_jbr_aa_to_jj_shader(REDUCE_WG), `jbr-aa`, m.jbrAaLayout);
    m.jbrJjPipe = await compileOne(device, sm.gen_jbr_jj_to_jj_shader(REDUCE_WG), `jbr-jj`, m.jbrJjLayout);

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

    // Pre-step buffers. Scalars are canonical — uploaded straight into the
    // buffer the Booth-decompose pass reads (no demont pass).
    const scalarsRawBuf = sbuf(scalars.byteLength);
    device.queue.writeBuffer(scalarsRawBuf, 0, scalars);
    const chunksBuf = sbuf(batchSlots * 4);
    const signsBuf = sbuf(batchSlots * 4);
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
      mkBind(this.decomposeLayout, [scalarsRawBuf, chunksBuf, signsBuf, decomposeParams, bwb]));
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

    // --- Reduction: Jacobian (S, W) tree ---
    // jbrBufs[0]: round 0 output / round 1 input.
    // jbrBufs[1]: round 2 input (= round 1 output) etc., ping-pong.
    // jbrFinalBuf: last-round output, plane stride = NUM_WINDOWS so each
    //              window's (S, W) is contiguous.
    //
    // Layout per buffer: 6 planes [S.X, S.Y, S.Z, W.X, W.Y, W.Z], each plane
    // is `plane_stride` field-elements wide, packed PG = 2 vec4 per field
    // element. We size jbrBufs[0] for the largest dispatch (round 0 output =
    // NUM_WINDOWS * STRIDE / 2 pairs) and jbrBufs[1] for the second-largest
    // (NUM_WINDOWS * STRIDE / 4 pairs); subsequent rounds reuse them.
    //
    // jbrPresenceBufs parallel jbrBufs with one u32 per node, propagating
    // emptiness from bucket_result through the tree so the host can skip
    // Z = 0 (all-empty) windows.
    const STRIDE = this.stride;
    const jbrStage0 = NUM_WINDOWS * (STRIDE >> 1); // round 0 output node count
    const allocJacBuf = (planeStride: number): GPUBuffer => {
      const bytes = 6 * planeStride * PG * 4 * 4; // 6 planes × stride × 2 vec4 × 16 B
      const b = device.createBuffer({
        size: Math.max(bytes, 16),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      this.prepBuffers.push(b);
      return b;
    };
    const allocPresenceBuf = (nodeCount: number): GPUBuffer => {
      const b = device.createBuffer({
        size: Math.max(nodeCount * 4, 16),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      this.prepBuffers.push(b);
      return b;
    };
    if (this.jbrRounds === 0) {
      // c == 2 -> only the AA -> J round. Its output IS the final per-window
      // (S, W) buffer; no ping-pong needed.
      this.jbrBufs = [];
      this.jbrPresenceBufs = [];
      this.jbrPlaneStrides = [];
      this.jbrFinalPlaneStride = NUM_WINDOWS;
      this.jbrFinalBuf = allocJacBuf(NUM_WINDOWS);
      this.jbrPresenceFinal = allocPresenceBuf(NUM_WINDOWS);
    } else {
      const planeA = jbrStage0;                 // round 0 -> 1
      const planeB = Math.max(1, jbrStage0 >> 1); // round 1 -> 2 onwards
      this.jbrBufs = [allocJacBuf(planeA), allocJacBuf(planeB)];
      this.jbrPresenceBufs = [allocPresenceBuf(planeA), allocPresenceBuf(planeB)];
      this.jbrPlaneStrides = [planeA, planeB];
      this.jbrFinalPlaneStride = NUM_WINDOWS;
      this.jbrFinalBuf = allocJacBuf(NUM_WINDOWS);
      this.jbrPresenceFinal = allocPresenceBuf(NUM_WINDOWS);
    }
    const jbrAaParams = ubuf(new Uint32Array([
      jbrStage0,        // M_pairs
      STRIDE >> 1,      // half_N (per window)
      BW,               // bucket_result stride per window
      B_TOTAL,          // bucket_result y-plane offset (= NW * BW)
    ]));
    const jbrAaOutBuf = this.jbrRounds === 0 ? this.jbrFinalBuf : this.jbrBufs[0];
    const jbrAaOutStride = this.jbrRounds === 0 ? this.jbrFinalPlaneStride : this.jbrPlaneStrides[0];
    const jbrAaOutPres = this.jbrRounds === 0 ? this.jbrPresenceFinal : this.jbrPresenceBufs[0];
    this.jbrAaBind = mkBind(this.jbrAaLayout, [bucketResult, jbrAaOutBuf, jbrAaOutPres, jbrAaParams]);

    // Build the JJ dispatch sequence.
    this.jbrJjBinds = [];
    this.jbrDispatchOutCount = [jbrStage0];
    let prevStride = jbrAaOutStride;
    let prevBuf = jbrAaOutBuf;
    let prevPres = jbrAaOutPres;
    let prevCount = jbrStage0;
    for (let r = 0; r < this.jbrRounds; r++) {
      const isLast = r === this.jbrRounds - 1;
      const outCount = prevCount >> 1;
      const outBuf = isLast ? this.jbrFinalBuf : this.jbrBufs[(r & 1) ^ 1];
      const outStride = isLast ? this.jbrFinalPlaneStride : this.jbrPlaneStrides[(r & 1) ^ 1];
      const outPres = isLast ? this.jbrPresenceFinal : this.jbrPresenceBufs[(r & 1) ^ 1];
      const numDoublings = r + 1; // round 1 -> 1 doubling, round 2 -> 2, ...
      const params = ubuf(new Uint32Array([outCount, prevStride, outStride, numDoublings]));
      this.jbrJjBinds.push(mkBind(this.jbrJjLayout, [prevBuf, outBuf, prevPres, outPres, params]));
      this.jbrDispatchOutCount.push(outCount);
      prevBuf = outBuf;
      prevStride = outStride;
      prevPres = outPres;
      prevCount = outCount;
    }

    // Per-window L_w staging: 3 field-elements (W.X, W.Y, W.Z) × NUM_WINDOWS.
    // Append NUM_WINDOWS × 4 bytes for the parallel presence bitmap so the
    // entire L_w gather is one staging buffer + one mapAsync.
    this.redStaging = device.createBuffer({
      size: NUM_WINDOWS * 3 * 32 + NUM_WINDOWS * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.prepBuffers.push(this.redStaging);
    this.jbrPresenceStaging = this.redStaging;

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
      // Jacobian tree reduction: 1 AA -> J dispatch + jbrRounds JJ -> J dispatches.
      passes += 1 + this.jbrRounds;
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
    // Jacobian bucket reduction tree. Round 0 is AA -> J across all windows
    // (one thread per (window, bucket-pair)). Rounds 1..jbrRounds are JJ -> J,
    // each halving the per-window node count; thread t merges in_buf[2t] and
    // in_buf[2t+1] into out_buf[t]. After the final round, jbrFinalBuf holds
    // NW (S, W) Jacobian pairs — W of each is L_w.
    {
      const nx0 = Math.ceil(this.jbrDispatchOutCount[0] / this.reduceWg);
      dispatch(this.jbrAaPipe, this.jbrAaBind, nx0, 1, 'redInit');
    }
    for (let r = 0; r < this.jbrRounds; r++) {
      const nx = Math.ceil(this.jbrDispatchOutCount[r + 1] / this.reduceWg);
      dispatch(this.jbrJjPipe, this.jbrJjBinds[r], nx, 1, 'redLevel');
    }
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf) {
      enc.resolveQuerySet(this.querySet, 0, passIdx * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, passIdx * 16);
    }
    // Gather each window's W = L_w (Jacobian, 3 field-elements) from the
    // final buffer. Plane stride = NUM_WINDOWS so each plane's chunk for
    // window w is at byte offset (plane * NUM_WINDOWS + w) * 32. We pack
    // (W.X, W.Y, W.Z) per window contiguously into redStaging, then the
    // per-window presence bitmap right after.
    {
      const planeBytes = this.jbrFinalPlaneStride * 32;
      const wxOffset = 3 * planeBytes;
      const wyOffset = 4 * planeBytes;
      const wzOffset = 5 * planeBytes;
      for (let w = 0; w < this.numWindows; w++) {
        const dst = w * 96; // 3 × 32 bytes per window
        enc.copyBufferToBuffer(this.jbrFinalBuf, wxOffset + w * 32, this.redStaging, dst, 32);
        enc.copyBufferToBuffer(this.jbrFinalBuf, wyOffset + w * 32, this.redStaging, dst + 32, 32);
        enc.copyBufferToBuffer(this.jbrFinalBuf, wzOffset + w * 32, this.redStaging, dst + 64, 32);
      }
      enc.copyBufferToBuffer(
        this.jbrPresenceFinal, 0, this.redStaging, this.numWindows * 96, this.numWindows * 4,
      );
    }
    device.queue.submit([enc.finish()]);
    await this.redStaging.mapAsync(GPUMapMode.READ);

    // Decode L_w (Jacobian, Montgomery form) and Horner-combine the windows.
    // Trailing NUM_WINDOWS × 4 bytes hold the parallel `meta` bitmap; the
    // low bit is is_present (the rest is unitp metadata, unused on the
    // host). An absent window collapses to JAC_INF so the safe Horner
    // skips it.
    const red = new Uint32Array(this.redStaging.getMappedRange());
    const metaOff = this.numWindows * 24; // u32 offset of the meta words
    const Ljac: Jac[] = new Array(this.numWindows);
    for (let w = 0; w < this.numWindows; w++) {
      const off = w * 24;
      if ((red[metaOff + w] & 1) === 0) {
        Ljac[w] = JAC_INF;
        continue;
      }
      const x = (packedU32x8ToBigint(red, off) * this.rinv) % FP;
      const y = (packedU32x8ToBigint(red, off + 8) * this.rinv) % FP;
      const z = (packedU32x8ToBigint(red, off + 16) * this.rinv) % FP;
      Ljac[w] = { x, y, z };
    }
    this.redStaging.unmap();
    this.windowSumsJac = Ljac;
    // Bridge: convert to affine per-window L_w by inverting Z so the C++
    // hook can consume them in its native bb::g1 combine. Empty windows
    // (Z = 0) collapse to affine (0, 0) — the C++ side treats that as the
    // point at infinity. Benchmark harness (combineOnHost = true) does the
    // Horner here.
    const L: Pt[] = Ljac.map(j => {
      if (j.z === 0n) return { x: 0n, y: 0n };
      const zInv = modInverse(j.z, FP);
      const zInv2 = fmul(zInv, zInv);
      return { x: fmul(j.x, zInv2), y: fmul(j.y, fmul(zInv2, zInv)) };
    });
    this.windowSums = L;
    const result = this.combineOnHost ? hostWindowCombine(Ljac, this.c) : { x: 0n, y: 0n };

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

  /** Per-window weighted sums L_w (normal form, affine), set by the last run(). */
  windowSums: Pt[] = [];

  /** Per-window weighted sums L_w as Jacobian points (normal form). Avoids
   * one inversion per window when the caller already wants to combine in
   * Jacobian (the C++ hook and host Horner both do). */
  windowSumsJac: Jac[] = [];

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
