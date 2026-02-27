/**
 * Compatibility test suite for TxPoolV2.
 * These tests mirror the original TxPool test suite (aztec_kv_tx_pool.test.ts)
 * but use the new TxPoolV2 interface.
 */
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { map, sort, toArray } from '@aztec/foundation/iterable';
import { unfreeze } from '@aztec/foundation/types';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { RevertCode } from '@aztec/stdlib/avm';
import { Body, L2Block, type L2BlockId, type L2BlockSource } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  NullifierLeaf,
  NullifierLeafPreimage,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxEffect, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxMetaData } from './tx_metadata.js';
import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

/** A validator that accepts all transactions. */
const alwaysValidValidator: TxValidator<TxMetaData> = {
  validateTx: () => Promise.resolve({ result: 'valid' }),
};

describe('TxPoolV2 Compatibility Tests', () => {
  let pool: AztecKVTxPoolV2;
  let mockL2BlockSource: MockProxy<L2BlockSource>;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let nextTxSeed: number;
  const mockFixedTxSize = 100;

  const block1Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1), timestamp: 0n }),
  });

  // L2BlockId for the latest valid block after a prune
  // When block 1 is pruned, the latest valid block is block 0
  const block0Id: L2BlockId = { number: BlockNumber(0), hash: '0x0' };

  const checkPendingTxConsistency = async () => {
    const pendingTxHashCount = (await pool.getPendingTxHashes()).length;
    expect(await pool.getPendingTxCount()).toEqual(pendingTxHashCount);
  };

  beforeEach(async () => {
    nextTxSeed = 1;

    mockL2BlockSource = mock<L2BlockSource>();
    mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

    mockWorldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    mockWorldState.getCommitted.mockReturnValue(db);
    mockWorldState.getSnapshot.mockReturnValue(db);

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

    pool = new AztecKVTxPoolV2(await openTmpStore('p2p'), await openTmpStore('archive'), {
      l2BlockSource: mockL2BlockSource,
      worldStateSynchronizer: mockWorldState,
      createTxValidator: () => Promise.resolve(alwaysValidValidator),
    });
    await pool.start();
  });

  afterEach(async () => {
    await checkPendingTxConsistency();
    await pool.stop();
  });

  const mockFixedSizeTx = async (maxPriorityFeesPerGas?: GasFees) => {
    const tx = await mockTx(nextTxSeed++, { maxPriorityFeesPerGas });
    jest.spyOn(tx, 'getSize').mockReturnValue(mockFixedTxSize);
    return tx;
  };

  /** Creates an L2Block from transactions and a header */
  const makeBlock = (txs: Tx[], header: BlockHeader): L2Block => {
    const txEffects = txs.map(tx => {
      const nullifiers = tx.data.getNonEmptyNullifiers();
      return new TxEffect(RevertCode.OK, tx.getTxHash(), Fr.ZERO, [], nullifiers, [], [], [], [], []);
    });
    const body = new Body(txEffects);
    const archive = new AppendOnlyTreeSnapshot(Fr.random(), header.globalVariables.blockNumber + 1);
    return new L2Block(
      archive,
      header,
      body,
      CheckpointNumber(Number(header.globalVariables.blockNumber)),
      IndexWithinCheckpoint(0),
    );
  };

  // === Shared test suite tests (from tx_pool_test_suite.ts) ===

  describe('basic operations', () => {
    it('adds txs to the pool as pending', async () => {
      const tx1 = await mockTx(1);

      await pool.addPendingTxs([tx1]);
      const poolTx = await pool.getTxByHash(tx1.getTxHash());
      expect(poolTx!.getTxHash()).toEqual(tx1.getTxHash());
      expect(await pool.getTxStatus(tx1.getTxHash())).toEqual('pending');
      expect(await pool.getPendingTxHashes()).toEqual([tx1.getTxHash()]);
      expect(await pool.getPendingTxCount()).toEqual(1);
    });

    it('emits txs-added event with new txs', async () => {
      const tx1 = await mockTx(1); // existing and pending
      const tx2 = await mockTx(2); // mined but not known
      const tx3 = await mockTx(3); // brand new

      await pool.addPendingTxs([tx1]);
      // Mark tx2 as mined without adding it first
      await pool.addMinedTxs([tx2], block1Header);

      let txsFromEvent: Tx[] | undefined = undefined;
      pool.once('txs-added', ({ txs }) => {
        txsFromEvent = txs;
      });

      await pool.addPendingTxs([tx1, tx3]); // tx1 is duplicate, tx3 is new
      expect(txsFromEvent).toBeDefined();
      expect(txsFromEvent).toHaveLength(1);
      const eventHashes = txsFromEvent!.map(tx => tx.getTxHash());
      expect(eventHashes).toContainEqual(tx3.getTxHash());
    });

    it('removes pending txs from the pool via handleFailedExecution', async () => {
      const pendingTx = await mockTx(1);
      const minedTx = await mockTx(2);

      await pool.addPendingTxs([pendingTx, minedTx]);
      await pool.handleMinedBlock(makeBlock([minedTx], block1Header));

      // Delete a pending tx via handleFailedExecution - should be slot-soft-deleted
      await pool.handleFailedExecution([pendingTx.getTxHash()]);
      expect(await pool.getTxByHash(pendingTx.getTxHash())).toBeDefined();
      expect(await pool.getTxStatus(pendingTx.getTxHash())).toBe('deleted');

      expect(await pool.getPendingTxCount()).toEqual(0);
    });

    it('marks txs as mined', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await pool.addPendingTxs([tx1, tx2]);
      await pool.handleMinedBlock(makeBlock([tx1], block1Header));

      const retrievedTx = await pool.getTxByHash(tx1.getTxHash());
      expect(retrievedTx?.getTxHash()).toEqual(tx1.getTxHash());
      expect(await pool.getTxStatus(tx1.getTxHash())).toEqual('mined');
      const minedHashes = await pool.getMinedTxHashes();
      expect(minedHashes.length).toEqual(1);
      expect(minedHashes[0][0]).toEqual(tx1.getTxHash());
      expect(minedHashes[0][1].number).toEqual(BlockNumber(1));
      expect(await pool.getPendingTxHashes()).toEqual([tx2.getTxHash()]);
      expect(await pool.getPendingTxCount()).toEqual(1);
    });

    it('marks txs as pending after being mined (reorg via handlePrunedBlocks)', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await pool.addPendingTxs([tx1, tx2]);
      await pool.handleMinedBlock(makeBlock([tx1], block1Header));

      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getMinedTxHashes()).toEqual([]);
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
      expect(pending).toEqual(expect.arrayContaining([tx1.getTxHash(), tx2.getTxHash()]));
      expect(await pool.getPendingTxCount()).toEqual(2);
    });

    it('only marks txs as pending if they are known (after reorg)', async () => {
      const tx1 = await mockTx(1);
      // simulate a situation where not all peers have all the txs
      const tx2 = await mockTx(2);
      await pool.addPendingTxs([tx1]);
      // this peer knows that tx2 was mined, but it does not have the tx object
      // In V2, we need to use protectTxs to mark it as protected, then handleMinedBlock
      await pool.handleMinedBlock(makeBlock([tx1], block1Header));
      // For tx2, we can add it as mined directly
      await pool.addMinedTxs([tx2], block1Header);

      const minedHashes = await pool.getMinedTxHashes();
      expect(minedHashes.length).toBe(2);

      // reorg: both txs should now become available again
      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getMinedTxHashes()).toEqual([]);
      // Both should be pending now since tx2 was added via addMinedTxs
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
      expect(pending).toEqual(expect.arrayContaining([tx1.getTxHash(), tx2.getTxHash()]));
    });

    it('returns txs by their hash', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      await pool.addPendingTxs([tx1, tx2, tx3]);

      const requestedTxs = await pool.getTxsByHash([tx1.getTxHash(), tx3.getTxHash()]);
      expect(requestedTxs).toHaveLength(2);
      const requestedHashes = requestedTxs.filter(tx => tx !== undefined).map(tx => tx!.getTxHash());
      expect(requestedHashes).toEqual(expect.arrayContaining([tx1.getTxHash(), tx3.getTxHash()]));
    });

    it('returns a large number of transactions by their hash', async () => {
      const numTxs = 1_000;
      const txs = await Promise.all(Array.from({ length: numTxs }, (_, i) => mockTx(i)));
      const hashes = txs.map(tx => tx.getTxHash());
      await pool.addPendingTxs(txs);
      const requestedTxs = await pool.getTxsByHash(hashes);
      expect(requestedTxs.filter(tx => tx !== undefined)).toHaveLength(numTxs);
      const requestedHashes = requestedTxs.filter(tx => tx !== undefined).map(tx => tx!.getTxHash());
      expect(requestedHashes).toEqual(expect.arrayContaining(hashes));
    });

    it('returns whether or not txs exist', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      await pool.addPendingTxs([tx1, tx2, tx3]);

      const tx4 = await mockTx(4);
      const tx5 = await mockTx(5);

      const availability = await pool.hasTxs([
        tx1.getTxHash(),
        tx2.getTxHash(),
        tx3.getTxHash(),
        tx4.getTxHash(),
        tx5.getTxHash(),
      ]);
      expect(availability).toHaveLength(5);
      expect(availability).toEqual([true, true, true, false, false]);
    });

    it('returns pending tx hashes sorted by priority', async () => {
      const withPriorityFee = (tx: Tx, fee: number) => {
        unfreeze(tx.data.constants.txContext.gasSettings).maxPriorityFeesPerGas = new GasFees(fee, fee);
        return tx;
      };

      const tx1 = withPriorityFee(await mockTx(0), 1000);
      const tx2 = withPriorityFee(await mockTx(1), 100);
      const tx3 = withPriorityFee(await mockTx(2), 200);
      const tx4 = withPriorityFee(await mockTx(3), 3000);

      await pool.addPendingTxs([tx1, tx2, tx3, tx4]);

      const poolTxHashes = await pool.getPendingTxHashes();
      expect(poolTxHashes).toHaveLength(4);
      expect(poolTxHashes).toEqual([tx4, tx1, tx3, tx2].map(tx => tx.getTxHash()));
    });
  });

  describe('finalization and deletion', () => {
    it('deletes mined txs via handleFinalizedBlock', async () => {
      const txs = await Promise.all([mockTx(1), mockTx(2), mockTx(3)]);
      await pool.addPendingTxs(txs);

      // Mark first tx as mined
      await pool.handleMinedBlock(makeBlock([txs[0]], block1Header));

      // Verify initial state
      expect(await pool.getPendingTxCount()).toBe(2);
      expect(await pool.getTxByHash(txs[0].getTxHash())).toBeDefined();
      expect(await pool.getTxByHash(txs[1].getTxHash())).toBeDefined();

      // Delete mined tx via finalization
      await pool.handleFinalizedBlock(block1Header);

      // Verify mined tx is deleted (slot-soft-deleted)
      expect(await pool.getTxStatus(txs[0].getTxHash())).toBe('deleted');

      // Verify remaining pending count
      expect(await pool.getPendingTxCount()).toBe(2);
    });
  });

  // === Implementation-specific tests (from aztec_kv_tx_pool.test.ts) ===

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    await pool.stop();
    pool = new AztecKVTxPoolV2(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(alwaysValidValidator),
      },
      undefined, // telemetry
      { archivedTxLimit: 2 },
    );
    await pool.start();

    const txs = await timesAsync(5, i => mockTx(i + 1));
    await pool.addPendingTxs(txs);

    // Only mined txs should be archived, pending are never archived
    await pool.handleMinedBlock(makeBlock(txs, block1Header));

    const expectArchivedTx = async (txHash: TxHash, shouldExist: boolean) => {
      const archived = await pool.getArchivedTxByHash(txHash);
      if (shouldExist) {
        expect(archived).toBeDefined();
        expect(archived!.getTxHash()).toEqual(txHash);
      } else {
        expect(archived).toBeUndefined();
      }
    };

    // delete two txs via finalization and assert that they are properly archived
    await pool.handleFinalizedBlock(block1Header);
    // All 5 txs were mined in block1, so they should all be deleted and 2 should be archived
    await expectArchivedTx(txs[3].getTxHash(), true);
    await expectArchivedTx(txs[4].getTxHash(), true);
    await expectArchivedTx(txs[0].getTxHash(), false);
    await expectArchivedTx(txs[1].getTxHash(), false);
    await expectArchivedTx(txs[2].getTxHash(), false);
  });

  it('Evicts low priority txs to satisfy the pending tx count limit', async () => {
    await pool.stop();
    pool = new AztecKVTxPoolV2(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(alwaysValidValidator),
      },
      undefined, // telemetry
      { maxPendingTxCount: 3 },
    );
    await pool.start();

    const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await pool.addPendingTxs([tx1, tx2, tx3]);
    await checkPendingTxConsistency();
    expect(await pool.getPendingTxHashes()).toEqual([tx3.getTxHash(), tx2.getTxHash(), tx1.getTxHash()]);

    // once the tx pool count limit is reached, the lowest priority txs (tx1, tx2) should be evicted
    const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
    const tx5 = await mockTx(5, { maxPriorityFeesPerGas: new GasFees(5, 5) });
    await pool.addPendingTxs([tx4, tx5]);
    await checkPendingTxConsistency();
    expect(await pool.getPendingTxHashes()).toEqual([tx5.getTxHash(), tx4.getTxHash(), tx3.getTxHash()]);

    // if another low priority tx is added after the tx pool count limit is reached, it should be evicted
    const tx6 = await mockTx(6, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await pool.addPendingTxs([tx6]);
    await checkPendingTxConsistency();
    expect(await pool.getPendingTxHashes()).toEqual([tx5.getTxHash(), tx4.getTxHash(), tx3.getTxHash()]);

    // if a tx is deleted via handleFailedExecution, any txs can be added until the limit is reached
    await pool.handleFailedExecution([tx3.getTxHash()]);
    const tx7 = await mockTx(7, { maxPriorityFeesPerGas: new GasFees(2, 2) });
    await pool.addPendingTxs([tx7]);
    await checkPendingTxConsistency();
    expect(await pool.getPendingTxHashes()).toEqual([tx5.getTxHash(), tx4.getTxHash(), tx7.getTxHash()]);

    // if a tx is mined, any txs can be added until the limit is reached
    await pool.handleMinedBlock(makeBlock([tx4], block1Header));
    const tx8 = await mockTx(8, { maxPriorityFeesPerGas: new GasFees(3, 3) });
    await pool.addPendingTxs([tx8]);
    await checkPendingTxConsistency();
    expect(await pool.getPendingTxHashes()).toEqual([tx5.getTxHash(), tx8.getTxHash(), tx7.getTxHash()]);

    // verify that the tx pool count limit is respected after mining and deletions
    const tx9 = await mockTx(9, { maxPriorityFeesPerGas: new GasFees(1, 1) });
    await pool.addPendingTxs([tx9]);
    await checkPendingTxConsistency();
    expect(await pool.getPendingTxHashes()).toEqual([tx5.getTxHash(), tx8.getTxHash(), tx7.getTxHash()]);
  });

  it('respects the maximum transaction count configured', async () => {
    await pool.stop();
    pool = new AztecKVTxPoolV2(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(alwaysValidValidator),
      },
      undefined, // telemetry
      { maxPendingTxCount: 10 },
    );
    await pool.start();

    const cmp = (a: TxHash, b: TxHash) => (a.toBigInt() < b.toBigInt() ? -1 : a.toBigInt() > b.toBigInt() ? 1 : 0);

    const firstBatch = await timesAsync(10, () => mockFixedSizeTx());
    await pool.addPendingTxs(firstBatch);

    // we've just added 10 txs. They should all be available
    expect(await toArray(sort(await pool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(firstBatch, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    const secondBatch = await timesAsync(2, () => mockFixedSizeTx());
    await pool.addPendingTxs(secondBatch);

    // pool should evict 2 txs to bring it back to 10
    expect(await pool.getPendingTxCount()).toBe(10);

    const lastTx = await mockFixedSizeTx();
    await pool.addPendingTxs([lastTx]);

    // the pool should evict enough txs to stay below the limit
    expect(await pool.getPendingTxCount()).toBe(10);
  });

  it('evicts based on the updated size limit', async () => {
    await pool.stop();
    pool = new AztecKVTxPoolV2(
      await openTmpStore('p2p'),
      await openTmpStore('archive'),
      {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(alwaysValidValidator),
      },
      undefined, // telemetry
      { maxPendingTxCount: 10 },
    );
    await pool.start();

    const cmp = (a: TxHash, b: TxHash) => (a.toBigInt() < b.toBigInt() ? -1 : a.toBigInt() > b.toBigInt() ? 1 : 0);

    const firstBatch = await timesAsync(10, (i: number) => mockFixedSizeTx(new GasFees(i + 1, i + 1)));
    const expectedRemainingTxs = firstBatch.slice(6);
    await pool.addPendingTxs(firstBatch);

    // we've just added 10 txs. They should all be available
    expect(await toArray(sort(await pool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(firstBatch, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    // now set the limit to 5 txs
    const numRemainingTxs = 5;
    await pool.updateConfig({ maxPendingTxCount: numRemainingTxs });

    // txs are not immediately evicted
    expect(await toArray(sort(await pool.getPendingTxHashes(), cmp))).toEqual(
      await toArray(
        sort(
          map(firstBatch, tx => tx.getTxHash()),
          cmp,
        ),
      ),
    );

    // now add one more transaction
    const lastTx = await mockFixedSizeTx(new GasFees(20, 20));
    await pool.addPendingTxs([lastTx]);

    const finalExpectedPool = expectedRemainingTxs.concat(lastTx);

    // There should now just be numRemainingTxs txs in the pool
    expect(await pool.getPendingTxCount()).toEqual(finalExpectedPool.length);

    expect(await toArray(sort(await pool.getPendingTxHashes(), cmp))).toEqual(
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

    // Add tx1 first, then the others - tx2 and tx3 should replace tx1 via challenge
    // but since they have the same fee, only one will be accepted
    await pool.addPendingTxs([tx1, tx2, tx3, tx4]);
    // tx2 and tx3 can't replace tx1 since they have same fee (challenge fails)

    // Mine tx1
    await pool.handleMinedBlock(makeBlock([tx1], block1Header));

    // tx4 should be the only pending tx
    expect(await pool.getPendingTxHashes()).toEqual([tx4.getTxHash()]);
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

    await pool.addPendingTxs([tx1, tx2, tx3, tx4]);
    await pool.handleMinedBlock(makeBlock([tx4], block1Header));

    const pendingTxHashes = await pool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
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

    await pool.addPendingTxs([tx1, tx2, tx3]);
    await pool.handleMinedBlock(makeBlock([tx1, tx2, tx3], block1Header));
    await pool.handlePrunedBlocks(block0Id);

    const pendingTxHashes = await pool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  it('Evicts txs with invalid fee payer balances after a reorg', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addPendingTxs([tx1, tx2, tx3]);
    await pool.handleMinedBlock(makeBlock([tx2], block1Header));
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

    await pool.handlePrunedBlocks(block0Id);
    await checkPendingTxConsistency();

    const pendingTxHashes = await pool.getPendingTxHashes();
    expect(pendingTxHashes).toEqual(expect.arrayContaining([tx2.getTxHash(), tx3.getTxHash()]));
    expect(pendingTxHashes).toHaveLength(2);
  });

  describe('getLowestPriorityPending', () => {
    it('returns the lowest-priority evictable tx hashes up to limit', async () => {
      await pool.stop();
      pool = new AztecKVTxPoolV2(
        await openTmpStore('p2p'),
        await openTmpStore('archive'),
        {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
        },
        undefined, // telemetry
        { maxPendingTxCount: 0 },
      );
      await pool.start();

      const tx1 = await mockTx(1, { maxPriorityFeesPerGas: new GasFees(1, 1) });
      const tx2 = await mockTx(2, { maxPriorityFeesPerGas: new GasFees(2, 2) });
      const tx3 = await mockTx(3, { maxPriorityFeesPerGas: new GasFees(3, 3) });
      const tx4 = await mockTx(4, { maxPriorityFeesPerGas: new GasFees(4, 4) });
      await pool.addPendingTxs([tx3, tx1, tx4, tx2]);

      const res1 = await pool.getLowestPriorityPending(1);
      expect(res1).toEqual([tx1.getTxHash()]);

      const res2 = await pool.getLowestPriorityPending(2);
      expect(res2).toEqual([tx1.getTxHash(), tx2.getTxHash()]);

      const res3 = await pool.getLowestPriorityPending(10);
      expect(res3).toEqual([tx1.getTxHash(), tx2.getTxHash(), tx3.getTxHash(), tx4.getTxHash()]);
    });

    it('respects zero limit', async () => {
      const tx1 = await mockTx(10, { maxPriorityFeesPerGas: new GasFees(1, 1) });
      await pool.addPendingTxs([tx1]);

      expect(await pool.getLowestPriorityPending(0)).toEqual([]);
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
      await pool.addPendingTxs([tx1]);
      await pool.handleFailedExecution([tx1.getTxHash()]);

      // Add a new tx with the same nullifier - should succeed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx2]);
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
    });

    it('removes nullifier entries when tx is mined', async () => {
      const tx1 = await mockPublicTx(1, 5);
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock(makeBlock([tx1], block1Header));

      // Add a new tx with the same nullifier, it should succeed
      // (In practice this would fail world state nullifier check,
      // but we're testing pool index consistency)
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx2]);
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
    });

    it('restores nullifier entries on reorg (handlePrunedBlocks)', async () => {
      const tx1 = await mockPublicTx(1, 10);
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock(makeBlock([tx1], block1Header));
      await pool.handlePrunedBlocks(block0Id);

      // Now tx1 is pending again - nullifier should be claimed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx2]);
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx1.getTxHash());
      expect(pending).not.toContainEqual(tx2.getTxHash()); // tx2 has lower fee, should be rejected
    });

    it('cleans up nullifier index when replacement happens', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);

      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);
      await pool.addPendingTxs([tx2]); // Replaces tx1

      // Now add tx3 with the same nullifier as tx2 but lower fee
      // It should be rejected because tx2 owns that nullifier now
      const tx3 = await mockPublicTx(3, 3);
      setNullifier(tx3, 0, getNullifier(tx2, 0));

      await pool.addPendingTxs([tx3]);
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
      expect(pending).not.toContainEqual(tx3.getTxHash());
      expect(pending.length).toBe(1);
    });
  });
});
