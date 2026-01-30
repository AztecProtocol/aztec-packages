import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';
import path from 'path';

import { TxPoolBenchMetrics, TxPoolOperation } from './tx_pool_bench_metrics.js';
import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

/** A validator that accepts all transactions. */
const alwaysValidValidator: TxValidator<Tx> = {
  validateTx: () => Promise.resolve({ result: 'valid' }),
};

jest.setTimeout(300_000);

describe('TxPoolV2: benchmarks', () => {
  const logger = createLogger('p2p:tx_pool_v2:bench');
  const metrics = new TxPoolBenchMetrics();

  // Use a fixed set of fee payers to test fee payer index with multiple txs per payer
  const feePayers = [AztecAddress.fromBigInt(1n), AztecAddress.fromBigInt(2n), AztecAddress.fromBigInt(3n)];

  let pool: AztecKVTxPoolV2;
  let mockL2BlockSource: MockProxy<L2BlockSource>;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;

  const slot1Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({
      blockNumber: BlockNumber(1),
      slotNumber: SlotNumber(1),
    }),
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, metrics.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      await writeFile(process.env.BENCH_OUTPUT_MD, metrics.toPrettyString());
    } else {
      logger.info(`\n`);
      logger.info(metrics.toPrettyString());
      logger.info(`\n`);
    }
  });

  beforeEach(async () => {
    mockL2BlockSource = mock<L2BlockSource>();
    mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

    mockWorldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    mockWorldState.getCommitted.mockReturnValue(db);
    mockWorldState.getSnapshot.mockReturnValue(db);

    // Mock fee payer balance lookups to return sufficient balance
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

    pool = new AztecKVTxPoolV2(await openTmpStore('p2p-bench'), await openTmpStore('archive-bench'), {
      l2BlockSource: mockL2BlockSource,
      worldStateSynchronizer: mockWorldState,
      pendingTxValidator: alwaysValidValidator,
    });
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
  });

  /**
   * Creates a batch of mock transactions with varied priority fees and cycling fee payers.
   */
  const createTxBatch = async (count: number, startSeed = 1): Promise<Tx[]> => {
    const txs: Tx[] = [];
    for (let i = 0; i < count; i++) {
      // Vary priority fees based on seed to create different priorities
      // Range from 1 to 100 to give meaningful priority differences
      const priorityFee = ((startSeed + i) % 100) + 1;
      // Cycle through fee payers to test fee payer index with multiple txs per payer
      const feePayer = feePayers[(startSeed + i) % feePayers.length];
      txs.push(
        await mockTx(startSeed + i, {
          numberOfNonRevertiblePublicCallRequests: 1,
          numberOfRevertibleNullifiers: 32,
          maxPriorityFeesPerGas: new GasFees(priorityFee, priorityFee),
          feePayer,
        }),
      );
    }
    return txs;
  };

  /**
   * Populates the pool with the specified number of transactions.
   */
  const populatePool = async (count: number): Promise<Tx[]> => {
    const txs = await createTxBatch(count);
    await pool.addPendingTxs(txs);
    return txs;
  };

  /**
   * Measures the average time to execute an operation.
   */
  const measureOperation = async (operation: () => Promise<void>, iterations: number): Promise<number> => {
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      await operation();
    }
    const endTime = performance.now();
    return (endTime - startTime) / iterations;
  };

  // === addPendingTxs benchmarks ===

  it.each([
    [0, 1],
    [0, 10],
    [0, 100],
    [100, 1],
    [100, 10],
    [100, 100],
    [1000, 1],
    [1000, 10],
    [1000, 100],
  ])('addPendingTxs: pool=%d, batch=%d', async (poolSize: number, batchSize: number) => {
    // Populate pool if needed
    if (poolSize > 0) {
      await populatePool(poolSize);
    }

    // Create batch to add
    const txs = await createTxBatch(batchSize, poolSize + 1);

    const startTime = performance.now();
    await pool.addPendingTxs(txs);
    const duration = performance.now() - startTime;

    metrics.addMetric(TxPoolOperation.ADD_PENDING_TXS, poolSize, batchSize, duration);
  });

  // === getPendingTxHashes benchmarks ===

  it.each([[10], [100], [1000]])('getPendingTxHashes: pool=%d', async (poolSize: number) => {
    await populatePool(poolSize);

    const duration = await measureOperation(async () => {
      await pool.getPendingTxHashes();
    }, 100);

    metrics.addMetric(TxPoolOperation.GET_PENDING_TX_HASHES, poolSize, 0, duration);
  });

  // === getTxByHash benchmarks ===

  it.each([[10], [100], [1000]])('getTxByHash: pool=%d', async (poolSize: number) => {
    const txs = await populatePool(poolSize);
    const randomTxHash = txs[Math.floor(Math.random() * txs.length)].getTxHash();

    const duration = await measureOperation(async () => {
      await pool.getTxByHash(randomTxHash);
    }, 1000);

    metrics.addMetric(TxPoolOperation.GET_TX_BY_HASH, poolSize, 0, duration);
  });

  // === getTxsByHash benchmarks ===

  it.each([
    [100, 1],
    [100, 10],
    [100, 50],
    [1000, 1],
    [1000, 10],
    [1000, 100],
  ])('getTxsByHash: pool=%d, batch=%d', async (poolSize: number, batchSize: number) => {
    const txs = await populatePool(poolSize);

    // Select random tx hashes
    const hashes: TxHash[] = [];
    for (let i = 0; i < batchSize; i++) {
      hashes.push(txs[Math.floor(Math.random() * txs.length)].getTxHash());
    }

    const duration = await measureOperation(async () => {
      await pool.getTxsByHash(hashes);
    }, 100);

    metrics.addMetric(TxPoolOperation.GET_TXS_BY_HASH, poolSize, batchSize, duration);
  });

  // === hasTxs benchmarks ===

  it.each([
    [100, 1],
    [100, 10],
    [100, 50],
    [1000, 1],
    [1000, 10],
    [1000, 100],
  ])('hasTxs: pool=%d, batch=%d', async (poolSize: number, batchSize: number) => {
    const txs = await populatePool(poolSize);

    // Select random tx hashes (mix of existing and non-existing)
    const hashes: TxHash[] = [];
    for (let i = 0; i < batchSize; i++) {
      if (i % 2 === 0) {
        hashes.push(txs[Math.floor(Math.random() * txs.length)].getTxHash());
      } else {
        hashes.push(TxHash.random());
      }
    }

    const duration = await measureOperation(async () => {
      await pool.hasTxs(hashes);
    }, 100);

    metrics.addMetric(TxPoolOperation.HAS_TXS, poolSize, batchSize, duration);
  });

  // === handleMinedBlock benchmarks ===

  it.each([
    [100, 10],
    [100, 50],
    [1000, 10],
    [1000, 100],
  ])('handleMinedBlock: pool=%d, mined=%d', async (poolSize: number, minedCount: number) => {
    const txs = await populatePool(poolSize);

    // Select txs to mine
    const txsToMine = txs.slice(0, minedCount);
    const hashesToMine = txsToMine.map(tx => tx.getTxHash());

    const startTime = performance.now();
    await pool.handleMinedBlock(hashesToMine, slot1Header);
    const duration = performance.now() - startTime;

    metrics.addMetric(TxPoolOperation.HANDLE_MINED_BLOCK, poolSize, minedCount, duration);
  });

  // === prepareForSlot benchmarks ===

  it.each([
    [100, 10],
    [100, 50],
    [1000, 10],
    [1000, 100],
  ])('prepareForSlot: pool=%d, protected=%d', async (poolSize: number, protectedCount: number) => {
    // Add some pending txs
    const pendingTxs = await createTxBatch(poolSize - protectedCount);
    await pool.addPendingTxs(pendingTxs);

    // Add protected txs for slot 1
    const protectedTxs = await createTxBatch(protectedCount, poolSize);
    await pool.addProtectedTxs(protectedTxs, slot1Header);

    // Measure prepareForSlot(2) which should unprotect slot 1 txs
    const startTime = performance.now();
    await pool.prepareForSlot(SlotNumber(2));
    const duration = performance.now() - startTime;

    metrics.addMetric(TxPoolOperation.PREPARE_FOR_SLOT, poolSize, protectedCount, duration);
  });

  // === getLowestPriorityPending benchmarks ===

  it.each([
    [100, 10],
    [100, 50],
    [1000, 10],
    [1000, 100],
  ])('getLowestPriorityPending: pool=%d, limit=%d', async (poolSize: number, limit: number) => {
    await populatePool(poolSize);

    const duration = await measureOperation(async () => {
      await pool.getLowestPriorityPending(limit);
    }, 100);

    metrics.addMetric(TxPoolOperation.GET_LOWEST_PRIORITY_PENDING, poolSize, limit, duration);
  });

  // === canAddPendingTx benchmarks ===

  it.each([[10], [100], [1000]])('canAddPendingTx: pool=%d', async (poolSize: number) => {
    await populatePool(poolSize);

    // Create a new tx to check
    const [newTx] = await createTxBatch(1, poolSize + 1);

    const duration = await measureOperation(async () => {
      await pool.canAddPendingTx(newTx);
    }, 100);

    metrics.addMetric(TxPoolOperation.CAN_ADD_PENDING_TX, poolSize, 0, duration);
  });

  // === handlePrunedBlocks benchmarks ===

  it.each([
    [100, 10],
    [100, 50],
    [1000, 10],
    [1000, 100],
  ])('handlePrunedBlocks: pool=%d, mined=%d', async (poolSize: number, minedCount: number) => {
    const txs = await populatePool(poolSize);

    // Mine some transactions at block 2
    const txsToMine = txs.slice(0, minedCount);
    const hashesToMine = txsToMine.map(tx => tx.getTxHash());
    const block2Header = BlockHeader.empty({
      globalVariables: GlobalVariables.empty({
        blockNumber: BlockNumber(2),
        slotNumber: SlotNumber(2),
      }),
    });
    await pool.handleMinedBlock(hashesToMine, block2Header);

    // Prune back to block 1 (un-mines the transactions)
    const block1Hash = await slot1Header.hash();
    const block1Id: L2BlockId = { number: BlockNumber(1), hash: block1Hash.toString() };

    const startTime = performance.now();
    await pool.handlePrunedBlocks(block1Id);
    const duration = performance.now() - startTime;

    metrics.addMetric(TxPoolOperation.HANDLE_PRUNED_BLOCKS, poolSize, minedCount, duration);
  });
});
