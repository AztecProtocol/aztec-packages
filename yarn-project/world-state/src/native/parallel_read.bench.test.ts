import { createLogger } from '@aztec/foundation/log';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { NativeWorldStateService } from './native_world_state.js';

/**
 * Parallel world-state read throughput.
 *
 * Measures committed-read throughput (reads/s) at increasing concurrency. The
 * point is to compare how throughput SCALES with concurrency between the
 * in-process world state (pre-IPC `next`: concurrent LMDB readers) and the
 * IPC-backed world state (this stack: every request serialized through the
 * single-threaded aztec-wsdb dispatch loop).
 *
 * Reads hit a small, hot index set so the measured cost is the read/dispatch
 * round-trip, not disk — that is the dimension that differs between the two
 * models. Identical file on both branches; the only difference is what
 * NativeWorldStateService.tmp() resolves to.
 *
 * Run with LOG_LEVEL=info to see the throughput lines.
 */
describe('world-state parallel read throughput', () => {
  const logger = createLogger('bench:ws-parallel-read');
  const TOTAL_READS = 20_000;
  const CONCURRENCIES = [1, 2, 4, 8, 16];
  const TREE = MerkleTreeId.PUBLIC_DATA_TREE;

  let ws: NativeWorldStateService;

  beforeAll(async () => {
    ws = await NativeWorldStateService.tmp();
  });

  afterAll(async () => {
    await ws.close();
  });

  it('reports read throughput vs concurrency', async () => {
    const committed = ws.getCommitted();

    // Warm up (open db pages, JIT, connect rings) so the first measured run
    // isn't penalised.
    await Promise.all(Array.from({ length: 16 }, () => committed.getSiblingPath(TREE, 0n)));

    const results: { concurrency: number; reads: number; ms: number; throughput: number }[] = [];

    for (const concurrency of CONCURRENCIES) {
      const perWorker = Math.floor(TOTAL_READS / concurrency);
      const reads = perWorker * concurrency;

      const worker = async (workerId: number) => {
        for (let i = 0; i < perWorker; i++) {
          // Small hot index set; each call is still a real read/round-trip.
          await committed.getSiblingPath(TREE, BigInt((workerId + i) % 64));
        }
      };

      const start = performance.now();
      await Promise.all(Array.from({ length: concurrency }, (_, w) => worker(w)));
      const ms = performance.now() - start;
      const throughput = reads / (ms / 1000);

      results.push({ concurrency, reads, ms, throughput });
      logger.info(
        `concurrency=${concurrency} reads=${reads} ms=${ms.toFixed(1)} throughput=${throughput.toFixed(0)} reads/s`,
      );
    }

    // Scaling factor vs the single-threaded baseline — >1 means concurrency
    // helped (parallel reads), ~1 means it was serialized.
    const base = results[0].throughput;
    for (const r of results) {
      logger.info(`concurrency=${r.concurrency} scaling=${(r.throughput / base).toFixed(2)}x vs c=1`);
    }
  }, 120_000);
});
