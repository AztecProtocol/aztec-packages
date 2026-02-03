import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

// Tx type alias for cleaner type annotations
type MockTx = Awaited<ReturnType<typeof mockTx>>;

/** A validator that accepts all transactions. Used in tests that don't need validation. */
const alwaysValidValidator: TxValidator<Tx> = {
  validateTx: () => Promise.resolve({ result: 'valid' }),
};

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
      pendingTxValidator: alwaysValidValidator,
    });
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
  });

  const mockTxWithFee = (seed: number, fee: number) => mockTx(seed, { maxPriorityFeesPerGas: new GasFees(fee, fee) });

  // Helper functions for string-based TxHash comparisons
  const toStrings = (hashes: TxHash[]) => hashes.map(h => h.toString());
  const hashOf = (tx: Tx) => tx.getTxHash().toString();

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
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('ignores duplicate transactions', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('challenges transactions with conflicting nullifiers - higher fee wins', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);

      // Set tx2 to have the same nullifier as tx1
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);
      const result = await pool.addPendingTxs([tx2]);

      expect(toStrings(result.accepted)).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx2));
      expect(pending).not.toContain(hashOf(tx1));
    });

    it('challenges transactions with conflicting nullifiers - existing wins on tie', async () => {
      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 10);

      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);
      const result = await pool.addPendingTxs([tx2]);

      // tx2 is valid but ignored due to nullifier conflict with equal-priority tx1
      expect(toStrings(result.ignored)).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx1));
      expect(pending).not.toContain(hashOf(tx2));
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
      await pool.updateConfig({ maxPendingTxCount: 3 });

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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx5));
      expect(pending).toContain(hashOf(tx4));
      expect(pending).toContain(hashOf(tx3));
      expect(pending).not.toContain(hashOf(tx1));
      expect(pending).not.toContain(hashOf(tx2));
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
      expect(addResult.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('returns ignored for duplicate transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      const canAddResult = await pool.canAddPendingTx(tx);
      expect(canAddResult).toBe('ignored');
    });
  });

  describe('duplicate handling across states', () => {
    it('addPendingTxs ignores tx that is already pending', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('addPendingTxs ignores tx that is already protected', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      // Status should remain protected
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    it('addPendingTxs ignores tx that is already mined', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      // Status should remain mined
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });

    it('canAddPendingTx returns ignored for tx that is already pending', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      const result = await pool.canAddPendingTx(tx);

      expect(result).toBe('ignored');
    });

    it('canAddPendingTx returns ignored for tx that is already protected', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      const result = await pool.canAddPendingTx(tx);

      expect(result).toBe('ignored');
    });

    it('canAddPendingTx returns ignored for tx that is already mined', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      const result = await pool.canAddPendingTx(tx);

      expect(result).toBe('ignored');
    });

    it('addPendingTxs handles duplicate tx in same batch', async () => {
      const tx = await mockTx(1);

      // Add same tx twice in one batch
      const result = await pool.addPendingTxs([tx, tx]);

      // First occurrence accepted, second ignored
      expect(result.accepted).toHaveLength(1);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('addProtectedTxs handles duplicate tx in same batch', async () => {
      const tx = await mockTx(1);

      // Add same tx twice in one batch
      await pool.addProtectedTxs([tx, tx], slot1Header);

      // Should only have one tx in pool
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      // Verify we can retrieve the tx
      const retrieved = await pool.getTxByHash(tx.getTxHash());
      expect(retrieved).toBeDefined();
    });

    it('addMinedTxs handles duplicate tx in same batch', async () => {
      const tx = await mockTx(1);

      // Add same tx twice in one batch
      await pool.addMinedTxs([tx, tx], slot1Header);

      // Should only have one tx in pool
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getMinedTxCount()).toBe(1);
    });

    it('addPendingTxs handles multiple duplicates in batch with other txs', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      // Batch: tx1, tx2, tx1, tx2, tx1
      const result = await pool.addPendingTxs([tx1, tx2, tx1, tx2, tx1]);

      // First occurrence of each accepted, rest ignored
      expect(result.accepted).toHaveLength(2);
      expect(result.ignored).toHaveLength(3);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
    });
  });

  describe('validator rejection', () => {
    let rejectingPool: AztecKVTxPoolV2;
    let rejectingValidator: TxValidator<Tx>;
    let txsToReject: Set<string>;

    beforeEach(async () => {
      // Create a validator that rejects specific transactions
      txsToReject = new Set<string>();
      rejectingValidator = {
        validateTx: (tx: Tx) => {
          const txHash = tx.getTxHash().toString();
          if (txsToReject.has(txHash)) {
            return Promise.resolve({ result: 'invalid', reason: ['test rejection'] });
          }
          return Promise.resolve({ result: 'valid' });
        },
      };

      rejectingPool = new AztecKVTxPoolV2(await openTmpStore('p2p'), await openTmpStore('archive'), {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: rejectingValidator,
      });
      await rejectingPool.start();
    });

    afterEach(async () => {
      await rejectingPool.stop();
    });

    it('addPendingTxs returns rejected for transaction that fails validation', async () => {
      const tx = await mockTx(1);
      txsToReject.add(tx.getTxHash().toString());

      const result = await rejectingPool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
      expect(await rejectingPool.getPendingTxCount()).toBe(0);
    });

    it('canAddPendingTx returns rejected for transaction that fails validation', async () => {
      const tx = await mockTx(1);
      txsToReject.add(tx.getTxHash().toString());

      const result = await rejectingPool.canAddPendingTx(tx);

      expect(result).toBe('rejected');
      expect(await rejectingPool.getPendingTxCount()).toBe(0); // State unchanged
    });

    it('addPendingTxs handles batch with mixed accepted and rejected', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      const tx3 = await mockTx(3);
      // Reject tx2 only
      txsToReject.add(tx2.getTxHash().toString());

      const result = await rejectingPool.addPendingTxs([tx1, tx2, tx3]);

      expect(toStrings(result.accepted)).toContain(hashOf(tx1));
      expect(toStrings(result.accepted)).toContain(hashOf(tx3));
      expect(result.ignored).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx2));
      expect(await rejectingPool.getPendingTxCount()).toBe(2);
    });

    it('addPendingTxs handles batch with accepted, ignored, and rejected', async () => {
      // First add a tx
      const existingTx = await mockTx(1);
      await rejectingPool.addPendingTxs([existingTx]);

      const newTx = await mockTx(2);
      const duplicateTx = existingTx; // Same tx, should be ignored
      const rejectedTx = await mockTx(3);
      txsToReject.add(rejectedTx.getTxHash().toString());

      const result = await rejectingPool.addPendingTxs([newTx, duplicateTx, rejectedTx]);

      expect(toStrings(result.accepted)).toContain(hashOf(newTx));
      expect(toStrings(result.ignored)).toContain(hashOf(duplicateTx));
      expect(toStrings(result.rejected)).toContain(hashOf(rejectedTx));
      expect(await rejectingPool.getPendingTxCount()).toBe(2); // existingTx + newTx
    });

    it('rejected tx does not affect existing pool state', async () => {
      // First add a valid tx
      const tx1 = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await rejectingPool.addPendingTxs([tx1]);
      expect(await rejectingPool.getPendingTxCount()).toBe(1);

      // Try to add a rejected tx with same nullifier (validation happens before nullifier check)
      const tx2 = await mockTx(2, { numberOfNonRevertiblePublicCallRequests: 1 });
      setNullifier(tx2, 0, getNullifier(tx1, 0)); // Same nullifier
      txsToReject.add(tx2.getTxHash().toString());

      const result = await rejectingPool.addPendingTxs([tx2]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx2));
      // Original tx should still be there
      expect(await rejectingPool.getTxStatus(tx1.getTxHash())).toBe('pending');
    });

    it('validation happens before pre-add rules', async () => {
      // Even if a tx would be ignored by pre-add rules (e.g., nullifier conflict),
      // it should be rejected first if it fails validation
      const tx1 = await mockTx(1, {
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      await rejectingPool.addPendingTxs([tx1]);

      // tx2 has same nullifier but lower priority - would be ignored if valid
      // but should be rejected since it fails validation
      const tx2 = await mockTx(2, {
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      setNullifier(tx2, 0, getNullifier(tx1, 0));
      txsToReject.add(tx2.getTxHash().toString());

      const result = await rejectingPool.addPendingTxs([tx2]);

      // Should be rejected, not ignored (validation first)
      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx2));
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

  describe('addMinedTxs', () => {
    it('adds new transactions as mined', async () => {
      const tx = await mockTx(1);

      await pool.addMinedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('updates existing pending transactions to mined', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);

      await pool.addMinedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('updates existing protected transactions to mined', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.addMinedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });

    it('is idempotent for already mined transactions', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Adding same tx as mined again should be a no-op
      await pool.addMinedTxs([tx], slot2Header);

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

      expect(toStrings(missing)).toContain(hashOf(tx2));
      expect(missing).toHaveLength(1);
    });

    it('immediately protects transactions received via gossip if pre-recorded', async () => {
      const tx = await mockTx(1);

      // Pre-record protection for a tx we don't have yet
      const missing = await pool.protectTxs([tx.getTxHash()], slot1Header);
      expect(toStrings(missing)).toContain(hashOf(tx));

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
      expect(toStrings(missing1)).toContain(hashOf(tx));

      // Pre-record protection for slot 2 (overwrites slot 1)
      const missing2 = await pool.protectTxs([tx.getTxHash()], slot2Header);
      expect(toStrings(missing2)).toContain(hashOf(tx));

      // Now add the tx - it should be protected for slot 2
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(2) should NOT unprotect since it's for slot 2
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    describe('pre-protected tx behavior via addPendingTxs', () => {
      // Helper to set fee payer balance in the mock
      const setFeePayerBalanceForPreProtect = (balance: bigint) => {
        db.getLeafPreimage.mockImplementation((tree, index) => {
          if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
            return Promise.resolve(
              new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(balance)), Fr.ONE, 1n),
            );
          }
          return Promise.resolve(undefined);
        });
      };

      it('pre-protected tx is accepted and goes directly to protected status', async () => {
        const tx = await mockTx(1);

        // Pre-record protection
        await pool.protectTxs([tx.getTxHash()], slot1Header);

        // Add via gossip
        const result = await pool.addPendingTxs([tx]);

        // Should be accepted, not ignored
        expect(toStrings(result.accepted)).toContain(hashOf(tx));
        expect(result.ignored).toHaveLength(0);
        expect(result.rejected).toHaveLength(0);
        // Should be protected, not pending
        expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      });

      it('pre-protected tx bypasses insufficient balance pre-add rule', async () => {
        const sharedFeePayer = AztecAddress.fromBigInt(999n);
        // Set balance to 0 - normally tx would be ignored
        setFeePayerBalanceForPreProtect(0n);

        const tx = await mockTx(1, {
          feePayer: sharedFeePayer,
          numberOfNonRevertiblePublicCallRequests: 1,
        });

        // Pre-record protection
        await pool.protectTxs([tx.getTxHash()], slot1Header);

        // Add via gossip - should bypass balance check
        const result = await pool.addPendingTxs([tx]);

        expect(toStrings(result.accepted)).toContain(hashOf(tx));

        expect(result.ignored).toHaveLength(0);
        expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      });

      it('pre-protected tx bypasses nullifier conflict pre-add rule', async () => {
        // Add a pending tx first
        const txPending = await mockPublicTx(1, 10); // Higher priority
        await pool.addPendingTxs([txPending]);
        expect(await pool.getPendingTxCount()).toBe(1);

        // Pre-protected tx has same nullifier but lower priority
        // Normally would be ignored due to nullifier conflict
        const txPreProtected = await mockPublicTx(2, 5);
        setNullifier(txPreProtected, 0, getNullifier(txPending, 0));

        // Pre-record protection
        await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

        // Add via gossip - should bypass nullifier conflict check
        const result = await pool.addPendingTxs([txPreProtected]);

        expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));
        expect(result.ignored).toHaveLength(0);
        expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
        // Original tx should still be pending
        expect(await pool.getTxStatus(txPending.getTxHash())).toBe('pending');
      });

      it('pre-protected tx bypasses low priority pre-add rule when pool is full', async () => {
        await pool.updateConfig({ maxPendingTxCount: 2 });

        // Fill pool with high priority txs
        const tx1 = await mockTxWithFee(1, 100);
        const tx2 = await mockTxWithFee(2, 200);
        await pool.addPendingTxs([tx1, tx2]);
        expect(await pool.getPendingTxCount()).toBe(2);

        // Pre-protected tx has lowest priority - normally would be ignored
        const txPreProtected = await mockTxWithFee(3, 1);

        // Pre-record protection
        await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

        // Add via gossip - should bypass low priority check
        const result = await pool.addPendingTxs([txPreProtected]);

        expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));
        expect(result.ignored).toHaveLength(0);
        expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
      });

      it('pre-protected tx does NOT evict other transactions', async () => {
        // Add a pending tx with conflicting nullifier and lower priority
        const txPending = await mockPublicTx(1, 5);
        await pool.addPendingTxs([txPending]);
        expect(await pool.getPendingTxCount()).toBe(1);

        // Pre-protected tx has same nullifier and higher priority
        // Without pre-protection, it would evict txPending
        const txPreProtected = await mockPublicTx(2, 100);
        setNullifier(txPreProtected, 0, getNullifier(txPending, 0));

        // Pre-record protection
        await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

        // Add via gossip - should NOT evict txPending
        const result = await pool.addPendingTxs([txPreProtected]);

        expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));
        expect(result.ignored).toHaveLength(0);
        // Both txs should be in pool
        expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
        expect(await pool.getTxStatus(txPending.getTxHash())).toBe('pending');
      });

      it('pre-protected tx does not trigger post-add eviction rules', async () => {
        const sharedFeePayer = AztecAddress.fromBigInt(999n);
        // Balance covers only one tx
        setFeePayerBalanceForPreProtect(BigInt(2e8));

        // Add a pending tx first
        const txPending = await mockTx(1, {
          feePayer: sharedFeePayer,
          maxPriorityFeesPerGas: new GasFees(5, 5),
          numberOfNonRevertiblePublicCallRequests: 1,
        });
        await pool.addPendingTxs([txPending]);
        expect(await pool.getPendingTxCount()).toBe(1);

        // Pre-protected tx from same fee payer
        // Without pre-protection, adding this would trigger fee payer balance eviction
        const txPreProtected = await mockTx(2, {
          feePayer: sharedFeePayer,
          maxPriorityFeesPerGas: new GasFees(10, 10),
          numberOfNonRevertiblePublicCallRequests: 1,
        });

        // Pre-record protection
        await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

        // Add via gossip - should NOT trigger post-add eviction
        const result = await pool.addPendingTxs([txPreProtected]);

        expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));
        expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
        // txPending should still be in pool (not evicted by post-add rules)
        expect(await pool.getTxStatus(txPending.getTxHash())).toBe('pending');
      });

      describe('batch with pre-protected tx', () => {
        it('pre-protected tx in batch does not interfere with other txs in batch', async () => {
          // txNormal should be processed normally (accepted)
          const txNormal = await mockTx(1);

          // txPreProtected should bypass rules and become protected
          const txPreProtected = await mockTx(2);

          // Pre-record protection for one tx
          await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

          // Add both in same batch
          const result = await pool.addPendingTxs([txNormal, txPreProtected]);

          // Both should be accepted
          expect(toStrings(result.accepted)).toContain(hashOf(txNormal));
          expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));
          expect(result.ignored).toHaveLength(0);
          expect(result.rejected).toHaveLength(0);

          // Normal tx should be pending, pre-protected should be protected
          expect(await pool.getTxStatus(txNormal.getTxHash())).toBe('pending');
          expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
        });

        it('pre-protected tx with nullifier conflict in batch does not evict batch mate', async () => {
          // Two txs in batch with same nullifier - normally higher priority evicts lower
          const txLowPriority = await mockPublicTx(1, 5);
          const txHighPriority = await mockPublicTx(2, 100);
          setNullifier(txHighPriority, 0, getNullifier(txLowPriority, 0));

          // Pre-protect the high priority tx - it should NOT evict the low priority tx
          await pool.protectTxs([txHighPriority.getTxHash()], slot1Header);

          // Add both in same batch
          const result = await pool.addPendingTxs([txLowPriority, txHighPriority]);

          // Both should be accepted
          expect(toStrings(result.accepted)).toContain(hashOf(txLowPriority));
          expect(toStrings(result.accepted)).toContain(hashOf(txHighPriority));
          expect(result.ignored).toHaveLength(0);

          // Both should be in pool
          expect(await pool.getTxStatus(txLowPriority.getTxHash())).toBe('pending');
          expect(await pool.getTxStatus(txHighPriority.getTxHash())).toBe('protected');
        });

        it('normal tx in batch still evicts other normal txs despite pre-protected tx present', async () => {
          // txExisting is in pool
          const txExisting = await mockPublicTx(1, 5);
          await pool.addPendingTxs([txExisting]);
          expect(await pool.getPendingTxCount()).toBe(1);

          // txNormal has higher priority and conflicts with txExisting - should evict it
          const txNormal = await mockPublicTx(2, 100);
          setNullifier(txNormal, 0, getNullifier(txExisting, 0));

          // txPreProtected is unrelated
          const txPreProtected = await mockTx(3);
          await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

          // Add both in same batch
          const result = await pool.addPendingTxs([txNormal, txPreProtected]);

          // Both new txs accepted
          expect(toStrings(result.accepted)).toContain(hashOf(txNormal));
          expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));

          // txExisting was evicted by txNormal (normal eviction still works)
          expect(await pool.getTxStatus(txExisting.getTxHash())).toBeUndefined();
          expect(await pool.getTxStatus(txNormal.getTxHash())).toBe('pending');
          expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
        });

        it('pre-protected tx in batch does not count towards pool size limit for others', async () => {
          await pool.updateConfig({ maxPendingTxCount: 2 });

          // Fill pool
          const tx1 = await mockTxWithFee(1, 100);
          const tx2 = await mockTxWithFee(2, 200);
          await pool.addPendingTxs([tx1, tx2]);
          expect(await pool.getPendingTxCount()).toBe(2);

          // txNormal has high priority - should evict lowest priority in pool
          const txNormal = await mockTxWithFee(3, 150);

          // txPreProtected has low priority - should bypass limit
          const txPreProtected = await mockTxWithFee(4, 1);
          await pool.protectTxs([txPreProtected.getTxHash()], slot1Header);

          // Add both in same batch
          const result = await pool.addPendingTxs([txNormal, txPreProtected]);

          // Both should be accepted
          expect(toStrings(result.accepted)).toContain(hashOf(txNormal));
          expect(toStrings(result.accepted)).toContain(hashOf(txPreProtected));

          // Pool should have: tx2 (200), txNormal (150), txPreProtected (1 - protected)
          // tx1 (100) was evicted to make room for txNormal
          expect(await pool.getTxStatus(tx1.getTxHash())).toBeUndefined();
          expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
          expect(await pool.getTxStatus(txNormal.getTxHash())).toBe('pending');
          expect(await pool.getTxStatus(txPreProtected.getTxHash())).toBe('protected');
        });
      });

      describe('ignored tx succeeds after pre-protection', () => {
        it('tx ignored due to nullifier conflict succeeds after pre-protection', async () => {
          // Add a high priority tx
          const txExisting = await mockPublicTx(1, 100);
          await pool.addPendingTxs([txExisting]);

          // Try to add conflicting lower priority tx - should be ignored
          const txConflicting = await mockPublicTx(2, 5);
          setNullifier(txConflicting, 0, getNullifier(txExisting, 0));

          const result1 = await pool.addPendingTxs([txConflicting]);
          expect(toStrings(result1.ignored)).toContain(hashOf(txConflicting));
          expect(await pool.getTxStatus(txConflicting.getTxHash())).toBeUndefined();

          // Now pre-protect and try again - should succeed
          await pool.protectTxs([txConflicting.getTxHash()], slot1Header);
          const result2 = await pool.addPendingTxs([txConflicting]);

          expect(toStrings(result2.accepted)).toContain(hashOf(txConflicting));
          expect(result2.ignored).toHaveLength(0);
          expect(await pool.getTxStatus(txConflicting.getTxHash())).toBe('protected');
          // Original tx still in pool
          expect(await pool.getTxStatus(txExisting.getTxHash())).toBe('pending');
        });

        it('tx ignored due to insufficient balance succeeds after pre-protection', async () => {
          const sharedFeePayer = AztecAddress.fromBigInt(999n);
          // Set balance to 0
          setFeePayerBalanceForPreProtect(0n);

          const tx = await mockTx(1, {
            feePayer: sharedFeePayer,
            numberOfNonRevertiblePublicCallRequests: 1,
          });

          // Try to add - should be ignored due to insufficient balance
          const result1 = await pool.addPendingTxs([tx]);
          expect(toStrings(result1.ignored)).toContain(hashOf(tx));
          expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();

          // Now pre-protect and try again - should succeed
          await pool.protectTxs([tx.getTxHash()], slot1Header);
          const result2 = await pool.addPendingTxs([tx]);

          expect(toStrings(result2.accepted)).toContain(hashOf(tx));
          expect(result2.ignored).toHaveLength(0);
          expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
        });

        it('tx ignored due to pool full succeeds after pre-protection', async () => {
          await pool.updateConfig({ maxPendingTxCount: 2 });

          // Fill pool with high priority txs
          const tx1 = await mockTxWithFee(1, 100);
          const tx2 = await mockTxWithFee(2, 200);
          await pool.addPendingTxs([tx1, tx2]);
          expect(await pool.getPendingTxCount()).toBe(2);

          // Try to add lowest priority tx - should be ignored
          const txLow = await mockTxWithFee(3, 1);
          const result1 = await pool.addPendingTxs([txLow]);
          expect(toStrings(result1.ignored)).toContain(hashOf(txLow));
          expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined();

          // Now pre-protect and try again - should succeed
          await pool.protectTxs([txLow.getTxHash()], slot1Header);
          const result2 = await pool.addPendingTxs([txLow]);

          expect(toStrings(result2.accepted)).toContain(hashOf(txLow));
          expect(result2.ignored).toHaveLength(0);
          expect(await pool.getTxStatus(txLow.getTxHash())).toBe('protected');
          // Original txs still in pool
          expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
          expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
        });
      });
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
      const txLow = await mockPublicTx(1, 5);
      const txHigh = await mockPublicTx(2, 10);
      setNullifier(txHigh, 0, getNullifier(txLow, 0));

      // Add low priority tx as pending
      await pool.addPendingTxs([txLow]);
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('pending');

      // Add high priority tx as protected (bypasses nullifier conflict check)
      await pool.addProtectedTxs([txHigh], slot1Header);
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('protected');

      // Unprotect - nullifier conflict resolution should delete the lower priority pending tx
      await pool.prepareForSlot(SlotNumber(2));

      // High priority tx should now be pending, low priority tx should be deleted
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined();
      expect(await pool.getPendingTxCount()).toBe(1);
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
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txProtected));
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
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txPending));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(tx2)); // tx2 has fee=15, highest
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txProtected));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending).toContain(hashOf(txPendingHigh));
      expect(pending).toContain(hashOf(txPendingLow));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txMined));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txPending));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(tx2)); // tx2 has fee=15, highest
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txMined));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending).toContain(hashOf(txPendingHigh));
      expect(pending).toContain(hashOf(txPendingLow));
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
      mockValidator.validateTx.mockImplementation((tx: Tx) => {
        if (tx.getTxHash().equals(txInvalid.getTxHash())) {
          return Promise.resolve({ result: 'invalid', reason: ['invalid proof'] });
        }
        return Promise.resolve({ result: 'valid' });
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
      mockValidator.validateTx.mockImplementation((tx: Tx) => {
        if (tx.getTxHash().equals(txInvalid.getTxHash())) {
          return Promise.resolve({ result: 'invalid', reason: ['nullifier exists'] });
        }
        return Promise.resolve({ result: 'valid' });
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
      mockValidator.validateTx.mockImplementation((tx: Tx) => {
        if (tx.getTxHash().equals(txProtected.getTxHash())) {
          return Promise.resolve({ result: 'invalid', reason: ['invalid'] });
        }
        return Promise.resolve({ result: 'valid' });
      });

      // Unprotect - protected tx should be deleted (validation fails before conflict check)
      // So pending tx should remain even though it has lower priority
      await poolWithValidator.prepareForSlot(SlotNumber(2));

      const pending = toStrings(await poolWithValidator.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txPending));
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
      expect(archived!.getTxHash().toString()).toEqual(hashOf(tx));
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

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending[0].toString()).toEqual(hashOf(tx2));
      expect(pending[1].toString()).toEqual(hashOf(tx3));
      expect(pending[2].toString()).toEqual(hashOf(tx1));
    });

    it('getPendingTxHashes uses tx hash as tiebreaker when fees are equal', async () => {
      // Create transactions with the same priority fee
      const tx1 = await mockTxWithFee(1, 5);
      const tx2 = await mockTxWithFee(2, 5);
      const tx3 = await mockTxWithFee(3, 5);

      // Add in random order
      await pool.addPendingTxs([tx2, tx1, tx3]);

      const pending = toStrings(await pool.getPendingTxHashes());
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

      const pending = toStrings(await pool.getPendingTxHashes());
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

    it('getLowestPriorityPending returns lowest priority txs', async () => {
      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 2);
      const tx3 = await mockTxWithFee(3, 3);

      await pool.addPendingTxs([tx1, tx2, tx3]);

      const lowest = await pool.getLowestPriorityPending(2);
      expect(lowest).toHaveLength(2);
      expect(toStrings(lowest)).toContain(hashOf(tx1));
      expect(toStrings(lowest)).toContain(hashOf(tx2));
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
      expect(toStrings(result.accepted)).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);
    });

    it('removes nullifier entries when tx is mined', async () => {
      const tx1 = await mockPublicTx(1, 5);
      await pool.addPendingTxs([tx1]);
      await pool.handleMinedBlock([tx1.getTxHash()], slot1Header);

      // Add a new tx with the same nullifier - should succeed
      const tx2 = await mockPublicTx(2, 1);
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx2]);
      expect(toStrings(result.accepted)).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);
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
      expect(toStrings(result.ignored)).toContain(hashOf(tx2)); // tx2 has lower fee
      expect(result.rejected).toHaveLength(0);
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
      expect(toStrings(result.ignored)).toContain(hashOf(tx));
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
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

      expect(toStrings(result.accepted)).toContain(hashOf(tx));
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('high priority tx evicts lower priority tx from same fee payer', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Fee limit per tx is ~186M (DEFAULT_L2_GAS_LIMIT * 10 + DEFAULT_DA_GAS_LIMIT * 10)
      // Set balance to cover only one tx
      setFeePayerBalance(BigInt(2e8));

      // Add low priority tx first
      const txLow = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      await pool.addPendingTxs([txLow]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Add high priority tx from same fee payer - should evict low priority
      const txHigh = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const result = await pool.addPendingTxs([txHigh]);

      expect(toStrings(result.accepted)).toContain(hashOf(txHigh));
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
      expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined(); // evicted
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
    });

    it('low priority tx ignored when fee payer balance exhausted by existing tx', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Balance covers only one tx
      setFeePayerBalance(BigInt(2e8));

      // Add high priority tx first
      const txHigh = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      await pool.addPendingTxs([txHigh]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Try to add low priority tx - should be ignored (balance exhausted)
      const txLow = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const result = await pool.addPendingTxs([txLow]);

      expect(toStrings(result.ignored)).toContain(hashOf(txLow));
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
    });

    it('batch from same fee payer - only top N by priority accepted', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Balance covers exactly 2 tx fee limits (~372M for 2 txs)
      setFeePayerBalance(BigInt(4e8));

      // Add 3 txs in one batch, all from same fee payer
      const tx1 = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5), // lowest
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const tx2 = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(15, 15), // highest
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const tx3 = await mockTx(3, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10), // middle
        numberOfNonRevertiblePublicCallRequests: 1,
      });

      const result = await pool.addPendingTxs([tx1, tx2, tx3]);

      // tx2 (highest) and tx3 (middle) should be accepted, tx1 (lowest) ignored
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(tx2));
      expect(accepted).toContain(hashOf(tx3));
      expect(ignored).toContain(hashOf(tx1));
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
    });
  });

  describe('fee payer balance eviction rule (post-event)', () => {
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

    it('evicts low-priority txs after BLOCK_MINED when balance is insufficient', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Initial balance covers all 3 txs
      setFeePayerBalance(BigInt(6e8));

      // Add three txs from same fee payer
      const txLow = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const txMed = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const txHigh = await mockTx(3, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(15, 15),
        numberOfNonRevertiblePublicCallRequests: 1,
      });

      await pool.addPendingTxs([txLow, txMed, txHigh]);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Simulate block mined that reduced fee payer's balance
      // After mining txHigh, balance only covers one more tx
      setFeePayerBalance(BigInt(2e8));

      // Mine the highest priority tx - this triggers balance check for sharedFeePayer
      // The fee payer balance rule will check remaining pending txs from this fee payer
      await pool.handleMinedBlock([txHigh.getTxHash()], slot1Header);

      // txHigh is now mined
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('mined');
      // txMed (higher priority) should remain pending
      expect(await pool.getTxStatus(txMed.getTxHash())).toBe('pending');
      // txLow (lower priority) should be evicted due to insufficient balance
      expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined();
    });

    it('evicts low-priority txs after CHAIN_PRUNED when balance is insufficient', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Initial balance covers both txs
      setFeePayerBalance(BigInt(4e8));

      db.findLeafIndices.mockResolvedValue([1n]); // Anchor blocks valid

      // Add two txs from same fee payer
      const txLow = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const txHigh = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });

      await pool.addPendingTxs([txLow, txHigh]);
      await pool.handleMinedBlock([txLow.getTxHash(), txHigh.getTxHash()], slot1Header);
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('mined');
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('mined');

      // Simulate reorg - balance reduced (e.g., another tx was restored)
      setFeePayerBalance(BigInt(2e8)); // Only enough for one tx

      await pool.handlePrunedBlocks(block0Id);

      // Low priority tx should be evicted, high priority should be pending
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined();
    });

    it('priority ordering is correct - highest priority funded first', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Balance covers only 2 out of 3 txs
      setFeePayerBalance(BigInt(4e8));

      db.findLeafIndices.mockResolvedValue([1n]); // Anchor blocks valid

      // Create 3 txs with distinct priorities
      const txPriority1 = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(1, 1), // Lowest
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const txPriority5 = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5), // Middle
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const txPriority10 = await mockTx(3, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10), // Highest
        numberOfNonRevertiblePublicCallRequests: 1,
      });

      // Add and mine all
      await pool.addPendingTxs([txPriority1, txPriority5, txPriority10]);
      await pool.handleMinedBlock(
        [txPriority1.getTxHash(), txPriority5.getTxHash(), txPriority10.getTxHash()],
        slot1Header,
      );

      // Reorg - triggers balance eviction
      await pool.handlePrunedBlocks(block0Id);

      // Highest (priority 10) and middle (priority 5) should remain
      // Lowest (priority 1) should be evicted
      expect(await pool.getTxStatus(txPriority10.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txPriority5.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txPriority1.getTxHash())).toBeUndefined();
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('does not evict when balance is sufficient', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Balance covers all txs
      setFeePayerBalance(BigInt(1e18));

      db.findLeafIndices.mockResolvedValue([1n]); // Anchor blocks valid

      const txLow = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const txHigh = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });

      await pool.addPendingTxs([txLow, txHigh]);
      await pool.handleMinedBlock([txLow.getTxHash(), txHigh.getTxHash()], slot1Header);

      await pool.handlePrunedBlocks(block0Id);

      // Both should be pending - balance is sufficient
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(2);
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
      const txValid = await mockTx(1);
      const txInvalid = await mockTx(2);

      // Give txInvalid a different anchor block header
      txInvalid.data.constants.anchorBlockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(999),
        }),
      });

      await pool.addPendingTxs([txValid, txInvalid]);
      await pool.handleMinedBlock([txValid.getTxHash(), txInvalid.getTxHash()], slot1Header);

      // Get the anchor block hashes
      const validAnchorHash = await txValid.data.constants.anchorBlockHeader.hash();

      // Mock: valid anchor exists, invalid anchor does not
      db.findLeafIndices.mockImplementation((_treeId, leaves) => {
        return Promise.resolve((leaves as Fr[]).map(leaf => (leaf.equals(validAnchorHash) ? 1n : undefined)));
      });

      await pool.handlePrunedBlocks(block0Id);

      // Valid tx should be restored to pending, invalid tx should be deleted
      expect(await pool.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txInvalid.getTxHash())).toBeUndefined();
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

    const slot4Header = BlockHeader.empty({
      globalVariables: GlobalVariables.empty({
        blockNumber: BlockNumber(4),
        slotNumber: SlotNumber(4),
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
      await pool.handleMinedBlock([tx.getTxHash()], slot4Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Second reorg all the way to block 0
      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('evicts pending tx when mined tx has conflicting nullifier', async () => {
      const txPending = await mockPublicTx(1, 5);
      const txToMine = await mockPublicTx(2, 10);

      // Give txToMine the same nullifier as txPending
      setNullifier(txToMine, 0, getNullifier(txPending, 0));

      // Add txPending to the pool
      await pool.addPendingTxs([txPending]);
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('pending');

      // Add txToMine as protected (bypasses nullifier conflict check)
      await pool.addProtectedTxs([txToMine], slot1Header);

      // Mine txToMine - this should evict txPending because its nullifier is now in the mined block
      await pool.handleMinedBlock([txToMine.getTxHash()], slot1Header);

      // txPending should be evicted (nullifier conflict with mined tx)
      expect(await pool.getTxStatus(txPending.getTxHash())).toBeUndefined();
      // txToMine should be mined
      expect(await pool.getTxStatus(txToMine.getTxHash())).toBe('mined');
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
      expect(toStrings(result.ignored)).toContain(hashOf(txLow));
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);

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
      expect(toStrings(result.accepted)).toContain(hashOf(txConflicting));
      expect(result.rejected).toHaveLength(0);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(txConflicting));
      expect(pending).not.toContain(hashOf(tx1));
      expect(pending).not.toContain(hashOf(tx2));
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
      expect(toStrings(result.ignored)).toContain(hashOf(txConflicting));
      expect(result.rejected).toHaveLength(0);

      // Original txs should remain
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx1));
      expect(pending).toContain(hashOf(tx2));
    });
  });

  describe('edge cases', () => {
    it('handles empty pool operations gracefully', async () => {
      expect(await pool.getPendingTxCount()).toBe(0);
      expect(await pool.getPendingTxHashes()).toHaveLength(0);
      expect(await pool.getMinedTxHashes()).toHaveLength(0);
      expect(await pool.getLowestPriorityPending(10)).toHaveLength(0);

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
      expect(result.ignored).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(100);

      // Verify ordering is correct (highest fee first)
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending[0].toString()).toEqual(hashOf(txs[99])); // fee=99
      expect(pending[99].toString()).toEqual(hashOf(txs[0])); // fee=0
    });

    it('handles txs with zero priority fee', async () => {
      const txZeroFee = await mockTxWithFee(1, 0);
      const txLowFee = await mockTxWithFee(2, 1);

      await pool.addPendingTxs([txZeroFee, txLowFee]);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending[0].toString()).toEqual(hashOf(txLowFee));
      expect(pending[1].toString()).toEqual(hashOf(txZeroFee));
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
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending[0].toString()).toEqual(hashOf(tx2)); // fee=20
      expect(pending[1].toString()).toEqual(hashOf(tx1)); // fee=10
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
      expect((await pool.getPendingTxHashes())[0].toString()).toEqual(hashOf(txExisting));
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

      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toHaveLength(2);
      expect(accepted).toContain(hashOf(tx2));
      expect(accepted).toContain(hashOf(tx3));
      expect(ignored).toHaveLength(1);
      expect(ignored).toContain(hashOf(tx1));
      expect(result.rejected).toHaveLength(0);
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
      expect(toStrings(result.ignored)).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);
    });

    it('returns correct status when nullifier conflict causes eviction', async () => {
      const txLow = await mockPublicTx(1, 5);
      const txHigh = await mockPublicTx(2, 10);

      // Give txHigh the same nullifier as txLow
      setNullifier(txHigh, 0, getNullifier(txLow, 0));

      await pool.addPendingTxs([txLow]);

      // txHigh should be accepted, and txLow should be evicted
      const result = await pool.addPendingTxs([txHigh]);

      expect(toStrings(result.accepted)).toContain(hashOf(txHigh));
      expect(result.ignored).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);

      // Verify txLow was evicted
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(txHigh));
      expect(pending).not.toContain(hashOf(txLow));
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
      expect(toStrings(result.ignored)).toContain(hashOf(tx));
      expect(result.rejected).toHaveLength(0);
    });

    it('batch with mixed outcomes: accepted, duplicate, nullifier conflict, insufficient balance', async () => {
      const existingTx = await mockPublicTx(1, 10);
      const duplicateTx = existingTx; // Same tx
      const newTx = await mockPublicTx(2);
      const conflictingTx = await mockPublicTx(3, 5);

      // Create a tx with very high maxFeesPerGas so fee limit exceeds 1e18 balance
      // Fee limit = gasLimits.l2 * maxFees.l2 + gasLimits.da * maxFees.da
      // Default gas limits are ~1e7 each, so with maxFees of 1e12 we get ~1e19 fee limit
      const highFeeTx = await mockTx(4, { numberOfNonRevertiblePublicCallRequests: 1 });
      highFeeTx.data.constants.txContext.gasSettings = GasSettings.default({
        maxFeesPerGas: new GasFees(1e12, 1e12),
      });

      // Give conflictingTx a nullifier conflict with existingTx
      setNullifier(conflictingTx, 0, getNullifier(existingTx, 0));

      // Add existingTx first
      await pool.addPendingTxs([existingTx]);

      // Now add all in one batch
      const result = await pool.addPendingTxs([duplicateTx, newTx, conflictingTx, highFeeTx]);

      // duplicateTx is ignored (already in pool)
      // newTx is accepted (no conflicts)
      // conflictingTx is ignored (loses to existingTx)
      // highFeeTx is ignored (fee limit exceeds balance)
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(newTx));
      expect(ignored).toContain(hashOf(duplicateTx));
      expect(ignored).toContain(hashOf(conflictingTx));
      expect(ignored).toContain(hashOf(highFeeTx));
      expect(result.rejected).toHaveLength(0);
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
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(txHigh));
      expect(ignored).toContain(hashOf(txLow));
      expect(accepted).not.toContain(hashOf(txLow));
      expect(result.rejected).toHaveLength(0);

      // Only txHigh should be in the pool
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txHigh));
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
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(txHigh));
      expect(ignored).toContain(hashOf(txLow));
      expect(result.rejected).toHaveLength(0);

      // Only txHigh should be in the pool
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txHigh));
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
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(tx3));
      expect(ignored).toContain(hashOf(tx1));
      expect(ignored).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(tx3));
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
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(tx2));
      expect(accepted).toContain(hashOf(tx3));
      expect(ignored).toContain(hashOf(tx1));
      expect(result.rejected).toHaveLength(0);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending).toContain(hashOf(tx2));
      expect(pending).toContain(hashOf(tx3));
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
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(tx2));
      expect(accepted).toContain(hashOf(tx4));
      expect(ignored).toContain(hashOf(tx1));
      expect(ignored).toContain(hashOf(tx3));
      expect(result.rejected).toHaveLength(0);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
    });
  });

  describe('rule interactions in addPendingTxs', () => {
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
      throw new Error('Transaction is not for public');
    };

    it('nullifier conflict + pool size limit - conflict resolved first', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      // Fill pool with 2 txs
      const tx1 = await mockTx(1, {
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const tx2 = await mockTx(2, {
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // New tx conflicts with tx1 (lower priority) and has higher priority than both
      const tx3 = await mockTx(3, {
        maxPriorityFeesPerGas: new GasFees(15, 15),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      setNullifier(tx3, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx3]);

      // tx3 should be accepted (evicts tx1 due to nullifier conflict)
      expect(toStrings(result.accepted)).toContain(hashOf(tx3));
      expect(result.ignored).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
      expect(await pool.getTxStatus(tx1.getTxHash())).toBeUndefined(); // evicted
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('pending');
    });

    it('pool full + new tx lower priority than all but conflicts with lowest', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      // Fill pool with 2 txs
      const tx1 = await mockTx(1, {
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const tx2 = await mockTx(2, {
        maxPriorityFeesPerGas: new GasFees(15, 15),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // New tx has lowest priority but conflicts with tx1
      const tx3 = await mockTx(3, {
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      setNullifier(tx3, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx3]);

      // tx3 should be ignored - loses nullifier conflict to tx1
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.ignored)).toContain(hashOf(tx3));
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
    });

    it('fee payer balance + nullifier conflict - higher priority wins both', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Set balance to only cover 1 tx
      db.getLeafPreimage.mockImplementation((tree, index) => {
        if (tree === MerkleTreeId.PUBLIC_DATA_TREE) {
          return Promise.resolve(
            new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(new Fr(index), new Fr(BigInt(2e8))), Fr.ONE, 1n),
          );
        }
        return Promise.resolve(undefined);
      });

      // Add low priority tx
      const txLow = await mockTx(1, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      await pool.addPendingTxs([txLow]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // New tx: same fee payer, same nullifier, higher priority
      const txHigh = await mockTx(2, {
        feePayer: sharedFeePayer,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      setNullifier(txHigh, 0, getNullifier(txLow, 0));

      const result = await pool.addPendingTxs([txHigh]);

      // txHigh wins - evicts txLow due to both nullifier conflict and fee payer balance
      expect(toStrings(result.accepted)).toContain(hashOf(txHigh));
      expect(result.ignored).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
      expect(await pool.getTxStatus(txLow.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
    });

    it('batch with nullifier conflicts across different fee payers', async () => {
      const feePayerA = AztecAddress.fromBigInt(111n);
      const feePayerB = AztecAddress.fromBigInt(222n);

      // tx1 (fee payer A, low priority) and tx2 (fee payer B, high priority) share nullifier
      const tx1 = await mockTx(1, {
        feePayer: feePayerA,
        maxPriorityFeesPerGas: new GasFees(5, 5),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      const tx2 = await mockTx(2, {
        feePayer: feePayerB,
        maxPriorityFeesPerGas: new GasFees(10, 10),
        numberOfNonRevertiblePublicCallRequests: 1,
      });
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      const result = await pool.addPendingTxs([tx1, tx2]);

      // tx2 wins nullifier conflict
      const accepted = toStrings(result.accepted);
      const ignored = toStrings(result.ignored);
      expect(accepted).toContain(hashOf(tx2));
      expect(ignored).toContain(hashOf(tx1));
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
    });
  });

  describe('hydration and rebuild', () => {
    it('resolves nullifier conflicts during hydration - higher priority wins', async () => {
      // First, we need to bypass the normal addPendingTxs conflict resolution
      // by adding txs directly to separate pools, then merging at DB level
      const store = await openTmpStore('p2p-hydration-test');
      const archiveStore = await openTmpStore('archive-hydration-test');

      // Create first pool and add low priority tx
      const pool1 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool1.start();

      const txLowPriority = await mockPublicTx(1, 5);
      await pool1.addPendingTxs([txLowPriority]);
      expect(await pool1.getPendingTxCount()).toBe(1);

      // Now add a conflicting high priority tx - this will evict the low priority one
      const txHighPriority = await mockPublicTx(2, 10);
      setNullifier(txHighPriority, 0, getNullifier(txLowPriority, 0));
      await pool1.addPendingTxs([txHighPriority]);

      // Verify high priority won
      expect(await pool1.getPendingTxCount()).toBe(1);
      const pending = toStrings(await pool1.getPendingTxHashes());
      expect(pending).toContain(hashOf(txHighPriority));
      expect(pending).not.toContain(hashOf(txLowPriority));

      await pool1.stop();

      // Create new pool with same stores - hydration should maintain the state
      const pool2 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool2.start();

      // Verify only high priority tx survived
      expect(await pool2.getPendingTxCount()).toBe(1);
      const pendingAfterHydration = toStrings(await pool2.getPendingTxHashes());
      expect(pendingAfterHydration).toContain(hashOf(txHighPriority));

      await pool2.stop();
    });

    it('enforces pool size limit during hydration', async () => {
      const store = await openTmpStore('p2p-hydration-size-test');
      const archiveStore = await openTmpStore('archive-hydration-size-test');

      // Create pool with large limit and add many txs
      const pool1 = new AztecKVTxPoolV2(
        store,
        archiveStore,
        {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          pendingTxValidator: alwaysValidValidator,
        },
        undefined, // telemetry
        { maxPendingTxCount: 100 },
      );
      await pool1.start();

      // Add 5 txs with different priorities
      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 2);
      const tx3 = await mockTxWithFee(3, 3);
      const tx4 = await mockTxWithFee(4, 4);
      const tx5 = await mockTxWithFee(5, 5);

      await pool1.addPendingTxs([tx1, tx2, tx3, tx4, tx5]);
      expect(await pool1.getPendingTxCount()).toBe(5);

      await pool1.stop();

      // Create new pool with smaller limit
      const pool2 = new AztecKVTxPoolV2(
        store,
        archiveStore,
        {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          pendingTxValidator: alwaysValidValidator,
        },
        undefined, // telemetry
        { maxPendingTxCount: 3 },
      );
      await pool2.start();

      // Only top 3 priority txs should survive
      expect(await pool2.getPendingTxCount()).toBe(3);
      const pending = toStrings(await pool2.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx5)); // fee=5
      expect(pending).toContain(hashOf(tx4)); // fee=4
      expect(pending).toContain(hashOf(tx3)); // fee=3
      expect(pending).not.toContain(hashOf(tx2)); // fee=2 - evicted
      expect(pending).not.toContain(hashOf(tx1)); // fee=1 - evicted

      await pool2.stop();
    });

    it('processes txs through pre-add rules during hydration', async () => {
      const store = await openTmpStore('p2p-hydration-rules-test');
      const archiveStore = await openTmpStore('archive-hydration-rules-test');

      // Create pool and add txs
      const pool1 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool1.start();

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      const tx3 = await mockTxWithFee(3, 15);

      await pool1.addPendingTxs([tx1, tx2, tx3]);
      expect(await pool1.getPendingTxCount()).toBe(3);

      await pool1.stop();

      // Hydrate into new pool
      const pool2 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool2.start();

      // All txs should survive (no conflicts, within limits)
      expect(await pool2.getPendingTxCount()).toBe(3);

      // Verify they're in correct priority order
      const pending = await pool2.getPendingTxHashes();
      expect(pending[0].toString()).toEqual(hashOf(tx2)); // fee=20
      expect(pending[1].toString()).toEqual(hashOf(tx3)); // fee=15
      expect(pending[2].toString()).toEqual(hashOf(tx1)); // fee=10

      await pool2.stop();
    });

    it('mined txs are not subject to pending pool rules during hydration', async () => {
      const store = await openTmpStore('p2p-hydration-mined-test');
      const archiveStore = await openTmpStore('archive-hydration-mined-test');

      // Create pool and add tx, then mark as mined
      const pool1 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool1.start();

      const tx = await mockTxWithFee(1, 10);
      await pool1.addPendingTxs([tx]);
      await pool1.handleMinedBlock([tx.getTxHash()], slot1Header);

      expect(await pool1.getPendingTxCount()).toBe(0);
      expect(await pool1.getMinedTxCount()).toBe(1);

      await pool1.stop();

      // Mock the block source to return mined status
      mockL2BlockSource.getTxEffect.mockImplementation(async (txHash: TxHash) => {
        if (txHash.toString() === tx.getTxHash().toString()) {
          return {
            l2BlockNumber: 1,
            l2BlockHash: Fr.random().toString(),
          } as any;
        }
        return undefined;
      });

      // Hydrate into new pool with small limit
      const pool2 = new AztecKVTxPoolV2(
        store,
        archiveStore,
        {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          pendingTxValidator: alwaysValidValidator,
        },
        undefined, // telemetry
        { maxPendingTxCount: 0 }, // No pending txs allowed
      );
      await pool2.start();

      // Mined tx should still be present (not subject to pending limits)
      expect(await pool2.getPendingTxCount()).toBe(0);
      expect(await pool2.getMinedTxCount()).toBe(1);
      expect(await pool2.getTxByHash(tx.getTxHash())).toBeDefined();

      await pool2.stop();
    });

    it('rejects invalid txs during hydration validation', async () => {
      const store = await openTmpStore('p2p-hydration-validation-test');
      const archiveStore = await openTmpStore('archive-hydration-validation-test');

      // Create pool with always-valid validator and add txs
      const pool1 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool1.start();

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);

      await pool1.addPendingTxs([tx1, tx2]);
      expect(await pool1.getPendingTxCount()).toBe(2);

      await pool1.stop();

      // Create validator that rejects tx1
      const selectiveValidator: TxValidator<Tx> = {
        validateTx: async (tx: Tx) => {
          if (tx.getTxHash().toString() === tx1.getTxHash().toString()) {
            return { result: 'invalid', reason: ['test rejection'] };
          }
          return { result: 'valid' };
        },
      };

      // Hydrate into new pool with selective validator
      const pool2 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: selectiveValidator,
      });
      await pool2.start();

      // Only tx2 should survive (tx1 rejected by validator)
      expect(await pool2.getPendingTxCount()).toBe(1);
      const pending = toStrings(await pool2.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx2));
      expect(pending).not.toContain(hashOf(tx1));

      await pool2.stop();
    });

    it('resolves nullifier conflict between pending and protected txs during hydration', async () => {
      const store = await openTmpStore('p2p-hydration-pending-protected-test');
      const archiveStore = await openTmpStore('archive-hydration-pending-protected-test');

      const pool1 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool1.start();

      // Add low priority tx as pending
      const txPendingLowPriority = await mockPublicTx(1, 5);
      await pool1.addPendingTxs([txPendingLowPriority]);
      expect(await pool1.getPendingTxCount()).toBe(1);

      // Add high priority tx with same nullifier as protected
      const txProtectedHighPriority = await mockPublicTx(2, 10);
      setNullifier(txProtectedHighPriority, 0, getNullifier(txPendingLowPriority, 0));
      await pool1.addProtectedTxs([txProtectedHighPriority], slot1Header);

      // Verify both are in pool (pending + protected don't conflict)
      expect(await pool1.getPendingTxCount()).toBe(1);
      expect(await pool1.getTxStatus(txPendingLowPriority.getTxHash())).toBe('pending');
      expect(await pool1.getTxStatus(txProtectedHighPriority.getTxHash())).toBe('protected');

      await pool1.stop();

      // Hydrate into new pool - protected status is lost, conflict must be resolved
      const pool2 = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        pendingTxValidator: alwaysValidValidator,
      });
      await pool2.start();

      // Only one tx should survive - the higher priority one
      expect(await pool2.getPendingTxCount()).toBe(1);
      const pending = toStrings(await pool2.getPendingTxHashes());
      expect(pending).toContain(hashOf(txProtectedHighPriority));
      expect(pending).not.toContain(hashOf(txPendingLowPriority));

      await pool2.stop();
    });
  });

  describe('late arrival scenarios', () => {
    it('tx arriving via gossip after being mined is marked as mined when pre-protected', async () => {
      const tx = await mockTx(1);
      const txHash = tx.getTxHash();

      // Scenario: Validator proposes a block with a tx we don't have yet
      // 1. protectTxs is called for the tx (pre-records protection, tx not in pool)
      const missing = await pool.protectTxs([txHash], slot1Header);
      expect(missing).toHaveLength(1);
      expect(missing[0].equals(txHash)).toBe(true);

      // 2. Block is mined with this tx
      // Since tx isn't in pool yet, handleMinedBlock has no effect
      await pool.handleMinedBlock([txHash], slot1Header);

      // 3. Mock the block source to return mined status for this tx
      mockL2BlockSource.getTxEffect.mockImplementation(async (hash: TxHash) => {
        if (hash.equals(txHash)) {
          return {
            l2BlockNumber: 1,
            l2BlockHash: (await slot1Header.hash()).toString(),
          } as any;
        }
        return undefined;
      });

      // 4. Tx finally arrives via gossip
      const result = await pool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(1);

      // Expected: tx should be mined (not pending, not just protected)
      // because we received it after the block was already mined
      const status = await pool.getTxStatus(txHash);
      expect(status).toBe('mined');

      // Verify it's in mined list, not pending
      expect(await pool.getPendingTxCount()).toBe(0);
      expect(await pool.getMinedTxCount()).toBe(1);
    });

    it('regular pending tx arriving after being mined is marked as mined and not in pending indices', async () => {
      const txMined = await mockTx(1);
      const txMinedHash = txMined.getTxHash();
      const txNotMined = await mockTx(2);

      // Mock the block source to return mined status ONLY for txMined
      mockL2BlockSource.getTxEffect.mockImplementation(async (hash: TxHash) => {
        if (hash.equals(txMinedHash)) {
          return {
            l2BlockNumber: 1,
            l2BlockHash: (await slot1Header.hash()).toString(),
          } as any;
        }
        return undefined;
      });

      // Add both txs via gossip
      const result = await pool.addPendingTxs([txMined, txNotMined]);
      expect(result.accepted).toHaveLength(2);

      // txMined should be mined (detected as already mined)
      expect(await pool.getTxStatus(txMinedHash)).toBe('mined');

      // txNotMined should be pending (not mined)
      expect(await pool.getTxStatus(txNotMined.getTxHash())).toBe('pending');

      // Verify counts
      expect(await pool.getPendingTxCount()).toBe(1);
      expect(await pool.getMinedTxCount()).toBe(1);

      // Verify getPendingTxHashes contains only the non-mined tx
      const pendingHashes = await pool.getPendingTxHashes();
      expect(pendingHashes).toHaveLength(1);
      expect(toStrings(pendingHashes)).toContain(hashOf(txNotMined));
      expect(toStrings(pendingHashes)).not.toContain(hashOf(txMined));
    });

    it('addProtectedTxs marks new tx as mined if already mined', async () => {
      const tx = await mockTx(1);
      const txHash = tx.getTxHash();

      // Mock the block source to return mined status for this tx
      mockL2BlockSource.getTxEffect.mockImplementation(async (hash: TxHash) => {
        if (hash.equals(txHash)) {
          return {
            l2BlockNumber: 1,
            l2BlockHash: (await slot1Header.hash()).toString(),
          } as any;
        }
        return undefined;
      });

      // Add tx directly as protected
      await pool.addProtectedTxs([tx], slot1Header);

      // Expected: tx should be mined (protection is set, but mined status takes precedence)
      const status = await pool.getTxStatus(txHash);
      expect(status).toBe('mined');

      expect(await pool.getPendingTxCount()).toBe(0);
      expect(await pool.getMinedTxCount()).toBe(1);
    });

    it('addProtectedTxs marks existing pending tx as mined if already mined', async () => {
      const tx = await mockTx(1);
      const txHash = tx.getTxHash();

      // First add as pending (not mined yet)
      await pool.addPendingTxs([tx]);
      expect(await pool.getTxStatus(txHash)).toBe('pending');

      // Now mock the block source to return mined status
      mockL2BlockSource.getTxEffect.mockImplementation(async (hash: TxHash) => {
        if (hash.equals(txHash)) {
          return {
            l2BlockNumber: 1,
            l2BlockHash: (await slot1Header.hash()).toString(),
          } as any;
        }
        return undefined;
      });

      // Call addProtectedTxs - this should detect the tx is mined
      await pool.addProtectedTxs([tx], slot1Header);

      // Expected: tx should be mined
      const status = await pool.getTxStatus(txHash);
      expect(status).toBe('mined');

      expect(await pool.getPendingTxCount()).toBe(0);
      expect(await pool.getMinedTxCount()).toBe(1);
    });

    it('pre-protected tx arriving not yet mined is marked as protected', async () => {
      const tx = await mockTx(1);
      const txHash = tx.getTxHash();

      // Pre-protect the tx
      const missing = await pool.protectTxs([txHash], slot1Header);
      expect(missing).toHaveLength(1);

      // Block source returns undefined (not mined)
      mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

      // Tx arrives via gossip
      const result = await pool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(1);

      // Expected: tx should be protected (not mined, not pending)
      const status = await pool.getTxStatus(txHash);
      expect(status).toBe('protected');

      expect(await pool.getPendingTxCount()).toBe(0);
      expect(await pool.getMinedTxCount()).toBe(0);
    });
  });
});
