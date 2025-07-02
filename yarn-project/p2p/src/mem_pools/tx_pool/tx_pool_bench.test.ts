import { shuffle } from '@aztec/foundation/array';
import { timesAsync } from '@aztec/foundation/collection';
import { getDefaultConfig } from '@aztec/foundation/config';
import { Timer } from '@aztec/foundation/timer';
import { AztecLMDBStoreV2, createStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';
import type { TxHash } from '@aztec/stdlib/tx';
import { ServerWorldStateSynchronizer, worldStateConfigMappings } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { mock } from 'jest-mock-extended';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import type { TxPool } from './tx_pool.js';

const RUNS = 50;
const batchSizes = [
  // regular gossip
  1,
  // batches of txs from block proposals
  4, 8, 20, 40,
  // 400 - takes too long
] as const;

describe('TxPool: Benchmarks', () => {
  let pool: TxPool;
  let store: AztecLMDBStoreV2;
  let dataDirectory: string;
  let ws: NativeWorldStateService;
  let wsSync: ServerWorldStateSynchronizer;
  let dbSizeBytes: Record<(typeof batchSizes)[number], number>;
  let addHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;
  let getHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;
  let delHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;

  beforeAll(() => {
    dbSizeBytes = Object.fromEntries(batchSizes.map(size => [size, 0])) as any;
    addHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
    getHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
    delHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];
      for (const size of batchSizes) {
        const add = addHistogram[size];
        const get = getHistogram[size];
        const del = delHistogram[size];

        data.push({
          name: `TxPool/${size} txs/addTxs/dbSize_after_${RUNS}_batches`,
          value: dbSizeBytes[size],
          unit: 'bytes',
        });

        data.push({
          name: `TxPool/${size} txs/addTxs/avg`,
          value: add.mean,
          unit: 'ms',
        });
        data.push({
          name: `TxPool/${size} txs/addTxs/p50`,
          value: add.percentile(50),
          unit: 'ms',
        });
        data.push({
          name: `TxPool/${size} txs/addTxs/p95`,
          value: add.percentile(95),
          unit: 'ms',
        });

        data.push({
          name: `TxPool/${size} txs/getTxsByHash/avg`,
          value: get.mean,
          unit: 'ms',
        });
        data.push({
          name: `TxPool/${size} txs/getTxsByHash/p50`,
          value: get.percentile(50),
          unit: 'ms',
        });
        data.push({
          name: `TxPool/${size} txs/getTxsByHash/p95`,
          value: get.percentile(95),
          unit: 'ms',
        });

        data.push({
          name: `TxPool/${size} txs/deleteTxs/avg`,
          value: del.mean,
          unit: 'ms',
        });
        data.push({
          name: `TxPool/${size} txs/deleteTxs/p50`,
          value: del.percentile(50),
          unit: 'ms',
        });
        data.push({
          name: `TxPool/${size} txs/deleteTxs/p95`,
          value: del.percentile(95),
          unit: 'ms',
        });
      }

      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    } else if (process.env.BENCH_OUTPUT_MD) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
      await using f = await fs.open(process.env.BENCH_OUTPUT_MD!, 'w');
      await f.write('|TYPE|SIZE|MIN|AVG|P50|P90|MAX|\n');
      await f.write('|----|----|---|---|---|---|---|\n');
      for (const size of batchSizes) {
        const histo = addHistogram[size];
        await f.write(
          `|ADD|${size}|${histo.min}|${histo.mean}|${histo.percentile(50)}|${histo.percentile(90)}|${histo.max}|\n`,
        );
      }
      for (const size of batchSizes) {
        const histo = getHistogram[size];
        await f.write(
          `|GET|${size}|${histo.min}|${histo.mean}|${histo.percentile(50)}|${histo.percentile(90)}|${histo.max}|\n`,
        );
      }
      for (const size of batchSizes) {
        const histo = delHistogram[size];
        await f.write(
          `|DEL|${size}|${histo.min}|${histo.mean}|${histo.percentile(50)}|${histo.percentile(90)}|${histo.max}|\n`,
        );
      }
    }
  });

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'tx-bench-'));
    store = await createStore('tx', 1, {
      dataDirectory,
      dataStoreMapSizeKB: 10 * 1024 * 1024,
    });

    ws = await NativeWorldStateService.tmp();
    const l2 = mock<L2BlockSource & L1ToL2MessageSource>({
      syncImmediate: () => Promise.resolve(),
      getProvenBlockNumber: () => Promise.resolve(0),
      getBlockNumber: () => Promise.resolve(0),
      getL2Tips: () =>
        Promise.resolve({
          latest: {
            number: 0,
          },
          proven: {
            number: 0,
          },
          finalized: {
            number: 0,
          },
        }),
    });
    wsSync = new ServerWorldStateSynchronizer(ws, l2, getDefaultConfig(worldStateConfigMappings));
    await wsSync.start();
    pool = new AztecKVTxPool(store, store, wsSync);
  });

  afterEach(async () => {
    await wsSync.stop();
    await ws.close();
    await store.close();
    await rm(dataDirectory, { recursive: true, maxRetries: 3, retryDelay: 100 });
  });

  it.each(batchSizes)('add txs in batches of %d', async batchSize => {
    for (let i = 0; i < RUNS; i++) {
      const txs = await timesAsync(batchSize, seed => mockTx(seed, { clientIvcProof: ClientIvcProof.random() }));
      const timer = new Timer();
      await pool.addTxs(txs);
      addHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }

    const sz = await store.estimateSize();
    dbSizeBytes[batchSize] = sz.physicalFileSize;
  });

  it.each(batchSizes)('get txs in batches of %d', async batchSize => {
    const txs = await timesAsync(2 * batchSize, seed => mockTx(seed, { clientIvcProof: ClientIvcProof.random() }));
    await pool.addTxs(txs);
    const allHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    for (let i = 0; i < RUNS; i++) {
      shuffle(allHashes);
      const hashesToGet = allHashes.slice(0, batchSize);
      const timer = new Timer();
      await pool.getTxsByHash(hashesToGet);
      getHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it.each(batchSizes)('delete txs in batches of %d', async batchSize => {
    const allHashes: TxHash[] = [];

    for (let i = 0; i < RUNS / 2; i++) {
      const txs = await timesAsync(batchSize, seed =>
        mockTx(i * batchSize + seed, { clientIvcProof: ClientIvcProof.random() }),
      );
      await pool.addTxs(txs);
      allHashes.push(...(await Promise.all(txs.map(tx => tx.getTxHash()))));
    }

    shuffle(allHashes);
    for (let i = 0; i < RUNS / 2; i++) {
      const hashesToRemove = allHashes.splice(0, batchSize);
      const timer = new Timer();
      await pool.deleteTxs(hashesToRemove);
      delHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }
  });
});
