import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { insertIntoSortedArray, shuffle } from '@aztec/foundation/array';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { getDefaultConfig } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Timer } from '@aztec/foundation/timer';
import { AztecLMDBStoreV2, createStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';
import type { TxHash } from '@aztec/stdlib/tx';
import { ServerWorldStateSynchronizer, worldStateConfigMappings } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';
import fs, { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import type { TxPool } from './tx_pool.js';

const TEST_TIMEOUT = 150_000;
jest.setTimeout(TEST_TIMEOUT);

const RUNS = 10;
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
      dataStoreMapSizeKb: 10 * 1024 * 1024,
    });

    ws = await NativeWorldStateService.tmp();
    const l2 = mock<L2BlockSource & L1ToL2MessageSource>({
      syncImmediate: () => Promise.resolve(),
      getProvenBlockNumber: () => Promise.resolve(BlockNumber.ZERO),
      getBlockNumber: () => Promise.resolve(BlockNumber.ZERO),
      getL2Tips: () =>
        Promise.resolve({
          blocks: {
            latest: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
            proven: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
            finalized: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
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
      const txs = await timesAsync(batchSize, seed => mockTx(seed, { chonkProof: ChonkProof.random() }));
      const timer = new Timer();
      await pool.addTxs(txs);
      addHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }

    const sz = await store.estimateSize();
    dbSizeBytes[batchSize] = sz.physicalFileSize;
  });

  it.each(batchSizes)('get txs in batches of %d', async batchSize => {
    const txs = await timesAsync(2 * batchSize, seed => mockTx(seed, { chonkProof: ChonkProof.random() }));
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
        mockTx(i * batchSize + seed, { chonkProof: ChonkProof.random() }),
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

describe('Fr deduplication: insertIntoSortedArray vs Set<string>', () => {
  const BENCH_RUNS = 100;
  const elementCounts = [10, 50, 100, 500] as const;
  const duplicateRatios = [0, 0.25, 0.5] as const;

  let sortedArrayHistogram: Record<(typeof elementCounts)[number], Record<(typeof duplicateRatios)[number], number[]>>;
  let setHistogram: Record<(typeof elementCounts)[number], Record<(typeof duplicateRatios)[number], number[]>>;

  beforeAll(() => {
    sortedArrayHistogram = Object.fromEntries(
      elementCounts.map(count => [count, Object.fromEntries(duplicateRatios.map(ratio => [ratio, []]))]),
    ) as any;
    setHistogram = Object.fromEntries(
      elementCounts.map(count => [count, Object.fromEntries(duplicateRatios.map(ratio => [ratio, []]))]),
    ) as any;
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];
      for (const count of elementCounts) {
        for (const ratio of duplicateRatios) {
          const sortedTimes = sortedArrayHistogram[count][ratio];
          const setTimes = setHistogram[count][ratio];
          const sortedAvg = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
          const setAvg = setTimes.reduce((a, b) => a + b, 0) / setTimes.length;

          data.push({
            name: `FrDedup/${count} elements/${ratio * 100}% duplicates/sortedArray/avg`,
            value: sortedAvg,
            unit: 'ms',
          });
          data.push({
            name: `FrDedup/${count} elements/${ratio * 100}% duplicates/set/avg`,
            value: setAvg,
            unit: 'ms',
          });
        }
      }

      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    } else if (process.env.BENCH_OUTPUT_MD) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
      await using f = await fs.open(process.env.BENCH_OUTPUT_MD!, 'w');
      await f.write('| Elements | Dup Ratio | SortedArray Avg (ms) | Set Avg (ms) | Winner |\n');
      await f.write('|----------|-----------|----------------------|--------------|--------|\n');
      for (const count of elementCounts) {
        for (const ratio of duplicateRatios) {
          const sortedTimes = sortedArrayHistogram[count][ratio];
          const setTimes = setHistogram[count][ratio];
          const sortedAvg = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
          const setAvg = setTimes.reduce((a, b) => a + b, 0) / setTimes.length;
          const winner = sortedAvg < setAvg ? 'SortedArray' : 'Set';
          await f.write(
            `| ${count.toString().padStart(8)} | ${(ratio * 100).toFixed(0).padStart(7)}% | ${sortedAvg.toFixed(4).padStart(20)} | ${setAvg.toFixed(4).padStart(12)} | ${winner.padStart(6)} |\n`,
          );
        }
      }
    }
  });

  function generateFrValues(count: number, duplicateRatio: number): Fr[] {
    const uniqueCount = Math.floor(count * (1 - duplicateRatio));
    const uniqueValues = Array.from({ length: uniqueCount }, () => Fr.random());
    const result = [...uniqueValues];

    while (result.length < count) {
      const randomIndex = Math.floor(Math.random() * uniqueValues.length);
      result.push(uniqueValues[randomIndex]);
    }

    shuffle(result);
    return result;
  }

  it.each(elementCounts)('benchmark with %d elements', count => {
    for (const duplicateRatio of duplicateRatios) {
      for (let run = 0; run < BENCH_RUNS; run++) {
        const values = generateFrValues(count, duplicateRatio);

        // Benchmark insertIntoSortedArray approach
        const sortedArray: Fr[] = [];
        const sortedTimer = new Timer();
        for (const value of values) {
          insertIntoSortedArray(sortedArray, value, Fr.cmp, false);
        }
        sortedArrayHistogram[count][duplicateRatio].push(sortedTimer.ms());

        // Benchmark Set<string> approach
        const set = new Set<string>();
        const setTimer = new Timer();
        for (const value of values) {
          const key = value.toString();
          if (!set.has(key)) {
            set.add(key);
          }
        }
        setHistogram[count][duplicateRatio].push(setTimer.ms());
      }
    }
  });
});
