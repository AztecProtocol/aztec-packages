import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { map, sort, toArray } from '@aztec/foundation/iterable';
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
    db = mock<MerkleTreeReadOperations>();
    worldState.getCommitted.mockReturnValue(db);
    worldState.getSnapshot.mockReturnValue(db);

    db.findLeafIndices.mockImplementation((tree, leaves) => {
      return Promise.resolve(times(leaves.length, () => 1n));
    });

    db.getPreviousValueIndex.mockImplementation((tree, slot) => {
      return Promise.resolve({ index: slot, alreadyPresent: true });
    });
    db.getLeafPreimage.mockImplementation((tree, index) => {
      return Promise.resolve(
        tree === MerkleTreeId.NULLIFIER_TREE
          ? new NullifierLeafPreimage(new NullifierLeaf(new Fr(index)), Fr.ONE, 1n)
          : new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(1e18)), Fr.ONE, 1n),
      );
    });

    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState);
  });

  afterEach(checkPendingTxConsistency);

  describeTxPool(() => txPool);

  const mockFixedSizeTx = async (maxPriorityFeesPerGas?: GasFees) => {
    const tx = await mockTx(nextTxSeed++, { maxPriorityFeesPerGas });
    jest.spyOn(tx, 'getSize').mockReturnValue(mockTxSize);
    return tx;
  };

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      archivedTxLimit: 2,
    });

    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);
    const tx4 = await mockTx(4);
    const tx5 = await mockTx(5);
    await txPool.addTxs([tx1, tx2, tx3, tx4, tx5]);

    // delete two txs and assert that they are properly archived
    await txPool.deleteTxs([tx1.getTxHash(), tx2.getTxHash()]);
    await expect(txPool.getArchivedTxByHash(tx1.getTxHash())).resolves.toEqual(tx1);
    await expect(txPool.getArchivedTxByHash(tx2.getTxHash())).resolves.toEqual(tx2);

    // delete a single tx and assert that the first tx is purged and the new tx is archived
    await txPool.deleteTxs([tx3.getTxHash()]);
    await expect(txPool.getArchivedTxByHash(tx1.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(tx2.getTxHash())).resolves.toEqual(tx2);
    await expect(txPool.getArchivedTxByHash(tx3.getTxHash())).resolves.toEqual(tx3);

    // delete multiple txs and assert that the old txs are purged and the new txs are archived
    await txPool.deleteTxs([tx4.getTxHash(), tx5.getTxHash()]);
    await expect(txPool.getArchivedTxByHash(tx1.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(tx2.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(tx3.getTxHash())).resolves.toBeUndefined();
    await expect(txPool.getArchivedTxByHash(tx4.getTxHash())).resolves.toEqual(tx4);
    await expect(txPool.getArchivedTxByHash(tx5.getTxHash())).resolves.toEqual(tx5);
  });

  it('Evicts low priority txs to satisfy the pending tx size limit', async () => {
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 15000,
    });

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
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 10, // pool should contain no more than 10 txs
    });

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
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: mockTxSize * 10, // pool should contain no more than 10 mock txs
    });

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
    tx1.data.constants.historicalHeader.globalVariables.blockNumber = 1;
    const tx1HeaderHash = await tx1.data.constants.historicalHeader.hash();
    db.findLeafIndices.mockImplementation((tree, leaves) => {
      if (tree === MerkleTreeId.ARCHIVE) {
        return Promise.resolve((leaves as Fr[]).map(l => (l.equals(tx1HeaderHash) ? undefined : 1n)));
      }
      return Promise.resolve([]);
    });

    await txPool.addTxs([tx1, tx2, tx3]);
    const txHashes = [tx1.getTxHash(), tx2.getTxHash(), tx3.getTxHash()];
    await txPool.markAsMined(txHashes, block1Header);
    await txPool.markMinedAsPending(tx2.data.constants.historicalHeader, txHashes);

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

    await txPool.markMinedAsPending(BlockHeader.empty(), [tx2.getTxHash()]);
    await checkPendingTxConsistency();

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });
  it('Does not evict low priority txs marked as non-evictable', async () => {
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 15000,
    });

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

  it('Evicts low priority txs after block is mined', async () => {
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 15000,
    });

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx3.getTxHash(), tx2.getTxHash(), tx1.getTxHash()]);

    // Mark tx 1 as non-evictable
    const tx1Hash = tx1.getTxHash();
    await txPool.markTxsAsNonEvictable([tx1Hash]);

    // once the tx pool size limit is reached, the lowest priority txs that are evictable (tx2, tx3) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx5.getTxHash(), tx4.getTxHash(), tx1.getTxHash()]);

    // We have now mined a block. Mark some tx hashes as mined and we should now evict tx1 again
    const newTx = await mockTx();
    // We are marking a completely different tx as mined, but that fact that any block has been mined should
    // clear the non-evictable status
    await txPool.markAsMined([newTx.getTxHash()], block10Header);

    // if another tx is added after the tx pool size limit is reached, the lowest priority tx that is evictable (tx1) should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(6, 6) });
    await txPool.addTxs([tx6]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([tx6.getTxHash(), tx5.getTxHash(), tx4.getTxHash()]);
  });
});
