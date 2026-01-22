import { BlockNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { map, sort, toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import {
  MerkleTreeId,
  NullifierLeaf,
  NullifierLeafPreimage,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import { describeTxPool } from './tx_pool_test_suite.js';

describe('KV TX pool', () => {
  let txPool: AztecKVTxPool;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let nextTxSeed: number;
  const mockFixedTxSize = 100;
  const logger = createLogger('p2p:test:tx-pool');

  const block1Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1), timestamp: 0n }),
  });
  const block2Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(2), timestamp: 36n }),
  });

  const checkPendingTxConsistency = async () => {
    const pendingTxHashCount = await txPool.getPendingTxHashes().then(h => h.length);
    expect(await txPool.getPendingTxCount()).toEqual(pendingTxHashCount);
  };

  beforeEach(async () => {
    nextTxSeed = 1;

    worldState = worldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    worldState.getCommitted.mockReturnValue(db);
    worldState.getSnapshot.mockReturnValue(db);

    db.findLeafIndices.mockImplementation((_tree, leaves) => {
      return Promise.resolve(times(leaves.length, () => 1n));
    });

    db.getPreviousValueIndex.mockImplementation((_tree, slot) => {
      return Promise.resolve({ index: slot, alreadyPresent: true });
    });
    db.getLeafPreimage.mockImplementation((tree, index) => {
      return Promise.resolve(
        tree === MerkleTreeId.NULLIFIER_TREE
          ? new NullifierLeafPreimage(new NullifierLeaf(new Fr(index)), Fr.ONE, 1n)
          : new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(1e18)), Fr.ONE, 1n),
      );
    });

    txPool = new AztecKVTxPool(
      await openTmpStore('p2p', logger),
      await openTmpStore('archive', logger),
      worldState,
      logger,
    );
  });

  afterEach(checkPendingTxConsistency);

  describeTxPool(() => txPool);

  const mockFixedSizeTx = async (maxPriorityFeesPerGas?: GasFees) => {
    const tx = await mockTx(nextTxSeed++, { maxPriorityFeesPerGas });
    jest.spyOn(tx, 'getSize').mockReturnValue(mockFixedTxSize);
    return tx;
  };

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    txPool = new AztecKVTxPool(
      await openTmpStore('p2p', logger),
      await openTmpStore('archive', logger),
      worldState,
      logger,
      undefined,
      {
        archivedTxLimit: 2,
      },
    );

    const txs = await timesAsync(5, i => mockTx(i + 1));
    await txPool.addTxs(txs);

    // Only mined txs should be archived, pending are never archived
    await txPool.markAsMined(
      txs.map(t => t.txHash),
      block1Header,
    );

    const expectArchivedTx = async (txHash: TxHash, shouldExist: boolean) => {
      const archived = await txPool.getArchivedTxByHash(txHash);
      if (shouldExist) {
        expect(archived).toBeDefined();
        expect(archived!.getTxHash()).toEqual(txHash);
      } else {
        expect(archived).toBeUndefined();
      }
    };

    // delete two txs and assert that they are properly archived
    await txPool.deleteTxs([txs[0].getTxHash(), txs[1].getTxHash()]);
    await expectArchivedTx(txs[0].getTxHash(), true);
    await expectArchivedTx(txs[1].getTxHash(), true);

    // delete a single tx and assert that the first tx is purged and the new tx is archived
    await txPool.deleteTxs([txs[2].getTxHash()]);
    await expectArchivedTx(txs[0].getTxHash(), false);
    await expectArchivedTx(txs[1].getTxHash(), true);
    await expectArchivedTx(txs[2].getTxHash(), true);

    // delete multiple txs and assert that the old txs are purged and the new txs are archived
    await txPool.deleteTxs([txs[3].getTxHash(), txs[4].getTxHash()]);
    await expectArchivedTx(txs[0].getTxHash(), false);
    await expectArchivedTx(txs[1].getTxHash(), false);
    await expectArchivedTx(txs[2].getTxHash(), false);
    await expectArchivedTx(txs[3].getTxHash(), true);
    await expectArchivedTx(txs[4].getTxHash(), true);
  });

  it('Evicts low priority txs to satisfy the pending tx size limit', async () => {
    txPool = new AztecKVTxPool(
      await openTmpStore('p2p', logger),
      await openTmpStore('archive', logger),
      worldState,
      logger,
      undefined,
      {
        maxPendingTxCount: 3,
      },
    );

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx3.getTxHash(), tx2.getTxHash(), tx1.getTxHash()]);

    // once the tx pool size limit is reached, the lowest priority txs (tx1, tx2) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx4.getTxHash(), tx3.getTxHash()]);

    // if another low priority tx is added after the tx pool size limit is reached, it should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await txPool.addTxs([tx6]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx4.getTxHash(), tx3.getTxHash()]);

    // if a tx is deleted, any txs can be added until the tx pool size limit is reached
    await txPool.deleteTxs([tx3.getTxHash()]);
    const tx7 = await mockTx(7, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    await txPool.addTxs([tx7]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx4.getTxHash(), tx7.getTxHash()]);

    // if a tx is mined, any txs can be added until the tx pool size limit is reached
    await txPool.markAsMined([tx4.getTxHash()], block1Header);
    const tx8 = await mockTx(8, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx8]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx8.getTxHash(), tx7.getTxHash()]);

    // verify that the tx pool size limit is respected after mining and deletions
    const tx9 = await mockTx(9, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await txPool.addTxs([tx9]);
    await checkPendingTxConsistency();
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx8.getTxHash(), tx7.getTxHash()]);
  });

  it('respects the maximum transaction count configured', async () => {
    txPool = new AztecKVTxPool(
      await openTmpStore('p2p', logger),
      await openTmpStore('archive', logger),
      worldState,
      logger,
      undefined,
      {
        maxPendingTxCount: 10, // pool should contain no more than 10 txs
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

    // pool should evict 2 txs to bring it back to 10
    expect(await txPool.getPendingTxCount()).toBe(10);

    const lastTx = await mockFixedSizeTx();
    await txPool.addTxs([lastTx]);

    // the pool should evict enough txs to stay below the limit
    expect(await txPool.getPendingTxCount()).toBe(10);
  });

  it('evicts based on the updated size limit', async () => {
    txPool = new AztecKVTxPool(
      await openTmpStore('p2p', logger),
      await openTmpStore('archive', logger),
      worldState,
      logger,
      undefined,
      {
        maxPendingTxCount: 10, // pool should contain no more than 10 mock txs
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
    txPool.updateConfig({ maxPendingTxCount: numRemainingTxs });

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
    await txPool.markAsMined([tx1.getTxHash()], block1Header);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx4.getTxHash()]);
  });

  it('Evicts txs with an insufficient fee payer balance after a block is mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);
    const tx4 = await mockTx(4);

    // modify tx1 to have the same fee payer as the mined tx and an insufficient fee payer balance
    tx1.data.feePayer = tx4.data.feePayer;
    const prev = db.getLeafPreimage.getMockImplementation()!;
    const expectedSlot = await computeFeePayerBalanceLeafSlot(tx1.data.feePayer);
    db.getLeafPreimage.mockImplementation((tree, index) => {
      if (index === expectedSlot.toBigInt() && tree === MerkleTreeId.PUBLIC_DATA_TREE) {
        return Promise.resolve(
          // this feePayer has a balance of 0 now
          new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(tx1.data.feePayer.toField(), Fr.ZERO), Fr.ONE, 1n),
        );
      } else {
        return prev(tree, index);
      }
    });

    await txPool.addTxs([tx1, tx2, tx3, tx4]);
    await txPool.markAsMined([tx4.getTxHash()], block1Header);

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
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
    await txPool.markAsMined([tx1.getTxHash()], block2Header);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx3.getTxHash()]);
  });

  it('Evicts txs with invalid archive roots after a reorg', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    // modify tx1 to return no archive indices
    tx1.data.constants.anchorBlockHeader.globalVariables.blockNumber = BlockNumber(1);
    const tx1HeaderHash = await tx1.data.constants.anchorBlockHeader.hash();
    db.findLeafIndices.mockImplementation((tree, leaves) => {
      if (tree === MerkleTreeId.ARCHIVE) {
        return Promise.resolve((leaves as Fr[]).map(l => (l.equals(tx1HeaderHash) ? undefined : 1n)));
      }
      return Promise.resolve([]);
    });

    await txPool.addTxs([tx1, tx2, tx3]);
    const txHashes = [tx1.getTxHash(), tx2.getTxHash(), tx3.getTxHash()];
    await txPool.markAsMined(txHashes, block1Header);
    await txPool.markMinedAsPending(txHashes, tx2.data.constants.anchorBlockHeader.getBlockNumber());

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  it('Evicts txs with invalid fee payer balances after a reorg', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await txPool.addTxs([tx1, tx2, tx3]);
    await txPool.markAsMined([tx2.getTxHash()], block1Header);
    await checkPendingTxConsistency();

    const prev = db.getLeafPreimage.getMockImplementation()!;
    const expectedSlot = await computeFeePayerBalanceLeafSlot(tx1.data.feePayer);
    db.getLeafPreimage.mockImplementation((tree, index) => {
      if (index === expectedSlot.toBigInt() && tree === MerkleTreeId.PUBLIC_DATA_TREE) {
        return Promise.resolve(
          // this feePayer has a balance of 0 now
          new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(tx1.data.feePayer.toField(), Fr.ZERO), Fr.ONE, 1n),
        );
      } else {
        return prev(tree, index);
      }
    });

    await txPool.markMinedAsPending([tx2.getTxHash()], BlockNumber(1));
    await checkPendingTxConsistency();

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  it('Does not evict low priority txs marked as non-evictable', async () => {
    txPool = new AztecKVTxPool(
      await openTmpStore('p2p', logger),
      await openTmpStore('archive', logger),
      worldState,
      logger,
      undefined,
      {
        maxPendingTxCount: 3,
      },
    );

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx3.getTxHash(), tx2.getTxHash(), tx1.getTxHash()]);

    const tx1Hash = tx1.getTxHash();
    await txPool.markTxsAsNonEvictable([tx1Hash]);

    // once the tx pool size limit is reached, the lowest priority txs that are evictable (tx2, tx3) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx4.getTxHash(), tx1.getTxHash()]);
  });

  describe('getLowestPriorityEvictable', () => {
    it('returns the lowest-priority evictable tx hashes up to limit', async () => {
      txPool = new AztecKVTxPool(
        await openTmpStore('p2p', logger),
        await openTmpStore('archive', logger),
        worldState,
        logger,
        undefined,
        {
          maxPendingTxCount: 0,
        },
      );

      const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
      const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
      const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
      const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
      await txPool.addTxs([tx3, tx1, tx4, tx2]);

      // Mark tx2 as non-evictable; tx1 should be considered first
      await txPool.markTxsAsNonEvictable([tx2.getTxHash()]);

      const res1 = await txPool.getLowestPriorityEvictable(1);
      expect(res1).toEqual([tx1.getTxHash()]);

      const res2 = await txPool.getLowestPriorityEvictable(2);
      // After skipping non-evictable tx2, next lowest is tx3
      expect(res2).toEqual([tx1.getTxHash(), tx3.getTxHash()]);

      const res3 = await txPool.getLowestPriorityEvictable(10);
      expect(res3).toEqual([tx1.getTxHash(), tx3.getTxHash(), tx4.getTxHash()]);
    });

    it('respects zero and all non-evictable cases', async () => {
      txPool = new AztecKVTxPool(
        await openTmpStore('p2p', logger),
        await openTmpStore('archive', logger),
        worldState,
        logger,
      );
      const tx1 = await mockTx(10, { maxPriorityFeesPerGas: new GasFees(1, 1) });
      await txPool.addTxs([tx1]);

      expect(await txPool.getLowestPriorityEvictable(0)).toEqual([]);

      await txPool.markTxsAsNonEvictable([tx1.getTxHash()]);
      expect(await txPool.getLowestPriorityEvictable(1)).toEqual([]);
    });
  });

  /**
   * Nullifier Index Consistency Tests
   *
   * These integration tests verify that the nullifier index is maintained
   * correctly across all pool operations (add, delete, mine, reorg).
   */
  describe('Nullifier index consistency', () => {
    // Tx type alias for cleaner type annotations
    type MockTx = Awaited<ReturnType<typeof mockTx>>;

    // Helper to create a public tx (forPublic path) with a specific fee
    const mockPublicTx = (seed: number, fee: number) =>
      mockTx(seed, {
        maxPriorityFeesPerGas: new GasFees(fee, fee),
        numberOfNonRevertiblePublicCallRequests: 1,
      });

    // Helper to set a specific nullifier on a transaction
    const setNullifier = (tx: MockTx, index: number, value: Fr) => {
      if (tx.data.forPublic) {
        tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[index] = value;
      } else if (tx.data.forRollup) {
        tx.data.forRollup.end.nullifiers[index] = value;
      }
    };

    const getNullifier = (tx: MockTx, index: number): Fr => {
      if (tx.data.forPublic) {
        return tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[index];
      } else if (tx.data.forRollup) {
        return tx.data.forRollup.end.nullifiers[index];
      }
      throw new Error('Transaction has no nullifiers');
    };

    it('removes nullifier entries when tx is deleted', async () => {
      const tx1 = await mockPublicTx(1, 5);
      await txPool.addTxs([tx1]);
      await txPool.deleteTxs([tx1.getTxHash()]);

      // Add a new tx with the same nullifier - should succeed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await txPool.addTxs([tx2]);
      const pending = await txPool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
    });

    it('removes nullifier entries when tx is mined', async () => {
      const tx1 = await mockPublicTx(1, 5);
      await txPool.addTxs([tx1]);
      await txPool.markAsMined([tx1.getTxHash()], block1Header);

      // Add a new tx with the same nullifier, it should succeed
      // (In practice this would fail world state nullifier check,
      // but we're testing pool index consistency)
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await txPool.addTxs([tx2]);
      const pending = await txPool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
    });

    it('restores nullifier entries on reorg (markMinedAsPending)', async () => {
      const tx1 = await mockPublicTx(1, 10);
      await txPool.addTxs([tx1]);
      await txPool.markAsMined([tx1.getTxHash()], block1Header);
      await txPool.markMinedAsPending([tx1.getTxHash()], BlockNumber(0));

      // Now tx1 is pending again - nullifier should be claimed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await txPool.addTxs([tx2]);
      const pending = await txPool.getPendingTxHashes();
      expect(pending).toContainEqual(tx1.getTxHash());
      expect(pending).not.toContainEqual(tx2.getTxHash()); // tx2 has lower fee, should be rejected
    });

    it('cleans up nullifier index when replacement happens', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);

      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await txPool.addTxs([tx1]);
      await txPool.addTxs([tx2]); // Replaces tx1

      // Now add tx3 with the same nullifier as tx2 but lower fee
      // It should be rejected because tx2 owns that nullifier now
      const tx3 = await mockPublicTx(3, 3);
      setNullifier(tx3, 0, getNullifier(tx2, 0));

      await txPool.addTxs([tx3]);
      const pending = await txPool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
      expect(pending).not.toContainEqual(tx3.getTxHash());
      expect(pending.length).toBe(1);
    });
  });
});
