// Unit tests for the CPU/GPU work-split planner (CPU_GPU_WORKSHARE_PLAN.md §2/§3).
// Pure / offline — no GPU. The cost model below is the one fit to msm-cpu-vs-gpu.csv
// on M4 (A_cpu ≈ 1.0 µs/non-zero, A_gpu ≈ 0.35 µs/point, GPU floor ≈ 8 ms), so the
// numbers double as a regression against the measured report.
import { describe, expect, test } from '@jest/globals';
import { planBatch, planSingleSplit, type MsmCostModel, type MsmJob } from './split_planner.js';

const M4: MsmCostModel = {
  cpu: { aPerNnz: 1.0e-3, bFixed: 0.3 },
  gpu: { aPerPoint: 3.5e-4, bFloor: 8, bUnion: 2 },
};

const cpuMs = (m: MsmCostModel, nnz: number) => m.cpu.aPerNnz * nnz + m.cpu.bFixed;
const allCpuMs = (m: MsmCostModel, jobs: MsmJob[]) => jobs.reduce((s, j) => (j.n > 0 ? s + cpuMs(m, j.nnz) : s), 0);
const allGpuMs = (m: MsmCostModel, jobs: MsmJob[]) => {
  const total = jobs.reduce((s, j) => s + j.n, 0);
  return total > 0 ? (m.gpu.bUnion ?? m.gpu.bFloor) + m.gpu.aPerPoint * total : 0;
};

describe('planSingleSplit (§2)', () => {
  test('sparse large MSM stays wholly on CPU', () => {
    // n=131071 but only ~131 non-zeros (a range-constraint poly): CPU ≈ 0.4 ms,
    // GPU floor alone is 8 ms — never split.
    const p = planSingleSplit({ n: 131071, nnz: 131 }, M4);
    expect(p.nGpu).toBe(0);
    expect(p.nCpu).toBe(131071);
  });

  test('tiny MSM stays wholly on CPU', () => {
    const p = planSingleSplit({ n: 512, nnz: 512 }, M4);
    expect(p.nGpu).toBe(0);
  });

  test('dense large MSM (Z_PERM) splits ~70% to GPU and balances the engines', () => {
    const n = 131071;
    const p = planSingleSplit({ n, nnz: n }, M4);
    expect(p.nGpu).toBeGreaterThan(0);
    expect(p.nCpu).toBeGreaterThan(0);
    expect(p.nGpu + p.nCpu).toBe(n);
    // GPU gets the majority (it's ~2.9× faster per element here).
    expect(p.nGpu / n).toBeGreaterThan(0.6);
    expect(p.nGpu / n).toBeLessThan(0.8);
    // The two engines finish within a hair of each other (the balance point).
    const cpuSide = M4.cpu.aPerNnz * p.nCpu + M4.cpu.bFixed;
    const gpuSide = M4.gpu.aPerPoint * p.nGpu + M4.gpu.bFloor;
    expect(Math.abs(cpuSide - gpuSide)).toBeLessThan(0.5);
    // And the split beats GPU-only (≈54 ms) and CPU-only (≈131 ms).
    const makespan = Math.max(cpuSide, gpuSide);
    expect(makespan).toBeLessThan(M4.gpu.aPerPoint * n + M4.gpu.bFloor);
    expect(makespan).toBeLessThan(cpuMs(M4, n));
    expect(makespan).toBeGreaterThan(35);
    expect(makespan).toBeLessThan(45);
  });

  test('split is never worse than the better single engine', () => {
    for (const n of [1 << 12, 1 << 14, 1 << 15, 1 << 16, 1 << 17]) {
      for (const density of [0.05, 0.25, 1.0]) {
        const nnz = Math.max(1, Math.round(n * density));
        const p = planSingleSplit({ n, nnz }, M4);
        expect(p.nGpu + p.nCpu).toBe(n);
        const cpuSide = p.nCpu > 0 ? M4.cpu.aPerNnz * (nnz * (p.nCpu / n)) + M4.cpu.bFixed : 0;
        const gpuSide = p.nGpu > 0 ? M4.gpu.aPerPoint * p.nGpu + M4.gpu.bFloor : 0;
        const makespan = Math.max(cpuSide, gpuSide);
        const tCpu = cpuMs(M4, nnz);
        const tGpu = M4.gpu.aPerPoint * n + M4.gpu.bFloor;
        expect(makespan).toBeLessThanOrEqual(Math.min(tCpu, tGpu) + 1e-6);
      }
    }
  });
});

describe('planBatch (§3)', () => {
  test('empty batch costs nothing', () => {
    const p = planBatch([], M4);
    expect(p.makespanMs).toBe(0);
    expect(p.gpuPointTotal).toBe(0);
  });

  test('all-sparse batch stays entirely on CPU', () => {
    const jobs: MsmJob[] = Array.from({ length: 20 }, () => ({ n: 131071, nnz: 50 }));
    const p = planBatch(jobs, M4);
    expect(p.gpuPointTotal).toBe(0);
    expect(p.splitJobIndex).toBeNull();
    for (const j of p.jobs) expect(j.nGpu).toBe(0);
  });

  test('uniform dense batch balances CPU and GPU below both pure strategies', () => {
    const jobs: MsmJob[] = Array.from({ length: 40 }, () => ({ n: 1 << 16, nnz: 1 << 16 }));
    const p = planBatch(jobs, M4);
    expect(p.gpuPointTotal).toBeGreaterThan(0);
    expect(p.makespanMs).toBeLessThan(allCpuMs(M4, jobs));
    expect(p.makespanMs).toBeLessThan(allGpuMs(M4, jobs));
    // Engines roughly balanced.
    expect(Math.abs(p.cpuTimeMs - p.gpuTimeMs)).toBeLessThan(0.05 * p.makespanMs + 1);
    for (const j of p.jobs) expect(j.nGpu + j.nCpu).toBe(j.n);
  });

  test('mixed batch: dense→GPU, sparse→CPU', () => {
    const jobs: MsmJob[] = [
      { n: 88899, nnz: 88899 }, // W_L dense
      { n: 88899, nnz: 88899 }, // W_R dense
      { n: 88899, nnz: 88899 }, // W_O dense
      { n: 131071, nnz: 131071 }, // Z_PERM dense
      ...Array.from({ length: 12 }, () => ({ n: 131071, nnz: 40 })), // range-constraint sparse
      ...Array.from({ length: 30 }, () => ({ n: 4, nnz: 4 })), // calldata tiny
    ];
    const p = planBatch(jobs, M4);
    // The 4 dense ones carry the GPU work; the sparse/tiny ones stay on CPU.
    const denseIdx = [0, 1, 2, 3];
    const gpuPts = p.jobs.filter(j => j.nGpu > 0).reduce((s, j) => s + j.nGpu, 0);
    expect(gpuPts).toBeGreaterThan(0);
    for (const j of p.jobs) {
      if (j.n <= 4 || (j.n > 1000 && jobs[j.index].nnz < 100)) expect(j.nGpu).toBe(0); // sparse/tiny on CPU
    }
    expect(denseIdx.some(i => p.jobs[i].nGpu > 0)).toBe(true);
    expect(p.makespanMs).toBeLessThan(allCpuMs(M4, jobs));
  });

  test('makespan is never worse than all-CPU or all-GPU, across random batches', () => {
    const rand = mulberry(12345);
    for (let trial = 0; trial < 50; trial++) {
      const k = 1 + Math.floor(rand() * 30);
      const jobs: MsmJob[] = Array.from({ length: k }, () => {
        const n = 1 << (8 + Math.floor(rand() * 10)); // 2^8..2^17
        const nnz = Math.max(1, Math.round(n * rand()));
        return { n, nnz };
      });
      const p = planBatch(jobs, M4);
      for (const j of p.jobs) expect(j.nGpu + j.nCpu).toBe(j.n);
      expect(p.makespanMs).toBeLessThanOrEqual(allCpuMs(M4, jobs) + 1e-6);
      expect(p.makespanMs).toBeLessThanOrEqual(allGpuMs(M4, jobs) + 1e-6);
      expect(p.gpuPointTotal).toBeGreaterThanOrEqual(0);
    }
  });

  test('boundary split equalises the engines when it fires', () => {
    // One big dense MSM dwarfs a little CPU pile: must split it to balance.
    const jobs: MsmJob[] = [
      { n: 1 << 17, nnz: 1 << 17 },
      { n: 4096, nnz: 4096 },
    ];
    const p = planBatch(jobs, M4);
    if (p.splitJobIndex !== null) {
      expect(Math.abs(p.cpuTimeMs - p.gpuTimeMs)).toBeLessThan(0.05 * p.makespanMs + 1);
    }
    expect(p.makespanMs).toBeLessThan(allCpuMs(M4, jobs));
  });

  test('deterministic', () => {
    const jobs: MsmJob[] = [
      { n: 1 << 16, nnz: 1 << 16 },
      { n: 1 << 15, nnz: 1 << 14 },
      { n: 1 << 17, nnz: 1 << 17 },
    ];
    expect(planBatch(jobs, M4)).toEqual(planBatch(jobs, M4));
  });
});

// Local PRNG so the random-batch test is reproducible without Math.random.
function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
