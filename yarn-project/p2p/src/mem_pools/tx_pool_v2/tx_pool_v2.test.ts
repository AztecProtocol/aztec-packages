import {
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
  PRIVATE_TX_L2_GAS_OVERHEAD,
  PUBLIC_TX_L2_GAS_OVERHEAD,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncMap } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block, type L2BlockId, type L2BlockSource } from '@aztec/stdlib/block';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, Tx, TxEffect, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { AggregateTxValidator } from '../../msg_validators/tx_validator/aggregate_tx_validator.js';
import { GasLimitsValidator, MaxFeePerGasValidator } from '../../msg_validators/tx_validator/gas_validator.js';
import { AllowedSetupCallsMetaValidator } from '../../msg_validators/tx_validator/phases_validator.js';
import type { TxMetaData } from './tx_metadata.js';
import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

// Tx type alias for cleaner type annotations
type MockTx = Awaited<ReturnType<typeof mockTx>>;

// Default maxFeesPerGas used by mockTx is GasFees(10, 10).
const DEFAULT_MAX_FEES_PER_GAS = new GasFees(10, 10);
const DEFAULT_GAS_LIMITS = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS);
const TEARDOWN_DA_GAS = 98_304;
const DEFAULT_TX_FEE_LIMIT = GasSettings.fallback({
  gasLimits: DEFAULT_GAS_LIMITS,
  maxFeesPerGas: DEFAULT_MAX_FEES_PER_GAS,
})
  .getFeeLimit()
  .toBigInt();

/** A validator that accepts all transactions. Used in tests that don't need validation. */
const alwaysValidValidator: TxValidator<TxMetaData> = {
  validateTx: () => Promise.resolve({ result: 'valid' }),
};

describe('TxPoolV2', () => {
  let pool: AztecKVTxPoolV2;
  let store: Awaited<ReturnType<typeof openTmpStore>>;
  let archiveStore: Awaited<ReturnType<typeof openTmpStore>>;
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

  // Callback tracking
  let addedTxs: Tx[] = [];
  let removedTxHashes: string[] = [];

  const clearCallbackTracking = () => {
    addedTxs = [];
    removedTxHashes = [];
  };

  /** Asserts that exactly these txs were added (in order) and clears added tracking */
  const expectAddedTxs = (...txs: Tx[]) => {
    const addedHashes = addedTxs.map(tx => tx.getTxHash().toString());
    const expectedHashes = txs.map(tx => tx.getTxHash().toString());
    expect(addedHashes).toEqual(expectedHashes);
    addedTxs = [];
  };

  /** Asserts that exactly these txs were removed (order independent) and clears removed tracking */
  const expectRemovedTxs = (...txs: Tx[]) => {
    const expectedHashes = txs.map(tx => tx.getTxHash().toString());
    expect(removedTxHashes.sort()).toEqual(expectedHashes.sort());
    removedTxHashes = [];
  };

  /** Asserts no callbacks were invoked and clears all tracking */
  const expectNoCallbacks = () => {
    expect(addedTxs).toHaveLength(0);
    expect(removedTxHashes).toHaveLength(0);
    clearCallbackTracking();
  };

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

    store = await openTmpStore('p2p');
    archiveStore = await openTmpStore('archive');
    pool = new AztecKVTxPoolV2(store, archiveStore, {
      l2BlockSource: mockL2BlockSource,
      worldStateSynchronizer: mockWorldState,
      createTxValidator: () => Promise.resolve(alwaysValidValidator),
      checkAllowedSetupCalls: () => Promise.resolve(true),
      blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
    });
    await pool.start();

    // Setup callback tracking
    clearCallbackTracking();
    pool.on('txs-added', ({ txs }) => {
      addedTxs.push(...txs);
    });
    pool.on('txs-removed', ({ txHashes }) => {
      removedTxHashes.push(...txHashes.map(h => h.toString()));
    });
  });

  afterEach(async () => {
    await pool.stop();
    await store.delete();
    await archiveStore.delete();
  });

  const mockTxWithFee = (seed: number, fee: number) =>
    mockTx(seed, { maxPriorityFeesPerGas: new GasFees(fee, fee), maxFeesPerGas: new GasFees(fee, fee) });

  // Helper functions for string-based TxHash comparisons
  const toStrings = (hashes: TxHash[]) => hashes.map(h => h.toString());
  const hashOf = (tx: Tx) => tx.getTxHash().toString();

  const mockPublicTx = (seed: number, fee: number = 1) =>
    mockTx(seed, {
      maxPriorityFeesPerGas: new GasFees(fee, fee),
      maxFeesPerGas: new GasFees(fee, fee),
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

  /**
   * Creates an L2Block from transactions and a header.
   * Extracts nullifiers from txs to create matching TxEffects.
   */
  const makeBlock = (txs: Tx[], header: BlockHeader): L2Block => {
    const txEffects = txs.map(tx => {
      const nullifiers = tx.data.getNonEmptyNullifiers();
      return new TxEffect(
        RevertCode.OK,
        tx.getTxHash(),
        Fr.ZERO, // transactionFee
        [], // noteHashes
        nullifiers,
        [], // l2ToL1Msgs
        [], // publicDataWrites
        [], // privateLogs
        [], // publicLogs
        [], // contractClassLogs
      );
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

  /** Creates an empty L2Block with no transactions */
  const makeEmptyBlock = (header: BlockHeader): L2Block => {
    const body = new Body([]);
    const archive = new AppendOnlyTreeSnapshot(Fr.random(), header.globalVariables.blockNumber + 1);
    return new L2Block(
      archive,
      header,
      body,
      CheckpointNumber(Number(header.globalVariables.blockNumber)),
      IndexWithinCheckpoint(0),
    );
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
      expectAddedTxs(tx1, tx2);
    });

    it('ignores duplicate transactions', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(1);
      expectNoCallbacks(); // No callbacks for ignored duplicates
    });

    it('challenges transactions with conflicting nullifiers - higher fee wins', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 10);

      // Set tx2 to have the same nullifier as tx1
      setNullifier(tx2, 0, getNullifier(tx1, 0));

      await pool.addPendingTxs([tx1]);
      expectAddedTxs(tx1);

      const result = await pool.addPendingTxs([tx2]);

      expect(toStrings(result.accepted)).toContain(hashOf(tx2));
      expect(result.rejected).toHaveLength(0);
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toContain(hashOf(tx2));
      expect(pending).not.toContain(hashOf(tx1));
      expectAddedTxs(tx2);
      expectRemovedTxs(tx1); // tx1 was evicted
    });

    it('challenges transactions with conflicting nullifiers - lower priority loses', async () => {
      // Create txs with same fee - the tiebreaker is the tx hash (as field element)
      const tx1 = await mockPublicTx(1, 10);
      const tx2 = await mockPublicTx(2, 10);

      setNullifier(tx2, 0, getNullifier(tx1, 0));

      // Determine which tx has higher priority (same fee, so hash is tiebreaker)
      // Use Fr.cmp for field element comparison (same as compareTxHash in tx_metadata.ts)
      const tx1HashFr = Fr.fromHexString(tx1.getTxHash().toString());
      const tx2HashFr = Fr.fromHexString(tx2.getTxHash().toString());
      const tx2HasHigherPriority = tx2HashFr.cmp(tx1HashFr) > 0;

      await pool.addPendingTxs([tx1]);
      expectAddedTxs(tx1);

      const result = await pool.addPendingTxs([tx2]);

      if (tx2HasHigherPriority) {
        // tx2 has higher priority - it evicts tx1
        expect(toStrings(result.accepted)).toContain(hashOf(tx2));
        expect(result.ignored).toHaveLength(0);
        const pending = toStrings(await pool.getPendingTxHashes());
        expect(pending).toContain(hashOf(tx2));
        expect(pending).not.toContain(hashOf(tx1));
        expectAddedTxs(tx2);
        expectRemovedTxs(tx1);
      } else {
        // tx1 has higher or equal priority - tx2 is ignored
        expect(toStrings(result.ignored)).toContain(hashOf(tx2));
        expect(result.rejected).toHaveLength(0);
        const pending = toStrings(await pool.getPendingTxHashes());
        expect(pending).toContain(hashOf(tx1));
        expect(pending).not.toContain(hashOf(tx2));
        expectNoCallbacks(); // tx2 was ignored, no callbacks
      }
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
      expectAddedTxs(tx1, tx2, tx3);

      // Adding more txs should evict lowest priority
      await pool.addPendingTxs([tx4, tx5]);
      expect(await pool.getPendingTxCount()).toBe(3);
      expectAddedTxs(tx4, tx5);
      expectRemovedTxs(tx1, tx2); // Lowest priority txs evicted

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
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expectNoCallbacks();
    });

    it('addPendingTxs ignores tx that is already protected', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      // Status should remain protected
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expectNoCallbacks();
    });

    it('addPendingTxs ignores tx that is already mined', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      const result = await pool.addPendingTxs([tx]);

      expect(result.accepted).toHaveLength(0);
      expect(result.ignored).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      // Status should remain mined
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expectNoCallbacks();
    });

    it('canAddPendingTx returns ignored for tx that is already pending', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      const result = await pool.canAddPendingTx(tx);

      expect(result).toBe('ignored');
      expectNoCallbacks(); // canAddPendingTx is read-only
    });

    it('canAddPendingTx returns ignored for tx that is already protected', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      const result = await pool.canAddPendingTx(tx);

      expect(result).toBe('ignored');
      expectNoCallbacks(); // canAddPendingTx is read-only
    });

    it('canAddPendingTx returns ignored for tx that is already mined', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      const result = await pool.canAddPendingTx(tx);

      expect(result).toBe('ignored');
      expectNoCallbacks(); // canAddPendingTx is read-only
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
      expectAddedTxs(tx); // Only one callback for the accepted tx
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
      expectAddedTxs(tx); // Only one callback for the first occurrence
    });

    it('addMinedTxs handles duplicate tx in same batch', async () => {
      const tx = await mockTx(1);

      // Add same tx twice in one batch
      await pool.addMinedTxs([tx, tx], slot1Header);

      // Should only have one tx in pool
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getMinedTxCount()).toBe(1);
      expectAddedTxs(tx); // Only one callback for the first occurrence
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
      expectAddedTxs(tx1, tx2); // Only callbacks for the accepted txs
    });
  });

  describe('proof storage', () => {
    it('returns the full tx including its proof by default', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      const retrieved = await pool.getTxByHash(tx.getTxHash());
      expect(retrieved).toBeDefined();
      expect(retrieved!.chonkProof.isEmpty()).toBe(false);
      expect(retrieved!.toBuffer().equals(tx.toBuffer())).toBe(true);
    });

    it('returns the tx without its proof when includeProof is false', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);

      const retrieved = await pool.getTxByHash(tx.getTxHash(), { includeProof: false });
      expect(retrieved).toBeDefined();
      expect(retrieved!.chonkProof.isEmpty()).toBe(true);
      expect(retrieved!.toBuffer().equals(tx.withoutProof().toBuffer())).toBe(true);
    });

    it('threads includeProof through getTxsByHash', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      await pool.addPendingTxs([tx1, tx2]);
      const hashes = [tx1.getTxHash(), tx2.getTxHash()];

      const withProofs = await pool.getTxsByHash(hashes);
      expect(withProofs.map(tx => tx!.chonkProof.isEmpty())).toEqual([false, false]);

      const withoutProofs = await pool.getTxsByHash(hashes, { includeProof: false });
      expect(withoutProofs.map(tx => tx!.chonkProof.isEmpty())).toEqual([true, true]);
    });

    it('stores the proof separately from the tx data and deletes both on hard delete', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      const txHashStr = tx.getTxHash().toString();

      const txsDB: AztecAsyncMap<string, Buffer> = store.openMap('txs');
      const proofsDB: AztecAsyncMap<string, Buffer> = store.openMap('tx_proofs');

      const storedTx = await txsDB.getAsync(txHashStr);
      expect(Tx.fromBuffer(storedTx!).chonkProof.isEmpty()).toBe(true);
      expect(await proofsDB.getAsync(txHashStr)).toBeDefined();

      // Slot-soft-delete the tx, then advance two slots to trigger hard deletion.
      await pool.handleFailedExecution([tx.getTxHash()]);
      await pool.prepareForSlot(SlotNumber(1));
      await pool.prepareForSlot(SlotNumber(2));

      expect(await txsDB.getAsync(txHashStr)).toBeUndefined();
      expect(await proofsDB.getAsync(txHashStr)).toBeUndefined();
    });
  });

  describe('validator rejection', () => {
    let rejectingPool: AztecKVTxPoolV2;
    let rejectingValidator: TxValidator<TxMetaData>;
    let txsToReject: Set<string>;
    let rejectingStore: Awaited<ReturnType<typeof openTmpStore>>;
    let rejectingArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;

    beforeEach(async () => {
      // Create a validator that rejects specific transactions
      txsToReject = new Set<string>();
      rejectingValidator = {
        validateTx: (meta: TxMetaData) => {
          if (txsToReject.has(meta.txHash)) {
            return Promise.resolve({ result: 'invalid', reason: ['test rejection'] });
          }
          return Promise.resolve({ result: 'valid' });
        },
      };

      rejectingStore = await openTmpStore('p2p');
      rejectingArchiveStore = await openTmpStore('archive');
      rejectingPool = new AztecKVTxPoolV2(rejectingStore, rejectingArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(rejectingValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await rejectingPool.start();
    });

    afterEach(async () => {
      await rejectingPool.stop();
      await rejectingStore.delete();
      await rejectingArchiveStore.delete();
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

  describe('gas limits validation', () => {
    let gasPool: AztecKVTxPoolV2;
    let gasStore: Awaited<ReturnType<typeof openTmpStore>>;
    let gasArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;

    beforeEach(async () => {
      gasStore = await openTmpStore('p2p');
      gasArchiveStore = await openTmpStore('archive');
      gasPool = new AztecKVTxPoolV2(gasStore, gasArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(new GasLimitsValidator<TxMetaData>()),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await gasPool.start();
    });

    afterEach(async () => {
      await gasPool.stop();
      await gasStore.delete();
      await gasArchiveStore.delete();
    });

    const makePublicTxWithGas = async (seed: number, gasLimits: Gas) => {
      const tx = await mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 1 });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits,
        maxFeesPerGas: DEFAULT_MAX_FEES_PER_GAS,
      });
      return tx;
    };

    const makePrivateTxWithGas = async (seed: number, gasLimits: Gas) => {
      const tx = await mockTx(seed, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
        hasPublicTeardownCallRequest: false,
      });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits,
        maxFeesPerGas: DEFAULT_MAX_FEES_PER_GAS,
      });
      return tx;
    };

    it('accepts public tx at exactly the minimum gas limits', async () => {
      const tx = await makePublicTxWithGas(1, new Gas(TX_DA_GAS_OVERHEAD, PUBLIC_TX_L2_GAS_OVERHEAD));
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
    });

    it('accepts private tx at exactly the minimum gas limits', async () => {
      const tx = await makePrivateTxWithGas(1, new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD));
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
    });

    it('rejects public tx below the public L2 gas minimum', async () => {
      const tx = await makePublicTxWithGas(1, new Gas(TX_DA_GAS_OVERHEAD, PUBLIC_TX_L2_GAS_OVERHEAD - 1));
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects private tx below the private L2 gas minimum', async () => {
      const tx = await makePrivateTxWithGas(1, new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD - 1));
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects public tx at private L2 gas minimum (between the two thresholds)', async () => {
      const tx = await makePublicTxWithGas(1, new Gas(TX_DA_GAS_OVERHEAD, PRIVATE_TX_L2_GAS_OVERHEAD));
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects tx below DA gas minimum', async () => {
      const tx = await makePublicTxWithGas(1, new Gas(TX_DA_GAS_OVERHEAD - 1, PUBLIC_TX_L2_GAS_OVERHEAD));
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects public tx if L2 gas limit is too high', async () => {
      const tx = await makePublicTxWithGas(1, new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1));
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1),
        maxFeesPerGas: DEFAULT_MAX_FEES_PER_GAS,
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects private tx if L2 gas limit is too high', async () => {
      const tx = await makePrivateTxWithGas(1, new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1));
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS + 1),
        maxFeesPerGas: DEFAULT_MAX_FEES_PER_GAS,
        teardownGasLimits: new Gas(TEARDOWN_DA_GAS, 1),
      });
      const result = await gasPool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });
  });

  describe('addProtectedTxs', () => {
    it('adds new transactions as protected', async () => {
      const tx = await mockTx(1);

      await pool.addProtectedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expect(await pool.getPendingTxCount()).toBe(0); // Not in pending
      expectAddedTxs(tx);
    });

    it('updates existing pending transactions to protected', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);

      await pool.addProtectedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectNoCallbacks(); // No new tx added, just state transition
    });

    it('does not modify mined transactions', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.addProtectedTxs([tx], slot2Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expectNoCallbacks(); // No change
    });
  });

  describe('addMinedTxs', () => {
    it('adds new transactions as mined', async () => {
      const tx = await mockTx(1);

      await pool.addMinedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectAddedTxs(tx);
    });

    it('updates existing pending transactions to mined', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);

      await pool.addMinedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectNoCallbacks(); // No new tx added, just state transition
    });

    it('updates existing protected transactions to mined', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.addMinedTxs([tx], slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expectNoCallbacks(); // No new tx added, just state transition
    });

    it('is idempotent for already mined transactions', async () => {
      const tx = await mockTx(1);
      await pool.addMinedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Adding same tx as mined again should be a no-op
      await pool.addMinedTxs([tx], slot2Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expectNoCallbacks(); // No change
    });
  });

  describe('protectTxs', () => {
    it('protects existing transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      const missing = await pool.protectTxs([tx.getTxHash()], slot1Header);

      expect(missing).toHaveLength(0);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expectNoCallbacks(); // protectTxs is state transition only
    });

    it('returns missing transaction hashes', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      await pool.addPendingTxs([tx1]);
      expectAddedTxs(tx1);

      const missing = await pool.protectTxs([tx1.getTxHash(), tx2.getTxHash()], slot1Header);

      expect(toStrings(missing)).toContain(hashOf(tx2));
      expect(missing).toHaveLength(1);
      expectNoCallbacks(); // protectTxs is state transition only
    });

    it('immediately protects transactions received via gossip if pre-recorded', async () => {
      const tx = await mockTx(1);

      // Pre-record protection for a tx we don't have yet
      const missing = await pool.protectTxs([tx.getTxHash()], slot1Header);
      expect(toStrings(missing)).toContain(hashOf(tx));
      expectNoCallbacks(); // Pre-recording doesn't add tx

      // Now add the tx via gossip - it should be immediately protected
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });

    it('updates slot number when re-protecting via protectTxs', async () => {
      const tx = await mockTx(1);

      // Add and protect for slot 1
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.protectTxs([tx.getTxHash()], slot1Header);
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Re-protect for slot 2 via protectTxs
      await pool.protectTxs([tx.getTxHash()], slot2Header);
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(2) should NOT unprotect since slot was updated to 2
      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(3) should unprotect
      await pool.prepareForSlot(SlotNumber(3));
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('updates pre-protected slot when called again before tx arrives', async () => {
      const tx = await mockTx(1);

      // Pre-record protection for slot 1
      const missing1 = await pool.protectTxs([tx.getTxHash()], slot1Header);
      expect(toStrings(missing1)).toContain(hashOf(tx));
      expectNoCallbacks();

      // Pre-record protection for slot 2 (overwrites slot 1)
      const missing2 = await pool.protectTxs([tx.getTxHash()], slot2Header);
      expect(toStrings(missing2)).toContain(hashOf(tx));
      expectNoCallbacks();

      // Now add the tx - it should be protected for slot 2
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(2) should NOT unprotect since it's for slot 2
      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks();
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
        setFeePayerBalanceForPreProtect(DEFAULT_TX_FEE_LIMIT + DEFAULT_TX_FEE_LIMIT / 2n);

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
          expect(await pool.getTxStatus(txExisting.getTxHash())).toBe('deleted');
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
          expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
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

    describe('soft-deleted tx resurrection', () => {
      let mockValidator: MockProxy<TxValidator<TxMetaData>>;
      let poolWithValidator: AztecKVTxPoolV2;
      let validatorStore: Awaited<ReturnType<typeof openTmpStore>>;
      let validatorArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;

      beforeEach(async () => {
        mockValidator = mock<TxValidator<TxMetaData>>();
        mockValidator.validateTx.mockResolvedValue({ result: 'valid' });

        validatorStore = await openTmpStore('p2p-protect-soft-delete');
        validatorArchiveStore = await openTmpStore('archive-protect-soft-delete');
        poolWithValidator = new AztecKVTxPoolV2(validatorStore, validatorArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(mockValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await poolWithValidator.start();
      });

      afterEach(async () => {
        await poolWithValidator.stop();
        await validatorStore.delete();
        await validatorArchiveStore.delete();
      });

      /** Helper: add tx, mine it, prune it, fail validation -> soft-deleted */
      const softDeleteTx = async (tx: Tx) => {
        await poolWithValidator.addPendingTxs([tx]);
        await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

        // Make validator reject so tx is soft-deleted on prune
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['timestamp expired'],
        });
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // Verify soft-deleted
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();

        // Restore validator for subsequent operations
        mockValidator.validateTx.mockResolvedValue({ result: 'valid' });
      };

      it('resurrects a soft-deleted tx as protected instead of reporting it missing', async () => {
        const tx = await mockTx(1);
        await softDeleteTx(tx);

        // protectTxs should find the soft-deleted tx and resurrect it
        const missing = await poolWithValidator.protectTxs([tx.getTxHash()], slot2Header);

        expect(missing).toHaveLength(0);
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');
      });

      it('resurrected soft-deleted tx is retrievable and in indices', async () => {
        const tx = await mockTx(1);
        await softDeleteTx(tx);

        await poolWithValidator.protectTxs([tx.getTxHash()], slot2Header);

        // Should be retrievable
        const retrieved = await poolWithValidator.getTxByHash(tx.getTxHash());
        expect(retrieved).toBeDefined();
        expect(retrieved!.getTxHash().toString()).toEqual(tx.getTxHash().toString());

        // hasTxs should return true (in indices, not just soft-deleted)
        const [hasTx] = await poolWithValidator.hasTxs([tx.getTxHash()]);
        expect(hasTx).toBe(true);
      });

      it('resurrecting a soft-deleted tx preserves its stored proof', async () => {
        const tx = await mockTx(1);
        await softDeleteTx(tx);

        await poolWithValidator.protectTxs([tx.getTxHash()], slot2Header);

        const retrieved = await poolWithValidator.getTxByHash(tx.getTxHash());
        expect(retrieved!.chonkProof.isEmpty()).toBe(false);
        expect(retrieved!.toBuffer().equals(tx.toBuffer())).toBe(true);
      });

      it('resurrected tx is unprotected on the next slot', async () => {
        const tx = await mockTx(1);
        await softDeleteTx(tx);

        await poolWithValidator.protectTxs([tx.getTxHash()], slot1Header);
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');

        // Advance to slot 2 — protection from slot 1 expires
        await poolWithValidator.prepareForSlot(SlotNumber(2));
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');
      });

      it('mix of existing, soft-deleted, and truly missing txs', async () => {
        const txExisting = await mockTx(1);
        const txSoftDeleted = await mockTx(2);
        const txMissing = await mockTx(3);

        // Add txExisting as a regular pending tx
        await poolWithValidator.addPendingTxs([txExisting]);
        expect(await poolWithValidator.getTxStatus(txExisting.getTxHash())).toBe('pending');

        // Soft-delete txSoftDeleted
        await softDeleteTx(txSoftDeleted);

        // Protect all three
        const missing = await poolWithValidator.protectTxs(
          [txExisting.getTxHash(), txSoftDeleted.getTxHash(), txMissing.getTxHash()],
          slot2Header,
        );

        // Only txMissing should be reported as missing
        expect(toStrings(missing)).toEqual([hashOf(txMissing)]);

        // txExisting: protected (was pending, now protected)
        expect(await poolWithValidator.getTxStatus(txExisting.getTxHash())).toBe('protected');
        // txSoftDeleted: protected (resurrected from soft-deleted)
        expect(await poolWithValidator.getTxStatus(txSoftDeleted.getTxHash())).toBe('protected');
        // txMissing: pre-recorded protection, not in pool yet
        expect(await poolWithValidator.getTxStatus(txMissing.getTxHash())).toBeUndefined();
      });

      it('resurrected tx survives a second protectTxs call', async () => {
        const tx = await mockTx(1);
        await softDeleteTx(tx);

        // Resurrect via protectTxs at slot 1
        await poolWithValidator.protectTxs([tx.getTxHash()], slot1Header);
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');

        // Re-protect at slot 2 — should update slot, not report missing
        const missing = await poolWithValidator.protectTxs([tx.getTxHash()], slot2Header);
        expect(missing).toHaveLength(0);
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');

        // Should survive prepareForSlot(2)
        await poolWithValidator.prepareForSlot(SlotNumber(2));
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');

        // Should unprotect at slot 3
        await poolWithValidator.prepareForSlot(SlotNumber(3));
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');
      });
    });
  });

  describe('handleMinedBlock', () => {
    it('marks protected transactions as mined', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);

      await pool.handleMinedBlock(makeBlock([tx], slot1Header));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expectNoCallbacks(); // State transition only, tx not removed from pool
    });

    it('marks pending transactions as mined', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      await pool.handleMinedBlock(makeBlock([tx], slot1Header));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectNoCallbacks(); // State transition only, tx not removed from pool
    });

    it('a tx protected at an earlier slot stays mined when its block lands, not unprotected to pending', async () => {
      // Models the event-driven release: the block stream handler marks txs mined for the landed
      // block before releasing protections from earlier slots. A tx protected at slot 1 that lands
      // in a block at slot 2 must end up mined, never bounced through pending where it could be lost.
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Mark mined first (as the blocks-added handler does), then release earlier-slot protections.
      await pool.handleMinedBlock(makeBlock([tx], slot2Header));
      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('handles empty block gracefully', async () => {
      // Should not throw when processing an empty block
      await pool.handleMinedBlock(makeEmptyBlock(slot1Header));
      expectNoCallbacks();
    });

    it('deletes pending transactions with conflicting nullifiers', async () => {
      // Create two transactions with the same nullifier
      const txLow = await mockPublicTx(1, 5);
      const txHigh = await mockPublicTx(2, 10);
      setNullifier(txHigh, 0, getNullifier(txLow, 0));

      // Add low priority tx as pending
      await pool.addPendingTxs([txLow]);
      expectAddedTxs(txLow);
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('pending');

      // Add high priority tx as protected (bypasses nullifier conflict check)
      await pool.addProtectedTxs([txHigh], slot1Header);
      expectAddedTxs(txHigh);
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('protected');

      // Unprotect - nullifier conflict resolution should delete the lower priority pending tx
      await pool.prepareForSlot(SlotNumber(2));
      expectRemovedTxs(txLow); // txLow evicted due to nullifier conflict

      // High priority tx should now be pending, low priority tx should be deleted
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('deleted');
      expect(await pool.getPendingTxCount()).toBe(1);
    });
  });

  describe('prepareForSlot', () => {
    it('unprotects transactions from earlier slots', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
      expectNoCallbacks(); // State transition only, tx not added or removed
    });

    it('does not unprotect transactions from current or future slots', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      await pool.addProtectedTxs([tx1], slot1Header);
      expectAddedTxs(tx1);
      await pool.addProtectedTxs([tx2], slot2Header);
      expectAddedTxs(tx2);

      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks(); // tx1 transitions to pending, tx2 stays protected - no adds/removes

      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('protected');
    });

    it('keeps tx protected when re-protected for later slot before late prepareForSlot', async () => {
      // Race condition: tx protected for slot 1, then re-protected for slot 2,
      // then prepareForSlot(2) called late - tx should stay protected
      const tx = await mockTx(1);

      // Initially protected for slot 1
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Re-protected for slot 2 (new proposer takes over)
      await pool.addProtectedTxs([tx], slot2Header);
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Late prepareForSlot(2) - tx should NOT be unprotected since it's now for slot 2
      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks();

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
      expectAddedTxs(tx);

      // Re-protected for slot 3 (skipping slot 2)
      await pool.addProtectedTxs([tx], slot3Header);
      expectNoCallbacks(); // State transition only

      // prepareForSlot(2) - tx should stay protected (it's for slot 3)
      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(3) - tx should still be protected (current slot)
      await pool.prepareForSlot(SlotNumber(3));
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // prepareForSlot(4) - NOW tx should be unprotected
      await pool.prepareForSlot(SlotNumber(4));
      expectNoCallbacks(); // State transition to pending, not a removal
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('cleans up stale pre-protected hash records', async () => {
      const tx = await mockTx(1);

      // Pre-record protection
      await pool.protectTxs([tx.getTxHash()], slot1Header);
      expectNoCallbacks();

      // Prepare for a later slot - should clean up the stale record
      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks();

      // Now add the tx - it should be pending, not protected
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('is idempotent for same slot', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);

      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks(); // State transition only
      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks(); // Idempotent

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
      expectAddedTxs(txPending);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Add protected tx (has higher priority, shares nullifier)
      await pool.addProtectedTxs([txProtected], slot1Header);
      expectAddedTxs(txProtected);

      // Unprotect - txProtected should evict txPending due to nullifier conflict
      await pool.prepareForSlot(SlotNumber(2));

      // Only the higher priority tx (previously protected) should remain
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txProtected));
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('deleted');
      expectRemovedTxs(txPending); // txPending evicted due to nullifier conflict
    });

    it('unprotected tx with lower priority is deleted when conflicting with pending tx', async () => {
      const txPending = await mockPublicTx(1, 10);
      const txProtected = await mockPublicTx(2, 5);

      // Give protected tx the same nullifier as pending tx
      setNullifier(txProtected, 0, getNullifier(txPending, 0));

      // Add pending tx (higher priority)
      await pool.addPendingTxs([txPending]);
      expectAddedTxs(txPending);

      // Add protected tx (lower priority, shares nullifier)
      await pool.addProtectedTxs([txProtected], slot1Header);
      expectAddedTxs(txProtected);

      // Unprotect - txProtected should be deleted, txPending should remain
      await pool.prepareForSlot(SlotNumber(2));

      // Only the higher priority pending tx should remain
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txPending));
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBe('deleted');
      expectRemovedTxs(txProtected); // txProtected deleted due to lower priority
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
      expectAddedTxs(tx1, tx2, tx3);

      // Unprotect all - only highest priority should survive
      await pool.prepareForSlot(SlotNumber(2));

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(tx2)); // tx2 has fee=15, highest
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('deleted');
      expectRemovedTxs(tx1, tx3); // Lower priority txs deleted
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
      expectAddedTxs(txPending1, txPending2);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Add protected tx
      await pool.addProtectedTxs([txProtected], slot1Header);
      expectAddedTxs(txProtected);

      // Unprotect - txProtected should evict both pending txs
      await pool.prepareForSlot(SlotNumber(2));

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txProtected));
      expect(await pool.getTxStatus(txPending1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(txPending2.getTxHash())).toBe('deleted');
      expectRemovedTxs(txPending1, txPending2); // Both evicted
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
      expectAddedTxs(txPendingHigh, txPendingLow);

      // Add protected tx
      await pool.addProtectedTxs([txProtected], slot1Header);
      expectAddedTxs(txProtected);

      // Unprotect - txProtected should be deleted because it can't beat txPendingHigh
      await pool.prepareForSlot(SlotNumber(2));

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending).toContain(hashOf(txPendingHigh));
      expect(pending).toContain(hashOf(txPendingLow));
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBe('deleted');
      expectRemovedTxs(txProtected); // txProtected deleted
    });
  });

  describe('unprotectTxs', () => {
    it('restores matching-slot protected txs to pending', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.unprotectTxs([tx.getTxHash()], SlotNumber(1));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
      expectNoCallbacks(); // state transition only, tx not added or removed
    });

    it('leaves protections recorded at a later slot untouched', async () => {
      const tx = await mockTx(1);
      // Protected for slot 1, then raised to slot 2 by a second live proposal
      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      await pool.addProtectedTxs([tx], slot2Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // The failed slot-1 proposal releases its protection, but the slot-2 protection survives
      await pool.unprotectTxs([tx.getTxHash()], SlotNumber(1));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expectNoCallbacks();
    });

    it('only releases the requested hashes that match the slot', async () => {
      const txReleased = await mockTx(1);
      const txKeptLaterSlot = await mockTx(2);
      const txUnrelated = await mockTx(3);

      await pool.addProtectedTxs([txReleased], slot1Header);
      await pool.addProtectedTxs([txKeptLaterSlot], slot2Header);
      await pool.addProtectedTxs([txUnrelated], slot1Header);
      clearCallbackTracking();

      // Failed proposal at slot 1 referenced only txReleased and txKeptLaterSlot
      await pool.unprotectTxs([txReleased.getTxHash(), txKeptLaterSlot.getTxHash()], SlotNumber(1));

      expect(await pool.getTxStatus(txReleased.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txKeptLaterSlot.getTxHash())).toBe('protected'); // slot 2, not released
      expect(await pool.getTxStatus(txUnrelated.getTxHash())).toBe('protected'); // not in the hash list
    });

    it('leaves mined txs untouched', async () => {
      const tx = await mockTx(1);
      // Protected, then mined at slot 1 (mining clears the protection entry)
      await pool.addProtectedTxs([tx], slot1Header);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      clearCallbackTracking();

      await pool.unprotectTxs([tx.getTxHash()], SlotNumber(1));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectNoCallbacks();
    });

    it('is a no-op when no protection matches the slot', async () => {
      const tx = await mockTx(1);
      await pool.addProtectedTxs([tx], slot2Header);
      clearCallbackTracking();

      await pool.unprotectTxs([tx.getTxHash()], SlotNumber(1));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
      expectNoCallbacks();
    });

    it('resolves nullifier conflicts when restoring to pending', async () => {
      const txPending = await mockPublicTx(1, 5);
      const txProtected = await mockPublicTx(2, 20);
      // Protected tx shares a nullifier with the pending tx but has higher priority
      setNullifier(txProtected, 0, getNullifier(txPending, 0));

      await pool.addPendingTxs([txPending]);
      await pool.addProtectedTxs([txProtected], slot1Header);
      clearCallbackTracking();

      await pool.unprotectTxs([txProtected.getTxHash()], SlotNumber(1));

      // Higher-priority unprotected tx wins the conflict; the pending loser is evicted
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('deleted');
    });
  });

  describe('handlePrunedBlocks', () => {
    it('un-mines transactions from pruned block', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks(); // handleMinedBlock is state transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handlePrunedBlocks(block0Id);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
      expectNoCallbacks(); // handlePrunedBlocks restores to pending, no removal
    });

    it('deleteAllTxs option deletes all un-mined txs instead of restoring to pending', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);
      await pool.addPendingTxs([tx1, tx2]);
      expectAddedTxs(tx1, tx2);

      // Mine both txs
      await pool.handleMinedBlock(makeBlock([tx1, tx2], slot1Header));
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('mined');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('mined');

      // Prune with deleteAllTxs - should delete all instead of restoring to pending
      await pool.handlePrunedBlocks(block0Id, { deleteAllTxs: true });

      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('deleted');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectRemovedTxs(tx1, tx2);
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
      expectAddedTxs(txMined);
      await pool.handleMinedBlock(makeBlock([txMined], slot1Header));
      expectNoCallbacks();
      expect(await pool.getTxStatus(txMined.getTxHash())).toBe('mined');

      // Now txPending can be added since txMined's nullifier is no longer in pending
      await pool.addPendingTxs([txPending]);
      expectAddedTxs(txPending);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Reorg - txMined returns to pending and should evict txPending
      await pool.handlePrunedBlocks(block0Id);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txMined));
      // txPending was never mined, never in a pruned block, so it's slot-soft-deleted
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('deleted');
      expectRemovedTxs(txPending); // txPending evicted due to nullifier conflict
    });

    it('un-mined tx with lower priority is deleted when conflicting with pending tx', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const txPending = await mockPublicTx(1, 10);
      const txMined = await mockPublicTx(2, 5);

      // Give mined tx the same nullifier as pending tx
      setNullifier(txMined, 0, getNullifier(txPending, 0));

      // Add mined tx first and mine it
      await pool.addPendingTxs([txMined]);
      expectAddedTxs(txMined);
      await pool.handleMinedBlock(makeBlock([txMined], slot1Header));
      expectNoCallbacks();

      // Now txPending can be added (higher priority)
      await pool.addPendingTxs([txPending]);
      expectAddedTxs(txPending);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Reorg - txMined tries to return but should be deleted (lower priority)
      await pool.handlePrunedBlocks(block0Id);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txPending));
      expect(await pool.getTxStatus(txMined.getTxHash())).toBe('deleted');
      expectRemovedTxs(txMined); // txMined deleted due to lower priority
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
      expectAddedTxs(tx1);
      await pool.handleMinedBlock(makeBlock([tx1], slot1Header));
      expectNoCallbacks();

      // After tx1 is mined, we can add tx2 (same nullifier but tx1 no longer pending)
      await pool.addPendingTxs([tx2]);
      expectAddedTxs(tx2);
      await pool.handleMinedBlock(makeBlock([tx2], slot1Header));
      expectNoCallbacks();

      // After tx2 is mined, we can add tx3
      await pool.addPendingTxs([tx3]);
      expectAddedTxs(tx3);
      await pool.handleMinedBlock(makeBlock([tx3], slot1Header));
      expectNoCallbacks();

      // Reorg all - only highest priority should survive
      await pool.handlePrunedBlocks(block0Id);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(tx2)); // tx2 has fee=15, highest
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('deleted');
      expectRemovedTxs(tx1, tx3); // Lower priority txs deleted
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
      expectAddedTxs(txMined);
      await pool.handleMinedBlock(makeBlock([txMined], slot1Header));
      expectNoCallbacks();

      // Now add the pending txs (no conflict since txMined is mined)
      await pool.addPendingTxs([txPending1, txPending2]);
      expectAddedTxs(txPending1, txPending2);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Reorg - txMined returns and should evict both pending txs
      await pool.handlePrunedBlocks(block0Id);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(1);
      expect(pending).toContain(hashOf(txMined));
      // txPending1 and txPending2 were never mined, never in a pruned block, so slot-soft-deleted
      expect(await pool.getTxStatus(txPending1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(txPending2.getTxHash())).toBe('deleted');
      expectRemovedTxs(txPending1, txPending2); // Both evicted
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
      expectAddedTxs(txMined);
      await pool.handleMinedBlock(makeBlock([txMined], slot1Header));
      expectNoCallbacks();

      // Add the pending txs
      await pool.addPendingTxs([txPendingHigh, txPendingLow]);
      expectAddedTxs(txPendingHigh, txPendingLow);

      // Reorg - txMined should be deleted because it can't beat txPendingHigh
      await pool.handlePrunedBlocks(block0Id);

      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending).toContain(hashOf(txPendingHigh));
      expect(pending).toContain(hashOf(txPendingLow));
      expect(await pool.getTxStatus(txMined.getTxHash())).toBe('deleted');
      expectRemovedTxs(txMined); // txMined deleted
    });

    it('evicts low priority txs after chain prune when pool exceeds limit', async () => {
      const txLow = await mockTxWithFee(1, 1);
      const txMed = await mockTxWithFee(2, 5);
      const txHigh = await mockTxWithFee(3, 10);

      // Add all 3 txs (no pool limit by default)
      await pool.addPendingTxs([txLow, txMed, txHigh]);
      expectAddedTxs(txLow, txMed, txHigh);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Mine all three
      await pool.handleMinedBlock(makeBlock([txLow, txMed, txHigh], slot1Header));
      expectNoCallbacks();
      expect(await pool.getPendingTxCount()).toBe(0);

      // Now set pool limit to 2
      await pool.updateConfig({ maxPendingTxCount: 2 });

      // Prune - all 3 txs return to pending, but pool limit is 2
      await pool.handlePrunedBlocks(block0Id);

      // Lowest priority tx should be evicted
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending).toHaveLength(2);
      expect(pending).toContain(hashOf(txMed));
      expect(pending).toContain(hashOf(txHigh));
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('deleted');
    });

    it('does not evict txs after chain prune when pool is within limit', async () => {
      const tx1 = await mockTxWithFee(1, 1);
      const tx2 = await mockTxWithFee(2, 2);

      await pool.addPendingTxs([tx1, tx2]);
      expectAddedTxs(tx1, tx2);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Mine both
      await pool.handleMinedBlock(makeBlock([tx1, tx2], slot1Header));
      expectNoCallbacks();

      // Set limit to 3 (above what will be restored)
      await pool.updateConfig({ maxPendingTxCount: 3 });

      // Prune - both txs return to pending, under the limit
      await pool.handlePrunedBlocks(block0Id);

      expect(await pool.getPendingTxCount()).toBe(2);
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
    });
  });

  describe('validation during restore', () => {
    let mockValidator: MockProxy<TxValidator<TxMetaData>>;
    let poolWithValidator: AztecKVTxPoolV2;
    let validatorStore: Awaited<ReturnType<typeof openTmpStore>>;
    let validatorArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;

    beforeEach(async () => {
      mockValidator = mock<TxValidator<TxMetaData>>();
      // Default to valid
      mockValidator.validateTx.mockResolvedValue({ result: 'valid' });

      validatorStore = await openTmpStore('p2p-val');
      validatorArchiveStore = await openTmpStore('archive-val');
      poolWithValidator = new AztecKVTxPoolV2(validatorStore, validatorArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(mockValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await poolWithValidator.start();
    });

    afterEach(async () => {
      await poolWithValidator.stop();
      await validatorStore.delete();
      await validatorArchiveStore.delete();
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

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await poolWithValidator.getPendingTxCount()).toBe(0);
    });

    it('unprotectTxs deletes tx that fails validation when restoring', async () => {
      const tx = await mockTx(1);

      await poolWithValidator.addProtectedTxs([tx], slot1Header);
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('protected');

      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['tx expired'],
      });

      await poolWithValidator.unprotectTxs([tx.getTxHash()], SlotNumber(1));

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
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
      mockValidator.validateTx.mockImplementation((meta: TxMetaData) => {
        if (meta.txHash === txInvalid.getTxHash().toString()) {
          return Promise.resolve({ result: 'invalid', reason: ['invalid proof'] });
        }
        return Promise.resolve({ result: 'valid' });
      });

      await poolWithValidator.prepareForSlot(SlotNumber(2));

      expect(await poolWithValidator.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getTxStatus(txInvalid.getTxHash())).toBe('deleted');
      expect(await poolWithValidator.getTxStatus(txAlsoValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(2);
    });

    it('handlePrunedBlocks deletes tx that fails validation when un-mining', async () => {
      db.findLeafIndices.mockResolvedValue([1n]); // Anchor block valid

      const tx = await mockTx(1);

      // Add, mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

      // Make validator reject this tx
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['timestamp expired'],
      });

      // Reorg - tx should be soft-deleted due to validation failure
      await poolWithValidator.handlePrunedBlocks(block0Id);

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await poolWithValidator.getPendingTxCount()).toBe(0);
    });

    it('handlePrunedBlocks keeps tx that passes validation when un-mining', async () => {
      db.findLeafIndices.mockResolvedValue([1n]); // Anchor block valid

      const tx = await mockTx(1);

      // Add, mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));

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
      await poolWithValidator.handleMinedBlock(makeBlock([txValid, txInvalid, txAlsoValid], slot1Header));

      // Configure validator to reject only txInvalid
      mockValidator.validateTx.mockImplementation((meta: TxMetaData) => {
        if (meta.txHash === txInvalid.getTxHash().toString()) {
          return Promise.resolve({ result: 'invalid', reason: ['nullifier exists'] });
        }
        return Promise.resolve({ result: 'valid' });
      });

      await poolWithValidator.handlePrunedBlocks(block0Id);

      expect(await poolWithValidator.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getTxStatus(txInvalid.getTxHash())).toBe('deleted');
      expect(await poolWithValidator.getTxStatus(txAlsoValid.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(2);
    });

    it('prepareForSlot deletes tx with disallowed setup calls when unprotecting', async () => {
      // Create a pool where checkAllowedSetupCalls returns false
      const disallowStore = await openTmpStore('p2p-disallow');
      const disallowArchiveStore = await openTmpStore('archive-disallow');
      const setupValidator = new AggregateTxValidator(mockValidator, new AllowedSetupCallsMetaValidator<TxMetaData>());
      const disallowPool = new AztecKVTxPoolV2(disallowStore, disallowArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(setupValidator),
        checkAllowedSetupCalls: () => Promise.resolve(false),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await disallowPool.start();

      const tx = await mockTx(1);

      // Add as protected - checkAllowedSetupCalls returns false, so metadata.allowedSetupCalls = false
      await disallowPool.addProtectedTxs([tx], slot1Header);
      expect(await disallowPool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Unprotect - AllowedSetupCallsMetaValidator should reject since allowedSetupCalls is false
      await disallowPool.prepareForSlot(SlotNumber(2));

      expect(await disallowPool.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await disallowPool.getPendingTxCount()).toBe(0);

      await disallowPool.stop();
      await disallowStore.delete();
      await disallowArchiveStore.delete();
    });

    it('prepareForSlot keeps tx with allowed setup calls when unprotecting', async () => {
      const tx = await mockTx(1);

      // poolWithValidator has checkAllowedSetupCalls returning true (default)
      await poolWithValidator.addProtectedTxs([tx], slot1Header);

      await poolWithValidator.prepareForSlot(SlotNumber(2));

      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await poolWithValidator.getPendingTxCount()).toBe(1);
    });

    it('prepareForSlot handles mixed allowed/disallowed setup calls on unprotect', async () => {
      // Create a pool where checkAllowedSetupCalls returns false for specific txs
      const mixedStore = await openTmpStore('p2p-mixed');
      const mixedArchiveStore = await openTmpStore('archive-mixed');

      const txAllowed = await mockTx(1);
      const txDisallowed = await mockTx(2);
      const txAlsoAllowed = await mockTx(3);
      const disallowedHash = txDisallowed.getTxHash().toString();

      const setupValidator = new AggregateTxValidator(mockValidator, new AllowedSetupCallsMetaValidator<TxMetaData>());
      const mixedPool = new AztecKVTxPoolV2(mixedStore, mixedArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(setupValidator),
        // Only disallow setup calls for the second tx
        checkAllowedSetupCalls: tx => Promise.resolve(tx.getTxHash().toString() !== disallowedHash),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await mixedPool.start();

      // Add all as protected
      await mixedPool.addProtectedTxs([txAllowed, txDisallowed, txAlsoAllowed], slot1Header);
      expect(await mixedPool.getTxStatus(txAllowed.getTxHash())).toBe('protected');
      expect(await mixedPool.getTxStatus(txDisallowed.getTxHash())).toBe('protected');
      expect(await mixedPool.getTxStatus(txAlsoAllowed.getTxHash())).toBe('protected');

      // Unprotect all - only txDisallowed should be deleted
      await mixedPool.prepareForSlot(SlotNumber(2));

      expect(await mixedPool.getTxStatus(txAllowed.getTxHash())).toBe('pending');
      expect(await mixedPool.getTxStatus(txDisallowed.getTxHash())).toBe('deleted');
      expect(await mixedPool.getTxStatus(txAlsoAllowed.getTxHash())).toBe('pending');
      expect(await mixedPool.getPendingTxCount()).toBe(2);

      await mixedPool.stop();
      await mixedStore.delete();
      await mixedArchiveStore.delete();
    });

    it('handlePrunedBlocks deletes tx with disallowed setup calls after reload and un-mining', async () => {
      db.findLeafIndices.mockResolvedValue([1n]); // Anchor block valid

      // Step 1: Start a pool that allows setup calls, add and mine a tx
      const sharedStore = await openTmpStore('p2p-disallow-prune');
      const sharedArchiveStore = await openTmpStore('archive-disallow-prune');
      const pool1 = new AztecKVTxPoolV2(sharedStore, sharedArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(mockValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await pool1.start();

      const tx = await mockTx(1);
      await pool1.addPendingTxs([tx]);
      await pool1.handleMinedBlock(makeBlock([tx], slot1Header));
      expect(await pool1.getTxStatus(tx.getTxHash())).toBe('mined');
      await pool1.stop();

      // Step 2: Restart pool with checkAllowedSetupCalls returning false.
      // On reload, tx gets allowedSetupCalls=false in metadata.
      const setupValidator = new AggregateTxValidator(mockValidator, new AllowedSetupCallsMetaValidator<TxMetaData>());
      const pool2 = new AztecKVTxPoolV2(sharedStore, sharedArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(setupValidator),
        checkAllowedSetupCalls: () => Promise.resolve(false),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      // Mock getTxEffect to return the mined tx so it stays mined on reload
      mockL2BlockSource.getTxEffect.mockResolvedValue({
        txEffect: TxEffect.empty(),
        l2BlockNumber: 1,
        l2BlockHash: '0x1',
      } as any);
      await pool2.start();
      expect(await pool2.getTxStatus(tx.getTxHash())).toBe('mined');

      // Restore original mock
      mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

      // Step 3: Prune - tx gets un-mined and revalidated.
      // AllowedSetupCallsMetaValidator rejects it since allowedSetupCalls=false.
      await pool2.handlePrunedBlocks(block0Id);

      expect(await pool2.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await pool2.getPendingTxCount()).toBe(0);

      await pool2.stop();
      await sharedStore.delete();
      await sharedArchiveStore.delete();
    });

    it('pending tx via addPendingTxs has allowedSetupCalls=true regardless of checkAllowedSetupCalls', async () => {
      // Create a pool where checkAllowedSetupCalls always returns false
      const disallowStore = await openTmpStore('p2p-disallow-pending');
      const disallowArchiveStore = await openTmpStore('archive-disallow-pending');
      const disallowPool = new AztecKVTxPoolV2(disallowStore, disallowArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(mockValidator),
        checkAllowedSetupCalls: () => Promise.resolve(false),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await disallowPool.start();

      const tx = await mockTx(1);

      // Add via addPendingTxs - this does NOT call checkAllowedSetupCalls,
      // so allowedSetupCalls defaults to true
      await disallowPool.addPendingTxs([tx]);
      expect(disallowPool.getPoolReadAccess().getMetadata(tx.getTxHash().toString())?.allowedSetupCalls).toBe(true);

      await disallowPool.stop();
      await disallowStore.delete();
      await disallowArchiveStore.delete();
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
      mockValidator.validateTx.mockImplementation((meta: TxMetaData) => {
        if (meta.txHash === txProtected.getTxHash().toString()) {
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
      expect(await poolWithValidator.getTxStatus(txProtected.getTxHash())).toBe('deleted');
    });
  });

  describe('soft deletion', () => {
    let mockValidator: MockProxy<TxValidator<TxMetaData>>;
    let poolWithValidator: AztecKVTxPoolV2;
    let validatorStore: Awaited<ReturnType<typeof openTmpStore>>;
    let validatorArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;

    beforeEach(async () => {
      mockValidator = mock<TxValidator<TxMetaData>>();
      mockValidator.validateTx.mockResolvedValue({ result: 'valid' });

      validatorStore = await openTmpStore('p2p-soft-delete');
      validatorArchiveStore = await openTmpStore('archive-soft-delete');
      poolWithValidator = new AztecKVTxPoolV2(validatorStore, validatorArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(mockValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await poolWithValidator.start();
    });

    afterEach(async () => {
      await poolWithValidator.stop();
      await validatorStore.delete();
      await validatorArchiveStore.delete();
    });

    it('soft-deleted txs have deleted status but are still retrievable via getTxByHash', async () => {
      const tx = await mockTx(1);

      // Add and mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

      // Make validator reject this tx so it gets soft-deleted on prune
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['timestamp expired'],
      });

      // Prune - tx should be soft-deleted (removed from indices but kept in DB)
      await poolWithValidator.handlePrunedBlocks(block0Id);

      // Status is 'deleted'
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await poolWithValidator.getPendingTxCount()).toBe(0);

      // But still retrievable via getTxByHash
      const retrieved = await poolWithValidator.getTxByHash(tx.getTxHash());
      expect(retrieved).toBeDefined();
      expect(retrieved!.getTxHash().toString()).toEqual(tx.getTxHash().toString());
    });

    it('handleFinalizedBlock hard-deletes soft-deleted txs', async () => {
      const tx = await mockTx(1);

      // Add and mine at block 1
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));

      // Make validator reject to cause soft deletion
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['invalid'],
      });

      // Prune - tx is soft-deleted at block 0 (prune point)
      await poolWithValidator.handlePrunedBlocks(block0Id);

      // Verify still retrievable
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();

      // Finalize block 1 - should hard-delete soft-deleted tx (pruned at block 0 <= finalized block 1)
      await poolWithValidator.handleFinalizedBlock(slot1Header);

      // Now completely gone from DB
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeUndefined();
    });

    it('soft-deleted tx is not hard-deleted until finalized block reaches prune point', async () => {
      const tx = await mockTx(1);

      // Create header for block 2
      const block2Header = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(2),
          slotNumber: SlotNumber(2),
        }),
      });

      // Add, mine at block 2
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], block2Header));
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

      // Make validator reject
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['invalid'],
      });

      // Prune to block 1 - tx mined at block 2 gets un-mined, fails validation, soft-deleted
      // The tx was mined at block 2, so it should only be hard-deleted when block 2 is finalized
      const block1Id: L2BlockId = { number: BlockNumber(1), hash: '0x1' };
      await poolWithValidator.handlePrunedBlocks(block1Id);

      // Verify soft-deleted (status is 'deleted', still in DB)
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();

      // Finalize block 1 - should NOT hard-delete (mined at 2 > finalized 1)
      await poolWithValidator.handleFinalizedBlock(slot1Header);

      // Still retrievable
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();

      // Finalize block 2 - NOW it should be hard-deleted (mined at 2 <= finalized 2)
      await poolWithValidator.handleFinalizedBlock(block2Header);

      // Gone
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeUndefined();
    });

    it('evicted txs during nullifier conflict are soft-deleted and retrievable', async () => {
      const txPending = await mockPublicTx(1, 10);
      const txMined = await mockPublicTx(2, 5);

      // Give mined tx the same nullifier as pending tx
      setNullifier(txMined, 0, getNullifier(txPending, 0));

      // Add mined tx first and mine it
      await poolWithValidator.addPendingTxs([txMined]);
      await poolWithValidator.handleMinedBlock(makeBlock([txMined], slot1Header));

      // Now txPending can be added (higher priority)
      await poolWithValidator.addPendingTxs([txPending]);

      // Reorg - txMined tries to return but loses to txPending (lower priority)
      // It should be soft-deleted, not hard-deleted
      await poolWithValidator.handlePrunedBlocks(block0Id);

      // txMined should have 'deleted' status but still be retrievable
      expect(await poolWithValidator.getTxStatus(txMined.getTxHash())).toBe('deleted');
      const retrieved = await poolWithValidator.getTxByHash(txMined.getTxHash());
      expect(retrieved).toBeDefined();
      expect(retrieved!.getTxHash().toString()).toEqual(txMined.getTxHash().toString());

      // txPending should be in pending
      expect(await poolWithValidator.getTxStatus(txPending.getTxHash())).toBe('pending');
    });

    it('hasTxs returns true for soft-deleted txs', async () => {
      const tx = await mockTx(1);

      // Add and mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));

      // Make validator reject to cause soft deletion
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['invalid'],
      });

      // Prune - tx is soft-deleted
      await poolWithValidator.handlePrunedBlocks(block0Id);

      // hasTxs should still return true for soft-deleted tx
      const [hasTx] = await poolWithValidator.hasTxs([tx.getTxHash()]);
      expect(hasTx).toBe(true);

      // getTxStatus returns 'deleted'
      expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');

      // And getTxByHash still works
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();
    });

    it('hasTxs returns false after hard deletion', async () => {
      const tx = await mockTx(1);

      // Add and mine
      await poolWithValidator.addPendingTxs([tx]);
      await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));

      // Make validator reject to cause soft deletion
      mockValidator.validateTx.mockResolvedValue({
        result: 'invalid',
        reason: ['invalid'],
      });

      // Prune - tx is soft-deleted
      await poolWithValidator.handlePrunedBlocks(block0Id);

      // Finalize - tx is hard-deleted
      await poolWithValidator.handleFinalizedBlock(slot1Header);

      // hasTxs should return false after hard deletion
      const [hasTx] = await poolWithValidator.hasTxs([tx.getTxHash()]);
      expect(hasTx).toBe(false);

      // getTxByHash returns undefined
      expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeUndefined();
    });

    describe('full soft deletion lifecycle', () => {
      it('prune -> soft-delete -> finalize -> gone', async () => {
        const tx = await mockTx(1);

        // 1. Add transaction as pending
        await poolWithValidator.addPendingTxs([tx]);
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();

        // 2. Mine the transaction
        await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

        // 3. Prune (reorg) - transaction fails validation and is soft-deleted
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['nullifier already exists'],
        });
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // Transaction is soft-deleted: status is 'deleted', still retrievable
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();
        expect((await poolWithValidator.hasTxs([tx.getTxHash()]))[0]).toBe(true);
        expect(await poolWithValidator.getPendingTxCount()).toBe(0);

        // 4. Finalize the block - transaction is hard-deleted
        await poolWithValidator.handleFinalizedBlock(slot1Header);

        // Transaction is completely gone (status undefined, not 'deleted')
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBeUndefined();
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeUndefined();
        expect((await poolWithValidator.hasTxs([tx.getTxHash()]))[0]).toBe(false);
      });

      it('multiple txs with different mined blocks finalize at correct times', async () => {
        const tx1 = await mockTx(1);
        const tx2 = await mockTx(2);
        const tx3 = await mockTx(3);

        const block2Header = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({
            blockNumber: BlockNumber(2),
            slotNumber: SlotNumber(2),
          }),
        });

        const block3Header = BlockHeader.empty({
          globalVariables: GlobalVariables.empty({
            blockNumber: BlockNumber(3),
            slotNumber: SlotNumber(3),
          }),
        });

        // Add and mine all txs at different blocks
        await poolWithValidator.addPendingTxs([tx1]);
        await poolWithValidator.handleMinedBlock(makeBlock([tx1], slot1Header)); // mined at block 1

        await poolWithValidator.addPendingTxs([tx2]);
        await poolWithValidator.handleMinedBlock(makeBlock([tx2], block2Header)); // mined at block 2

        await poolWithValidator.addPendingTxs([tx3]);
        await poolWithValidator.handleMinedBlock(makeBlock([tx3], block3Header)); // mined at block 3

        // Make validator reject all
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['invalid'],
        });

        // Prune to block 0 - un-mines all txs (mined at 1, 2, 3 are all > 0)
        // All fail validation and are soft-deleted
        // Each tx tracks its original mined block (1, 2, 3 respectively)
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // All are soft-deleted, retrievable
        expect(await poolWithValidator.getTxByHash(tx1.getTxHash())).toBeDefined();
        expect(await poolWithValidator.getTxByHash(tx2.getTxHash())).toBeDefined();
        expect(await poolWithValidator.getTxByHash(tx3.getTxHash())).toBeDefined();

        // Finalize block 1 - only tx1 should be hard-deleted (mined at block 1)
        await poolWithValidator.handleFinalizedBlock(slot1Header);

        expect(await poolWithValidator.getTxByHash(tx1.getTxHash())).toBeUndefined();
        expect(await poolWithValidator.getTxByHash(tx2.getTxHash())).toBeDefined();
        expect(await poolWithValidator.getTxByHash(tx3.getTxHash())).toBeDefined();

        // Finalize block 2 - tx2 should be hard-deleted (mined at block 2)
        await poolWithValidator.handleFinalizedBlock(block2Header);

        expect(await poolWithValidator.getTxByHash(tx2.getTxHash())).toBeUndefined();
        expect(await poolWithValidator.getTxByHash(tx3.getTxHash())).toBeDefined();

        // Finalize block 3 - tx3 should be hard-deleted (mined at block 3)
        await poolWithValidator.handleFinalizedBlock(block3Header);

        expect(await poolWithValidator.getTxByHash(tx3.getTxHash())).toBeUndefined();
      });

      it('soft-deleted txs are excluded from state-specific queries but included in hash queries', async () => {
        const txPending = await mockTx(1);
        const txToSoftDelete = await mockTx(2);

        // Add both as pending
        await poolWithValidator.addPendingTxs([txPending, txToSoftDelete]);
        expect(await poolWithValidator.getPendingTxCount()).toBe(2);

        // Mine txToSoftDelete
        await poolWithValidator.handleMinedBlock(makeBlock([txToSoftDelete], slot1Header));

        // Make validator reject
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['invalid'],
        });

        // Prune - txToSoftDelete is soft-deleted
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // State-specific queries should NOT include soft-deleted tx
        expect(await poolWithValidator.getPendingTxCount()).toBe(1);
        const pendingHashes = await poolWithValidator.getPendingTxHashes();
        expect(pendingHashes.map(h => h.toString())).toContain(txPending.getTxHash().toString());
        expect(pendingHashes.map(h => h.toString())).not.toContain(txToSoftDelete.getTxHash().toString());

        // Hash-based queries should include soft-deleted tx
        const [hasPending, hasSoftDeleted] = await poolWithValidator.hasTxs([
          txPending.getTxHash(),
          txToSoftDelete.getTxHash(),
        ]);
        expect(hasPending).toBe(true);
        expect(hasSoftDeleted).toBe(true);

        // Both retrievable by hash
        expect(await poolWithValidator.getTxByHash(txPending.getTxHash())).toBeDefined();
        expect(await poolWithValidator.getTxByHash(txToSoftDelete.getTxHash())).toBeDefined();

        // Status differs
        expect(await poolWithValidator.getTxStatus(txPending.getTxHash())).toBe('pending');
        expect(await poolWithValidator.getTxStatus(txToSoftDelete.getTxHash())).toBe('deleted');
      });

      it('getTxsByHash returns soft-deleted txs', async () => {
        const tx1 = await mockTx(1);
        const tx2 = await mockTx(2);

        // Add and mine
        await poolWithValidator.addPendingTxs([tx1, tx2]);
        await poolWithValidator.handleMinedBlock(makeBlock([tx1, tx2], slot1Header));

        // Make validator reject
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['invalid'],
        });

        // Prune - both soft-deleted
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // getTxsByHash should return both
        const txs = await poolWithValidator.getTxsByHash([tx1.getTxHash(), tx2.getTxHash()]);
        expect(txs).toHaveLength(2);
        expect(txs[0]).toBeDefined();
        expect(txs[1]).toBeDefined();
        expect(txs[0]!.getTxHash().toString()).toBe(tx1.getTxHash().toString());
        expect(txs[1]!.getTxHash().toString()).toBe(tx2.getTxHash().toString());
      });
    });

    describe('protected tx in pruned block', () => {
      it('mined tx from pruned block that fails revalidation on un-mine should be soft-deleted', async () => {
        const tx = await mockTx(1);

        // Add, protect, and mine the tx. Mining clears the protection entry.
        await poolWithValidator.addPendingTxs([tx]);
        await poolWithValidator.addProtectedTxs([tx], slot1Header);
        await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('mined');

        // Make validator reject this tx, then prune. handlePrunedBlocks revalidates un-mined txs.
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['timestamp expired'],
        });
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // The tx was in a pruned block, so it should be SOFT-deleted, not hard-deleted
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();
      });

      it('mined tx from pruned block that loses nullifier conflict on un-mine should be soft-deleted', async () => {
        const txMined = await mockPublicTx(1, 5);
        const txHigherPriority = await mockPublicTx(2, 10);

        // Give them the same nullifier
        setNullifier(txHigherPriority, 0, getNullifier(txMined, 0));

        // Add, protect, and mine txMined. Mining clears the protection entry.
        await poolWithValidator.addPendingTxs([txMined]);
        await poolWithValidator.addProtectedTxs([txMined], slot1Header);
        await poolWithValidator.handleMinedBlock(makeBlock([txMined], slot1Header));
        expect(await poolWithValidator.getTxStatus(txMined.getTxHash())).toBe('mined');

        // Add a higher priority pending tx with the same nullifier
        await poolWithValidator.addPendingTxs([txHigherPriority]);
        expect(await poolWithValidator.getTxStatus(txHigherPriority.getTxHash())).toBe('pending');

        // Prune - txMined is un-mined and loses the nullifier conflict during handlePrunedBlocks
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // The tx was in a pruned block, so it should be SOFT-deleted, not hard-deleted
        expect(await poolWithValidator.getTxStatus(txMined.getTxHash())).toBe('deleted');
        expect(await poolWithValidator.getTxByHash(txMined.getTxHash())).toBeDefined();

        // Higher priority tx should be pending
        expect(await poolWithValidator.getTxStatus(txHigherPriority.getTxHash())).toBe('pending');
      });

      it('tx not in pruned block that is deleted should be slot-soft-deleted', async () => {
        const tx = await mockTx(1);

        // Add tx as pending (never mined, so never pruned)
        await poolWithValidator.addPendingTxs([tx]);
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('pending');

        // Make validator reject
        mockValidator.validateTx.mockResolvedValue({
          result: 'invalid',
          reason: ['invalid'],
        });

        // Protect and then unprotect - tx fails validation
        await poolWithValidator.addProtectedTxs([tx], slot1Header);
        await poolWithValidator.prepareForSlot(SlotNumber(2));

        // The tx was never in a pruned block, so it should be slot-soft-deleted
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();
      });
    });
  });

  describe('handleFailedExecution', () => {
    it('deletes failed transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      await pool.handleFailedExecution([tx.getTxHash()]);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await pool.getPendingTxCount()).toBe(0);
      expectRemovedTxs(tx);
    });

    it('removes transactions from getPendingTxHashes', async () => {
      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      const tx3 = await mockTxWithFee(3, 30);

      await pool.addPendingTxs([tx1, tx2, tx3]);
      expect(await pool.getPendingTxCount()).toBe(3);
      expectAddedTxs(tx1, tx2, tx3);

      // Mark tx2 as failed
      await pool.handleFailedExecution([tx2.getTxHash()]);

      // Verify tx2 is no longer returned by getPendingTxHashes
      const pendingHashes = toStrings(await pool.getPendingTxHashes());
      expect(pendingHashes).toHaveLength(2);
      expect(pendingHashes).toContain(hashOf(tx3)); // fee=30, highest priority
      expect(pendingHashes).toContain(hashOf(tx1)); // fee=10
      expect(pendingHashes).not.toContain(hashOf(tx2)); // deleted
      expectRemovedTxs(tx2);
    });
  });

  describe('handleFinalizedBlock', () => {
    it('permanently deletes mined transactions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks(); // handleMinedBlock is just a state transition

      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
      expectRemovedTxs(tx); // Now the tx is actually deleted
    });

    it('archives transactions if configured', async () => {
      await pool.updateConfig({ archivedTxLimit: 10 });
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks(); // handleMinedBlock is just a state transition

      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
      const archived = await pool.getArchivedTxByHash(tx.getTxHash());
      expect(archived).toBeDefined();
      expect(archived!.getTxHash().toString()).toEqual(hashOf(tx));
      expectRemovedTxs(tx); // Now the tx is actually deleted
    });
  });

  describe('state transitions', () => {
    it('pending -> protected -> mined -> deleted (happy path)', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      await pool.addProtectedTxs([tx], slot1Header);
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handleFinalizedBlock(slot1Header);
      expectRemovedTxs(tx); // Actually deleted
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
    });

    it('pending -> protected -> pending (slot passed)', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      await pool.addProtectedTxs([tx], slot1Header);
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.prepareForSlot(SlotNumber(2));
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('pending -> protected -> mined -> pending (reorg, still valid)', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.addProtectedTxs([tx], slot1Header);
      expectNoCallbacks();
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Mining supersedes protection and clears its entry, so a later reorg un-mines the tx back to
      // pending (not protected). Event-driven release then handles it like any other pending tx.
      await pool.handlePrunedBlocks(block0Id);
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('N/A -> protected -> mined -> deleted (req/resp flow)', async () => {
      const tx = await mockTx(1);

      await pool.addProtectedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks(); // State transition only
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handleFinalizedBlock(slot1Header);
      expectRemovedTxs(tx); // Actually deleted
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
    });

    it('N/A -> mined -> deleted (prover flow)', async () => {
      const tx = await mockTx(1);

      await pool.addMinedTxs([tx], slot1Header);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handleFinalizedBlock(slot1Header);
      expectRemovedTxs(tx); // Actually deleted
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
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

    it('caps priority by maxFeesPerGas when maxPriorityFeesPerGas exceeds it', async () => {
      // txGamed has absurdly high maxPriorityFeesPerGas but low maxFeesPerGas.
      // Its effective priority should be capped by maxFeesPerGas (5 + 5 = 10).
      const txGamed = await mockTx(1, {
        maxPriorityFeesPerGas: new GasFees(1000, 1000),
        maxFeesPerGas: new GasFees(5, 5),
      });

      // txHonest has properly set fees: priority 10 per dimension, max fees 10 per dimension.
      // Its effective priority = 10 + 10 = 20.
      const txHonest = await mockTxWithFee(2, 10);

      await pool.addPendingTxs([txGamed, txHonest]);

      // txHonest (effective priority 20) should rank above txGamed (effective priority 10, capped)
      const pending = toStrings(await pool.getPendingTxHashes());
      expect(pending[0]).toEqual(hashOf(txHonest));
      expect(pending[1]).toEqual(hashOf(txGamed));
    });

    it('tx with maxPriorityFeesPerGas > maxFeesPerGas does not evict properly priced tx', async () => {
      await pool.updateConfig({ maxPendingTxCount: 1 });

      // txHonest has priority fee = max fee = 10 per dimension, effective priority = 20
      const txHonest = await mockTxWithFee(1, 10);
      await pool.addPendingTxs([txHonest]);
      clearCallbackTracking();

      // txGamed tries to game priority with huge priority fees but low max fees.
      // Effective priority = min(1000, 5) + min(1000, 5) = 10, which is lower than txHonest's 20.
      const txGamed = await mockTx(2, {
        maxPriorityFeesPerGas: new GasFees(1000, 1000),
        maxFeesPerGas: new GasFees(5, 5),
      });

      const result = await pool.addPendingTxs([txGamed]);

      // txGamed should be ignored since its capped priority (10) < txHonest's priority (20)
      expect(toStrings(result.ignored)).toContain(hashOf(txGamed));
      expect(await pool.getPendingTxCount()).toBe(1);
      expect(await pool.getTxStatus(txHonest.getTxHash())).toBe('pending');
      expectNoCallbacks();
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
      await pool.handleMinedBlock(makeBlock([tx1], slot1Header));
      await pool.handleMinedBlock(makeBlock([tx2], slot2Header));

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
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
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
        await pool.handleMinedBlock(makeBlock([txs[i]], header));
        await pool.handleFinalizedBlock(header);
      }

      // Only the last 2 should be archived
      expect(await pool.getArchivedTxByHash(txs[0].getTxHash())).toBeUndefined();
      expect(await pool.getArchivedTxByHash(txs[1].getTxHash())).toBeUndefined();
      expect(await pool.getArchivedTxByHash(txs[2].getTxHash())).toBeUndefined();
      expect(await pool.getArchivedTxByHash(txs[3].getTxHash())).toBeDefined();
      expect(await pool.getArchivedTxByHash(txs[4].getTxHash())).toBeDefined();
    });

    it('archives and deletes all mined txs across many chunks when finalizing a single block', async () => {
      // Use a count larger than the internal FINALIZE_BLOCK_CHUNK_SIZE (100) so we exercise
      // the chunked path of handleFinalizedBlock.
      const txCount = 250;
      await pool.updateConfig({ archivedTxLimit: txCount });

      const txs = await timesAsync(txCount, i => mockTx(i + 1));
      await pool.addPendingTxs(txs);
      await pool.handleMinedBlock(makeBlock(txs, slot1Header));

      await pool.handleFinalizedBlock(slot1Header);

      for (const tx of txs) {
        expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
        expect(await pool.getArchivedTxByHash(tx.getTxHash())).toBeDefined();
      }
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
      await pool.handleMinedBlock(makeBlock([tx1], slot1Header));

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
      await pool.handleMinedBlock(makeBlock([tx1], slot1Header));
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
      // Set balance to cover only one tx
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT + DEFAULT_TX_FEE_LIMIT / 2n);

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
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('deleted'); // evicted
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
    });

    it('low priority tx ignored when fee payer balance exhausted by existing tx', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Balance covers only one tx
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT + DEFAULT_TX_FEE_LIMIT / 2n);

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
      // Balance covers exactly 2 tx fee limits
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT * 2n + DEFAULT_TX_FEE_LIMIT / 2n);

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
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT * 3n + DEFAULT_TX_FEE_LIMIT / 2n);

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
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT + DEFAULT_TX_FEE_LIMIT / 2n);

      // Mine the highest priority tx - this triggers balance check for sharedFeePayer
      // The fee payer balance rule will check remaining pending txs from this fee payer
      await pool.handleMinedBlock(makeBlock([txHigh], slot1Header));

      // txHigh is now mined
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('mined');
      // txMed (higher priority) should remain pending
      expect(await pool.getTxStatus(txMed.getTxHash())).toBe('pending');
      // txLow (lower priority) should be evicted due to insufficient balance
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('deleted');
    });

    it('evicts low-priority txs after CHAIN_PRUNED when balance is insufficient', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Initial balance covers both txs
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT * 2n + DEFAULT_TX_FEE_LIMIT / 2n);

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
      await pool.handleMinedBlock(makeBlock([txLow, txHigh], slot1Header));
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('mined');
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('mined');

      // Simulate reorg - balance reduced (e.g., another tx was restored)
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT + DEFAULT_TX_FEE_LIMIT / 2n); // Only enough for one tx

      await pool.handlePrunedBlocks(block0Id);

      // Low priority tx should be evicted (soft-deleted since from pruned block), high priority should be pending
      expect(await pool.getTxStatus(txHigh.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('deleted');
    });

    it('priority ordering is correct - highest priority funded first', async () => {
      const sharedFeePayer = AztecAddress.fromBigInt(999n);
      // Initial balance covers all 3 txs
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT * 3n + DEFAULT_TX_FEE_LIMIT / 2n);

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
      await pool.handleMinedBlock(makeBlock([txPriority1, txPriority5, txPriority10], slot1Header));

      // Reduce balance to only cover 2 txs before reorg
      setFeePayerBalance(DEFAULT_TX_FEE_LIMIT * 2n + DEFAULT_TX_FEE_LIMIT / 2n);

      // Reorg - triggers balance eviction
      await pool.handlePrunedBlocks(block0Id);

      // Highest (priority 10) and middle (priority 5) should remain
      // Lowest (priority 1) should be soft-deleted (from pruned block)
      expect(await pool.getTxStatus(txPriority10.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txPriority5.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txPriority1.getTxHash())).toBe('deleted');
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
      await pool.handleMinedBlock(makeBlock([txLow, txHigh], slot1Header));

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
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      // Simulate reorg - anchor block is no longer in archive
      db.findLeafIndices.mockResolvedValue([undefined]); // Block not found

      await pool.handlePrunedBlocks(block0Id);

      // Tx should be soft-deleted (from pruned block and anchor block was pruned)
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
    });

    it('keeps txs with valid anchor blocks after reorg', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));

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
      await pool.handleMinedBlock(makeBlock([txValid, txInvalid], slot1Header));

      // Get the anchor block hashes
      const validAnchorHash = await txValid.data.constants.anchorBlockHeader.hash();

      // Mock: valid anchor exists, invalid anchor does not
      db.findLeafIndices.mockImplementation((_treeId, leaves) => {
        return Promise.resolve((leaves as Fr[]).map(leaf => (leaf.equals(validAnchorHash) ? 1n : undefined)));
      });

      await pool.handlePrunedBlocks(block0Id);

      // Valid tx should be restored to pending, invalid tx should be soft-deleted (from pruned block)
      expect(await pool.getTxStatus(txValid.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(txInvalid.getTxHash())).toBe('deleted');
    });

    it('evicts all txs when shared anchor block is pruned', async () => {
      const tx1 = await mockTx(1);
      const tx2 = await mockTx(2);

      await pool.addPendingTxs([tx1, tx2]);
      await pool.handleMinedBlock(makeBlock([tx1, tx2], slot1Header));

      // Mock: anchor block does not exist (pruned)
      db.findLeafIndices.mockResolvedValue([undefined]);

      await pool.handlePrunedBlocks(block0Id);

      // Both should be soft-deleted (from pruned block and anchor block was pruned)
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('deleted');
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
      await pool.handleMinedBlock(makeBlock([tx1], slot1Header));
      await pool.handleMinedBlock(makeBlock([tx2], slot2Header));
      await pool.handleMinedBlock(makeBlock([tx3], slot3Header));

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
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');

      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      await pool.handleMinedBlock(makeBlock([tx], slot2Header));
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('mined');
    });

    it('handles consecutive reorgs', async () => {
      db.findLeafIndices.mockResolvedValue([1n]);

      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock(makeBlock([tx], slot3Header));

      // First reorg to block 2
      await pool.handlePrunedBlocks(block2Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      // Re-mine in block 3
      await pool.handleMinedBlock(makeBlock([tx], slot4Header));
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
      await pool.handleMinedBlock(makeBlock([txToMine], slot1Header));

      // txPending should be evicted (nullifier conflict with mined tx)
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('deleted');
      // txToMine should be mined
      expect(await pool.getTxStatus(txToMine.getTxHash())).toBe('mined');
    });

    it('evicts pending tx when block contains conflicting nullifier from unknown tx', async () => {
      // This tests the key behavior: we extract nullifiers directly from the block's txEffects,
      // so we can evict pending txs even if we never had the mined transaction in our pool

      const txPending = await mockPublicTx(1, 5);

      // Create a tx that the pool will never see - we'll only use it to create the block
      const txUnknown = await mockPublicTx(2, 10);
      // Give it the same nullifier as txPending
      setNullifier(txUnknown, 0, getNullifier(txPending, 0));

      // Add txPending to the pool
      await pool.addPendingTxs([txPending]);
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('pending');

      // The pool has never seen txUnknown
      expect(await pool.getTxStatus(txUnknown.getTxHash())).toBeUndefined();

      // Mine a block containing txUnknown - pool doesn't have this tx but gets its nullifiers from the block
      await pool.handleMinedBlock(makeBlock([txUnknown], slot1Header));

      // txPending should be evicted because the block contains a conflicting nullifier
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('deleted');
      // txUnknown should NOT be in the pool (we never added it)
      expect(await pool.getTxStatus(txUnknown.getTxHash())).toBeUndefined();
    });

    it('evicts multiple pending txs when block contains multiple conflicting nullifiers', async () => {
      const tx1 = await mockPublicTx(1, 5);
      const tx2 = await mockPublicTx(2, 5);
      const tx3 = await mockPublicTx(3, 5); // This one won't conflict

      // Create unknown txs with conflicting nullifiers
      const unknownTx1 = await mockPublicTx(10, 10);
      const unknownTx2 = await mockPublicTx(11, 10);
      setNullifier(unknownTx1, 0, getNullifier(tx1, 0));
      setNullifier(unknownTx2, 0, getNullifier(tx2, 0));

      // Add pending txs
      await pool.addPendingTxs([tx1, tx2, tx3]);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Mine block with unknown txs - tx1 and tx2 should be evicted, tx3 should remain
      await pool.handleMinedBlock(makeBlock([unknownTx1, unknownTx2], slot1Header));

      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('evicts pending tx when any nullifier in the block conflicts', async () => {
      // A transaction can have multiple nullifiers - test that we check all of them
      const txPending = await mockPublicTx(1, 5);

      // Create unknown tx with multiple nullifiers, one of which conflicts
      const txUnknown = await mockPublicTx(2, 10);
      // Set the second nullifier (index 1) to conflict with txPending's first nullifier
      setNullifier(txUnknown, 1, getNullifier(txPending, 0));

      await pool.addPendingTxs([txPending]);
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('pending');

      await pool.handleMinedBlock(makeBlock([txUnknown], slot1Header));

      // txPending should be evicted even though only the second nullifier conflicts
      expect(await pool.getTxStatus(txPending.getTxHash())).toBe('deleted');
    });

    it('does not evict protected txs when block contains conflicting nullifiers', async () => {
      const txProtected = await mockPublicTx(1, 5);
      const txUnknown = await mockPublicTx(2, 10);
      setNullifier(txUnknown, 0, getNullifier(txProtected, 0));

      // Add as protected
      await pool.addProtectedTxs([txProtected], slot1Header);
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBe('protected');

      // Mine block with conflicting nullifier
      await pool.handleMinedBlock(makeBlock([txUnknown], slot1Header));

      // Protected tx should still exist (eviction rules skip protected txs)
      expect(await pool.getTxStatus(txProtected.getTxHash())).toBe('protected');
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
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
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
      expect(await pool.getTxStatus(txs[0].getTxHash())).toBe('deleted'); // fee=10 evicted
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

  describe('feeOnly priority comparison', () => {
    it('default (gossip): same-fee tx can evict via hash tiebreaker at capacity', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);
      clearCallbackTracking();

      // Create a tx with the same fee as the lowest (tx1, fee=10).
      // Without feeOnly, comparePriority uses hash tiebreaker and may evict.
      const tx3 = await mockTxWithFee(3, 10);

      // Determine tiebreaker direction
      const tx3HashFr = Fr.fromHexString(tx3.getTxHash().toString());
      const tx1HashFr = Fr.fromHexString(tx1.getTxHash().toString());
      const tx3WinsTiebreaker = tx3HashFr.cmp(tx1HashFr) > 0;

      // Default: no feeOnly flag (gossip path)
      const result = await pool.addPendingTxs([tx3]);

      if (tx3WinsTiebreaker) {
        expect(toStrings(result.accepted)).toContain(hashOf(tx3));
        expect(await pool.getPendingTxCount()).toBe(2);
        expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
        expect(await pool.getTxStatus(tx3.getTxHash())).toBe('pending');
      } else {
        expect(toStrings(result.ignored)).toContain(hashOf(tx3));
        expect(await pool.getPendingTxCount()).toBe(2);
        expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
      }
    });

    it('feeOnly (RPC): same-fee tx is ignored at capacity regardless of hash', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);
      clearCallbackTracking();

      // Same fee as the lowest — with feeOnly, no hash tiebreaker, always ignored
      const tx3 = await mockTxWithFee(3, 10);
      const result = await pool.addPendingTxs([tx3], { feeComparisonOnly: true });

      expect(toStrings(result.ignored)).toContain(hashOf(tx3));
      expect(result.accepted).toHaveLength(0);
      expect(await pool.getPendingTxCount()).toBe(2);
      expectNoCallbacks();
    });

    it('feeOnly (RPC): higher-fee tx still evicts at capacity', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);
      clearCallbackTracking();

      const tx3 = await mockTxWithFee(3, 15);
      const result = await pool.addPendingTxs([tx3], { feeComparisonOnly: true });

      expect(toStrings(result.accepted)).toContain(hashOf(tx3));
      expect(await pool.getPendingTxCount()).toBe(2);
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted'); // fee=10 evicted
      expect(await pool.getTxStatus(tx3.getTxHash())).toBe('pending');
    });

    it('feeOnly (RPC): lower-fee tx is ignored at capacity', async () => {
      await pool.updateConfig({ maxPendingTxCount: 2 });

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);
      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);
      clearCallbackTracking();

      const tx3 = await mockTxWithFee(3, 5);
      const result = await pool.addPendingTxs([tx3], { feeComparisonOnly: true });

      expect(toStrings(result.ignored)).toContain(hashOf(tx3));
      expect(await pool.getPendingTxCount()).toBe(2);
      expectNoCallbacks();
    });

    it('feeOnly has no effect when pool is not at capacity', async () => {
      await pool.updateConfig({ maxPendingTxCount: 10 });

      const tx1 = await mockTxWithFee(1, 10);

      // Both modes accept when below capacity
      const result1 = await pool.addPendingTxs([tx1], { feeComparisonOnly: true });
      expect(result1.accepted).toHaveLength(1);

      const tx2 = await mockTxWithFee(2, 10);
      const result2 = await pool.addPendingTxs([tx2]);
      expect(result2.accepted).toHaveLength(1);

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

      // Operations on empty pool
      await pool.handleMinedBlock(makeEmptyBlock(slot1Header));
      await pool.handleFailedExecution([TxHash.random()]);
      await pool.handlePrunedBlocks(block0Id);
      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('handles tx added, mined, finalized in quick succession', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
    });

    it('handles duplicate handleMinedBlock calls', async () => {
      const tx = await mockTx(1);

      await pool.addPendingTxs([tx]);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      await pool.handleMinedBlock(makeBlock([tx], slot1Header)); // Duplicate

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
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
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
      highFeeTx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: DEFAULT_GAS_LIMITS,
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
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted'); // evicted
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
            new PublicDataTreeLeafPreimage(
              new PublicDataTreeLeaf(new Fr(index), new Fr(DEFAULT_TX_FEE_LIMIT + DEFAULT_TX_FEE_LIMIT / 2n)),
              Fr.ONE,
              1n,
            ),
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
      expect(await pool.getTxStatus(txLow.getTxHash())).toBe('deleted');
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
      const testStore = await openTmpStore('p2p-hydration-test');
      const testArchiveStore = await openTmpStore('archive-hydration-test');

      try {
        // Create first pool and add low priority tx
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
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
        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool2.start();

        // Verify only high priority tx survived
        expect(await pool2.getPendingTxCount()).toBe(1);
        const pendingAfterHydration = toStrings(await pool2.getPendingTxHashes());
        expect(pendingAfterHydration).toContain(hashOf(txHighPriority));

        await pool2.stop();
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('enforces pool size limit during hydration', async () => {
      const testStore = await openTmpStore('p2p-hydration-size-test');
      const testArchiveStore = await openTmpStore('archive-hydration-size-test');

      try {
        // Create pool with large limit and add many txs
        const pool1 = new AztecKVTxPoolV2(
          testStore,
          testArchiveStore,
          {
            l2BlockSource: mockL2BlockSource,
            worldStateSynchronizer: mockWorldState,
            createTxValidator: () => Promise.resolve(alwaysValidValidator),
            checkAllowedSetupCalls: () => Promise.resolve(true),
            blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
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
          testStore,
          testArchiveStore,
          {
            l2BlockSource: mockL2BlockSource,
            worldStateSynchronizer: mockWorldState,
            createTxValidator: () => Promise.resolve(alwaysValidValidator),
            checkAllowedSetupCalls: () => Promise.resolve(true),
            blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
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
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('processes txs through pre-add rules during hydration', async () => {
      const testStore = await openTmpStore('p2p-hydration-rules-test');
      const testArchiveStore = await openTmpStore('archive-hydration-rules-test');

      try {
        // Create pool and add txs
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool1.start();

        const tx1 = await mockTxWithFee(1, 10);
        const tx2 = await mockTxWithFee(2, 20);
        const tx3 = await mockTxWithFee(3, 15);

        await pool1.addPendingTxs([tx1, tx2, tx3]);
        expect(await pool1.getPendingTxCount()).toBe(3);

        await pool1.stop();

        // Hydrate into new pool
        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
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
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('mined txs are not subject to pending pool rules during hydration', async () => {
      const testStore = await openTmpStore('p2p-hydration-mined-test');
      const testArchiveStore = await openTmpStore('archive-hydration-mined-test');

      try {
        // Create pool and add tx, then mark as mined
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool1.start();

        const tx = await mockTxWithFee(1, 10);
        await pool1.addPendingTxs([tx]);
        const block = makeBlock([tx], slot1Header);
        await pool1.handleMinedBlock(block);

        expect(await pool1.getPendingTxCount()).toBe(0);
        expect(await pool1.getMinedTxCount()).toBe(1);

        await pool1.stop();

        // Mock the block source to return mined status
        mockL2BlockSource.getTxEffect.mockImplementation(async (txHash: TxHash) => {
          if (txHash.toString() === tx.getTxHash().toString()) {
            return {
              l2BlockNumber: BlockNumber(1),
              l2BlockHash: await block.hash(),
              data: block.body.txEffects[0],
              txIndexInBlock: 0,
              slotNumber: SlotNumber(1),
            };
          }
          return undefined;
        });

        // Hydrate into new pool with small limit
        const pool2 = new AztecKVTxPoolV2(
          testStore,
          testArchiveStore,
          {
            l2BlockSource: mockL2BlockSource,
            worldStateSynchronizer: mockWorldState,
            createTxValidator: () => Promise.resolve(alwaysValidValidator),
            checkAllowedSetupCalls: () => Promise.resolve(true),
            blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
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
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('rejects invalid txs during hydration validation', async () => {
      const testStore = await openTmpStore('p2p-hydration-validation-test');
      const testArchiveStore = await openTmpStore('archive-hydration-validation-test');

      try {
        // Create pool with always-valid validator and add txs
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool1.start();

        const tx1 = await mockTxWithFee(1, 10);
        const tx2 = await mockTxWithFee(2, 20);

        await pool1.addPendingTxs([tx1, tx2]);
        expect(await pool1.getPendingTxCount()).toBe(2);

        await pool1.stop();

        // Create validator that rejects tx1
        const selectiveValidator: TxValidator<TxMetaData> = {
          validateTx: (meta: TxMetaData) => {
            if (meta.txHash === tx1.getTxHash().toString()) {
              return Promise.resolve({ result: 'invalid', reason: ['test rejection'] });
            }
            return Promise.resolve({ result: 'valid' });
          },
        };

        // Hydrate into new pool with selective validator
        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(selectiveValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool2.start();

        // Only tx2 should survive (tx1 rejected by validator)
        expect(await pool2.getPendingTxCount()).toBe(1);
        const pending = toStrings(await pool2.getPendingTxHashes());
        expect(pending).toContain(hashOf(tx2));
        expect(pending).not.toContain(hashOf(tx1));

        await pool2.stop();
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('resolves nullifier conflict between pending and protected txs during hydration', async () => {
      const testStore = await openTmpStore('p2p-hydration-pending-protected-test');
      const testArchiveStore = await openTmpStore('archive-hydration-pending-protected-test');

      try {
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
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
        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool2.start();

        // Only one tx should survive - the higher priority one
        expect(await pool2.getPendingTxCount()).toBe(1);
        const pending = toStrings(await pool2.getPendingTxHashes());
        expect(pending).toContain(hashOf(txProtectedHighPriority));
        expect(pending).not.toContain(hashOf(txPendingLowPriority));

        await pool2.stop();
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('hydration recomputes allowedSetupCalls from checkAllowedSetupCalls', async () => {
      const testStore = await openTmpStore('p2p-hydration-setup-test');
      const testArchiveStore = await openTmpStore('archive-hydration-setup-test');

      try {
        // Add a tx with allowedSetupCalls=true (default for addPendingTxs)
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool1.start();

        const tx = await mockTx(1);
        await pool1.addPendingTxs([tx]);
        const txHashStr = tx.getTxHash().toString();
        expect(pool1.getPoolReadAccess().getMetadata(txHashStr)?.allowedSetupCalls).toBe(true);
        await pool1.stop();

        // Restart with checkAllowedSetupCalls returning false — metadata should reflect it
        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(false),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool2.start();

        expect(pool2.getPoolReadAccess().getMetadata(txHashStr)?.allowedSetupCalls).toBe(false);

        await pool2.stop();
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
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
      // Since tx isn't in pool yet, handleMinedBlock just processes the block (no tx to mark as mined)
      await pool.handleMinedBlock(makeEmptyBlock(slot1Header));

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

  describe('minimum transaction age (getEligiblePendingTxHashes)', () => {
    let ageStore: Awaited<ReturnType<typeof openTmpStore>>;
    let ageArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;
    let agePool: AztecKVTxPoolV2;
    let mockDateProvider: DateProvider;
    let currentTime: number;

    beforeEach(async () => {
      currentTime = 10_000;
      mockDateProvider = { now: () => currentTime } as DateProvider;

      ageStore = await openTmpStore('p2p-age');
      ageArchiveStore = await openTmpStore('archive-age');
      agePool = new AztecKVTxPoolV2(
        ageStore,
        ageArchiveStore,
        {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        },
        undefined, // telemetry
        { minTxPoolAgeMs: 2_000 },
        mockDateProvider,
      );
      await agePool.start();
    });

    afterEach(async () => {
      await agePool.stop();
      await ageStore.delete();
      await ageArchiveStore.delete();
    });

    it('newly added tx is not eligible before minTxPoolAgeMs elapses', async () => {
      const tx = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx]);

      // getPendingTxHashes returns the tx regardless of age
      expect(await agePool.getPendingTxHashes()).toHaveLength(1);

      // At the same time, the tx is NOT eligible (added at 10000, cutoff is 10000 - 2000 = 8000)
      expect(await agePool.getEligiblePendingTxHashes()).toHaveLength(0);
    });

    it('tx becomes eligible after minTxPoolAgeMs elapses', async () => {
      const tx = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx]);

      // Advance time past the minimum age
      currentTime = 12_001;

      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(tx)]);
    });

    it('tx becomes eligible at exactly minTxPoolAgeMs', async () => {
      const tx = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx]);

      // Advance time to exactly the min age boundary (added at 10000, need 12000)
      currentTime = 12_000;

      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(eligible).toHaveLength(1);
    });

    it('filters ineligible txs while returning eligible ones', async () => {
      // Add tx1 at time 10000
      const tx1 = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx1]);

      // Advance time and add tx2 at time 11000
      currentTime = 11_000;
      const tx2 = await mockTxWithFee(2, 20);
      await agePool.addPendingTxs([tx2]);

      // At time 12500: tx1 (added at 10000) is eligible, tx2 (added at 11000) is not
      currentTime = 12_500;

      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(tx1)]);

      // All are still in getPendingTxHashes
      expect(await agePool.getPendingTxHashes()).toHaveLength(2);
    });

    it('eligible txs are returned in priority order', async () => {
      // Add three txs at the same time with different priorities
      const txLow = await mockTxWithFee(1, 5);
      const txMid = await mockTxWithFee(2, 10);
      const txHigh = await mockTxWithFee(3, 20);
      await agePool.addPendingTxs([txLow, txMid, txHigh]);

      // Advance time so all are eligible
      currentTime = 13_000;

      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(txHigh), hashOf(txMid), hashOf(txLow)]);
    });

    it('hydrated txs are immediately eligible (receivedAt = 0)', async () => {
      // Add a tx, stop, and re-hydrate into a new pool
      const tx = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx]);
      await agePool.stop();

      // Set time to exactly minTxPoolAgeMs — hydrated txs (receivedAt=0) should still be eligible
      // because 0 <= (2000 - 2000) = 0
      currentTime = 2_000;

      const hydratedPool = new AztecKVTxPoolV2(
        ageStore,
        ageArchiveStore,
        {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        },
        undefined,
        { minTxPoolAgeMs: 2_000 },
        mockDateProvider,
      );
      await hydratedPool.start();

      // Hydrated tx should be immediately eligible even at time 0
      const eligible = await hydratedPool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(tx)]);

      await hydratedPool.stop();
    });

    it('updateConfig changes minTxPoolAgeMs', async () => {
      const tx = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx]);

      // Not eligible yet at default 2000ms
      expect(await agePool.getEligiblePendingTxHashes()).toHaveLength(0);

      // Reduce the minimum age to 0ms
      await agePool.updateConfig({ minTxPoolAgeMs: 0 });

      // Now the tx should be immediately eligible
      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(tx)]);
    });

    it('minTxPoolAgeMs of 0 makes all txs immediately eligible', async () => {
      await agePool.updateConfig({ minTxPoolAgeMs: 0 });

      const tx = await mockTxWithFee(1, 10);
      await agePool.addPendingTxs([tx]);

      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(tx)]);
    });

    it('protected and mined txs are excluded from eligible pending', async () => {
      const txPending = await mockTxWithFee(1, 10);
      const txProtected = await mockTxWithFee(2, 20);
      const txMined = await mockTxWithFee(3, 30);

      await agePool.addPendingTxs([txPending, txProtected, txMined]);

      // Advance time so all are old enough
      currentTime = 13_000;

      // Transition txProtected to protected and txMined to mined
      await agePool.addProtectedTxs([txProtected], slot1Header);
      await agePool.addMinedTxs([txMined], slot1Header);

      // Only the pending tx should appear in eligible results
      const eligible = await agePool.getEligiblePendingTxHashes();
      expect(toStrings(eligible)).toEqual([hashOf(txPending)]);
    });
  });

  describe('slot-based soft deletion', () => {
    it('deleted tx is retrievable and has deleted status within the same slot', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);

      // Tx is soft-deleted: status is 'deleted' but still in DB
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
    });

    it('prepareForSlot hard-deletes txs from previous slots', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      // Delete in slot 1
      await pool.prepareForSlot(SlotNumber(1));
      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);

      // Still retrievable in same slot
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();

      // Advance to slot 2 - should hard-delete
      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxByHash(tx.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });

    it('prepareForSlot with same slot preserves current-slot deletions', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      await pool.prepareForSlot(SlotNumber(1));
      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);

      // Call prepareForSlot again with same slot number
      await pool.prepareForSlot(SlotNumber(1));

      // Tx should still be retrievable (same slot)
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
    });

    it('evicted tx is retrievable until next slot', async () => {
      // Setup pool with size limit of 1
      await pool.updateConfig({ maxPendingTxCount: 1 });

      const tx1 = await mockTxWithFee(1, 10);
      const tx2 = await mockTxWithFee(2, 20);

      await pool.prepareForSlot(SlotNumber(1));
      await pool.addPendingTxs([tx1]);
      expectAddedTxs(tx1);

      // tx2 has higher fee, so tx1 gets evicted
      await pool.addPendingTxs([tx2]);
      expectAddedTxs(tx2);
      expectRemovedTxs(tx1);

      // Evicted tx1 is still retrievable (slot-soft-deleted)
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxByHash(tx1.getTxHash())).toBeDefined();

      // Advance slot - tx1 should be hard-deleted
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxByHash(tx1.getTxHash())).toBeUndefined();
    });

    it('re-added tx after slot-soft-delete is not cleaned up by prepareForSlot', async () => {
      const tx = await mockTx(1);

      await pool.prepareForSlot(SlotNumber(1));
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);

      // Delete in slot 1
      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');

      // Re-add while still soft deleted
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      // Advance to slot 2 - tx should NOT be cleaned up since it was re-added
      await pool.prepareForSlot(SlotNumber(2));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('re-added tx after prune-soft-delete is not cleaned up by handleFinalizedBlock', async () => {
      const tx = await mockTx(1);

      // Add, mine at block 1, prune
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks();
      await pool.handlePrunedBlocks(block0Id);

      // Tx is restored to pending (valid by default)
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      // Delete the tx
      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');

      // Re-add the tx
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      // Finalize block 1 - should NOT delete the re-added tx
      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
      expect(await pool.getPendingTxCount()).toBe(1);
    });

    it('re-added then re-deleted prune tx remains prune-soft-deleted until finalized', async () => {
      const tx = await mockTx(1);

      // Add, mine at block 1, prune
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));
      expectNoCallbacks();
      await pool.handlePrunedBlocks(block0Id);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');

      // Delete, re-add, delete again
      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleFailedExecution([tx.getTxHash()]);
      expectRemovedTxs(tx);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');

      // Advance slot - tx should survive because it's prune-soft-deleted, not slot-soft-deleted
      await pool.prepareForSlot(SlotNumber(1));
      await pool.prepareForSlot(SlotNumber(2));
      await pool.prepareForSlot(SlotNumber(3));

      // Still retrievable (prune-soft-deleted, not affected by slot cleanup)
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');

      // Finalize block 1 - now the tx should be hard-deleted
      await pool.handleFinalizedBlock(slot1Header);

      expect(await pool.getTxByHash(tx.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });

    it('prune-soft-deleted tx is not affected by slot cleanup', async () => {
      const mockValidator = mock<TxValidator<TxMetaData>>();
      mockValidator.validateTx.mockResolvedValue({ result: 'valid' });
      const validatorStore = await openTmpStore('p2p-slot-prune');
      const validatorArchiveStore = await openTmpStore('archive-slot-prune');
      const poolWithValidator = new AztecKVTxPoolV2(validatorStore, validatorArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(mockValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await poolWithValidator.start();

      try {
        const tx = await mockTx(1);

        // Add, mine, prune with rejection
        await poolWithValidator.addPendingTxs([tx]);
        await poolWithValidator.handleMinedBlock(makeBlock([tx], slot1Header));

        mockValidator.validateTx.mockResolvedValue({ result: 'invalid', reason: ['expired'] });
        await poolWithValidator.handlePrunedBlocks(block0Id);

        // Tx is prune-soft-deleted
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();

        // Advance many slots
        await poolWithValidator.prepareForSlot(SlotNumber(5));
        await poolWithValidator.prepareForSlot(SlotNumber(10));

        // Still present - prune deletions are not cleaned up by slot advancement
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeDefined();
        expect(await poolWithValidator.getTxStatus(tx.getTxHash())).toBe('deleted');

        // Only finalization cleans it up
        await poolWithValidator.handleFinalizedBlock(slot1Header);
        expect(await poolWithValidator.getTxByHash(tx.getTxHash())).toBeUndefined();
      } finally {
        await poolWithValidator.stop();
        await validatorStore.delete();
        await validatorArchiveStore.delete();
      }
    });

    it('finalized mined tx is slot-soft-deleted and cleaned next slot', async () => {
      const tx = await mockTx(1);
      await pool.addPendingTxs([tx]);
      expectAddedTxs(tx);
      await pool.handleMinedBlock(makeBlock([tx], slot1Header));

      await pool.prepareForSlot(SlotNumber(1));
      await pool.handleFinalizedBlock(slot1Header);
      expectRemovedTxs(tx);

      // Tx is slot-soft-deleted (was never pruned, so uses slot path)
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
      expect(await pool.getTxByHash(tx.getTxHash())).toBeDefined();

      // Advance slot - hard-deleted
      await pool.prepareForSlot(SlotNumber(2));
      expect(await pool.getTxByHash(tx.getTxHash())).toBeUndefined();
      expect(await pool.getTxStatus(tx.getTxHash())).toBeUndefined();
    });
  });

  describe('persistence consistency', () => {
    it('pool state is consistent across restart when getTxEffect throws for a later tx in batch', async () => {
      const testStore = await openTmpStore('p2p-comeback-gettxeffect');
      const testArchiveStore = await openTmpStore('archive-comeback-gettxeffect');

      try {
        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool1.start();

        // Add tx1 (fee=5) with a nullifier
        const tx1 = await mockPublicTx(1, 5);
        await pool1.addPendingTxs([tx1]);
        expect(await pool1.getTxStatus(tx1.getTxHash())).toBe('pending');

        // Create tx2 (same nullifier as tx1, higher fee — will evict tx1) and tx3 (different nullifiers)
        const tx2 = await mockPublicTx(2, 10);
        setNullifier(tx2, 0, getNullifier(tx1, 0));
        const tx3 = await mockPublicTx(3, 1);

        // Mock getTxEffect to throw for tx3 (simulates L2BlockSource I/O failure)
        const tx3HashStr = tx3.getTxHash().toString();
        mockL2BlockSource.getTxEffect.mockImplementation((txHash: TxHash) => {
          if (txHash.toString() === tx3HashStr) {
            throw new Error('Simulated L2BlockSource failure');
          }
          return Promise.resolve(undefined);
        });

        // Batch fails because tx3's getMinedBlockId throws
        await expect(pool1.addPendingTxs([tx2, tx3])).rejects.toThrow('Simulated L2BlockSource failure');

        const statusBeforeRestart = await pool1.getTxStatus(tx1.getTxHash());

        await pool1.stop();
        mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool2.start();

        const statusAfterRestart = await pool2.getTxStatus(tx1.getTxHash());
        expect(statusAfterRestart).toBe(statusBeforeRestart);

        await pool2.stop();
      } finally {
        mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });

    it('pool state is consistent across restart when validateMeta throws for a later tx in batch', async () => {
      const testStore = await openTmpStore('p2p-comeback-validatemeta');
      const testArchiveStore = await openTmpStore('archive-comeback-validatemeta');

      try {
        // Create a validator that throws (not rejects) for tx3
        let tx3HashStr = '';
        const throwingValidator: TxValidator<TxMetaData> = {
          validateTx: (meta: TxMetaData) => {
            if (meta.txHash === tx3HashStr) {
              throw new Error('Simulated validator crash');
            }
            return Promise.resolve({ result: 'valid' });
          },
        };

        const pool1 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(throwingValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool1.start();

        // Add tx1 (fee=5) with a nullifier
        const tx1 = await mockPublicTx(1, 5);
        await pool1.addPendingTxs([tx1]);
        expect(await pool1.getTxStatus(tx1.getTxHash())).toBe('pending');

        // Create tx2 (same nullifier as tx1, higher fee — will evict tx1) and tx3 (different nullifiers)
        const tx2 = await mockPublicTx(2, 10);
        setNullifier(tx2, 0, getNullifier(tx1, 0));
        const tx3 = await mockPublicTx(3, 1);
        tx3HashStr = tx3.getTxHash().toString();

        // Batch fails because tx3's validateMeta throws
        await expect(pool1.addPendingTxs([tx2, tx3])).rejects.toThrow('Simulated validator crash');

        const statusBeforeRestart = await pool1.getTxStatus(tx1.getTxHash());

        await pool1.stop();

        const pool2 = new AztecKVTxPoolV2(testStore, testArchiveStore, {
          l2BlockSource: mockL2BlockSource,
          worldStateSynchronizer: mockWorldState,
          createTxValidator: () => Promise.resolve(alwaysValidValidator),
          checkAllowedSetupCalls: () => Promise.resolve(true),
          blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        });
        await pool2.start();

        const statusAfterRestart = await pool2.getTxStatus(tx1.getTxHash());
        expect(statusAfterRestart).toBe(statusBeforeRestart);

        await pool2.stop();
      } finally {
        await testStore.delete();
        await testArchiveStore.delete();
      }
    });
  });

  describe('max fee per gas validation', () => {
    let feePool: AztecKVTxPoolV2;
    let feeStore: Awaited<ReturnType<typeof openTmpStore>>;
    let feeArchiveStore: Awaited<ReturnType<typeof openTmpStore>>;

    // Block gas fees that the validator will compare against
    const blockGasFees = new GasFees(10, 20);

    beforeEach(async () => {
      feeStore = await openTmpStore('p2p');
      feeArchiveStore = await openTmpStore('archive');
      feePool = new AztecKVTxPoolV2(feeStore, feeArchiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(new MaxFeePerGasValidator<TxMetaData>(blockGasFees)),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      });
      await feePool.start();
    });

    afterEach(async () => {
      await feePool.stop();
      await feeStore.delete();
      await feeArchiveStore.delete();
    });

    const makeTxWithMaxFees = async (seed: number, maxFeesPerGas: GasFees) => {
      const tx = await mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 1 });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({ gasLimits: DEFAULT_GAS_LIMITS, maxFeesPerGas });
      return tx;
    };

    it('accepts tx with maxFeesPerGas exactly equal to block gas fees', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(10, 20));
      const result = await feePool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
    });

    it('accepts tx with maxFeesPerGas above block gas fees', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(100, 200));
      const result = await feePool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
    });

    it('rejects tx with insufficient DA fee per gas', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(9, 20)); // DA too low
      const result = await feePool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects tx with insufficient L2 fee per gas', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(10, 19)); // L2 too low
      const result = await feePool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('rejects tx with both DA and L2 fee per gas insufficient', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(5, 10));
      const result = await feePool.addPendingTxs([tx]);
      expect(result.accepted).toHaveLength(0);
      expect(toStrings(result.rejected)).toContain(hashOf(tx));
    });

    it('handles batch with mixed sufficient and insufficient fees', async () => {
      const txGood = await makeTxWithMaxFees(1, new GasFees(10, 20));
      const txBadDA = await makeTxWithMaxFees(2, new GasFees(9, 20));
      const txBadL2 = await makeTxWithMaxFees(3, new GasFees(10, 19));
      const txAlsoGood = await makeTxWithMaxFees(4, new GasFees(50, 50));

      const result = await feePool.addPendingTxs([txGood, txBadDA, txBadL2, txAlsoGood]);

      expect(toStrings(result.accepted)).toContain(hashOf(txGood));
      expect(toStrings(result.accepted)).toContain(hashOf(txAlsoGood));
      expect(toStrings(result.rejected)).toContain(hashOf(txBadDA));
      expect(toStrings(result.rejected)).toContain(hashOf(txBadL2));
      expect(await feePool.getPendingTxCount()).toBe(2);
    });
  });

  describe('max fee per gas eviction after block mined', () => {
    // The eviction rule uses getCurrentMinFees to determine the fee threshold.
    // We use a mutable variable so each test can set the projected min fees.
    let currentMinFees = GasFees.empty();

    beforeEach(async () => {
      // Re-create the pool with a getCurrentMinFees that returns the test-controlled value
      await pool.stop();
      await store.delete();
      await archiveStore.delete();
      store = await openTmpStore('p2p');
      archiveStore = await openTmpStore('archive');
      currentMinFees = GasFees.empty();
      pool = new AztecKVTxPoolV2(store, archiveStore, {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(alwaysValidValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(currentMinFees) },
      });
      await pool.start();
    });

    const makeTxWithMaxFees = async (seed: number, maxFeesPerGas: GasFees) => {
      const tx = await mockTx(seed, {
        numberOfNonRevertiblePublicCallRequests: 1,
        maxPriorityFeesPerGas: new GasFees(1, 1),
      });
      tx.data.constants.txContext.gasSettings = GasSettings.fallback({
        gasLimits: DEFAULT_GAS_LIMITS,
        maxFeesPerGas,
        maxPriorityFeesPerGas: new GasFees(1, 1),
      });
      return tx;
    };

    const headerWithGasFees = (gasFees: GasFees) =>
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({
          blockNumber: BlockNumber(1),
          slotNumber: SlotNumber(1),
          timestamp: 0n,
          gasFees,
        }),
      });

    it('evicts pending txs when mined block has higher gas fees', async () => {
      // Txs with maxFeesPerGas = (10, 10)
      const tx1 = await makeTxWithMaxFees(1, new GasFees(10, 10));
      const tx2 = await makeTxWithMaxFees(2, new GasFees(10, 10));

      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Set projected min fees higher than txs' maxFeesPerGas
      currentMinFees = new GasFees(20, 20);
      const blockHeader = headerWithGasFees(new GasFees(20, 20));
      await pool.handleMinedBlock(makeEmptyBlock(blockHeader));

      // Both txs should be evicted since their maxFeesPerGas (10, 10) < block fees (20, 20)
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('deleted');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('deleted');
      expect(await pool.getPendingTxCount()).toBe(0);
    });

    it('keeps pending txs when their maxFeesPerGas meets block gas fees', async () => {
      // Txs with maxFeesPerGas = (50, 50)
      const tx1 = await makeTxWithMaxFees(1, new GasFees(50, 50));
      const tx2 = await makeTxWithMaxFees(2, new GasFees(50, 50));

      await pool.addPendingTxs([tx1, tx2]);
      expect(await pool.getPendingTxCount()).toBe(2);

      // Set projected min fees lower than txs' maxFeesPerGas
      currentMinFees = new GasFees(20, 20);
      const blockHeader = headerWithGasFees(new GasFees(20, 20));
      await pool.handleMinedBlock(makeEmptyBlock(blockHeader));

      // Both txs should remain pending since their maxFeesPerGas (50, 50) >= block fees (20, 20)
      expect(await pool.getTxStatus(tx1.getTxHash())).toBe('pending');
      expect(await pool.getTxStatus(tx2.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('selectively evicts only txs with insufficient fees', async () => {
      const txLowFee = await makeTxWithMaxFees(1, new GasFees(5, 5));
      const txHighFee = await makeTxWithMaxFees(2, new GasFees(50, 50));
      const txBorderline = await makeTxWithMaxFees(3, new GasFees(20, 20));

      await pool.addPendingTxs([txLowFee, txHighFee, txBorderline]);
      expect(await pool.getPendingTxCount()).toBe(3);

      // Set projected min fees to (20, 20)
      currentMinFees = new GasFees(20, 20);
      const blockHeader = headerWithGasFees(new GasFees(20, 20));
      await pool.handleMinedBlock(makeEmptyBlock(blockHeader));

      // txLowFee (5, 5) < (20, 20) -> evicted
      expect(await pool.getTxStatus(txLowFee.getTxHash())).toBe('deleted');
      // txHighFee (50, 50) >= (20, 20) -> still pending
      expect(await pool.getTxStatus(txHighFee.getTxHash())).toBe('pending');
      // txBorderline (20, 20) >= (20, 20) -> still pending (exactly equal is sufficient)
      expect(await pool.getTxStatus(txBorderline.getTxHash())).toBe('pending');
      expect(await pool.getPendingTxCount()).toBe(2);
    });

    it('evicts when only DA fee is insufficient', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(5, 50)); // DA too low, L2 fine

      await pool.addPendingTxs([tx]);
      expect(await pool.getPendingTxCount()).toBe(1);

      currentMinFees = new GasFees(20, 20);
      const blockHeader = headerWithGasFees(new GasFees(20, 20));
      await pool.handleMinedBlock(makeEmptyBlock(blockHeader));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
    });

    it('evicts when only L2 fee is insufficient', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(50, 5)); // L2 too low, DA fine

      await pool.addPendingTxs([tx]);
      expect(await pool.getPendingTxCount()).toBe(1);

      currentMinFees = new GasFees(20, 20);
      const blockHeader = headerWithGasFees(new GasFees(20, 20));
      await pool.handleMinedBlock(makeEmptyBlock(blockHeader));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('deleted');
    });

    it('does not evict when block gas fees are zero', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(10, 10));

      await pool.addPendingTxs([tx]);
      expect(await pool.getPendingTxCount()).toBe(1);

      // Mine a block with zero gas fees (GasFees.empty)
      await pool.handleMinedBlock(makeEmptyBlock(slot1Header));

      expect(await pool.getTxStatus(tx.getTxHash())).toBe('pending');
    });

    it('does not evict protected txs even with insufficient fees', async () => {
      const tx = await makeTxWithMaxFees(1, new GasFees(5, 5));

      // Add as protected (not pending)
      await pool.addProtectedTxs([tx], slot1Header);
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');

      // Set projected min fees higher than the tx's maxFeesPerGas
      currentMinFees = new GasFees(20, 20);
      const blockHeader = headerWithGasFees(new GasFees(20, 20));
      await pool.handleMinedBlock(makeEmptyBlock(blockHeader));

      // Protected tx should not be evicted (eviction rules only check pending txs)
      expect(await pool.getTxStatus(tx.getTxHash())).toBe('protected');
    });
  });
});
