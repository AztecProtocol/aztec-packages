// msm.ts — backend dispatcher.
//
// One toggle picks the MSM algorithm. Both backends share an MsmPool (the SRS
// uploaded once) and present the same Msm surface, so callers (the dev bench,
// the bb.js bridge) build a pool once and dispatch by `config.backend` without
// knowing which algorithm runs.

import { MsmPool } from './msm_pool.js';
import { MsmStreamWalker, MsmStreamWalkerPool } from './msm_stream_walker.js';
import { MsmHighMemory, MsmHighMemoryPool } from './msm_high_memory.js';
import type { MsmConfig, ProfileBreakdown, Pt } from './msm_types.js';

/** Per-window sums + the folded point, returned by every backend's `run()`. */
export interface MsmRunResult {
  x: bigint;
  y: bigint;
  profile: ProfileBreakdown | null;
  windowSums: Pt[];
  c: number;
}

/** The common surface both backends implement. `getReduceDensePack` is the
 * stream-walker's CPU reduce-tail handoff and is absent on the high-memory
 * backend — callers that use it must check `config.backend` first. */
export interface Msm {
  prepare(scalarsBuf: Uint8Array, srsOffset?: number): void;
  run(): Promise<MsmRunResult>;
  destroy(): void;
  getReduceDensePack?(): {
    dense: Uint8Array;
    ops: Uint32Array;
    rootRank: number;
    kPerWindow: number;
    numWindows: number;
    c: number;
  } | null;
}

/** The per-size backend pool (its own scratch), bundled with its instance so a
 * caller can free both when a size changes; the shared MsmPool outlives it. */
export type BackendPool = MsmStreamWalkerPool | MsmHighMemoryPool;

/** Upload + Montgomery-convert the SRS once; both backends draw from this. */
export function createMsmPool(device: GPUDevice, srsCanonicalBytes: Uint8Array): Promise<MsmPool> {
  return MsmPool.create(device, srsCanonicalBytes);
}

/**
 * Build an n-point MSM on the chosen backend (`config.backend`, default
 * `'stream_walker'`), drawing the SRS from `srsPool`. Returns the instance plus
 * its backend pool — `destroy()` both when the size changes; keep `srsPool`.
 */
export async function createMsm(
  device: GPUDevice,
  n: number,
  srsPool: MsmPool,
  config: MsmConfig = {},
): Promise<{ msm: Msm; pool: BackendPool }> {
  if ((config.backend ?? 'stream_walker') === 'high_memory') {
    const pool = MsmHighMemoryPool.create(device, srsPool);
    const msm = await MsmHighMemory.create(device, n, pool, config);
    return { msm, pool };
  }
  const pool = MsmStreamWalkerPool.create(device, srsPool);
  const msm = await MsmStreamWalker.create(device, n, pool, config);
  return { msm, pool };
}
