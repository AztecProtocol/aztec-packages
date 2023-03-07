import { createDebugLogger } from '@aztec/log';
import { WasmWorker } from './wasm_worker.js';

const debug = createDebugLogger('bb:worker_pool');

export type CreateWorker = (name: string, minMem: number, maxMem: number) => WasmWorker;
/**
 * Allocates a pool of WasmWorker's.
 * Worker 0 is allocated MAX_PAGES memory pages. This is because worker 0 will need to hold the proving key
 * (i.e. has state), whereas the others are pure compute (they hold a little crs state).
 */
export class WorkerPool {
  // TODO(AD): Revisit what this means in aztec 3 context
  // --
  // Introduction of low mem prover work (polynomial cache) may actually increase mem usage when the backing store isn't
  // enabled. We were seeing intermittent failings related to memory in production for some users when limiting to
  // 6660 (416MB). It would be nice to understand why this is (the non determinism and/or the increased mem usage).
  // For now, increasing mem usage to 512MB. This maybe preferable to backing out the low mem work, but
  // ironically may break the chance of us using it in mobile.
  // We *could* enable the low memory backing store, but this needs a little bit of work to actually
  // read/write from indexeddb, performance testing, and actual further memory load testing.
  // At this point it's hard to know what our memory savings would be relative to just fully reverting the LMP.
  // public static MAX_PAGES = 6660;
  public static MAX_PAGES = 8192;
  public workers: WasmWorker[] = [];

  static async new(createWorker: CreateWorker, poolSize: number) {
    const pool = new WorkerPool();
    await pool.init(createWorker, poolSize);
    return pool;
  }

  public async init(createWorker: CreateWorker, poolSize: number, maxMem = WorkerPool.MAX_PAGES) {
    debug(`creating ${poolSize} workers...`);
    const start = new Date().getTime();
    this.workers = await Promise.all(
      Array(poolSize)
        .fill(0)
        .map((_, i) => createWorker(`${i}`, i === 0 ? Math.min(WorkerPool.MAX_PAGES, maxMem) : 768, maxMem)),
    );

    debug(`created workers: ${new Date().getTime() - start}ms`);
  }

  public async destroy() {
    await Promise.all(this.workers.map(w => w.destroyWorker()));
  }
}
