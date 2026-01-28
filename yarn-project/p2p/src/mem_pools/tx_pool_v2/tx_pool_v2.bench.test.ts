import { shuffle } from '@aztec/foundation/array';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Timer } from '@aztec/foundation/timer';
import { AztecLMDBStoreV2, createStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';
import {
  MerkleTreeId,
  type MerkleTreeReadOperations,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import fs, { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

const TEST_TIMEOUT = 150_000;

/** Creates a mock WorldStateSynchronizer with proper fee payer balance support */
function createMockWorldState(): MockProxy<WorldStateSynchronizer> {
  const worldState = mock<WorldStateSynchronizer>();
  const db = mock<MerkleTreeReadOperations>();
  worldState.getCommitted.mockReturnValue(db);
  worldState.getSnapshot.mockReturnValue(db);

  // Mock fee payer balance lookups to return sufficient balance (1e18)
  db.getPreviousValueIndex.mockImplementation((_tree, slot) => {
    return Promise.resolve({ index: slot, alreadyPresent: true });
  });
  db.getLeafPreimage.mockImplementation((tree, index) => {
    if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
      return Promise.resolve(
        new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(1e18)), Fr.ONE, 1n),
      );
    }
    return Promise.resolve(undefined);
  });

  return worldState;
}
jest.setTimeout(TEST_TIMEOUT);

const RUNS = 10;
const batchSizes = [1, 4, 8, 20, 40] as const;

describe('TxPoolV2: Benchmarks', () => {
  let pool: AztecKVTxPoolV2;
  let store: AztecLMDBStoreV2;
  let archiveStore: AztecLMDBStoreV2;
  let mockL2BlockSource: MockProxy<L2BlockSource>;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let dataDirectory: string;
  let dbSizeBytes: Record<(typeof batchSizes)[number], number>;
  let addHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;
  let getHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;
  let protectHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;
  let minedHistogram: Record<(typeof batchSizes)[number], RecordableHistogram>;
  let prepareSlotHistogram: RecordableHistogram;

  beforeAll(() => {
    dbSizeBytes = Object.fromEntries(batchSizes.map(size => [size, 0])) as any;
    addHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
    getHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
    protectHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
    minedHistogram = Object.fromEntries(batchSizes.map(size => [size, createHistogram()])) as any;
    prepareSlotHistogram = createHistogram();
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];

      for (const size of batchSizes) {
        const add = addHistogram[size];
        const get = getHistogram[size];
        const protect = protectHistogram[size];
        const mined = minedHistogram[size];

        data.push({
          name: `TxPoolV2/${size} txs/addPendingTxs/dbSize_after_${RUNS}_batches`,
          value: dbSizeBytes[size],
          unit: 'bytes',
        });

        data.push({ name: `TxPoolV2/${size} txs/addPendingTxs/avg`, value: add.mean, unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/addPendingTxs/p50`, value: add.percentile(50), unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/addPendingTxs/p95`, value: add.percentile(95), unit: 'ms' });

        data.push({ name: `TxPoolV2/${size} txs/getTxsByHash/avg`, value: get.mean, unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/getTxsByHash/p50`, value: get.percentile(50), unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/getTxsByHash/p95`, value: get.percentile(95), unit: 'ms' });

        data.push({ name: `TxPoolV2/${size} txs/protectTxs/avg`, value: protect.mean, unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/protectTxs/p50`, value: protect.percentile(50), unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/protectTxs/p95`, value: protect.percentile(95), unit: 'ms' });

        data.push({ name: `TxPoolV2/${size} txs/handleMinedBlock/avg`, value: mined.mean, unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/handleMinedBlock/p50`, value: mined.percentile(50), unit: 'ms' });
        data.push({ name: `TxPoolV2/${size} txs/handleMinedBlock/p95`, value: mined.percentile(95), unit: 'ms' });
      }

      data.push({ name: `TxPoolV2/prepareForSlot/avg`, value: prepareSlotHistogram.mean, unit: 'ms' });
      data.push({ name: `TxPoolV2/prepareForSlot/p50`, value: prepareSlotHistogram.percentile(50), unit: 'ms' });
      data.push({ name: `TxPoolV2/prepareForSlot/p95`, value: prepareSlotHistogram.percentile(95), unit: 'ms' });

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
        const histo = protectHistogram[size];
        await f.write(
          `|PROTECT|${size}|${histo.min}|${histo.mean}|${histo.percentile(50)}|${histo.percentile(90)}|${histo.max}|\n`,
        );
      }
      for (const size of batchSizes) {
        const histo = minedHistogram[size];
        await f.write(
          `|MINED|${size}|${histo.min}|${histo.mean}|${histo.percentile(50)}|${histo.percentile(90)}|${histo.max}|\n`,
        );
      }

      await f.write(
        `|PREPARE_SLOT|N/A|${prepareSlotHistogram.min}|${prepareSlotHistogram.mean}|${prepareSlotHistogram.percentile(50)}|${prepareSlotHistogram.percentile(90)}|${prepareSlotHistogram.max}|\n`,
      );
    }
  });

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'tx-pool-v2-bench-'));
    store = await createStore('tx-v2', 1, {
      dataDirectory,
      dataStoreMapSizeKb: 10 * 1024 * 1024,
    });
    archiveStore = await createStore('archive-v2', 1, {
      dataDirectory,
      dataStoreMapSizeKb: 1 * 1024 * 1024,
    });

    mockL2BlockSource = mock<L2BlockSource>();
    mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);
    mockWorldState = createMockWorldState();

    pool = new AztecKVTxPoolV2(store, archiveStore, {
      l2BlockSource: mockL2BlockSource,
      worldStateSynchronizer: mockWorldState,
    });
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
    await store.close();
    await archiveStore.close();
    await rm(dataDirectory, { recursive: true, maxRetries: 3, retryDelay: 100 });
  });

  it.each(batchSizes)('add pending txs in batches of %d', async batchSize => {
    for (let i = 0; i < RUNS; i++) {
      const txs = await timesAsync(batchSize, seed =>
        mockTx(i * batchSize + seed, { chonkProof: ChonkProof.random() }),
      );
      const timer = new Timer();
      await pool.addPendingTxs(txs);
      addHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }

    const sz = await store.estimateSize();
    dbSizeBytes[batchSize] = sz.physicalFileSize;
  });

  it.each(batchSizes)('get txs in batches of %d', async batchSize => {
    const txs = await timesAsync(2 * batchSize, seed => mockTx(seed, { chonkProof: ChonkProof.random() }));
    await pool.addPendingTxs(txs);
    const allHashes = txs.map(tx => tx.getTxHash());

    for (let i = 0; i < RUNS; i++) {
      shuffle(allHashes);
      const hashesToGet = allHashes.slice(0, batchSize);
      const timer = new Timer();
      await pool.getTxsByHash(hashesToGet);
      getHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it.each(batchSizes)('protect txs in batches of %d', async batchSize => {
    const txs = await timesAsync(2 * batchSize, seed => mockTx(seed, { chonkProof: ChonkProof.random() }));
    await pool.addPendingTxs(txs);
    const allHashes = txs.map(tx => tx.getTxHash());

    for (let i = 0; i < RUNS; i++) {
      const header = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(i + 1),
          slotNumber: SlotNumber(i + 1),
        }),
      });
      shuffle(allHashes);
      const hashesToProtect = allHashes.slice(0, batchSize);
      const timer = new Timer();
      await pool.protectTxs(hashesToProtect, header);
      protectHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it.each(batchSizes)('handle mined block with %d txs', async batchSize => {
    for (let i = 0; i < RUNS; i++) {
      const txs = await timesAsync(batchSize, seed =>
        mockTx(i * batchSize + seed, { chonkProof: ChonkProof.random() }),
      );
      await pool.addPendingTxs(txs);
      const hashes = txs.map(tx => tx.getTxHash());
      const header = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(i + 1),
          slotNumber: SlotNumber(i + 1),
        }),
      });

      const timer = new Timer();
      await pool.handleMinedBlock(hashes, header);
      minedHistogram[batchSize].record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('prepareForSlot with many protected txs', async () => {
    // Add 100 protected txs across multiple slots
    const txsPerSlot = 20;
    const slots = 5;

    for (let slot = 1; slot <= slots; slot++) {
      const header = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(slot),
          slotNumber: SlotNumber(slot),
        }),
      });
      const txs = await timesAsync(txsPerSlot, seed =>
        mockTx((slot - 1) * txsPerSlot + seed, { chonkProof: ChonkProof.random() }),
      );
      await pool.addProtectedTxs(txs, header);
    }

    // Benchmark prepareForSlot
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await pool.prepareForSlot(SlotNumber(slots + 1 + i));
      prepareSlotHistogram.record(Math.max(1, Math.ceil(timer.ms())));

      // Re-protect some txs for the next iteration
      if (i < RUNS - 1) {
        const header = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({
            blockNumber: BlockNumber(slots + 1 + i),
            slotNumber: SlotNumber(slots + 1 + i),
          }),
        });
        const txs = await timesAsync(txsPerSlot / 2, seed =>
          mockTx(slots * txsPerSlot + i * (txsPerSlot / 2) + seed, { chonkProof: ChonkProof.random() }),
        );
        await pool.addProtectedTxs(txs, header);
      }
    }
  });
});

describe('TxPoolV2: Memory benchmark', () => {
  it('estimates memory per transaction', async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), 'tx-pool-v2-mem-'));
    const store = await createStore('tx-v2-mem', 1, {
      dataDirectory,
      dataStoreMapSizeKb: 10 * 1024 * 1024,
    });
    const archiveStore = await createStore('archive-v2-mem', 1, {
      dataDirectory,
      dataStoreMapSizeKb: 1 * 1024 * 1024,
    });

    const memMockL2BlockSource = mock<L2BlockSource>();
    memMockL2BlockSource.getTxEffect.mockResolvedValue(undefined);
    const memMockWorldState = createMockWorldState();

    const pool = new AztecKVTxPoolV2(store, archiveStore, {
      l2BlockSource: memMockL2BlockSource,
      worldStateSynchronizer: memMockWorldState,
    });
    await pool.start();

    const counts = [100, 500, 1000];
    const results: { count: number; dbSize: number; bytesPerTx: number }[] = [];

    for (const count of counts) {
      // Start fresh
      const freshMockL2BlockSource = mock<L2BlockSource>();
      freshMockL2BlockSource.getTxEffect.mockResolvedValue(undefined);
      const freshMockWorldState = createMockWorldState();

      const freshPool = new AztecKVTxPoolV2(
        await createStore(`tx-v2-mem-${count}`, 1, {
          dataDirectory,
          dataStoreMapSizeKb: 10 * 1024 * 1024,
        }),
        await createStore(`archive-v2-mem-${count}`, 1, {
          dataDirectory,
          dataStoreMapSizeKb: 1 * 1024 * 1024,
        }),
        { l2BlockSource: freshMockL2BlockSource, worldStateSynchronizer: freshMockWorldState },
      );
      await freshPool.start();

      const txs = await timesAsync(count, seed => mockTx(seed, { chonkProof: ChonkProof.random() }));
      await freshPool.addPendingTxs(txs);

      const sz = await store.estimateSize();
      results.push({
        count,
        dbSize: sz.physicalFileSize,
        bytesPerTx: Math.round(sz.physicalFileSize / count),
      });

      await freshPool.stop();
    }

    if (process.env.BENCH_OUTPUT) {
      const data = results.map(r => ({
        name: `TxPoolV2/memory/${r.count}_txs/bytesPerTx`,
        value: r.bytesPerTx,
        unit: 'bytes',
      }));

      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.appendFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    }

    await pool.stop();
    await store.close();
    await archiveStore.close();
    await rm(dataDirectory, { recursive: true, maxRetries: 3, retryDelay: 100 });
  });
});
