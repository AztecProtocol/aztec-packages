import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { MaxBlockNumber, Tx, type TxValidationResult } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ArchiveCache, GasTxValidator } from '../../msg_validators/index.js';
import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import { describeTxPool } from './tx_pool_test_suite.js';

describe('KV TX pool', () => {
  let txPool: TestAztecKVTxPool;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;

  beforeEach(async () => {
    worldState = worldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    worldState.getCommitted.mockReturnValue(db);

    txPool = new TestAztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState);
    txPool.mockGasTxValidator.validateTxFee.mockImplementation(() =>
      Promise.resolve({ result: 'valid' } as TxValidationResult),
    );
    txPool.mockArchiveCache.getArchiveIndices.mockImplementation(() => Promise.resolve([BigInt(1)]));
  });

  describeTxPool(() => txPool);

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    txPool = new TestAztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      archivedTxLimit: 2,
    });

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
    txPool = new TestAztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 15000,
    });

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx1, tx2, tx3]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx3.getTxHash(),
      await tx2.getTxHash(),
      await tx1.getTxHash(),
    ]);

    // once the tx pool size limit is reached, the lowest priority txs (tx1, tx2) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await txPool.addTxs([tx4, tx5]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx3.getTxHash(),
    ]);

    // if another low priority tx is added after the tx pool size limit is reached, it should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await txPool.addTxs([tx6]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx3.getTxHash(),
    ]);

    // if a tx is deleted, any txs can be added until the tx pool size limit is reached
    await txPool.deleteTxs([await tx3.getTxHash()]);
    const tx7 = await mockTx(7, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    await txPool.addTxs([tx7]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx7.getTxHash(),
    ]);

    // if a tx is mined, any txs can be added until the tx pool size limit is reached
    await txPool.markAsMined([await tx4.getTxHash()], 1);
    const tx8 = await mockTx(8, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await txPool.addTxs([tx8]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx8.getTxHash(),
      await tx7.getTxHash(),
    ]);

    // verify that the tx pool size limit is respected after mining and deletions
    const tx9 = await mockTx(9, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await txPool.addTxs([tx9]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx8.getTxHash(),
      await tx7.getTxHash(),
    ]);
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
    await txPool.markAsMined([await tx1.getTxHash()], 1);
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
    await txPool.markAsMined([await tx4.getTxHash()], 1);

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([await tx2.getTxHash(), await tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  it('Evicts txs with a max block number lower than or equal to the mined block', async () => {
    const tx1 = await mockTx(1);
    tx1.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, new Fr(1));
    const tx2 = await mockTx(2);
    tx2.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, new Fr(2));
    const tx3 = await mockTx(3);
    tx3.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, new Fr(3));

    await txPool.addTxs([tx1, tx2, tx3]);
    await txPool.markAsMined([await tx1.getTxHash()], 2);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([await tx3.getTxHash()]);
  });

  it('Evicts txs with invalid archive roots after a reorg', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    // modify tx1 to return no archive indices
    tx1.data.constants.historicalHeader.globalVariables.blockNumber = new Fr(1);
    const tx1HeaderHash = await tx1.data.constants.historicalHeader.hash();
    txPool.mockArchiveCache.getArchiveIndices.mockImplementation((archives: Fr[]) => {
      if (archives[0].equals(tx1HeaderHash)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([BigInt(1)]);
    });

    await txPool.addTxs([tx1, tx2, tx3]);
    const txHashes = [await tx1.getTxHash(), await tx2.getTxHash(), await tx3.getTxHash()];
    await txPool.markAsMined(txHashes, 1);
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
    await txPool.markAsMined([await tx2.getTxHash()], 1);

    // modify tx1 to have an insufficient fee payer balance after the reorg
    txPool.mockGasTxValidator.validateTxFee.mockImplementation(async (tx: Tx) => {
      return Promise.resolve({
        result: (await tx.getTxHash()).equals(await tx1.getTxHash()) ? 'invalid' : 'valid',
      } as TxValidationResult);
    });
    await txPool.markMinedAsPending([await tx2.getTxHash()]);

    const pendingTxHashes = await txPool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([await tx2.getTxHash(), await tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });
  it('Does not evict low priority txs marked as non-evictable', async () => {
    txPool = new TestAztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 15000,
    });

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
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx1.getTxHash(),
    ]);
  });

  it('Evicts low priority txs after block is mined', async () => {
    txPool = new TestAztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), worldState, undefined, {
      maxTxPoolSize: 15000,
    });

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
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx5.getTxHash(),
      await tx4.getTxHash(),
      await tx1.getTxHash(),
    ]);

    // We have now mined a block. Mark some tx hashes as mined and we should now evict tx1 again
    const newTx = await mockTx();
    // We are marking a completely different tx as mined, but that fact that any block has been mined should
    // clear the non-evictable status
    await txPool.markAsMined([await newTx.getTxHash()], 10);

    // if another tx is added after the tx pool size limit is reached, the lowest priority tx that is evictable (tx1) should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(6, 6) });
    await txPool.addTxs([tx6]);
    await expect(txPool.getPendingTxHashes()).resolves.toEqual([
      await tx6.getTxHash(),
      await tx5.getTxHash(),
      await tx4.getTxHash(),
    ]);
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
