import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { map, sort, toArray } from '@aztec/foundation/iterable';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { GasFees } from '@aztec/stdlib/gas';
import type { ArchiverApi, MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { BlockHeader, GlobalVariables, Tx, TxHash, type TxValidationResult } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { ArchiveCache, GasTxValidator } from '../../msg_validators/index.js';
import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import { describeTxPool } from './tx_pool_test_suite.js';

describe('KV TX pool', () => {
  let txPool: TestAztecKVTxPool;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let archiver: MockProxy<ArchiverApi>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let nextTxSeed: number;
  let mockTxSize: number;

  const block1Header = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: 1, timestamp: 0n }) });
  const block2Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: 2, timestamp: 36n }),
  });
  const block10Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: 10, timestamp: 360n }),
  });

  const checkPendingTxConsistency = async () => {
    const pendingTxHashCount = await txPool.getPendingTxHashes().then(h => h.length);
    expect(await txPool.getPendingTxCount()).toEqual(pendingTxHashCount);
  };

  beforeEach(async () => {
    nextTxSeed = 1;
    mockTxSize = 100;

    worldState = worldState = mock<WorldStateSynchronizer>();
    archiver = mock<ArchiverApi>();
    db = mock<MerkleTreeReadOperations>();
    worldState.getCommitted.mockReturnValue(db);

    // Mock the archiver to return a latest block header with timestamp
    archiver.getBlockHeader.mockImplementation(blockNumber => {
      if (blockNumber === 'latest') {
        return Promise.resolve(
          BlockHeader.empty({
            globalVariables: GlobalVariables.empty({
              blockNumber: 100,
              timestamp: 1000n, // Default timestamp for tests
            }),
          }),
        );
      }
      return Promise.resolve(undefined);
    });

    txPool = new TestAztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, archiver);
    txPool.mockGasTxValidator.validateTxFee.mockImplementation(() =>
      Promise.resolve({ result: 'valid' } as TxValidationResult),
    );
    txPool.mockArchiveCache.getArchiveIndices.mockImplementation(() => Promise.resolve([BigInt(1)]));
  });

  afterEach(async () => {
    await checkPendingTxConsistency();
    await txPool?.stop();
  });

  describeTxPool(() => txPool);

  const mockFixedSizeTx = async (maxPriorityFeesPerGas?: GasFees) => {
    const tx = await mockTx(nextTxSeed++, { maxPriorityFeesPerGas });
    jest.spyOn(tx, 'getSize').mockReturnValue(mockTxSize);
    return tx;
  };

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        archivedTxLimit: 2,
      },
    );

    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);
    const tx4 = await mockTx(4);
    const tx5 = await mockTx(5);
    await txPool.addTxs([tx1, tx2, tx3, tx4, tx5]);

    // delete two txs and assert that they are properly archived
    await txPool.deleteTxs([await tx1.getTxHash(), await tx2.getTxHash()]);
    await expect(txPool.getArchivedTxByHash(await tx1.getTxHash())).resolves.toEqual(tx1);
    await expect(txPool.getArchivedTxByHash(await tx2.getTxHash())).resolves.toEqual(tx2);

    // delete a single tx and assert that the first tx is purged and the new tx is archived
    await txPool.deleteTxs([await tx3.getTxHash()]);
    await expect(txPool.getArchivedTxByHash(await tx1.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(await tx2.getTxHash())).resolves.toEqual(tx2);
    await expect(txPool.getArchivedTxByHash(await tx3.getTxHash())).resolves.toEqual(tx3);

    // delete multiple txs and assert that the old txs are purged and the new txs are archived
    await txPool.deleteTxs([await tx4.getTxHash(), await tx5.getTxHash()]);
    await expect(txPool.getArchivedTxByHash(await tx1.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(await tx2.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(await tx3.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(await tx4.getTxHash())).resolves.toEqual(tx4);
    await expect(txPool.getArchivedTxByHash(await tx5.getTxHash())).resolves.toEqual(tx5);
  });

  it('Evicts low priority txs to satisfy the pending tx size limit', async () => {
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        maxTxPoolSize: 15000,
      },
    );

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx3.getTxHash(),
      await tx2.getTxHash(),
      await tx1.getTxHash(),
    ]);

    // once the tx pool size limit is reached, the lowest priority txs (tx1, tx2) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await txPool.triggerEviction();
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx3.getTxHash(),
    ]);

    // if another low priority tx is added after the tx pool size limit is reached, it should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await txPool.addTxs([tx6]);
    await txPool.triggerEviction();
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx3.getTxHash(),
    ]);

    // if a tx is deleted, any txs can be added until the tx pool size limit is reached
    await txPool.deleteTxs([await tx3.getTxHash()]);
    const tx7 = await mockTx(7, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    await txPool.addTxs([tx7]);
    await txPool.triggerEviction();
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx7.getTxHash(),
    ]);

    // if a tx is mined, any txs can be added until the tx pool size limit is reached
    await txPool.markAsMined([await tx4.getTxHash()], block1Header);
    const tx8 = await mockTx(8, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx8]);
    await txPool.triggerEviction();
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx8.getTxHash(),
      await tx7.getTxHash(),
    ]);

    // verify that the tx pool size limit is respected after mining and deletions
    const tx9 = await mockTx(9, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await txPool.addTxs([tx9]);
    await txPool.triggerEviction();
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx8.getTxHash(),
      await tx7.getTxHash(),
    ]);
  });

  it('respects the overflow factor configured', async () => {
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        maxTxPoolSize: mockTxSize * 10, // pool should contain no more than 10 mock txs
        txPoolOverflowFactor: 1.5, // but allow it to grow up to 15, but then when it evicts, it evicts until it's left to 10
      },
    );

    const cmp = (a: TxHash, b: TxHash) => (a.toBigInt() < b.toBigInt() ? -1 : a.toBigInt() > b.toBigInt() ? 1 : 0);

    const firstBatch = await timesAsync(10, () => mockFixedSizeTx());
    await txPool.addTxs(firstBatch);

    // we've just added 10 txs. They should all be available
    expect(await toArray(sort(await txPool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(firstBatch, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    const secondBatch = await timesAsync(2, () => mockFixedSizeTx());
    await txPool.addTxs(secondBatch);

    // we've added two more txs. At this point the pool contains more txs than the limit
    // but it still hasn't evicted anything
    expect(await toArray(sort(await txPool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map([...firstBatch, ...secondBatch], tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    const thirdBatch = await timesAsync(3, () => mockFixedSizeTx());
    await txPool.addTxs(thirdBatch);

    // add another 3 txs. The pool has reached the limit. All txs should be available still
    // another txs would trigger evictions
    expect(await toArray(sort(await txPool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map([...firstBatch, ...secondBatch, ...thirdBatch], tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    const lastTx = await mockFixedSizeTx();
    await txPool.addTxs([lastTx]);

    await txPool.triggerEviction();

    // the pool should evict enough txs to stay under the size limit
    expect(await txPool.getPendingTxCount()).toBeLessThanOrEqual(10);
  });

  it('evicts based on the updated size limit', async () => {
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        maxTxPoolSize: mockTxSize * 10, // pool should contain no more than 10 mock txs
      },
    );

    const cmp = (a: TxHash, b: TxHash) => (a.toBigInt() < b.toBigInt() ? -1 : a.toBigInt() > b.toBigInt() ? 1 : 0);

    const firstBatch = await timesAsync(10, (i: number) => mockFixedSizeTx(new GasFees(i + 1, i + 1)));
    const expectedRemainingTxs = firstBatch.slice(6);
    await txPool.addTxs(firstBatch);

    // we've just added 10 txs. They should all be available
    expect(await toArray(sort(await txPool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(firstBatch, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    // now set the limit to 5 txs
    const numRemainingTxs = 5;
    txPool.updateConfig({ maxTxPoolSize: mockTxSize * numRemainingTxs });

    // txs are not immediately evicted
    expect(await toArray(sort(await txPool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(firstBatch, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    // now add one more transaction
    const lastTx = await mockFixedSizeTx(new GasFees(20, 20));
    await txPool.addTxs([lastTx]);

    await txPool.triggerEviction();

    const finalExpectedPool = expectedRemainingTxs.concat(lastTx);

    // There should now just be numRemainingTxs txs in the pool
    expect(await txPool.getPendingTxCount()).toEqual(finalExpectedPool.length);

    expect(await toArray(sort(await txPool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(finalExpectedPool, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );
  });

  it('Evicts txs with nullifiers that are already included in the mined block', async () => {
    const tx1 = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    const tx2 = await mockTx(2, { numberOfNonRevertiblePublicCallRequests: 1 });
    const tx3 = await mockTx(3, { numberOfNonRevertiblePublicCallRequests: 1 });
    const tx4 = await mockTx(4, { numberOfNonRevertiblePublicCallRequests: 1 });

    // simulate a situation where tx1, tx2, and tx3 have the same nullifier
    tx2.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] =
      tx1.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0];
    tx3.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] =
      tx1.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0];

    await txPool.addTxs([tx1, tx2, tx3, tx4]);
    await txPool.markAsMined([await tx1.getTxHash()], block1Header);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([await tx4.getTxHash()]);
  });

  it('Evicts txs with an insufficient fee payer balance after a block is mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);
    const tx4 = await mockTx(4);

    // modify tx1 to have the same fee payer as the mined tx and an insufficient fee payer balance
    tx1.data.feePayer = tx4.data.feePayer;
    txPool.mockGasTxValidator.validateTxFee.mockImplementation(async (tx: Tx) => {
      return Promise.resolve({
        result: (await tx.getTxHash()).equals(await tx1.getTxHash()) ? 'invalid' : 'valid',
      } as TxValidationResult);
    });

    await txPool.addTxs([tx1, tx2, tx3, tx4]);
    await txPool.markAsMined([await tx4.getTxHash()], block1Header);

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([await tx2.getTxHash(), await tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  it('Evicts txs with a max inclusion timestamp lower than or equal to the timestamp of the mined block', async () => {
    const tx1 = await mockTx(1);
    tx1.data.includeByTimestamp = 0n;
    const tx2 = await mockTx(2);
    tx2.data.includeByTimestamp = 32n;
    const tx3 = await mockTx(3);
    tx3.data.includeByTimestamp = 64n;

    await txPool.addTxs([tx1, tx2, tx3]);
    await txPool.markAsMined([await tx1.getTxHash()], block2Header);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([await tx3.getTxHash()]);
  });

  it('Evicts txs with invalid archive roots after a reorg', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    // modify tx1 to return no archive indices
    tx1.data.constants.historicalHeader.globalVariables.blockNumber = 1;
    const tx1HeaderHash = await tx1.data.constants.historicalHeader.hash();
    txPool.mockArchiveCache.getArchiveIndices.mockImplementation((archives: Fr[]) => {
      if (archives[0].equals(tx1HeaderHash)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([BigInt(1)]);
    });

    await txPool.addTxs([tx1, tx2, tx3]);
    const txHashes = [await tx1.getTxHash(), await tx2.getTxHash(), await tx3.getTxHash()];
    await txPool.markAsMined(txHashes, block1Header);
    await txPool.markMinedAsPending(txHashes);

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([await tx2.getTxHash(), await tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  it('Evicts txs with invalid fee payer balances after a reorg', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await txPool.addTxs([tx1, tx2, tx3]);
    await txPool.markAsMined([await tx2.getTxHash()], block1Header);
    await checkPendingTxConsistency();

    // modify tx1 to have an insufficient fee payer balance after the reorg
    txPool.mockGasTxValidator.validateTxFee.mockImplementation(async (tx: Tx) => {
      return Promise.resolve({
        result: (await tx.getTxHash()).equals(await tx1.getTxHash()) ? 'invalid' : 'valid',
      } as TxValidationResult);
    });
    await txPool.markMinedAsPending([await tx2.getTxHash()]);
    await checkPendingTxConsistency();

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([await tx2.getTxHash(), await tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });
  it('Does not evict low priority txs marked as non-evictable', async () => {
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        maxTxPoolSize: 15000,
      },
    );

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx3.getTxHash(),
      await tx2.getTxHash(),
      await tx1.getTxHash(),
    ]);

    const tx1Hash = await tx1.getTxHash();
    await txPool.markTxsAsNonEvictable([tx1Hash]);

    // once the tx pool size limit is reached, the lowest priority txs that are evictable (tx2, tx3) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await txPool.triggerEviction();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx1.getTxHash(),
    ]);
  });

  it('Evicts low priority txs after block is mined', async () => {
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        maxTxPoolSize: 15000,
      },
    );

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx3.getTxHash(),
      await tx2.getTxHash(),
      await tx1.getTxHash(),
    ]);

    // Mark tx 1 as non-evictable
    const tx1Hash = await tx1.getTxHash();
    await txPool.markTxsAsNonEvictable([tx1Hash]);

    // once the tx pool size limit is reached, the lowest priority txs that are evictable (tx2, tx3) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await txPool.triggerEviction();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx1.getTxHash(),
    ]);

    // We have now mined a block. Mark some tx hashes as mined and we should now evict tx1 again
    const newTx = await mockTx();
    // We are marking a completely different tx as mined, but that fact that any block has been mined should
    // clear the non-evictable status
    await txPool.markAsMined([await newTx.getTxHash()], block10Header);

    // if another tx is added after the tx pool size limit is reached, the lowest priority tx that is evictable (tx1) should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(6, 6) });
    await txPool.addTxs([tx6]);
    await txPool.triggerEviction();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx6.getTxHash(),
      await tx5.getTxHash(),
      await tx4.getTxHash(),
    ]);
  });

  it('Evicts expired txs based on L1 timestamp during periodic eviction', async () => {
    // Create a tx with an expiration timestamp of 500
    const expiredTx = await mockTx(1);
    expiredTx.data.includeByTimestamp = 500n;

    const validTx = await mockTx(2);
    validTx.data.includeByTimestamp = 2000n; // Valid tx with future timestamp

    await txPool.addTxs([expiredTx, validTx]);

    // Initially both txs should be in the pool
    expect(await txPool.getPendingTxCount()).toBe(2);

    txPool.triggerEviction();

    // Wait a bit for eviction to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Only the valid tx should remain (expired tx should be evicted)
    const remainingHashes = await txPool.getPendingTxHashes();
    expect(remainingHashes).toHaveLength(1);
    expect(remainingHashes[0]).toEqual(await validTx.getTxHash());
  });

  it('Does not evict valid tx initially, then evicts after timestamp passes', async () => {
    // Mock archiver to return timestamp 500 initially
    let currentTimestamp = 500n;
    archiver.getBlockHeader.mockImplementation(blockNumber => {
      if (blockNumber === 'latest') {
        return Promise.resolve(
          BlockHeader.empty({
            globalVariables: GlobalVariables.empty({
              blockNumber: 100,
              timestamp: currentTimestamp,
            }),
          }),
        );
      }
      return Promise.resolve(undefined);
    });

    // Create a tx that expires at timestamp 1000
    const tx = await mockTx(1);
    tx.data.includeByTimestamp = 1000n;

    await txPool.addTxs([tx]);
    expect(await txPool.getPendingTxCount()).toBe(1);

    // First eviction run - tx should NOT be evicted (timestamp 500 < 1000)
    await txPool.triggerEviction();

    expect(await txPool.getPendingTxCount()).toBe(1);
    expect(await txPool.getPendingTxHashes()).toContainEqual(await tx.getTxHash());

    // Advance timestamp past expiration
    currentTimestamp = 1500n;

    // Second eviction run - tx should now be evicted (timestamp 1500 > 1000)
    await txPool.triggerEviction();

    expect(await txPool.getPendingTxCount()).toBe(0);
  });

  it('Evicts low fee txs when pool size exceeds limit during periodic eviction', async () => {
    // Create a pool with small size limit
    txPool = new TestAztecKVTxPool(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      worldState,
      archiver,
      undefined,
      {
        maxTxPoolSize: 250, // Small pool that can fit ~2 txs of 100 bytes each
        txPoolOverflowFactor: 1.5, // Allow up to 375 bytes before evicting
      },
    );

    // Create txs with different fee priorities
    const lowFeeTx1 = await mockFixedSizeTx(new GasFees(1, 1)); // Lowest priority
    const lowFeeTx2 = await mockFixedSizeTx(new GasFees(2, 2)); // Low priority
    const medFeeTx = await mockFixedSizeTx(new GasFees(5, 5)); // Medium priority
    const highFeeTx = await mockFixedSizeTx(new GasFees(10, 10)); // Highest priority

    // Add txs to fill pool beyond overflow limit (4 * 100 = 400 bytes > 375 bytes)
    await txPool.addTxs([lowFeeTx1, lowFeeTx2, medFeeTx, highFeeTx]);

    // All txs should initially be in pool (overflow allowed)
    expect(await txPool.getPendingTxCount()).toBe(4);

    await txPool.triggerEviction();

    // Pool should evict lowest priority txs to get back under base limit (250 bytes = ~2 txs)
    const remainingCount = await txPool.getPendingTxCount();
    expect(remainingCount).toBeLessThanOrEqual(2);

    // High priority txs should remain
    const remainingHashes = await txPool.getPendingTxHashes();
    expect(remainingHashes).toContainEqual(await highFeeTx.getTxHash());
    expect(remainingHashes).toContainEqual(await medFeeTx.getTxHash());

    // Low priority txs should be evicted
    expect(remainingHashes).not.toContainEqual(await lowFeeTx1.getTxHash());
    expect(remainingHashes).not.toContainEqual(await lowFeeTx2.getTxHash());
  });
});

class TestAztecKVTxPool extends AztecKVTxPool {
  public mockGasTxValidator: MockProxy<GasTxValidator> = mock<GasTxValidator>();
  public mockArchiveCache: MockProxy<ArchiveCache> = mock<ArchiveCache>();

  protected override createGasTxValidator(_db: MerkleTreeReadOperations): GasTxValidator {
    return this.mockGasTxValidator;
  }

  protected override createArchiveCache(_db: MerkleTreeReadOperations): ArchiveCache {
    return this.mockArchiveCache;
  }
}
