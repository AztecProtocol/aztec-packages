// CPU/GPU MSM work-split planner (CPU_GPU_WORKSHARE_PLAN.md §2/§3).
//
// Given a calibrated cost model and a batch of MSMs, decide how to split each
// MSM's points between the CPU (native Pippenger, cost ∝ non-zeros) and the GPU
// (dense O(n), union-batched) so the two engines — run CONCURRENTLY — finish at
// the same time (minimum makespan).
//
// Pure, deterministic, no GPU/wasm dependency: this is the reference the C++
// hook planner is ported from, and it is unit-tested in `split_planner.test.ts`.

/** The coefficients the planner needs (a subset of `MsmCalibration`). */
export interface MsmCostModel {
  cpu: {
    /** ms per non-zero scalar. */
    aPerNnz: number;
    /** per-MSM CPU fixed cost, ms. */
    bFixed: number;
  };
  gpu: {
    /** ms per point (dense). */
    aPerPoint: number;
    /** solo per-dispatch floor, ms (used for a single Commit). */
    bFloor: number;
    /** shared floor for a union batch, ms (used for BatchCommit). Falls back to
     *  `bFloor` when null. */
    bUnion: number | null;
  };
}

/** One MSM to plan. `nnz` is the non-zero scalar count (the density signal); pass
 *  `n` when unknown (treats it as dense — conservative, biases toward the GPU). */
export interface MsmJob {
  n: number;
  nnz: number;
}

/** Per-MSM split decision. `nGpu + nCpu === n`. Either may be 0 (whole on one engine). */
export interface JobPlan {
  index: number;
  n: number;
  nGpu: number;
  nCpu: number;
}

/** The batch plan: per-job splits + the predicted concurrent makespan. */
export interface BatchPlan {
  jobs: JobPlan[];
  /** predicted CPU-side finish time, ms. */
  cpuTimeMs: number;
  /** predicted GPU-side finish time, ms. */
  gpuTimeMs: number;
  /** `max(cpuTimeMs, gpuTimeMs)` — what the batch actually costs with overlap. */
  makespanMs: number;
  /** total points dispatched to the GPU across the batch. */
  gpuPointTotal: number;
  /** index of the one MSM that was fractionally split, or null. */
  splitJobIndex: number | null;
}

export interface PlanOptions {
  /** Don't dispatch a GPU slice smaller than this (avoids paying the floor for a
   *  trivial slice). Default 1024. */
  minGpuSlice?: number;
  /** Don't keep a CPU slice smaller than this when splitting. Default 256. */
  minCpuSlice?: number;
  /** Only split/route to GPU if it beats the better single engine by at least
   *  this fraction (guards against churn for tiny gains). Default 0.02. */
  margin?: number;
}

const DEFAULTS: Required<PlanOptions> = { minGpuSlice: 1024, minCpuSlice: 256, margin: 0.02 };

function cpuTime(model: MsmCostModel, nnz: number): number {
  return model.cpu.aPerNnz * nnz + model.cpu.bFixed;
}

/**
 * Plan a single `Commit` (CPU_GPU_WORKSHARE_PLAN.md §2). Splits one MSM across
 * CPU and GPU at the makespan-balance point, or returns whole-on-one-engine when
 * splitting doesn't help. Uses the SOLO GPU floor (`bFloor`).
 */
export function planSingleSplit(job: MsmJob, model: MsmCostModel, options?: PlanOptions): JobPlan {
  const opt = { ...DEFAULTS, ...options };
  const { n, nnz } = job;
  if (n <= 0) return { index: 0, n, nGpu: 0, nCpu: n };
  const rho = nnz / n;
  const aCpuEff = model.cpu.aPerNnz * rho; // CPU ms per POINT at this density
  const aGpu = model.gpu.aPerPoint;

  const tCpu = cpuTime(model, nnz);
  const tGpu = aGpu * n + model.gpu.bFloor;

  // Balance: aCpuEff·nCpu + bFixed = aGpu·nGpu + bFloor,  nCpu + nGpu = n
  //   ⇒ nGpu = (aCpuEff·n + bFixed − bFloor) / (aGpu + aCpuEff).
  const denom = aCpuEff + aGpu;
  let nGpu = denom > 0 ? Math.round((aCpuEff * n + model.cpu.bFixed - model.gpu.bFloor) / denom) : 0;
  nGpu = Math.max(0, Math.min(n, nGpu));
  const nCpu = n - nGpu;

  // Interior split only if both slices are worth it AND it beats the better engine.
  if (nGpu >= opt.minGpuSlice && nCpu >= opt.minCpuSlice) {
    const makespan = Math.max(aCpuEff * nCpu + model.cpu.bFixed, aGpu * nGpu + model.gpu.bFloor);
    if (makespan < Math.min(tCpu, tGpu) * (1 - opt.margin)) {
      return { index: 0, n, nGpu, nCpu };
    }
  }
  // Whole on the better engine.
  return tGpu < tCpu ? { index: 0, n, nGpu: n, nCpu: 0 } : { index: 0, n, nGpu: 0, nCpu: n };
}

/**
 * Plan a `BatchCommit` (CPU_GPU_WORKSHARE_PLAN.md §3): marginal-benefit greedy
 * (sort by Δ = cpu − gpu_marginal, move GPU-favourable MSMs while it lowers the
 * makespan) + a single fractional split of the boundary MSM to equalise the two
 * engines. Uses the SHARED union floor (`bUnion`, falling back to `bFloor`).
 */
export function planBatch(jobs: MsmJob[], model: MsmCostModel, options?: PlanOptions): BatchPlan {
  const opt = { ...DEFAULTS, ...options };
  const gpuFloor = model.gpu.bUnion ?? model.gpu.bFloor;
  const aGpu = model.gpu.aPerPoint;

  const items = jobs.map((j, index) => ({
    index,
    n: j.n,
    nnz: j.nnz,
    cpu: cpuTime(model, j.nnz),
    gpuMarg: aGpu * j.n,
  }));

  // Start: everything on CPU.
  const onGpu = new Array<boolean>(jobs.length).fill(false);
  let cpuTimeMs = items.reduce((s, it) => (it.n > 0 ? s + it.cpu : s), 0);
  let gpuPoints = 0;
  const gpuTimeOf = (points: number, anyOnGpu: boolean) => (anyOnGpu ? gpuFloor + aGpu * points : 0);

  // Δ-descending order; n=0 jobs never route.
  const order = items
    .filter(it => it.n > 0)
    .map(it => ({ it, delta: it.cpu - it.gpuMarg }))
    .sort((a, b) => b.delta - a.delta);

  let boundary: (typeof items)[number] | null = null;
  for (const { it, delta } of order) {
    if (delta <= 0) break; // remaining jobs are GPU-unfavourable
    const curMakespan = Math.max(cpuTimeMs, gpuTimeOf(gpuPoints, gpuPoints > 0 || onGpu.some(Boolean)));
    const cpuAfter = cpuTimeMs - it.cpu;
    const gpuAfter = gpuFloor + aGpu * (gpuPoints + it.n);
    if (Math.max(cpuAfter, gpuAfter) < curMakespan) {
      onGpu[it.index] = true;
      cpuTimeMs = cpuAfter;
      gpuPoints += it.n;
    } else {
      boundary = it; // moving the WHOLE job overshoots → split it
      break;
    }
  }

  const plans: JobPlan[] = items.map(it => ({
    index: it.index,
    n: it.n,
    nGpu: onGpu[it.index] ? it.n : 0,
    nCpu: onGpu[it.index] ? 0 : it.n,
  }));

  let splitJobIndex: number | null = null;
  if (boundary && boundary.n >= opt.minGpuSlice + opt.minCpuSlice) {
    const anyOnGpu = gpuPoints > 0;
    const gBase = anyOnGpu ? gpuFloor + aGpu * gpuPoints : gpuFloor; // the union exists once the split slice lands
    // f = (C − G_base) / (aGpu·n_j + aCpu·nnz_j)   (derivation in the design doc).
    const denom = aGpu * boundary.n + model.cpu.aPerNnz * boundary.nnz;
    let f = denom > 0 ? (cpuTimeMs - gBase) / denom : 0;
    f = Math.max(0, Math.min(1, f));
    let nGpu = Math.round(f * boundary.n);
    if (nGpu >= opt.minGpuSlice && boundary.n - nGpu >= opt.minCpuSlice) {
      const nCpu = boundary.n - nGpu;
      plans[boundary.index] = { index: boundary.index, n: boundary.n, nGpu, nCpu };
      // Update running totals: remove the boundary job's full CPU cost, add its slices.
      cpuTimeMs =
        cpuTimeMs - boundary.cpu + (model.cpu.aPerNnz * boundary.nnz * (nCpu / boundary.n) + model.cpu.bFixed);
      gpuPoints += nGpu;
      splitJobIndex = boundary.index;
    }
  }

  const anyGpu = plans.some(p => p.nGpu > 0);
  const gpuTimeMs = anyGpu ? gpuFloor + aGpu * gpuPoints : 0;
  return {
    jobs: plans,
    cpuTimeMs,
    gpuTimeMs,
    makespanMs: Math.max(cpuTimeMs, gpuTimeMs),
    gpuPointTotal: gpuPoints,
    splitJobIndex,
  };
}
