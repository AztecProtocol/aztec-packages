// GPU calibration for CPU+GPU MSM work-sharing.
//
// A fast (<1 s, first-visit) measurement pass that produces an `MsmCalibration`:
//   1. montmul variant         — karat | cios_unrolled  (adapter prior + real A/B)
//   2. limb radix R            — montgomery bits/limb    (adapter prior; see note)
//   3. CPU + GPU cost models   — the four/five coefficients the split planner needs
//
// The cost models (validated against msm-cpu-vs-gpu.csv on M4 — see
// CPU_GPU_WORKSHARE_PLAN.md §0):
//
//   t_cpu(nnz) = A_cpu · nnz + B_cpu     ms   (native Pippenger; cost ∝ NON-ZEROS)
//   t_gpu(n)   = A_gpu · n   + B_gpu     ms   (GPU is dense O(n))
//
// GPU timing rides the real `MsmV2` pipeline (the production compute path); CPU
// timing is supplied by the caller via {@link CpuMsmTimer} (in bb.js this wraps
// the `bb_native_pippenger_bn254_*` wasm exports). The split planner
// (`split_planner.ts`) consumes the returned model.

import { MsmV2, MsmV2Pool, type MsmConfig } from './msm_v2.js';
import type { MontMulVariant } from './cuzk/shader_manager.js';

const POINT_BYTES = 64;
const SCALAR_BYTES = 32;

/** A least-squares affine fit `y = a·x + b` over the sample points. */
export interface AffineFit {
  a: number;
  b: number;
}

/** The calibrated CPU MSM cost model (native multi-threaded Pippenger). */
export interface CpuCostModel {
  /** ms per non-zero scalar (the Pippenger slope). */
  aPerNnz: number;
  /** per-MSM fixed cost, ms. */
  bFixed: number;
}

/** The calibrated GPU MSM cost model. */
export interface GpuCostModel {
  /** ms per point (dense slope). */
  aPerPoint: number;
  /** solo per-dispatch compute+readback floor, ms. */
  bFloor: number;
  /** shared floor when many MSMs ride ONE union dispatch, ms. `null` if not
   *  measured (the planner then falls back to `bFloor`). */
  bUnion: number | null;
}

/** The full calibration result, cacheable by {@link adapterKey}. */
export interface MsmCalibration {
  /** `vendor/architecture/device` — the cache key. */
  adapterKey: string;
  montmul: MontMulVariant;
  /** Montgomery limb radix (bits/limb). See the note in {@link calibrateMsmEngine}. */
  limbRadix: number;
  cpu: CpuCostModel;
  gpu: GpuCostModel;
  /** False when a measurement looked degenerate; the caller should fall back to
   *  all-CPU rather than trust a bad first-visit calibration. */
  trusted: boolean;
  /** Total wall time the calibration took, ms (includes pipeline compiles). */
  elapsedMs: number;
  /** Measurement-only time, ms — `elapsedMs` minus GPU pipeline compile. This is
   *  the figure the <1 s first-visit budget applies to: shader compile is paid by
   *  the warm-up regardless and is excluded (CPU_GPU_WORKSHARE_PLAN.md §1.4). */
  measureMs: number;
  /** GPU pipeline compile time (MsmV2.create), ms — the part the warm-up absorbs. */
  compileMs: number;
  /** Raw samples + the montmul A/B, for debugging / dashboards. */
  raw: CalibrationRaw;
}

export interface CalibrationRaw {
  cpuSamples: { n: number; ms: number }[];
  gpuSamples: { n: number; ms: number }[];
  montmulAb: { variant: MontMulVariant; n: number; ms: number }[];
  unionSample: { members: number; n: number; ms: number } | null;
  notes: string[];
}

/**
 * CPU MSM timer. The caller decodes `points`/`scalars` (raw LE bytes — `n×64`
 * affine, `n×32` Fr, the same layout the GPU path consumes) and runs the native
 * Pippenger, returning the COMPUTE time in ms (load/decode excluded). In bb.js
 * this wraps `bb_native_pippenger_bn254_load` + a timed `…_run`.
 */
export interface CpuMsmTimer {
  time(points: Uint8Array, scalars: Uint8Array, n: number, threads: number): Promise<number>;
}

export interface CalibrateOptions {
  device: GPUDevice;
  /** SRS pool the production MSM uses (provides the GPU points, srsOffset 0). */
  pool: MsmV2Pool;
  /** Canonical SRS bytes (`≥ max(gpuSizes)·64`) — the CPU timer's points. */
  srsCanonicalBytes: Uint8Array;
  cpuTimer: CpuMsmTimer;
  adapterInfo?: GPUAdapterInfo;
  /** CPU fit sizes (dense). Default `[2^10, 2^12, 2^14]` — kept small; a 2^17
   *  CPU MSM is ~150 ms in wasm and would blow the budget. */
  cpuSizes?: number[];
  /** GPU fit sizes. Default `[2^14, 2^17]`. The smaller doubles as the montmul
   *  A/B size; the larger pins the slope. */
  gpuSizes?: number[];
  /** CPU threads for the native Pippenger (0 = runtime default). */
  cpuThreads?: number;
  /** Base MsmConfig for GPU timing (production defaults: earlyExit on, etc.). */
  config?: MsmConfig;
  /** Also measure the union floor `B_gpu_union` (one extra dispatch). Default true. */
  measureUnion?: boolean;
  /** Force the full karat-vs-cios A/B even when the adapter prior is confident
   *  (compiles BOTH variants). Default: A/B both only when the vendor is unknown;
   *  a known vendor (Apple/Adreno/Mali) measures only its prior, saving a compile. */
  forceMontmulAb?: boolean;
  /** Deterministic scalar seed (testing). */
  seed?: number;
  /** Per-size timed reps (after one warm-up). Default 2; the min is taken. */
  reps?: number;
}

const DEFAULT_CPU_SIZES = [1 << 10, 1 << 12, 1 << 14];
const DEFAULT_GPU_SIZES = [1 << 14, 1 << 17];

/**
 * Serialize a calibration's cost model for the `bb_set_msm_split_model` WASM
 * export: 5 little-endian f64 (ms units) `[cpu_a_per_nnz, cpu_b_fixed,
 * gpu_a_per_point, gpu_b_floor, gpu_b_union]`. The C++ hook routes each MSM to
 * the GPU iff `t_gpu(n) < t_cpu(nnz)` (CPU_GPU_WORKSHARE_PLAN.md §3). bb.js
 * writes these 40 bytes into WASM memory and calls the export with `(ptr,
 * enabled)`. `gpu_b_union ≤ 0` marks the union floor unmeasured.
 */
export function serializeMsmModel(cal: MsmCalibration): Uint8Array {
  const buf = new Uint8Array(5 * 8);
  const dv = new DataView(buf.buffer);
  dv.setFloat64(0, cal.cpu.aPerNnz, true);
  dv.setFloat64(8, cal.cpu.bFixed, true);
  dv.setFloat64(16, cal.gpu.aPerPoint, true);
  dv.setFloat64(24, cal.gpu.bFloor, true);
  dv.setFloat64(32, cal.gpu.bUnion ?? -1, true);
  return buf;
}

/** Least-squares affine fit. With <2 distinct x, returns a flat line at the mean. */
export function fitAffine(samples: { x: number; y: number }[]): AffineFit {
  const pts = samples.filter(s => Number.isFinite(s.x) && Number.isFinite(s.y));
  const n = pts.length;
  if (n === 0) return { a: 0, b: 0 };
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  if (n === 1) return { a: 0, b: pts[0].y };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { a: 0, b: meanY };
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  return { a, b };
}

/** Adapter `vendor/architecture/device` string — the calibration cache key. */
export function adapterKey(info?: GPUAdapterInfo): string {
  if (!info) return 'unknown/unknown/unknown';
  return `${info.vendor || '?'}/${info.architecture || '?'}/${info.device || '?'}`;
}

/**
 * The near-free montmul prior from the adapter (CPU_GPU_WORKSHARE_PLAN.md §1.3):
 * Apple → grouped Karatsuba (high register budget); Adreno/Mali → register-lean
 * CIOS (wins via stream_walker spill elimination). The A/B confirms or overrides.
 */
export function vendorPriorMontmul(info?: GPUAdapterInfo): MontMulVariant {
  const hay = `${info?.vendor ?? ''} ${info?.architecture ?? ''} ${info?.description ?? ''}`.toLowerCase();
  if (hay.includes('apple') || hay.includes('metal')) return 'karat';
  if (hay.includes('qualcomm') || hay.includes('adreno') || hay.includes('arm') || hay.includes('mali')) {
    return 'cios_unrolled';
  }
  // Desktop/unknown: karat is the safe high-register default.
  return 'karat';
}

/** True when the adapter matches a known GPU family, so the montmul prior is
 *  reliable and the A/B can skip compiling the loser (saves a pipeline compile). */
export function vendorPriorConfident(info?: GPUAdapterInfo): boolean {
  const hay = `${info?.vendor ?? ''} ${info?.architecture ?? ''} ${info?.description ?? ''}`.toLowerCase();
  return ['apple', 'metal', 'qualcomm', 'adreno', 'arm', 'mali'].some(k => hay.includes(k));
}

/** Deterministic mulberry32 PRNG (avoids `Math.random`, reproducible by seed). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dense (all non-zero) BN254 Fr scalars, `n × 32` LE bytes. Top byte forced to 0
 * (well below the field modulus) and a low bit set (non-zero). Density = 1 so
 * `nnz = n`, isolating the per-element slopes.
 */
export function makeDenseScalars(n: number, seed: number): Uint8Array {
  const rng = mulberry32(seed);
  const out = new Uint8Array(n * SCALAR_BYTES);
  for (let i = 0; i < n; i++) {
    const off = i * SCALAR_BYTES;
    for (let b = 0; b < 31; b++) out[off + b] = (rng() * 256) | 0;
    out[off] |= 1; // guarantee non-zero
    out[off + 31] = 0; // < modulus
  }
  return out;
}

/**
 * Time one GPU MSM through the real `MsmV2` pipeline. Returns the min run wall
 * over `reps` (after a warm-up) AND the pipeline compile time separately, so the
 * caller can exclude compile from the <1 s budget (the warm-up pays it anyway).
 */
async function timeGpuMsm(
  device: GPUDevice,
  pool: MsmV2Pool,
  n: number,
  scalars: Uint8Array,
  config: MsmConfig,
  reps: number,
): Promise<{ runMs: number; compileMs: number }> {
  const tCompile = performance.now();
  const inst = await MsmV2.create(device, n, pool, config); // compiles pipelines
  const compileMs = performance.now() - tCompile;
  try {
    inst.prepare(scalars, 0);
    await inst.run(); // warm-up: first-touch zero-init out of the timed window
    let best = Infinity;
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      await inst.run();
      best = Math.min(best, performance.now() - t0);
    }
    return { runMs: best, compileMs };
  } finally {
    inst.destroy?.();
  }
}

/**
 * Run the calibration. Returns an {@link MsmCalibration} the split planner can
 * consume, plus `elapsedMs` so the caller can confirm the <1 s budget.
 *
 * NOTE on `limbRadix` (R): the shipped MSM is fixed at the int 20×13 (13-bit)
 * representation; the larger-limb / FP32 float-limb paths
 * (`experiments/fp-montmul`, B16–B22) are not yet wired into `MsmV2`. So `R` is
 * taken from the adapter prior here. The montmul A/B below is the generic
 * "sweep candidate field-arithmetic variants, pick the fastest real-pipeline
 * wall" harness — wiring a radix knob into `MsmConfig` later means adding it to
 * the same A/B, not a rewrite.
 */
export async function calibrateMsmEngine(opts: CalibrateOptions): Promise<MsmCalibration> {
  const t0 = performance.now();
  const notes: string[] = [];
  const reps = Math.max(1, opts.reps ?? 2);
  const seed = opts.seed ?? 0x9e3779b9;
  const cpuSizes = (opts.cpuSizes ?? DEFAULT_CPU_SIZES).slice().sort((a, b) => a - b);
  const gpuSizes = (opts.gpuSizes ?? DEFAULT_GPU_SIZES).slice().sort((a, b) => a - b);
  const cpuThreads = opts.cpuThreads ?? 0;
  const baseConfig: MsmConfig = { earlyExit: true, profile: false, warmupRuns: 0, ...(opts.config ?? {}) };

  // --- montmul A/B at the smallest GPU size (real pipeline; vendor prior breaks ties). ---
  // On a known vendor the prior is reliable, so we measure ONLY the prior variant
  // (one compile); unknown vendors compile both and pick the faster wall.
  const prior = vendorPriorMontmul(opts.adapterInfo);
  const abN = gpuSizes[0];
  const abScalars = makeDenseScalars(abN, seed ^ 0x5151);
  const fullAb = opts.forceMontmulAb ?? !vendorPriorConfident(opts.adapterInfo);
  const candidates: MontMulVariant[] = fullAb ? ['karat', 'cios_unrolled'] : [prior];
  if (!fullAb) notes.push(`montmul A/B skipped (vendor prior ${prior} confident); measured prior only`);
  let compileMs = 0;
  const montmulAb: CalibrationRaw['montmulAb'] = [];
  for (const variant of candidates) {
    let ms: number;
    try {
      const t = await timeGpuMsm(opts.device, opts.pool, abN, abScalars, { ...baseConfig, montmul: variant }, reps);
      ms = t.runMs;
      compileMs += t.compileMs;
    } catch (e) {
      ms = Infinity;
      notes.push(`montmul ${variant} failed to compile/run: ${(e as Error).message}`);
    }
    montmulAb.push({ variant, n: abN, ms });
  }
  const montmul = pickMontmul(montmulAb, prior, notes);

  // --- GPU slope: time the chosen variant at each gpuSize (reuse the A/B winner at abN). ---
  const gpuSamples: { n: number; ms: number }[] = [];
  const abWinner = montmulAb.find(s => s.variant === montmul && s.n === abN);
  if (abWinner && Number.isFinite(abWinner.ms)) gpuSamples.push({ n: abN, ms: abWinner.ms });
  for (const n of gpuSizes) {
    if (n === abN && abWinner && Number.isFinite(abWinner.ms)) continue; // already have it
    const scalars = makeDenseScalars(n, seed ^ n);
    try {
      const t = await timeGpuMsm(opts.device, opts.pool, n, scalars, { ...baseConfig, montmul }, reps);
      gpuSamples.push({ n, ms: t.runMs });
      compileMs += t.compileMs;
    } catch (e) {
      notes.push(`GPU sample n=${n} failed: ${(e as Error).message}`);
    }
  }
  const gpuFit = fitAffine(gpuSamples.map(s => ({ x: s.n, y: s.ms })));

  // --- CPU slope: time the native Pippenger at each cpuSize (dense ⇒ nnz=n). ---
  const cpuSamples: { n: number; ms: number }[] = [];
  for (const n of cpuSizes) {
    const points = opts.srsCanonicalBytes.subarray(0, n * POINT_BYTES);
    if (points.length < n * POINT_BYTES) {
      notes.push(`CPU sample n=${n} skipped: SRS has < ${n} points`);
      continue;
    }
    const scalars = makeDenseScalars(n, seed ^ (n + 1));
    try {
      // One untimed warm call (JIT / page-in), then the min of `reps`.
      await opts.cpuTimer.time(points, scalars, n, cpuThreads);
      let best = Infinity;
      for (let r = 0; r < reps; r++) best = Math.min(best, await opts.cpuTimer.time(points, scalars, n, cpuThreads));
      cpuSamples.push({ n, ms: best });
    } catch (e) {
      notes.push(`CPU sample n=${n} failed: ${(e as Error).message}`);
    }
  }
  const cpuFit = fitAffine(cpuSamples.map(s => ({ x: s.n, y: s.ms })));

  // --- optional union floor: one dispatch of K equal small members. ---
  let unionSample: CalibrationRaw['unionSample'] = null;
  // (Left to the orchestration phase: needs the union runner wired with a pool;
  // the planner falls back to bFloor when bUnion is null.)
  void opts.measureUnion;

  const cpu: CpuCostModel = { aPerNnz: cpuFit.a, bFixed: Math.max(0, cpuFit.b) };
  const gpu: GpuCostModel = {
    aPerPoint: gpuFit.a,
    bFloor: Math.max(0, gpuFit.b),
    // Union floor measurement is deferred to the orchestration phase (needs the
    // union runner + pool); until then the planner falls back to bFloor.
    bUnion: null,
  };

  const trusted = assessTrust(cpu, gpu, cpuSamples, gpuSamples, notes);

  const elapsedMs = performance.now() - t0;
  return {
    adapterKey: adapterKey(opts.adapterInfo),
    montmul,
    limbRadix: 13,
    cpu,
    gpu,
    trusted,
    elapsedMs,
    measureMs: Math.max(0, elapsedMs - compileMs),
    compileMs,
    raw: { cpuSamples, gpuSamples, montmulAb, unionSample, notes },
  };
}

/** Pick the montmul: trust the A/B if both ran and differ by >5 %; else the prior. */
function pickMontmul(ab: CalibrationRaw['montmulAb'], prior: MontMulVariant, notes: string[]): MontMulVariant {
  const byVariant = new Map(ab.map(s => [s.variant, s.ms]));
  const karat = byVariant.get('karat') ?? Infinity;
  const cios = byVariant.get('cios_unrolled') ?? Infinity;
  if (!Number.isFinite(karat) && !Number.isFinite(cios)) {
    notes.push(`montmul A/B: both variants failed; using prior ${prior}`);
    return prior;
  }
  if (!Number.isFinite(karat)) return 'cios_unrolled';
  if (!Number.isFinite(cios)) return 'karat';
  const faster = karat <= cios ? 'karat' : 'cios_unrolled';
  const slower = faster === 'karat' ? cios : karat;
  const fast = faster === 'karat' ? karat : cios;
  const rel = (slower - fast) / fast;
  if (rel < 0.05) {
    notes.push(`montmul A/B within 5% (karat=${karat.toFixed(2)} cios=${cios.toFixed(2)}); using prior ${prior}`);
    return prior;
  }
  notes.push(`montmul A/B chose ${faster} (karat=${karat.toFixed(2)} cios=${cios.toFixed(2)})`);
  return faster;
}

/** Sanity-gate the fitted model; flips `trusted` off (→ all-CPU fallback) if degenerate. */
function assessTrust(
  cpu: CpuCostModel,
  gpu: GpuCostModel,
  cpuSamples: { n: number; ms: number }[],
  gpuSamples: { n: number; ms: number }[],
  notes: string[],
): boolean {
  let ok = true;
  if (cpuSamples.length < 2) {
    notes.push('CPU fit has <2 samples; untrusted');
    ok = false;
  }
  if (gpuSamples.length < 2) {
    notes.push('GPU fit has <2 samples; untrusted');
    ok = false;
  }
  if (cpu.aPerNnz <= 0) {
    notes.push(`CPU slope non-positive (${cpu.aPerNnz}); untrusted`);
    ok = false;
  }
  if (gpu.aPerPoint <= 0) {
    notes.push(`GPU slope non-positive (${gpu.aPerPoint}); untrusted`);
    ok = false;
  }
  return ok;
}
