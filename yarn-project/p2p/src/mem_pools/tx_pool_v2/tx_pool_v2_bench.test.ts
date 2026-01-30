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

  // Pre-created transaction pools for different sizes
  const POOL_SIZES = [10, 100, 1000] as const;
  const preCreatedTxs: Map<number, Tx[]> = new Map();

  // Block headers for benchmarks
  const slot1Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({
      blockNumber: BlockNumber(1),
      slotNumber: SlotNumber(1),
    }),
  });

  const slot2Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({
      blockNumber: BlockNumber(2),
      slotNumber: SlotNumber(2),
    }),
  });

  // Shared mocks
  let mockL2BlockSource: MockProxy<L2BlockSource>;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;

  /**
   * Creates a batch of mock transactions with varied priority fees and cycling fee payers.
   */
  const createTxBatch = async (count: number, startSeed = 1): Promise<Tx[]> => {
    const txs: Tx[] = [];
    for (let i = 0; i < count; i++) {
      const priorityFee = ((startSeed + i) % 100) + 1;
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

  const setupMocks = () => {
    mockL2BlockSource = mock<L2BlockSource>();
    mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

    mockWorldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    mockWorldState.getCommitted.mockReturnValue(db);
    mockWorldState.getSnapshot.mockReturnValue(db);

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
  };

  const createPool = async (): Promise<AztecKVTxPoolV2> => {
    const pool = new AztecKVTxPoolV2(await openTmpStore('p2p-bench'), await openTmpStore('archive-bench'), {
      l2BlockSource: mockL2BlockSource,
      worldStateSynchronizer: mockWorldState,
      pendingTxValidator: alwaysValidValidator,
    });
    await pool.start();
    return pool;
  };

  const populatePool = async (pool: AztecKVTxPoolV2, count: number): Promise<Tx[]> => {
    const txs = preCreatedTxs.get(count);
    if (!txs) {
      throw new Error(`No pre-created txs for count ${count}`);
    }
    await pool.addPendingTxs(txs);
    return txs;
  };

  const measureOperation = async (operation: () => Promise<void>, iterations: number): Promise<number> => {
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      await operation();
    }
    const endTime = performance.now();
    return (endTime - startTime) / iterations;
  };

  // Pre-create all transactions before running any benchmarks
  beforeAll(async () => {
    logger.info('Pre-creating transactions for benchmarks...');

    // Create txs for the largest pool size (others will use subsets)
    const maxSize = Math.max(...POOL_SIZES);
    const allTxs = await createTxBatch(maxSize);

    // Store subsets for each pool size
    for (const size of POOL_SIZES) {
      preCreatedTxs.set(size, allTxs.slice(0, size));
    }

    // Also create extra txs for addPendingTxs benchmarks (to add to existing pools)
    const extraTxs = await createTxBatch(100, maxSize + 1);
    preCreatedTxs.set(-1, extraTxs); // Use -1 as key for "extra" txs

    logger.info(`Pre-created ${maxSize} transactions + 100 extra for add benchmarks`);
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

  // ============================================================================
  // Read-only benchmarks - can share pools within each size group
  // ============================================================================

  describe.each(POOL_SIZES)('read-only operations: pool=%d', (poolSize: number) => {
    let pool: AztecKVTxPoolV2;
    let txs: Tx[];

    beforeAll(async () => {
      setupMocks();
      pool = await createPool();
      txs = await populatePool(pool, poolSize);
    });

    afterAll(async () => {
      await pool.stop();
    });

    it('getPendingTxHashes', async () => {
      const duration = await measureOperation(async () => {
        await pool.getPendingTxHashes();
      }, 100);

      metrics.addMetric(TxPoolOperation.GET_PENDING_TX_HASHES, poolSize, 0, duration);
    });

    it('getTxByHash', async () => {
      const randomTxHash = txs[Math.floor(Math.random() * txs.length)].getTxHash();

      const duration = await measureOperation(async () => {
        await pool.getTxByHash(randomTxHash);
      }, 1000);

      metrics.addMetric(TxPoolOperation.GET_TX_BY_HASH, poolSize, 0, duration);
    });

    it.each([1, 10, Math.min(50, poolSize)])('getTxsByHash: batch=%d', async (batchSize: number) => {
      const hashes: TxHash[] = [];
      for (let i = 0; i < batchSize; i++) {
        hashes.push(txs[Math.floor(Math.random() * txs.length)].getTxHash());
      }

      const duration = await measureOperation(async () => {
        await pool.getTxsByHash(hashes);
      }, 100);

      metrics.addMetric(TxPoolOperation.GET_TXS_BY_HASH, poolSize, batchSize, duration);
    });

    it.each([1, 10, Math.min(50, poolSize)])('hasTxs: batch=%d', async (batchSize: number) => {
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

    it.each([10, Math.min(50, poolSize)])('getLowestPriorityPending: limit=%d', async (limit: number) => {
      const duration = await measureOperation(async () => {
        await pool.getLowestPriorityPending(limit);
      }, 100);

      metrics.addMetric(TxPoolOperation.GET_LOWEST_PRIORITY_PENDING, poolSize, limit, duration);
    });

    it('canAddPendingTx', async () => {
      const extraTxs = preCreatedTxs.get(-1)!;
      const newTx = extraTxs[0];

      const duration = await measureOperation(async () => {
        await pool.canAddPendingTx(newTx);
      }, 100);

      metrics.addMetric(TxPoolOperation.CAN_ADD_PENDING_TX, poolSize, 0, duration);
    });
  });

  // ============================================================================
  // Mutating benchmarks - run each operation multiple times with reset
  // ============================================================================

  const MUTATION_ITERATIONS = 5;

  describe('addPendingTxs', () => {
    beforeAll(() => {
      setupMocks();
    });

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
    ])('pool=%d, batch=%d', async (poolSize: number, batchSize: number) => {
      const pool = await createPool();

      try {
        // Populate pool if needed
        if (poolSize > 0) {
          await populatePool(pool, poolSize);
        }

        // Get batch to add from extra txs
        const extraTxs = preCreatedTxs.get(-1)!;
        const txsToAdd = extraTxs.slice(0, batchSize);
        const hashesToRemove = txsToAdd.map(tx => tx.getTxHash());

        let totalDuration = 0;
        for (let i = 0; i < MUTATION_ITERATIONS; i++) {
          const startTime = performance.now();
          await pool.addPendingTxs(txsToAdd);
          totalDuration += performance.now() - startTime;

          // Reset: remove added txs
          await pool.handleFailedExecution(hashesToRemove);
        }

        metrics.addMetric(TxPoolOperation.ADD_PENDING_TXS, poolSize, batchSize, totalDuration / MUTATION_ITERATIONS);
      } finally {
        await pool.stop();
      }
    });
  });

  describe('handleMinedBlock', () => {
    beforeAll(() => {
      setupMocks();
    });

    it.each([
      [100, 10],
      [100, 50],
      [1000, 10],
      [1000, 100],
    ])('pool=%d, mined=%d', async (poolSize: number, minedCount: number) => {
      const pool = await createPool();

      try {
        const txs = await populatePool(pool, poolSize);
        const hashesToMine = txs.slice(0, minedCount).map(tx => tx.getTxHash());

        // Pre-compute block IDs for reset
        const block0Hash = await BlockHeader.empty().hash();
        const block0Id: L2BlockId = { number: BlockNumber(0), hash: block0Hash.toString() };

        let totalDuration = 0;
        for (let i = 0; i < MUTATION_ITERATIONS; i++) {
          const startTime = performance.now();
          await pool.handleMinedBlock(hashesToMine, slot1Header);
          totalDuration += performance.now() - startTime;

          // Reset: un-mine by pruning back to block 0
          await pool.handlePrunedBlocks(block0Id);
        }

        metrics.addMetric(
          TxPoolOperation.HANDLE_MINED_BLOCK,
          poolSize,
          minedCount,
          totalDuration / MUTATION_ITERATIONS,
        );
      } finally {
        await pool.stop();
      }
    });
  });

  describe('prepareForSlot', () => {
    beforeAll(() => {
      setupMocks();
    });

    it.each([
      [100, 10],
      [100, 50],
      [1000, 10],
      [1000, 100],
    ])('pool=%d, protected=%d', async (poolSize: number, protectedCount: number) => {
      const pool = await createPool();

      try {
        // Get txs and split into pending and protected
        const txs = preCreatedTxs.get(poolSize)!;
        const pendingTxs = txs.slice(0, poolSize - protectedCount);
        const protectedTxs = txs.slice(poolSize - protectedCount);

        await pool.addPendingTxs(pendingTxs);

        let totalDuration = 0;
        for (let i = 0; i < MUTATION_ITERATIONS; i++) {
          // Protect txs for slot N
          const slotN = SlotNumber(i * 2 + 1);
          const slotNHeader = BlockHeader.empty({
            globalVariables: GlobalVariables.empty({
              blockNumber: BlockNumber(i * 2 + 1),
              slotNumber: slotN,
            }),
          });
          await pool.addProtectedTxs(protectedTxs, slotNHeader);

          // Measure prepareForSlot(N+1) which unprotects slot N txs
          const startTime = performance.now();
          await pool.prepareForSlot(SlotNumber(i * 2 + 2));
          totalDuration += performance.now() - startTime;
        }

        metrics.addMetric(
          TxPoolOperation.PREPARE_FOR_SLOT,
          poolSize,
          protectedCount,
          totalDuration / MUTATION_ITERATIONS,
        );
      } finally {
        await pool.stop();
      }
    });
  });

  describe('handlePrunedBlocks', () => {
    beforeAll(() => {
      setupMocks();
    });

    it.each([
      [100, 10],
      [100, 50],
      [1000, 10],
      [1000, 100],
    ])('pool=%d, mined=%d', async (poolSize: number, minedCount: number) => {
      const pool = await createPool();

      try {
        const txs = await populatePool(pool, poolSize);
        const hashesToMine = txs.slice(0, minedCount).map(tx => tx.getTxHash());

        // Pre-compute block IDs
        const block1Hash = await slot1Header.hash();
        const block1Id: L2BlockId = { number: BlockNumber(1), hash: block1Hash.toString() };

        let totalDuration = 0;
        for (let i = 0; i < MUTATION_ITERATIONS; i++) {
          // Mine transactions at block 2
          await pool.handleMinedBlock(hashesToMine, slot2Header);

          // Measure: prune back to block 1 (un-mines the transactions)
          const startTime = performance.now();
          await pool.handlePrunedBlocks(block1Id);
          totalDuration += performance.now() - startTime;
        }

        metrics.addMetric(
          TxPoolOperation.HANDLE_PRUNED_BLOCKS,
          poolSize,
          minedCount,
          totalDuration / MUTATION_ITERATIONS,
        );
      } finally {
        await pool.stop();
      }
    });
  });
});
