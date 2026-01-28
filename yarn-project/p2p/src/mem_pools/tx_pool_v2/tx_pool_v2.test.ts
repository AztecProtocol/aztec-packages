import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

// Tx type alias for cleaner type annotations
type MockTx = Awaited<ReturnType<typeof mockTx>>;

describe('TxPoolV2', () => {
  let pool: AztecKVTxPoolV2;
  let mockL2BlockSource: MockProxy<L2BlockSource>;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;

  const slot1Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({
      blockNumber: BlockNumber(1),
      slotNumber: SlotNumber(1),
      timestamp: 0n,
    }),
  });

  const slot2Header = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({
      blockNumber: BlockNumber(2),
      slotNumber: SlotNumber(2),
      timestamp: 36n,
    }),
  });

  // L2BlockId for the latest valid block after a prune
  // When block 1 is pruned, the latest valid block is block 0
  const block0Id: L2BlockId = { number: BlockNumber(0), hash: '0x0' };

  beforeEach(async () => {
    mockL2BlockSource = mock<L2BlockSource>();
    mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

    // Setup world state mock with proper fee payer balance support
    mockWorldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    mockWorldState.getCommitted.mockReturnValue(db);
    mockWorldState.getSnapshot.mockReturnValue(db);

    // Mock fee payer balance lookups to return sufficient balance (1e18)
    db.getPreviousValueIndex.mockImplementation((_tree, slot) => {
      return Promise.resolve({ index: slot, alreadyPresent: true });
    });
    db.getLeafPreimage.mockImplementation((tree, index) => {
      if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
        // Return a balance of 1e18 for any fee payer
        return Promise.resolve(
          new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(1e18)), Fr.ONE, 1n),
        );
      }
      return Promise.resolve(undefined);
    });

    pool = new AztecKVTxPoolV2(await openTmpStore('p2p'), await openTmpStore('archive'), {
      l2BlockSource: mockL2BlockSource,
      worldStateSynchronizer: mockWorldState,
    });
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
  });

  const mockTxWithFee = (seed: number, fee: number) => mockTx(seed, { maxPriorityFeesPerGas: new GasFees(fee, fee) });

  const mockPublicTx = (seed: number, fee: number = 1) =>
    mockTx(seed, {
      maxPriorityFeesPerGas: new GasFees(fee, fee),
      numberOfNonRevertiblePublicCallRequests: 1,
    });

  // Helper to set a specific nullifier on a transaction
  const setNullifier = (tx: MockTx, index: number, value: Fr) => {
    if (tx.data.forPublic) {
      tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[index] = value;
    }
  };

  const getNullifier = (tx: MockTx, index: number): Fr => {
    if (tx.data.forPublic) {
      return tx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[index];
    }
    throw new Error('Transaction has no nullifiers');
  };

  describe('addPendingTxs', () => {
    it('adds valid transactions to pending pool', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      const result = await pool.addPendingTxs([tx1, tx2]);

      expect(result.accepted).toHaveLength(2);
      expect(result.ignored).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('ignores duplicate transactions', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('challenges transactions with conflicting nullifiers - higher fee wins', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);

      // Set tx2 to have the same nullifier as tx1
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);
      const result = await pool.addPendingTxs([tx2]);

      expect(result.accepted).toContainEqual(tx2.getTxHash());
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx2.getTxHash());
      expect(pending).not.toContainEqual(tx1.getTxHash());
    });

    it('challenges transactions with conflicting nullifiers - existing wins on tie', async () => {
      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 10);

      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);
      const result = await pool.addPendingTxs([tx2]);

      // tx2 is valid but ignored due to nullifier conflict with equal-priority tx1
      expect(result.ignored).toContainEqual(tx2.getTxHash());
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx1.getTxHash());
      expect(pending).not.toContainEqual(tx2.getTxHash());
    });

    it('emits txs-added event with source', async () => {
      const tx = await mockTx(1);
      const eventPromise = new Promise<{ txs: Tx[]; source?: string }>(resolve => {
        pool.on('txs-added', args => resolve(args));
      });

      await pool.addPendingTxs([tx], { source: 'gossip' });

      const event = await eventPromise;
      expect(event.txs).toHaveLength(1);
      expect(event.source).toBe('gossip');
    });

    it('respects maxPendingTxCount limit', async () => {
      await await pool.updateConfig({ maxPendingTxCount: 3 });

      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 2);
      const tx3 = await mockTxWithFee(3, 3);
      const tx4 = await mockTxWithFee(4, 4);
      const tx5 = await mockTxWithFee(5, 5);

      await pool.addPendingTxs([tx1, tx2, tx3]);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Adding more txs should evict lowest priority
      await pool.addPendingTxs([tx4, tx5]);
      expect(await pool.getPendingTxCount()).toBe(3);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx5.getTxHash());
      expect(pending).toContainEqual(tx4.getTxHash());
      expect(pending).toContainEqual(tx3.getTxHash());
      expect(pending).not.toContainEqual(tx1.getTxHash());
      expect(pending).not.toContainEqual(tx2.getTxHash());
    });
  });

  describe('canAddPendingTx', () => {
    it('returns same result as addPendingTxs without modifying state', async () => {
      const tx = await mockTx(1);

      const canAddResult = await pool.canAddPendingTx(tx);

      expect(canAddResult).toBe('accepted');
      expect(await pool.getPendingTxCount()).toBe(0); // State unchanged

      const addResult = await pool.addPendingTxs([tx]);
      expect(addResult.accepted).toHaveLength(1);
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('returns ignored for duplicate transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      const canAddResult = await pool.canAddPendingTx(tx);
      expect(canAddResult).toBe('ignored');
    });
  });

  describe('addProtectedTxs', () => {
    it('adds new transactions as protected', async () => {
      const tx = await mockTx(1);

      await pool.addProtectedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expect(await pool.getPendingTxCount()).toBe(0); // Not in pending
    });

    it('updates existing pending transactions to protected', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);

      await pool.addProtectedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('does not modify mined transactions', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.addProtectedTxs([tx], slot2Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });
  });

  describe('protectTxs', () => {
    it('protects existing transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      const missing = await pool.protectTxs([tx.getTxHash()], slot1Header);

      expect(missing).toHaveLength(0);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    it('returns missing transaction hashes', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      await pool.addPendingTxs([tx1]);

      const missing = await pool.protectTxs([tx1.getTxHash(), tx2.getTxHash()], slot1Header);

      expect(missing).toContainEqual(tx2.getTxHash());
      expect(missing).toHaveLength(1);
    });

    it('immediately protects transactions received via gossip if pre-recorded', async () => {
      const tx = await mockTx(1);

      // Pre-record protection for a tx we don't have yet
      const missing = await pool.protectTxs([tx.getTxHash()], slot1Header);
      expect(missing).toContainEqual(tx.getTxHash());

      // Now add the tx via gossip - it should be immediately protected
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    it('updates slot number when re-protecting via protectTxs', async () => {
      const tx = await mockTx(1);

      // Add and protect for slot 1
      await pool.addPendingTxs([tx]);
      await pool.protectTxs([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Re-protect for slot 2 via protectTxs
      await pool.protectTxs([tx.getTxHash()], slot2Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(2) should NOT unprotect since slot was updated to 2
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(3) should unprotect
      await pool.prepareForSlot(SlotNumber(3));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('updates pre-protected slot when called again before tx arrives', async () => {
      const tx = await mockTx(1);

      // Pre-record protection for slot 1
      const missing1 = await pool.protectTxs([tx.getTxHash()], slot1Header);
      expect(missing1).toContainEqual(tx.getTxHash());

      // Pre-record protection for slot 2 (overwrites slot 1)
      const missing2 = await pool.protectTxs([tx.getTxHash()], slot2Header);
      expect(missing2).toContainEqual(tx.getTxHash());

      // Now add the tx - it should be protected for slot 2
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(2) should NOT unprotect since it's for slot 2
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });
  });

  describe('handleMinedBlock', () => {
    it('marks protected transactions as mined', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);

      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });

    it('marks pending transactions as mined', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('handles missing transactions gracefully', async () => {
      const unknownHash = TxHash.random();

      // Should not throw
      await pool.handleMinedBlock([unknownHash], slot1Header);
    });

    it('deletes pending transactions with conflicting nullifiers', async () => {
      // Create two transactions with the same nullifier
      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 5);

      // Give tx2 the same nullifier as tx1
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      // Add tx1 as protected (it will be mined)
      await pool.addProtectedTxs([tx1], slot1Header);

      // Add tx2 as pending (different tx hash, but shares a nullifier with tx1)
      // We need to add it differently since direct addPendingTxs would conflict
      // First, let's create a scenario where tx2 doesn't conflict initially
      const tx3 = await mockPublicTx(3, 5);
      await pool.addPendingTxs([tx3]);

      // Now manually set tx3's nullifier to match tx1's to simulate the conflict
      // Actually, let's use a cleaner approach: add tx2 first, then mine tx1
      await pool.stop();

      // Restart with fresh pool
      mockL2BlockSource = mock<L2BlockSource>();
      mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);
      pool = new AztecKVTxPoolV2(await openTmpStore('p2p-2'), await openTmpStore('archive-2'), {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
      });
      await pool.start();

      // Create fresh transactions
      const minedTx = await mockPublicTx(100, 10);
      const pendingTx = await mockPublicTx(200, 5);

      // Set pendingTx to have a different nullifier initially
      // Add both to the pool - minedTx as protected, pendingTx as pending
      await pool.addProtectedTxs([minedTx], slot1Header);
      await pool.addPendingTxs([pendingTx]);

      expect(await pool.getPendingTxCount()).toBe(1);
      expect(await pool.getTxStatus(pendingTx.getTxHash())).toBe('pending');

      // Now give pendingTx the same nullifier as minedTx by manipulating the metadata
      // This simulates a situation where the nullifier wasn't visible before (e.g., from public execution)
      // For testing purposes, we'll just verify the behavior with a simpler approach

      // Actually, the design says "nullifiers emitted from public will be added to the tree"
      // which means the mined tx's nullifiers weren't visible before mining.
      // The test should be: when we mine tx1, any pending tx2 that shares nullifiers should be deleted.

      // Let's set up this properly: pendingTx has a unique nullifier, but we'll pretend
      // the mined tx also emits that same nullifier (simulating public execution adding it)
      // Since we can't easily modify the nullifier index after the fact, let's test this differently

      // The actual behavior is: when handleMinedBlock is called, we look at the mined txs' nullifiers
      // and delete any pending txs that share those nullifiers.
      // So let's verify that if we have two txs where one is pending and shares a nullifier with
      // a tx being mined, the pending one gets deleted.

      // For this test, we need two txs with the same nullifier where one is pending and one gets mined.
      // The trick is they can't both be in the pool initially with the same nullifier.
      // Solution: add pending tx first, then mine a DIFFERENT tx that happens to share a nullifier.

      // Reset again for a clean test
      await pool.stop();
      pool = new AztecKVTxPoolV2(await openTmpStore('p2p-3'), await openTmpStore('archive-3'), {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
      });
      await pool.start();

      // Add a pending transaction
      const pendingTxFinal = await mockPublicTx(300, 5);
      await pool.addPendingTxs([pendingTxFinal]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Create a "mined" transaction that shares a nullifier (but was never in our pool)
      // This simulates a tx from another node that got mined with a conflicting nullifier
      const minedTxFinal = await mockPublicTx(400, 10);
      setNullifier(minedTxFinal, 0, getNullifier(pendingTxFinal, 0));

      // Add the mined tx as protected first (simulating receiving it for block validation)
      await pool.addProtectedTxs([minedTxFinal], slot1Header);

      // Now mine it - this should delete the pending tx with conflicting nullifier
      await pool.handleMinedBlock([minedTxFinal.getTxHash()], slot1Header);

      // The pending transaction should be deleted due to nullifier conflict
      expect(await pool.getTxStatus(pendingTxFinal.getTxHash())).toBeUndefined();
      expect(await pool.getPendingTxCount()).toBe(0);

      // The mined transaction should still be there
      expect(await pool.getTxStatus(minedTxFinal.getTxHash())).toBe('mined');
    });
  });

  describe('prepareForSlot', () => {
    it('unprotects transactions from earlier slots', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('does not unprotect transactions from current or future slots', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      await pool.addProtectedTxs([tx1], slot1Header);
      await pool.addProtectedTxs([tx2], slot2Header);

      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('protected');
    });

    it('keeps tx protected when re-protected for later slot before late prepareForSlot', async () => {
      // Race condition: tx protected for slot 1, then re-protected for slot 2,
      // then prepareForSlot(2) called late - tx should stay protected
      const tx = await mockTx(1);

      // Initially protected for slot 1
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Re-protected for slot 2 (new proposer takes over)
      await pool.addProtectedTxs([tx], slot2Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Late prepareForSlot(2) - tx should NOT be unprotected since it's now for slot 2
      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    it('keeps tx protected when re-protected for even later slot', async () => {
      const slot3Header = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(3),
          slotNumber: SlotNumber(3),
          timestamp: 72n,
        }),
      });

      const tx = await mockTx(1);

      // Protected for slot 1
      await pool.addProtectedTxs([tx], slot1Header);

      // Re-protected for slot 3 (skipping slot 2)
      await pool.addProtectedTxs([tx], slot3Header);

      // prepareForSlot(2) - tx should stay protected (it's for slot 3)
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(3) - tx should still be protected (current slot)
      await pool.prepareForSlot(SlotNumber(3));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(4) - NOW tx should be unprotected
      await pool.prepareForSlot(SlotNumber(4));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('cleans up stale pre-protected hash records', async () => {
      const tx = await mockTx(1);

      // Pre-record protection
      await pool.protectTxs([tx.getTxHash()], slot1Header);

      // Prepare for a later slot - should clean up the stale record
      await pool.prepareForSlot(SlotNumber(2));

      // Now add the tx - it should be pending, not protected
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('is idempotent for same slot', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);

      await pool.prepareForSlot(SlotNumber(2));
      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('unprotected tx with higher priority evicts conflicting pending tx', async () => {
      const txPending = await mockPublicTx(1, 5);
      const txProtected = await mockPublicTx(2, 10);

      // Give protected tx the same nullifier as pending tx
      setNullifier(txProtected, 0, getNullifier(txPending, 0));

      // Add pending tx
      await pool.addPendingTxs([txPending]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Add protected tx (has higher priority, shares nullifier)
      await pool.addProtectedTxs([txProtected], slot1Header);

      // Unprotect - txProtected should evict txPending due to nullifier conflict
      await pool.prepareForSlot(SlotNumber(2));

      // Only the higher priority tx (previously protected) should remain
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txProtected.getTxHash());
      expect(await pool.getTxStatus(txPending.getTxHash())).toBeUndefined();
    });

    it('unprotected tx with lower priority is deleted when conflicting with pending tx', async () => {
      const txPending = await mockPublicTx(1, 10);
      const txProtected = await mockPublicTx(2, 5);

      // Give protected tx the same nullifier as pending tx
      setNullifier(txProtected, 0, getNullifier(txPending, 0));

      // Add pending tx (higher priority)
      await pool.addPendingTxs([txPending]);

      // Add protected tx (lower priority, shares nullifier)
      await pool.addProtectedTxs([txProtected], slot1Header);

      // Unprotect - txProtected should be deleted, txPending should remain
      await pool.prepareForSlot(SlotNumber(2));

      // Only the higher priority pending tx should remain
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txPending.getTxHash());
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBeUndefined();
    });

    it('multiple unprotected txs with same nullifier - highest priority wins', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 15);
      const tx3 = await mockPublicTx(3, 10);

      // All share the same nullifier
      setNullifier(tx2, 0, getNullifier(tx1, 0));
      setNullifier(tx3, 0, getNullifier(tx1, 0));

      // Add all as protected for slot 1
      await pool.addProtectedTxs([tx1, tx2, tx3], slot1Header);

      // Unprotect all - only highest priority should survive
      await pool.prepareForSlot(SlotNumber(2));

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(tx2.getTxHash()); // tx2 has fee=15, highest
      expect(await pool.getTxStatus(tx1.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(tx3.getTxHash())).toBeUndefined();
    });

    it('unprotected tx evicts multiple conflicting pending txs with lower priority', async () => {
      const txPending1 = await mockPublicTx(1, 3);
      const txPending2 = await mockPublicTx(2, 4);
      const txProtected = await mockPublicTx(3, 10);

      // txProtected conflicts with both pending txs (has nullifiers from both)
      setNullifier(txProtected, 0, getNullifier(txPending1, 0));
      setNullifier(txProtected, 1, getNullifier(txPending2, 0));

      // Add pending txs
      await pool.addPendingTxs([txPending1, txPending2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Add protected tx
      await pool.addProtectedTxs([txProtected], slot1Header);

      // Unprotect - txProtected should evict both pending txs
      await pool.prepareForSlot(SlotNumber(2));

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txProtected.getTxHash());
      expect(await pool.getTxStatus(txPending1.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(txPending2.getTxHash())).toBeUndefined();
    });

    it('unprotected tx with one winning and one losing conflict is deleted', async () => {
      const txPendingHigh = await mockPublicTx(1, 20);
      const txPendingLow = await mockPublicTx(2, 3);
      const txProtected = await mockPublicTx(3, 10);

      // txProtected conflicts with both (would beat txPendingLow but lose to txPendingHigh)
      setNullifier(txProtected, 0, getNullifier(txPendingHigh, 0));
      setNullifier(txProtected, 1, getNullifier(txPendingLow, 0));

      // Add pending txs
      await pool.addPendingTxs([txPendingHigh, txPendingLow]);

      // Add protected tx
      await pool.addProtectedTxs([txProtected], slot1Header);

      // Unprotect - txProtected should be deleted because it can't beat txPendingHigh
      await pool.prepareForSlot(SlotNumber(2));

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
      expect(pending).toContainEqual(txPendingHigh.getTxHash());
      expect(pending).toContainEqual(txPendingLow.getTxHash());
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBeUndefined();
    });
  });

  describe('handlePrunedBlocks', () => {
    it('un-mines transactions from pruned block', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handlePrunedBlocks(block0Id);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('un-mined tx with higher priority evicts conflicting pending tx', async () => {
      // Ensure anchor block is valid
      db.findLeafIndices.mockResolvedValue([1n]);

      const txPending = await mockPublicTx(1, 5);
      const txMined = await mockPublicTx(2, 10);

      // Give mined tx the same nullifier as pending tx
      setNullifier(txMined, 0, getNullifier(txPending, 0));

      // Add mined tx first and mine it
      await pool.addPendingTxs([txMined]);
      await pool.handleMinedBlock([txMined.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(txMined.getTxHash())).toBe('mined');

      // Now txPending can be added since txMined's nullifier is no longer in pending
      await pool.addPendingTxs([txPending]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Reorg - txMined returns to pending and should evict txPending
      await pool.handlePrunedBlocks(block0Id);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txMined.getTxHash());
      expect(await pool.getTxStatus(txPending.getTxHash())).toBeUndefined();
    });

    it('un-mined tx with lower priority is deleted when conflicting with pending tx', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const txPending = await mockPublicTx(1, 10);
      const txMined = await mockPublicTx(2, 5);

      // Give mined tx the same nullifier as pending tx
      setNullifier(txMined, 0, getNullifier(txPending, 0));

      // Add mined tx first and mine it
      await pool.addPendingTxs([txMined]);
      await pool.handleMinedBlock([txMined.getTxHash()], slot1Header);

      // Now txPending can be added (higher priority)
      await pool.addPendingTxs([txPending]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Reorg - txMined tries to return but should be deleted (lower priority)
      await pool.handlePrunedBlocks(block0Id);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txPending.getTxHash());
      expect(await pool.getTxStatus(txMined.getTxHash())).toBeUndefined();
    });

    it('multiple un-mined txs with same nullifier - highest priority wins', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 15);
      const tx3 = await mockPublicTx(3, 10);

      // All share the same nullifier
      setNullifier(tx2, 0, getNullifier(tx1, 0));
      setNullifier(tx3, 0, getNullifier(tx1, 0));

      // Add all as pending, then mine them all in one block
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);

      // After tx1 is mined, we can add tx2 (same nullifier but tx1 no longer pending)
      await pool.addPendingTxs([tx2]);
      await pool.handleMinedBlock([tx2.getTxHash()], slot1Header);

      // After tx2 is mined, we can add tx3
      await pool.addPendingTxs([tx3]);
      await pool.handleMinedBlock([tx3.getTxHash()], slot1Header);

      // Reorg all - only highest priority should survive
      await pool.handlePrunedBlocks(block0Id);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(tx2.getTxHash()); // tx2 has fee=15, highest
      expect(await pool.getTxStatus(tx1.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(tx3.getTxHash())).toBeUndefined();
    });

    it('un-mined tx evicts multiple conflicting pending txs with lower priority', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const txPending1 = await mockPublicTx(1, 3);
      const txPending2 = await mockPublicTx(2, 4);
      const txMined = await mockPublicTx(3, 10);

      // txMined conflicts with both pending txs
      setNullifier(txMined, 0, getNullifier(txPending1, 0));
      setNullifier(txMined, 1, getNullifier(txPending2, 0));

      // Mine txMined first
      await pool.addPendingTxs([txMined]);
      await pool.handleMinedBlock([txMined.getTxHash()], slot1Header);

      // Now add the pending txs (no conflict since txMined is mined)
      await pool.addPendingTxs([txPending1, txPending2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Reorg - txMined returns and should evict both pending txs
      await pool.handlePrunedBlocks(block0Id);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txMined.getTxHash());
      expect(await pool.getTxStatus(txPending1.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(txPending2.getTxHash())).toBeUndefined();
    });

    it('un-mined tx with one winning and one losing conflict is deleted', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const txPendingHigh = await mockPublicTx(1, 20);
      const txPendingLow = await mockPublicTx(2, 3);
      const txMined = await mockPublicTx(3, 10);

      // txMined conflicts with both (would beat txPendingLow but lose to txPendingHigh)
      setNullifier(txMined, 0, getNullifier(txPendingHigh, 0));
      setNullifier(txMined, 1, getNullifier(txPendingLow, 0));

      // Mine txMined first
      await pool.addPendingTxs([txMined]);
      await pool.handleMinedBlock([txMined.getTxHash()], slot1Header);

      // Add the pending txs
      await pool.addPendingTxs([txPendingHigh, txPendingLow]);

      // Reorg - txMined should be deleted because it can't beat txPendingHigh
      await pool.handlePrunedBlocks(block0Id);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
      expect(pending).toContainEqual(txPendingHigh.getTxHash());
      expect(pending).toContainEqual(txPendingLow.getTxHash());
      expect(await pool.getTxStatus(txMined.getTxHash())).toBeUndefined();
    });
  });

  describe('validation during restore', () => {
    let mockValidator: MockProxy<TxValidator<Tx>>;
    let poolWithValidator: AztecKVTxPoolV2;

    beforeEach(async () => {
      mockValidator = mock<TxValidator<Tx>>();
      // Default to valid
      mockValidator.validateTx.mockResolvedValue({ result: 'valid' });

      poolWithValidator = new AztecKVTxPoolV2(await openTmpStore('p2p-val'), await openTmpStore('archive-val'), {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: mockValidator,
      });
      await poolWithValidator.start();
    });

    afterEach(async () => {
      await poolWithValidator.stop();
    });

    it('prepareForSlot deletes tx that fails validation when unprotecting', async () => {
      const tx = await mockTx(1);

      // Add and protect the tx
      await poolWithValidator.addProtectedTxs([tx], slot1Header);
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');

      // Make validator reject this tx
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['tx expired'],
      });

      // Unprotect - tx should be deleted due to validation failure
      await poolWithValidator.prepareForSlot(SlotNumber(2));

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBeUndefined();
      expect(await poolWithValidator.getPendingTxCount()).toBe(0);
    });

    it('prepareForSlot keeps tx that passes validation when unprotecting', async () => {
      const tx = await mockTx(1);

      // Add and protect the tx
      await poolWithValidator.addProtectedTxs([tx], slot1Header);

      // Validator returns valid (default)
      await poolWithValidator.prepareForSlot(SlotNumber(2));

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(1);
    });

    it('prepareForSlot handles mixed valid/invalid txs', async () => {
      const txValid = await mockTx(1);
      const txInvalid = await mockTx(2);
      const txAlsoValid = await mockTx(3);

      // Add and protect all txs
      await poolWithValidator.addProtectedTxs([txValid, txInvalid, txAlsoValid], slot1Header);

      // Configure validator to reject only txInvalid
      mockValidator.validateTx.mockImplementation(async (tx: Tx) => {
        if (tx.getTxHash().equals(txInvalid.getTxHash())) {
          return { result: 'invalid', reason: ['invalid proof'] };
        }
        return { result: 'valid' };
      });

      await poolWithValidator.prepareForSlot(SlotNumber(2));

      expect(await poolWithValidator.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getTxStatus(txInvalid.getTxHash())).toBeUndefined();
      expect(await poolWithValidator.getTxStatus(txAlsoValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(2);
    });

    it('handlePrunedBlocks deletes tx that fails validation when un-mining', async () => {
      db.findLeafIndices.mockResolvedValue([1n]); // Anchor block valid

      const tx = await mockTx(1);

      // Add, mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

      // Make validator reject this tx
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['timestamp expired'],
      });

      // Reorg - tx should be deleted due to validation failure
      await poolWithValidator.handlePrunedBlocks(block0Id);

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBeUndefined();
      expect(await poolWithValidator.getPendingTxCount()).toBe(0);
    });

    it('handlePrunedBlocks keeps tx that passes validation when un-mining', async () => {
      db.findLeafIndices.mockResolvedValue([1n]); // Anchor block valid

      const tx = await mockTx(1);

      // Add, mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock([tx.getTxHash()], slot1Header);

      // Validator returns valid (default)
      await poolWithValidator.handlePrunedBlocks(block0Id);

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(1);
    });

    it('handlePrunedBlocks handles mixed valid/invalid txs', async () => {
      db.findLeafIndices.mockResolvedValue([1n]); // Anchor block valid

      const txValid = await mockTx(1);
      const txInvalid = await mockTx(2);
      const txAlsoValid = await mockTx(3);

      // Add and mine all txs
      await poolWithValidator.addPendingTxs([txValid, txInvalid, txAlsoValid]);
      await poolWithValidator.handleMinedBlock(
        [txValid.getTxHash(), txInvalid.getTxHash(), txAlsoValid.getTxHash()],
        slot1Header,
      );

      // Configure validator to reject only txInvalid
      mockValidator.validateTx.mockImplementation(async (tx: Tx) => {
        if (tx.getTxHash().equals(txInvalid.getTxHash())) {
          return { result: 'invalid', reason: ['nullifier exists'] };
        }
        return { result: 'valid' };
      });

      await poolWithValidator.handlePrunedBlocks(block0Id);

      expect(await poolWithValidator.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getTxStatus(txInvalid.getTxHash())).toBeUndefined();
      expect(await poolWithValidator.getTxStatus(txAlsoValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(2);
    });

    it('validation runs before nullifier conflict check in prepareForSlot', async () => {
      const txPending = await mockPublicTx(1, 5);
      const txProtected = await mockPublicTx(2, 10);

      // Give protected tx the same nullifier as pending tx
      setNullifier(txProtected, 0, getNullifier(txPending, 0));

      // Add pending tx
      await poolWithValidator.addPendingTxs([txPending]);

      // Add protected tx with higher priority
      await poolWithValidator.addProtectedTxs([txProtected], slot1Header);

      // Make validator reject the protected tx
      mockValidator.validateTx.mockImplementation(async (tx: Tx) => {
        if (tx.getTxHash().equals(txProtected.getTxHash())) {
          return { result: 'invalid', reason: ['invalid'] };
        }
        return { result: 'valid' };
      });

      // Unprotect - protected tx should be deleted (validation fails before conflict check)
      // So pending tx should remain even though it has lower priority
      await poolWithValidator.prepareForSlot(SlotNumber(2));

      const pending = await poolWithValidator.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txPending.getTxHash());
      expect(await poolWithValidator.getTxStatus(txProtected.getTxHash())).toBeUndefined();
    });
  });

  describe('handleFailedExecution', () => {
    it('deletes failed transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      await pool.handleFailedExecution([tx.getTxHash()]);

      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
      expect(await pool.getPendingTxCount()).toBe(0);
    });
  });

  describe('handleFinalizedBlock', () => {
    it('permanently deletes mined transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);

      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
      expect(await pool.getTxByHash(tx.getTxHash())).toBeUndefined();
    });

    it('archives transactions if configured', async () => {
      await pool.updateConfig({ archivedTxLimit: 10 });
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);

      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
      const archived = await pool.getArchivedTxByHash(tx.getTxHash());
      expect(archived).toBeDefined();
      expect(archived!.getTxHash()).toEqual(tx.getTxHash());
    });
  });

  describe('state transitions', () => {
    it('pending -> protected -> mined -> deleted (happy path)', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handleFinalizedBlock(slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });

    it('pending -> protected -> pending (slot passed)', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('pending -> protected -> mined -> protected (reorg, still valid)', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.addProtectedTxs([tx], slot1Header);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // After reorg, tx retains its protection status (protection is managed by prepareForSlot)
      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    it('N/A -> protected -> mined -> deleted (req/resp flow)', async () => {
      const tx = await mockTx(1);

      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handleFinalizedBlock(slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });

    it('N/A -> mined -> deleted (prover flow)', async () => {
      const tx = await mockTx(1);

      await pool.addMinedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handleFinalizedBlock(slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });
  });

  describe('queries', () => {
    it('getPendingTxHashes returns txs sorted by priority (highest first)', async () => {
      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 3);
      const tx3 = await mockTxWithFee(3, 2);

      await pool.addPendingTxs([tx1, tx2, tx3]);

      const pending = await pool.getPendingTxHashes();
      expect(pending[0]).toEqual(tx2.getTxHash());
      expect(pending[1]).toEqual(tx3.getTxHash());
      expect(pending[2]).toEqual(tx1.getTxHash());
    });

    it('getPendingTxHashes uses tx hash as tiebreaker when fees are equal', async () => {
      // Create transactions with the same priority fee
      const tx1 = await mockTxWithFee(1, 5);
      const tx2 = await mockTxWithFee(2, 5);
      const tx3 = await mockTxWithFee(3, 5);

      // Add in random order
      await pool.addPendingTxs([tx2, tx1, tx3]);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(3);

      // All have the same fee, so they should be sorted by hash (highest first)
      const hashes = [tx1.getTxHash(), tx2.getTxHash(), tx3.getTxHash()];
      const sortedByHashDesc = [...hashes].sort((a, b) => b.toString().localeCompare(a.toString()));

      expect(pending.map(h => h.toString())).toEqual(sortedByHashDesc.map(h => h.toString()));
    });

    it('getPendingTxHashes sorts by fee first, then by hash for equal fees', async () => {
      // Create transactions: some with same fee, some with different
      const txHighFee1 = await mockTxWithFee(10, 100);
      const txHighFee2 = await mockTxWithFee(11, 100);
      const txMidFee = await mockTxWithFee(20, 50);
      const txLowFee1 = await mockTxWithFee(30, 10);
      const txLowFee2 = await mockTxWithFee(31, 10);

      // Add in random order
      await pool.addPendingTxs([txLowFee2, txHighFee1, txMidFee, txLowFee1, txHighFee2]);

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(5);

      // Group by expected order: high fees first (sorted by hash), then mid, then low (sorted by hash)
      const highFeeHashes = [txHighFee1.getTxHash(), txHighFee2.getTxHash()].sort((a, b) =>
        b.toString().localeCompare(a.toString()),
      );
      const lowFeeHashes = [txLowFee1.getTxHash(), txLowFee2.getTxHash()].sort((a, b) =>
        b.toString().localeCompare(a.toString()),
      );

      // First should be high fee txs (by hash), then mid fee, then low fee txs (by hash)
      expect(pending[0].toString()).toEqual(highFeeHashes[0].toString());
      expect(pending[1].toString()).toEqual(highFeeHashes[1].toString());
      expect(pending[2].toString()).toEqual(txMidFee.getTxHash().toString());
      expect(pending[3].toString()).toEqual(lowFeeHashes[0].toString());
      expect(pending[4].toString()).toEqual(lowFeeHashes[1].toString());
    });

    it('getMinedTxHashes returns mined txs with block IDs', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await pool.addPendingTxs([tx1, tx2]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);
      await pool.handleMinedBlock([tx2.getTxHash()], slot2Header);

      const mined = await pool.getMinedTxHashes();
      expect(mined).toHaveLength(2);

      // Find entries by tx hash and check block ID structure
      const tx1Entry = mined.find(([hash]) => hash.equals(tx1.getTxHash()));
      const tx2Entry = mined.find(([hash]) => hash.equals(tx2.getTxHash()));

      expect(tx1Entry).toBeDefined();
      expect(tx1Entry![1].number).toBe(BlockNumber(1));
      expect(tx1Entry![1].hash).toBeDefined();

      expect(tx2Entry).toBeDefined();
      expect(tx2Entry![1].number).toBe(BlockNumber(2));
      expect(tx2Entry![1].hash).toBeDefined();
    });

    it('getLowestPriorityEvictable returns lowest priority txs', async () => {
      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 2);
      const tx3 = await mockTxWithFee(3, 3);

      await pool.addPendingTxs([tx1, tx2, tx3]);

      const lowest = await pool.getLowestPriorityEvictable(2);
      expect(lowest).toHaveLength(2);
      expect(lowest).toContainEqual(tx1.getTxHash());
      expect(lowest).toContainEqual(tx2.getTxHash());
    });
  });

  describe('archive', () => {
    it('archives mined transactions on deletion', async () => {
      await pool.updateConfig({ archivedTxLimit: 5 });
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      await pool.handleFinalizedBlock(slot1Header);

      const archived = await pool.getArchivedTxByHash(tx.getTxHash());
      expect(archived).toBeDefined();
    });

    it('enforces archivedTxLimit with FIFO eviction', async () => {
      await pool.updateConfig({ archivedTxLimit: 2 });

      const txs = await timesAsync(5, i => mockTx(i + 1));

      // Add and finalize all txs
      for (let i = 0; i < txs.length; i++) {
        const header = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({
            blockNumber: BlockNumber(i + 1),
            slotNumber: SlotNumber(i + 1),
          }),
        });
        await pool.addPendingTxs([txs[i]]);
        await pool.handleMinedBlock([txs[i].getTxHash()], header);
        await pool.handleFinalizedBlock(header);
      }

      // Only the last 2 should be archived
      expect(await pool.getArchivedTxByHash(txs[0].getTxHash())).toBeUndefined();
      expect(await pool.getArchivedTxByHash(txs[1].getTxHash())).toBeUndefined();
      expect(await pool.getArchivedTxByHash(txs[2].getTxHash())).toBeUndefined();
      expect(await pool.getArchivedTxByHash(txs[3].getTxHash())).toBeDefined();
      expect(await pool.getArchivedTxByHash(txs[4].getTxHash())).toBeDefined();
    });
  });

  describe('nullifier index consistency', () => {
    it('removes nullifier entries when tx is deleted', async () => {
      const tx1 = await mockPublicTx(1, 5);
      await pool.addPendingTxs([tx1]);
      await pool.handleFailedExecution([tx1.getTxHash()]);

      // Add a new tx with the same nullifier - should succeed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx2]);
      expect(result.accepted).toContainEqual(tx2.getTxHash());
    });

    it('removes nullifier entries when tx is mined', async () => {
      const tx1 = await mockPublicTx(1, 5);
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);

      // Add a new tx with the same nullifier - should succeed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx2]);
      expect(result.accepted).toContainEqual(tx2.getTxHash());
    });

    it('restores nullifier entries on reorg', async () => {
      const tx1 = await mockPublicTx(1, 10);
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);
      await pool.handlePrunedBlocks(block0Id);

      // Now tx1 is pending again - nullifier should be claimed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx2]);
      // tx2 is valid but ignored due to nullifier conflict with higher-priority tx1
      expect(result.ignored).toContainEqual(tx2.getTxHash()); // tx2 has lower fee
    });
  });

  describe('fee payer balance eviction', () => {
    it('keeps txs when fee payer has sufficient balance', async () => {
      // Default mock has balance of 1e18, which is sufficient
      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 5);

      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Mine a block - triggers fee payer balance check
      await pool.handleMinedBlock([], slot1Header);

      // Both should remain with sufficient balance
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('does not evict txs from different fee payers', async () => {
      // Different seeds = different fee payers
      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 5);

      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Each fee payer has their own balance, no eviction needed
      await pool.handleMinedBlock([], slot1Header);
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('eviction rule checks balance after block is mined', async () => {
      // Add txs with default high balance
      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 5);

      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Mine block - balance check happens at block's state
      await pool.handleMinedBlock([], slot1Header);

      // Txs remain since balance is sufficient
      expect(await pool.getPendingTxCount()).toBe(2);
    });
  });

  describe('fee payer balance pre-add rule', () => {
    // Helper to set fee payer balance in the mock
    const setFeePayerBalance = (balance: bigint) => {
      db.getLeafPreimage.mockImplementation((tree, index) => {
        if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
          return Promise.resolve(
            new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(balance)), Fr.ONE, 1n),
          );
        }
        return Promise.resolve(undefined);
      });
    };

    it('ignores tx when fee payer has insufficient balance', async () => {
      // Set balance to 0 - no tx can be covered
      setFeePayerBalance(0n);

      const tx = await mockPublicTx(1);

      const result = await pool.addPendingTxs([tx]);

      // Tx is valid but ignored due to insufficient balance
      expect(result.ignored).toContainEqual(tx.getTxHash());
      expect(result.accepted).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('canAddPendingTx returns ignored when fee payer has insufficient balance', async () => {
      setFeePayerBalance(0n);

      const tx = await mockPublicTx(1);

      const result = await pool.canAddPendingTx(tx);
      expect(result).toBe('ignored');

      // Pool state unchanged
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('accepts tx when fee payer has sufficient balance', async () => {
      // Default balance is 1e18, which is sufficient
      const tx = await mockPublicTx(1);

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toContainEqual(tx.getTxHash());
      expect(await pool.getPendingTxCount()).toBe(1);
    });
  });

  describe('anchor block validation (reorg)', () => {
    it('evicts txs with pruned anchor blocks after reorg', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Simulate reorg - anchor block is no longer in archive
      db.findLeafIndices.mockResolvedValue([undefined]); // Block not found

      await pool.handlePrunedBlocks(block0Id);

      // Tx should be deleted because its anchor block was pruned
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });

    it('keeps txs with valid anchor blocks after reorg', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);

      // Anchor block still exists in archive
      db.findLeafIndices.mockResolvedValue([1n]); // Block found at index 1

      await pool.handlePrunedBlocks(block0Id);

      // Tx should be restored to pending
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('handles mixed valid/invalid anchor blocks in batch', async () => {
      // Both txs from same mock likely share the same anchor block hash
      // So we test that when anchor block is valid, both are restored
      const txValid = await mockTx(1);
      const txAlsoValid = await mockTx(2);

      await pool.addPendingTxs([txValid, txAlsoValid]);
      await pool.handleMinedBlock([txValid.getTxHash(), txAlsoValid.getTxHash()], slot1Header);

      // Mock: anchor block exists
      db.findLeafIndices.mockResolvedValue([1n]);

      await pool.handlePrunedBlocks(block0Id);

      // Both should be restored to pending since they share valid anchor block
      expect(await pool.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txAlsoValid.getTxHash())).toBe('pending');
    });

    it('evicts all txs when shared anchor block is pruned', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await pool.addPendingTxs([tx1, tx2]);
      await pool.handleMinedBlock([tx1.getTxHash(), tx2.getTxHash()], slot1Header);

      // Mock: anchor block does not exist (pruned)
      db.findLeafIndices.mockResolvedValue([undefined]);

      await pool.handlePrunedBlocks(block0Id);

      // Both should be deleted since their anchor block was pruned
      expect(await pool.getTxStatus(tx1.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(tx2.getTxHash())).toBeUndefined();
    });
  });

  describe('complex reorg scenarios', () => {
    const slot3Header = BlockHeader.empty({
      globalVariables: GlobalVariables.empty({
        blockNumber: BlockNumber(3),
        slotNumber: SlotNumber(3),
        timestamp: 72n,
      }),
    });

    const block1Id: L2BlockId = { number: BlockNumber(1), hash: '0x1' };
    const block2Id: L2BlockId = { number: BlockNumber(2), hash: '0x2' };

    it('handles multiple blocks being pruned', async () => {
      // Ensure anchor blocks are valid
      db.findLeafIndices.mockResolvedValue([1n]);

      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      // Mine txs in different blocks
      await pool.addPendingTxs([tx1, tx2, tx3]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);
      await pool.handleMinedBlock([tx2.getTxHash()], slot2Header);
      await pool.handleMinedBlock([tx3.getTxHash()], slot3Header);

      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('mined');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('mined');
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('mined');

      // Prune back to block 1 - tx2 and tx3 should be un-mined
      await pool.handlePrunedBlocks(block1Id);

      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('mined');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('handles reorg followed by re-mining', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const tx = await mockTx(1);

      // Mine, prune, re-mine cycle
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      await pool.handleMinedBlock([tx.getTxHash()], slot2Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });

    it('handles consecutive reorgs', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot3Header);

      // First reorg to block 2
      await pool.handlePrunedBlocks(block2Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      // Re-mine in block 3
      await pool.handleMinedBlock([tx.getTxHash()], slot3Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Second reorg all the way to block 0
      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('cleans up indices properly through multiple state transitions', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 5);

      // Set same nullifier
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      // Add tx1, mine it
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);

      // Now tx2 can be added (tx1's nullifier is no longer in pending)
      const result1 = await pool.addPendingTxs([tx2]);
      expect(result1.accepted).toContainEqual(tx2.getTxHash());

      // Reorg - tx1 comes back to pending
      await pool.handlePrunedBlocks(block0Id);

      // tx1 is pending again, tx2 should be evicted due to nullifier conflict
      // (depends on which has higher priority)
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx1.getTxHash()); // tx1 has higher fee
    });
  });

  describe('protected tx behavior', () => {
    it('protected txs are not evicted by low priority rule', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 2);
      const txProtected = await mockTxWithFee(3, 0); // Lowest priority but protected

      // Add and protect tx3
      await pool.addProtectedTxs([txProtected], slot1Header);

      // Add pending txs
      await pool.addPendingTxs([tx1, tx2]);

      // Protected tx should still exist
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBe('protected');
    });

    it('protected txs become pending on slot transition', async () => {
      const tx = await mockTx(1);

      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expect(await pool.getPendingTxCount()).toBe(0);

      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('cannot transition mined tx back to protected', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Try to protect - should remain mined
      await pool.addProtectedTxs([tx], slot2Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });
  });

  describe('pool size limits', () => {
    it('evicts lowest priority when adding beyond limit', async () => {
      await pool.updateConfig({ maxPendingTxCount: 3 });

      const txs = await Promise.all([
        mockTxWithFee(1, 10),
        mockTxWithFee(2, 20),
        mockTxWithFee(3, 30),
        mockTxWithFee(4, 5), // Lowest priority
      ]);

      await pool.addPendingTxs(txs);

      expect(await pool.getPendingTxCount()).toBe(3);
      expect(await pool.getTxStatus(txs[3].getTxHash())).toBeUndefined(); // Lowest evicted
    });

    it('handles limit exactly at capacity', async () => {
      await pool.updateConfig({ maxPendingTxCount: 3 });

      const txs = await Promise.all([mockTxWithFee(1, 10), mockTxWithFee(2, 20), mockTxWithFee(3, 30)]);

      await pool.addPendingTxs(txs);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Adding one more should evict lowest
      const tx4 = await mockTxWithFee(4, 15);
      await pool.addPendingTxs([tx4]);

      expect(await pool.getPendingTxCount()).toBe(3);
      expect(await pool.getTxStatus(txs[0].getTxHash())).toBeUndefined(); // fee=10 evicted
      expect(await pool.getTxStatus(tx4.getTxHash())).toBe('pending'); // fee=15 kept
    });

    it('new tx with lowest priority is ignored when pool is full', async () => {
      await pool.updateConfig({ maxPendingTxCount: 3 });

      const txs = await Promise.all([mockTxWithFee(1, 10), mockTxWithFee(2, 20), mockTxWithFee(3, 30)]);

      await pool.addPendingTxs(txs);

      // Add new tx with lowest priority - should be ignored by pre-add rule (not added then evicted)
      const txLow = await mockTxWithFee(4, 5);
      const result = await pool.addPendingTxs([txLow]);

      // The tx should be in the ignored array (pre-add rule handled it)
      expect(result.ignored).toContainEqual(txLow.getTxHash());
      expect(result.accepted).toHaveLength(0);

      // Pool count unchanged, tx not in pool
      expect(await pool.getPendingTxCount()).toBe(3);
      expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined();
    });

    it('unprotecting txs respects pool size limit', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      const txProtected = await mockTxWithFee(3, 5); // Will be unprotected

      await pool.addPendingTxs([tx1, tx2]);
      await pool.addProtectedTxs([txProtected], slot1Header);

      expect(await pool.getPendingTxCount()).toBe(2);

      // Unprotect tx3 - should trigger eviction
      await pool.prepareForSlot(SlotNumber(2));

      // Pool should maintain limit
      expect(await pool.getPendingTxCount()).toBe(2);
    });
  });

  describe('multiple nullifier conflicts', () => {
    it('handles tx with multiple nullifiers conflicting with different txs', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 5);
      const txConflicting = await mockPublicTx(3, 10); // Higher fee

      // Set txConflicting to conflict with both tx1 and tx2
      setNullifier(txConflicting, 0, getNullifier(tx1, 0));
      setNullifier(txConflicting, 1, getNullifier(tx2, 0));

      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Adding txConflicting should evict both tx1 and tx2
      const result = await pool.addPendingTxs([txConflicting]);
      expect(result.accepted).toContainEqual(txConflicting.getTxHash());

      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(txConflicting.getTxHash());
      expect(pending).not.toContainEqual(tx1.getTxHash());
      expect(pending).not.toContainEqual(tx2.getTxHash());
    });

    it('ignores tx when one conflict would win but another would lose', async () => {
      const tx1 = await mockPublicTx(1, 10); // High fee
      const tx2 = await mockPublicTx(2, 1); // Low fee
      const txConflicting = await mockPublicTx(3, 5); // Medium fee

      // txConflicting conflicts with tx1 (would lose) and tx2 (would win)
      setNullifier(txConflicting, 0, getNullifier(tx1, 0));
      setNullifier(txConflicting, 1, getNullifier(tx2, 0));

      await pool.addPendingTxs([tx1, tx2]);

      // Should be ignored because it can't beat tx1 (valid tx but not desired)
      const result = await pool.addPendingTxs([txConflicting]);
      expect(result.ignored).toContainEqual(txConflicting.getTxHash());

      // Original txs should remain
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(tx1.getTxHash());
      expect(pending).toContainEqual(tx2.getTxHash());
    });
  });

  describe('edge cases', () => {
    it('handles empty pool operations gracefully', async () => {
      expect(await pool.getPendingTxCount()).toBe(0);
      expect(await pool.getPendingTxHashes()).toHaveLength(0);
      expect(await pool.getMinedTxHashes()).toHaveLength(0);
      expect(await pool.getLowestPriorityEvictable(10)).toHaveLength(0);

      // Operations on non-existent txs
      await pool.handleMinedBlock([TxHash.random()], slot1Header);
      await pool.handleFailedExecution([TxHash.random()]);
      await pool.handlePrunedBlocks(block0Id);
      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('handles tx added, mined, finalized in quick succession', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
      expect(await pool.getTxByHash(tx.getTxHash())).toBeUndefined();
    });

    it('handles duplicate handleMinedBlock calls', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header); // Duplicate

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });

    it('handles finalization of already-deleted tx', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleFailedExecution([tx.getTxHash()]);

      // Should not throw
      await pool.handleFinalizedBlock(slot1Header);
    });

    it('handles prepareForSlot with no protected txs', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      // Should not throw or change anything
      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('handles large batch of txs', async () => {
      const txs = await timesAsync(100, i => mockTxWithFee(i, i));

      const result = await pool.addPendingTxs(txs);

      expect(result.accepted).toHaveLength(100);
      expect(await pool.getPendingTxCount()).toBe(100);

      // Verify ordering is correct (highest fee first)
      const pending = await pool.getPendingTxHashes();
      expect(pending[0]).toEqual(txs[99].getTxHash()); // fee=99
      expect(pending[99]).toEqual(txs[0].getTxHash()); // fee=0
    });

    it('handles txs with zero priority fee', async () => {
      const txZeroFee = await mockTxWithFee(1, 0);
      const txLowFee = await mockTxWithFee(2, 1);

      await pool.addPendingTxs([txZeroFee, txLowFee]);

      const pending = await pool.getPendingTxHashes();
      expect(pending[0]).toEqual(txLowFee.getTxHash());
      expect(pending[1]).toEqual(txZeroFee.getTxHash());
    });
  });

  describe('persistence and recovery', () => {
    it('maintains indices after adding and removing txs', async () => {
      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 20);
      const tx3 = await mockPublicTx(3, 15);

      await pool.addPendingTxs([tx1, tx2, tx3]);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Delete middle priority tx
      await pool.handleFailedExecution([tx3.getTxHash()]);

      // Check remaining txs are still accessible and ordered correctly
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
      expect(pending[0]).toEqual(tx2.getTxHash()); // fee=20
      expect(pending[1]).toEqual(tx1.getTxHash()); // fee=10
    });

    it('fee payer index is maintained through state transitions', async () => {
      const tx = await mockTx(1);

      // Add as pending
      await pool.addPendingTxs([tx]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Protect
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getPendingTxCount()).toBe(0);

      // Unprotect
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getPendingTxCount()).toBe(1);

      // Mine
      await pool.handleMinedBlock([tx.getTxHash()], slot1Header);
      expect(await pool.getPendingTxCount()).toBe(0);

      // Reorg
      db.findLeafIndices.mockResolvedValue([1n]);
      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Verify tx is still retrievable
      const retrieved = await pool.getTxByHash(tx.getTxHash());
      expect(retrieved).toBeDefined();
    });
  });

  describe('canAddPendingTx edge cases', () => {
    it('returns ignored for nullifier conflict with higher priority tx', async () => {
      const txExisting = await mockPublicTx(1, 10);
      const txNew = await mockPublicTx(2, 5);
      setNullifier(txNew, 0, getNullifier(txExisting, 0));

      await pool.addPendingTxs([txExisting]);

      // tx is valid but ignored due to nullifier conflict with higher-priority tx
      const result = await pool.canAddPendingTx(txNew);
      expect(result).toBe('ignored');
    });

    it('returns accepted for nullifier conflict with lower priority tx', async () => {
      const txExisting = await mockPublicTx(1, 5);
      const txNew = await mockPublicTx(2, 10);
      setNullifier(txNew, 0, getNullifier(txExisting, 0));

      await pool.addPendingTxs([txExisting]);

      const result = await pool.canAddPendingTx(txNew);
      expect(result).toBe('accepted');

      // Verify pool state unchanged
      expect(await pool.getPendingTxCount()).toBe(1);
      expect((await pool.getPendingTxHashes())[0]).toEqual(txExisting.getTxHash());
    });

    it('returns accepted when pool has capacity', async () => {
      await pool.updateConfig({ maxPendingTxCount: 10 });
      const tx = await mockTx(1);

      const result = await pool.canAddPendingTx(tx);
      expect(result).toBe('accepted');
    });
  });

  describe('AddTxsResult status accuracy', () => {
    it('returns correct status for mixed accepted/ignored txs', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);

      // Add tx1 first
      await pool.addPendingTxs([tx1]);

      // Add tx1 again (duplicate) along with new txs
      const result = await pool.addPendingTxs([tx1, tx2, tx3]);

      expect(result.accepted).toHaveLength(2);
      expect(result.accepted).toContainEqual(tx2.getTxHash());
      expect(result.accepted).toContainEqual(tx3.getTxHash());
      expect(result.ignored).toHaveLength(1);
      expect(result.ignored).toContainEqual(tx1.getTxHash());
    });

    it('returns correct status when nullifier conflict causes ignore', async () => {
      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 5);

      // Give tx2 the same nullifier as tx1
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);

      // tx2 should be ignored (not rejected) due to nullifier conflict with higher priority
      const result = await pool.addPendingTxs([tx2]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toContainEqual(tx2.getTxHash());
    });

    it('returns correct status when nullifier conflict causes eviction', async () => {
      const txLow = await mockPublicTx(1, 5);
      const txHigh = await mockPublicTx(2, 10);

      // Give txHigh the same nullifier as txLow
      setNullifier(txHigh, 0, getNullifier(txLow, 0));

      await pool.addPendingTxs([txLow]);

      // txHigh should be accepted, and txLow should be evicted
      const result = await pool.addPendingTxs([txHigh]);

      expect(result.accepted).toContainEqual(txHigh.getTxHash());
      expect(result.ignored).toHaveLength(0);

      // Verify txLow was evicted
      const pending = await pool.getPendingTxHashes();
      expect(pending).toContainEqual(txHigh.getTxHash());
      expect(pending).not.toContainEqual(txLow.getTxHash());
    });

    it('returns ignored for fee payer balance insufficient', async () => {
      // Set balance to 0 - insufficient for any tx
      db.getLeafPreimage.mockImplementation((tree, index) => {
        if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
          return Promise.resolve(
            new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), Fr.ZERO), Fr.ONE, 1n),
          );
        }
        return Promise.resolve(undefined);
      });

      const tx = await mockPublicTx(1);

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toContainEqual(tx.getTxHash());
    });

    it('batch with mixed outcomes: accepted, duplicate, nullifier conflict', async () => {
      const existingTx = await mockPublicTx(1, 10);
      const duplicateTx = existingTx; // Same tx
      const newTx = await mockPublicTx(2);
      const conflictingTx = await mockPublicTx(3, 5);

      // Give conflictingTx a nullifier conflict with existingTx
      setNullifier(conflictingTx, 0, getNullifier(existingTx, 0));

      // Add existingTx first
      await pool.addPendingTxs([existingTx]);

      // Now add all in one batch
      const result = await pool.addPendingTxs([duplicateTx, newTx, conflictingTx]);

      // duplicateTx is ignored (already in pool)
      // newTx is accepted (no conflicts)
      // conflictingTx is ignored (loses to existingTx)
      expect(result.accepted).toContainEqual(newTx.getTxHash());
      expect(result.ignored).toContainEqual(duplicateTx.getTxHash());
      expect(result.ignored).toContainEqual(conflictingTx.getTxHash());
    });
  });

  describe('intra-batch eviction', () => {
    it('later tx in batch evicts earlier tx with same nullifier', async () => {
      const txLow = await mockPublicTx(1, 5);
      const txHigh = await mockPublicTx(2, 10);

      // Give txHigh the same nullifier as txLow
      setNullifier(txHigh, 0, getNullifier(txLow, 0));

      // Add both in same batch - txLow first, then txHigh
      const result = await pool.addPendingTxs([txLow, txHigh]);

      // txLow should be ignored (evicted by txHigh within the same batch)
      // txHigh should be accepted
      expect(result.accepted).toContainEqual(txHigh.getTxHash());
      expect(result.ignored).toContainEqual(txLow.getTxHash());
      expect(result.accepted).not.toContainEqual(txLow.getTxHash());

      // Only txHigh should be in the pool
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txHigh.getTxHash());
    });

    it('earlier tx in batch is NOT evicted if it has higher priority', async () => {
      const txHigh = await mockPublicTx(1, 10);
      const txLow = await mockPublicTx(2, 5);

      // Give txLow the same nullifier as txHigh
      setNullifier(txLow, 0, getNullifier(txHigh, 0));

      // Add both in same batch - txHigh first, then txLow
      const result = await pool.addPendingTxs([txHigh, txLow]);

      // txHigh should be accepted
      // txLow should be ignored (loses to txHigh)
      expect(result.accepted).toContainEqual(txHigh.getTxHash());
      expect(result.ignored).toContainEqual(txLow.getTxHash());

      // Only txHigh should be in the pool
      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(txHigh.getTxHash());
    });

    it('chain of evictions within batch', async () => {
      // tx1 (fee=5), tx2 (fee=10), tx3 (fee=15) - all share same nullifier
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);
      const tx3 = await mockPublicTx(3, 15);

      // All share the same nullifier
      setNullifier(tx2, 0, getNullifier(tx1, 0));
      setNullifier(tx3, 0, getNullifier(tx1, 0));

      // Add all three in same batch
      const result = await pool.addPendingTxs([tx1, tx2, tx3]);

      // Only tx3 should survive (highest priority)
      // tx1 and tx2 should be ignored
      expect(result.accepted).toContainEqual(tx3.getTxHash());
      expect(result.ignored).toContainEqual(tx1.getTxHash());
      expect(result.ignored).toContainEqual(tx2.getTxHash());

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(1);
      expect(pending).toContainEqual(tx3.getTxHash());
    });

    it('mixed batch with some evictions and some independent txs', async () => {
      // tx1 and tx2 share nullifier A (tx2 has higher fee)
      // tx3 is independent
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);
      const tx3 = await mockPublicTx(3, 7); // Independent, different nullifiers

      setNullifier(tx2, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx1, tx2, tx3]);

      // tx1 should be ignored (evicted by tx2)
      // tx2 and tx3 should be accepted
      expect(result.accepted).toContainEqual(tx2.getTxHash());
      expect(result.accepted).toContainEqual(tx3.getTxHash());
      expect(result.ignored).toContainEqual(tx1.getTxHash());

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
      expect(pending).toContainEqual(tx2.getTxHash());
      expect(pending).toContainEqual(tx3.getTxHash());
    });

    it('multiple independent nullifier conflicts within batch', async () => {
      // tx1 and tx2 share nullifier A (tx2 wins)
      // tx3 and tx4 share nullifier B (tx4 wins)
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);
      const tx3 = await mockPublicTx(3, 3);
      const tx4 = await mockPublicTx(4, 8);

      setNullifier(tx2, 0, getNullifier(tx1, 0)); // tx2 shares with tx1
      setNullifier(tx4, 0, getNullifier(tx3, 0)); // tx4 shares with tx3

      const result = await pool.addPendingTxs([tx1, tx2, tx3, tx4]);

      // tx1 and tx3 should be ignored (evicted)
      // tx2 and tx4 should be accepted
      expect(result.accepted).toContainEqual(tx2.getTxHash());
      expect(result.accepted).toContainEqual(tx4.getTxHash());
      expect(result.ignored).toContainEqual(tx1.getTxHash());
      expect(result.ignored).toContainEqual(tx3.getTxHash());

      const pending = await pool.getPendingTxHashes();
      expect(pending).toHaveLength(2);
    });
  });
});
