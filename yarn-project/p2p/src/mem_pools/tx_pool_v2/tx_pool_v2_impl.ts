import { SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource } from '@aztec/stdlib/trees';
import { BlockHeader, Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';

import { TxArchive } from './archive/index.js';
import {
  EvictionManager,
  FeePayerBalanceEvictionRule,
  FeePayerBalancePreAddRule,
  InvalidTxsAfterMiningRule,
  InvalidTxsAfterReorgRule,
  LowPriorityEvictionRule,
  LowPriorityPreAddRule,
  NullifierConflictRule,
  type PoolOperations,
  type PreAddPoolAccess,
} from './eviction/index.js';
import {
  type AddTxsResult,
  DEFAULT_TX_POOL_V2_CONFIG,
  type PoolReadAccess,
  type TxPoolV2Config,
  type TxPoolV2Dependencies,
} from './interfaces.js';
import { type TxMetaData, type TxState, buildTxMetaData } from './tx_metadata.js';

/**
 * Callbacks for the implementation to notify the outer class about events and metrics.
 */
export interface TxPoolV2Callbacks {
  onTxsAdded: (txs: Tx[], opts: { source?: string }) => void;
  onTxsRemoved: (txHashes: string[] | bigint[]) => void;
}

/**
 * Implementation of TxPoolV2 logic.
 *
 * This class contains all the actual transaction pool logic.
 */
export class TxPoolV2Impl {
  // === Persistence ===
  #store: AztecAsyncKVStore;
  #txsDB: AztecAsyncMap<string, Buffer>;

  // === Dependencies ===
  #l2BlockSource: L2BlockSource;
  #worldStateSynchronizer: WorldStateSynchronizer;
  #pendingTxValidator: TxValidator<Tx>;

  // === In-Memory Indices ===
  /** Primary metadata store: txHash -> TxMetaData */
  #metadata: Map<string, TxMetaData> = new Map();
  /** Nullifier to txHash index (pending txs only) */
  #nullifierToTxHash: Map<string, string> = new Map();
  /** Fee payer to txHashes index (pending txs only) */
  #feePayerToTxHashes: Map<string, Set<string>> = new Map();
  /**
   * Pending txHashes grouped by priority fee.
   * Outer map: priorityFee -> Set of txHashes at that fee level.
   */
  #pendingByPriority: Map<bigint, Set<string>> = new Map();
  /** Protected transactions: txHash -> slotNumber. Includes txs we have and txs we expect to receive. */
  #protectedTransactions: Map<string, SlotNumber> = new Map();

  // === Config & Services ===
  #config: TxPoolV2Config;
  #archive: TxArchive;
  #evictionManager: EvictionManager;
  #log: Logger;
  #callbacks: TxPoolV2Callbacks;

  constructor(
    store: AztecAsyncKVStore,
    archiveStore: AztecAsyncKVStore,
    deps: TxPoolV2Dependencies,
    callbacks: TxPoolV2Callbacks,
    config: Partial<TxPoolV2Config> = {},
    log: Logger,
  ) {
    this.#store = store;
    this.#txsDB = store.openMap('txs');

    this.#l2BlockSource = deps.l2BlockSource;
    this.#worldStateSynchronizer = deps.worldStateSynchronizer;
    this.#pendingTxValidator = deps.pendingTxValidator;

    this.#config = { ...DEFAULT_TX_POOL_V2_CONFIG, ...config };
    this.#archive = new TxArchive(archiveStore, this.#config.archivedTxLimit, log);
    this.#log = log;
    this.#callbacks = callbacks;

    // Setup eviction manager with rules
    this.#evictionManager = new EvictionManager(this.#createPoolOperations(), log);

    // Pre-add rules (run during addPendingTxs) - work with TxMetaData
    this.#evictionManager.registerPreAddRule(new NullifierConflictRule());
    this.#evictionManager.registerPreAddRule(new FeePayerBalancePreAddRule());
    this.#evictionManager.registerPreAddRule(
      new LowPriorityPreAddRule({ maxPoolSize: this.#config.maxPendingTxCount }),
    );

    // Post-event eviction rules (run after events to check ALL pending txs)
    this.#evictionManager.registerRule(new InvalidTxsAfterMiningRule());
    this.#evictionManager.registerRule(new InvalidTxsAfterReorgRule(deps.worldStateSynchronizer));
    this.#evictionManager.registerRule(new FeePayerBalanceEvictionRule(deps.worldStateSynchronizer));
    // LowPriorityEvictionRule handles cases where txs become pending via prepareForSlot (unprotect)
    // The pre-add rule handles the addPendingTxs case, but post-event is needed for unprotect
    this.#evictionManager.registerRule(new LowPriorityEvictionRule({ maxPoolSize: this.#config.maxPendingTxCount }));
  }

  // ============================================================================
  // PUBLIC IMPLEMENTATION METHODS
  // ============================================================================

  /**
   * Hydrates the in-memory state from the database on startup.
   * Pipeline: Load → Check Mined Status → Partition → Validate Non-Mined → Populate Indices → Delete Invalid
   */
  async hydrateFromDatabase(): Promise<void> {
    // Step 1: Load all transactions from DB
    const { loaded, errors: deserializationErrors } = await this.#loadAllTxsFromDb();

    // Step 2: Check mined status for each tx
    await this.#checkMinedStatusBatch(loaded);

    // Step 3: Partition by mined status
    const { mined, nonMined } = this.#partitionByMinedStatus(loaded);

    // Step 4: Validate non-mined transactions
    const { valid, invalid } = await this.#validateNonMinedTxs(nonMined);

    // Step 5: Populate indices
    this.#populateMinedIndices(mined);
    this.#populatePendingIndices(valid);

    // Step 6: Delete invalid txs from DB (deserialization errors + validation failures)
    // These were never added to indices, so we only need to remove from persistence
    const toDelete = [...deserializationErrors, ...invalid];
    if (toDelete.length === 0) {
      return;
    }
    await this.#store.transactionAsync(async () => {
      for (const txHashStr of toDelete) {
        await this.#txsDB.delete(txHashStr);
      }
    });
    this.#log.info(`Deleted ${toDelete.length} invalid transactions on startup`);
  }

  async addPendingTxs(txs: Tx[], opts: { source?: string }): Promise<AddTxsResult> {
    const state = this.#createPendingTxBatchState();
    const poolAccess = this.#createPreAddPoolAccess();

    // Step 1: Process each tx in the batch
    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        // Step 1a: Skip duplicates
        if (this.#isDuplicateTx(txHashStr)) {
          this.#log.debug(`Tx ${txHashStr} already in pool`);
          state.ignored.push(txHash);
          continue;
        }

        // Step 1b: Validate transaction
        const validationResult = await this.#pendingTxValidator.validateTx(tx);
        if (validationResult.result !== 'valid') {
          this.#log.info(`Rejecting tx ${txHashStr}: ${validationResult.reason?.join(', ')}`);
          state.rejected.push(txHash);
          continue;
        }

        // Step 1c: Build metadata and run pre-add rules
        const meta = await buildTxMetaData(tx);
        const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

        if (preAddResult.shouldIgnore) {
          // Transaction is to be ignored, it would immediately be evicted
          this.#log.debug(`Ignoring tx ${txHashStr}: ${preAddResult.reason}`);
          state.ignored.push(txHash);
          continue;
        }

        // Step 1d: Evict conflicts (tracking intra-batch evictions)
        const evictedFromBatch = await this.#evictConflictsAndTrackBatch(
          preAddResult.txHashesToEvict,
          txHashStr,
          state.acceptedInBatch,
        );
        state.ignored.push(...evictedFromBatch);

        // Step 1e: Add the transaction
        await this.#addNewPendingTx(tx);
        state.acceptedInBatch.add(txHashStr);
        state.added.push({ tx, meta });
      }
    });

    // Step 2: Filter out intra-batch evictions from final results
    const { finalTxs, finalHashes, finalFeePayers } = this.#filterIntraBatchEvictions(
      state.added,
      state.acceptedInBatch,
    );

    // Step 3: Run post-add eviction rules
    if (finalHashes.length > 0) {
      await this.#evictionManager.evictAfterNewTxs(
        finalHashes.map(h => h.toString()),
        finalFeePayers,
      );
    }

    // Step 4: Emit events
    if (finalTxs.length > 0) {
      this.#callbacks.onTxsAdded(finalTxs, opts);
    }

    return { accepted: finalHashes, ignored: state.ignored, rejected: state.rejected };
  }

  async canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored' | 'rejected'> {
    const txHashStr = tx.getTxHash().toString();

    // Check if already in pool
    if (this.#metadata.has(txHashStr)) {
      return 'ignored';
    }

    // Validate transaction
    const validationResult = await this.#pendingTxValidator.validateTx(tx);
    if (validationResult.result !== 'valid') {
      return 'rejected';
    }

    // Build metadata and use pre-add rules
    const meta = await buildTxMetaData(tx);
    const poolAccess = this.#createPreAddPoolAccess();
    const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

    return preAddResult.shouldIgnore ? 'ignored' : 'accepted';
  }

  async addProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    const slotNumber = block.globalVariables.slotNumber;
    const newlyAdded: Tx[] = [];

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHashStr = tx.getTxHash().toString();

        // Step 1: Check if tx already exists
        if (this.#metadata.has(txHashStr)) {
          // Step 2a: Update protection for existing tx
          this.#updateProtection(txHashStr, slotNumber);
          continue;
        }

        // Step 2b: Add new protected tx
        await this.#addNewProtectedTx(tx, slotNumber);
        newlyAdded.push(tx);
      }
    });

    // Step 3: Emit events for newly added txs
    if (newlyAdded.length > 0) {
      this.#callbacks.onTxsAdded(newlyAdded, opts);
    }
  }

  protectTxs(txHashes: TxHash[], block: BlockHeader): TxHash[] {
    const slotNumber = block.globalVariables.slotNumber;
    const missing: TxHash[] = [];

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();

      if (this.#metadata.has(txHashStr)) {
        // Step 1a: Update protection for existing tx
        this.#updateProtection(txHashStr, slotNumber);
      } else {
        // Step 1b: Pre-record protection for tx we don't have yet
        this.#protectedTransactions.set(txHashStr, slotNumber);
        missing.push(txHash);
      }
    }

    return missing;
  }

  async addMinedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    // Step 1: Build block ID
    const blockId = await this.#buildBlockId(block);
    const newlyAdded: Tx[] = [];

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHashStr = tx.getTxHash().toString();
        const existingMeta = this.#metadata.get(txHashStr);

        if (existingMeta) {
          // Step 2a: Mark existing tx as mined
          this.#markAsMined(existingMeta, blockId);
        } else {
          // Step 2b: Add new mined tx
          await this.#addNewMinedTx(tx, blockId);
          newlyAdded.push(tx);
        }
      }
    });

    // Step 3: Emit events for newly added txs
    if (newlyAdded.length > 0) {
      this.#callbacks.onTxsAdded(newlyAdded, opts);
    }
  }

  async handleMinedBlock(txHashes: TxHash[], block: BlockHeader): Promise<void> {
    // Step 1: Build block ID
    const blockId = await this.#buildBlockId(block);

    // Step 2: Collect info from mined txs (nullifiers, fee payers)
    const { nullifiers, feePayers, found } = this.#collectMinedTxInfo(txHashes);

    // Step 3: Mark each tx as mined
    this.#markTxsAsMined(found, blockId);

    // Step 4: Run eviction rules (remove pending txs with conflicting nullifiers/expired timestamps)
    await this.#evictionManager.evictAfterNewBlock(block, nullifiers, feePayers);

    this.#callbacks.onTxsRemoved(txHashes.map(h => h.toBigInt()));
    this.#log.info(`Marked ${found.length} txs as mined in block ${blockId.number}`);
  }

  async prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    // Step 1: Find expired protected txs
    const expiredProtected = this.#findExpiredProtectedTxs(slotNumber);

    // Step 2: Clear protection for all expired entries (including those without metadata)
    this.#clearProtection(expiredProtected);

    // Step 3: Filter to only txs that have metadata and are not mined
    const txsToRestore = this.#filterRestorable(expiredProtected);
    if (txsToRestore.length === 0) {
      return;
    }

    this.#log.info(`Preparing for slot ${slotNumber}: unprotecting ${txsToRestore.length} txs`);

    // Step 4: Validate for pending pool
    const { valid, invalid } = await this.#validateForPending(txsToRestore);

    // Step 5: Resolve nullifier conflicts and add winners to pending indices
    const { toAdd, toEvict } = this.#resolveNullifierConflicts(valid);

    // Step 6: Delete invalid and evicted txs
    await this.#deleteTxsBatch([...invalid, ...toEvict]);

    // Step 7: Run eviction rules (enforce pool size limit)
    if (toAdd.length > 0) {
      const feePayers = toAdd.map(meta => meta.feePayer);
      await this.#evictionManager.evictAfterNewTxs(
        toAdd.map(m => m.txHash),
        feePayers,
      );
    }
  }

  async handlePrunedBlocks(latestBlock: L2BlockId): Promise<void> {
    // Step 1: Find transactions mined after the prune point
    const txsToUnmine = this.#findTxsMinedAfter(latestBlock.number);
    if (txsToUnmine.length === 0) {
      this.#log.debug(`No transactions to un-mine for prune to block ${latestBlock.number}`);
      return;
    }

    this.#log.info(`Handling prune to block ${latestBlock.number}: un-mining ${txsToUnmine.length} txs`);

    // Step 2: Unmine - clear mined status from metadata
    this.#unmineTxs(txsToUnmine);

    // Step 3: Filter out protected txs (they'll be handled by prepareForSlot)
    const unprotectedTxs = this.#filterUnprotected(txsToUnmine);

    // Step 4: Validate for pending pool
    const { valid, invalid } = await this.#validateForPending(unprotectedTxs);

    // Step 5: Resolve nullifier conflicts and add winners to pending indices
    const { toEvict } = this.#resolveNullifierConflicts(valid);

    // Step 6: Delete invalid and evicted txs
    await this.#deleteTxsBatch([...invalid, ...toEvict]);

    // Step 7: Run eviction rules for ALL pending txs (not just restored ones)
    // This handles cases like existing pending txs with invalid fee payer balances
    await this.#evictionManager.evictAfterChainPrune(latestBlock.number);
  }

  async handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    // Step 1: Delete failed txs
    await this.#deleteTxsBatch(txHashes.map(h => h.toString()));

    this.#log.info(`Deleted ${txHashes.length} failed txs`);
  }

  async handleFinalizedBlock(block: BlockHeader): Promise<void> {
    const blockNumber = block.globalVariables.blockNumber;

    // Step 1: Find txs mined at or before finalized block
    const txsToFinalize = this.#findTxsMinedAtOrBefore(blockNumber);
    if (txsToFinalize.length === 0) {
      return;
    }

    // Step 2: Collect txs for archiving (before deletion)
    const txsToArchive: Tx[] = [];
    if (this.#archive.isEnabled()) {
      for (const txHashStr of txsToFinalize) {
        const buffer = await this.#txsDB.getAsync(txHashStr);
        if (buffer) {
          txsToArchive.push(Tx.fromBuffer(buffer));
        }
      }
    }

    // Step 3: Delete from active pool
    await this.#deleteTxsBatch(txsToFinalize);

    // Step 4: Archive
    if (txsToArchive.length > 0) {
      await this.#archive.archiveTxs(txsToArchive);
    }

    this.#log.info(`Finalized ${txsToFinalize.length} txs from blocks up to ${blockNumber}`);
  }

  // === Query Methods ===

  async getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#txsDB.getAsync(txHash.toString());
    return buffer ? Tx.fromBuffer(buffer) : undefined;
  }

  async getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const results: (Tx | undefined)[] = [];
    for (const h of txHashes) {
      const buffer = await this.#txsDB.getAsync(h.toString());
      results.push(buffer ? Tx.fromBuffer(buffer) : undefined);
    }
    return results;
  }

  async hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const h of txHashes) {
      results.push(await this.#txsDB.hasAsync(h.toString()));
    }
    return results;
  }

  getTxStatus(txHash: TxHash): TxState | undefined {
    const meta = this.#metadata.get(txHash.toString());
    if (!meta) {
      return undefined;
    }
    return this.#getTxState(meta);
  }

  getPendingTxHashes(): TxHash[] {
    return [...this.#iteratePendingByPriority('desc')].map(hash => TxHash.fromString(hash));
  }

  getPendingTxCount(): number {
    let count = 0;
    for (const hashes of this.#pendingByPriority.values()) {
      count += hashes.size;
    }
    return count;
  }

  getMinedTxHashes(): [TxHash, L2BlockId][] {
    const result: [TxHash, L2BlockId][] = [];
    for (const [txHash, meta] of this.#metadata) {
      if (meta.minedL2BlockId !== undefined) {
        result.push([TxHash.fromString(txHash), meta.minedL2BlockId]);
      }
    }
    return result;
  }

  getMinedTxCount(): number {
    let count = 0;
    for (const meta of this.#metadata.values()) {
      if (meta.minedL2BlockId !== undefined) {
        count++;
      }
    }
    return count;
  }

  isEmpty(): boolean {
    return this.#metadata.size === 0;
  }

  getTxCount(): number {
    return this.#metadata.size;
  }

  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#archive.getTxByHash(txHash);
  }

  getLowestPriorityPending(limit: number): TxHash[] {
    if (limit <= 0) {
      return [];
    }

    const result: TxHash[] = [];
    for (const hash of this.#iteratePendingByPriority('asc')) {
      result.push(TxHash.fromString(hash));
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }

  // === Configuration ===

  updateConfig(config: Partial<TxPoolV2Config>): void {
    if (config.maxPendingTxCount !== undefined) {
      this.#config.maxPendingTxCount = config.maxPendingTxCount;
    }
    if (config.archivedTxLimit !== undefined) {
      this.#config.archivedTxLimit = config.archivedTxLimit;
      this.#archive.updateLimit(config.archivedTxLimit);
    }
    // Update eviction rules with new config
    this.#evictionManager.updateConfig(config);
  }

  // === Pool Read Access ===

  getPoolReadAccess(): PoolReadAccess {
    return {
      getMetadata: (txHash: string) => this.#metadata.get(txHash),
      getTxHashByNullifier: (nullifier: string) => this.#nullifierToTxHash.get(nullifier),
      getTxHashesByFeePayer: (feePayer: string) => this.#feePayerToTxHashes.get(feePayer),
      getPendingTxCount: () => this.getPendingTxCount(),
    };
  }

  // === Metrics ===

  countTxs(): { pending: number; protected: number; mined: number } {
    let pending = 0;
    let protected_ = 0;
    let mined = 0;

    for (const meta of this.#metadata.values()) {
      const state = this.#getTxState(meta);
      if (state === 'pending') {
        pending++;
      } else if (state === 'protected') {
        protected_++;
      } else if (state === 'mined') {
        mined++;
      }
    }

    return { pending, protected: protected_, mined };
  }

  // ============================================================================
  // PRIVATE QUERY IMPLEMENTATIONS
  // ============================================================================

  /**
   * Derives the transaction state from its metadata and protection status.
   * A transaction is:
   * - 'mined' if it has a minedL2BlockId
   * - 'protected' if it's in the protectedTransactions map (but not mined)
   * - 'pending' otherwise
   */
  #getTxState(meta: TxMetaData): TxState {
    if (meta.minedL2BlockId !== undefined) {
      return 'mined';
    } else if (this.#protectedTransactions.has(meta.txHash)) {
      return 'protected';
    } else {
      return 'pending';
    }
  }

  /**
   * Iterates pending transaction hashes in priority order.
   * @param order - 'desc' for highest priority first, 'asc' for lowest priority first
   */
  *#iteratePendingByPriority(order: 'asc' | 'desc'): Generator<string> {
    const compareFn =
      order === 'desc'
        ? (a: bigint, b: bigint) => (b > a ? 1 : b < a ? -1 : 0)
        : (a: bigint, b: bigint) => (a > b ? 1 : a < b ? -1 : 0);

    const sortedFees = [...this.#pendingByPriority.keys()].sort(compareFn);

    for (const fee of sortedFees) {
      const hashesAtFee = this.#pendingByPriority.get(fee)!;
      // Sort hashes in same direction within fee level for deterministic ordering
      const sortedHashes =
        order === 'desc'
          ? [...hashesAtFee].sort((a, b) => (b < a ? -1 : b > a ? 1 : 0))
          : [...hashesAtFee].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const hash of sortedHashes) {
        yield hash;
      }
    }
  }

  // ============================================================================
  // HELPER FUNCTIONS - Pipeline Step Functions
  // ============================================================================

  // --- Finding & Filtering Steps ---

  /** Finds all transactions mined in blocks after the given block number */
  #findTxsMinedAfter(blockNumber: number): TxMetaData[] {
    const result: TxMetaData[] = [];
    for (const meta of this.#metadata.values()) {
      if (meta.minedL2BlockId !== undefined && meta.minedL2BlockId.number > blockNumber) {
        result.push(meta);
      }
    }
    return result;
  }

  /** Finds tx hashes mined at or before the given block number */
  #findTxsMinedAtOrBefore(blockNumber: number): string[] {
    const result: string[] = [];
    for (const [txHashStr, meta] of this.#metadata) {
      if (meta.minedL2BlockId !== undefined && meta.minedL2BlockId.number <= blockNumber) {
        result.push(txHashStr);
      }
    }
    return result;
  }

  /** Finds protected tx hashes from slots earlier than the given slot number */
  #findExpiredProtectedTxs(slotNumber: SlotNumber): string[] {
    const result: string[] = [];
    for (const [txHashStr, protectedSlot] of this.#protectedTransactions) {
      if (protectedSlot < slotNumber) {
        result.push(txHashStr);
      }
    }
    return result;
  }

  /** Filters out transactions that are currently protected */
  #filterUnprotected(txs: TxMetaData[]): TxMetaData[] {
    return txs.filter(meta => !this.#protectedTransactions.has(meta.txHash));
  }

  /** Filters to transactions that have metadata and are not mined */
  #filterRestorable(txHashes: string[]): TxMetaData[] {
    const result: TxMetaData[] = [];
    for (const txHashStr of txHashes) {
      const meta = this.#metadata.get(txHashStr);
      if (meta && meta.minedL2BlockId === undefined) {
        result.push(meta);
      }
    }
    return result;
  }

  // --- Validation & Conflict Resolution Steps ---

  /** Validates transactions for pending pool, returning valid and invalid groups */
  async #validateForPending(txs: TxMetaData[]): Promise<{ valid: TxMetaData[]; invalid: string[] }> {
    const valid: TxMetaData[] = [];
    const invalid: string[] = [];

    for (const meta of txs) {
      const buffer = await this.#txsDB.getAsync(meta.txHash);
      if (!buffer) {
        this.#log.warn(`Tx ${meta.txHash} not found in DB during validation`);
        invalid.push(meta.txHash);
        continue;
      }

      const tx = Tx.fromBuffer(buffer);
      const result = await this.#pendingTxValidator.validateTx(tx);

      if (result.result === 'valid') {
        valid.push(meta);
      } else {
        this.#log.info(`Tx ${meta.txHash} failed validation: ${result.reason?.join(', ')}`);
        invalid.push(meta.txHash);
      }
    }

    return { valid, invalid };
  }

  /**
   * Resolves nullifier conflicts between incoming txs and existing pending txs.
   * Modifies the pending indices during iteration to maintain consistent state
   * for subsequent conflict checks within the same batch.
   */
  #resolveNullifierConflicts(txs: TxMetaData[]): { toAdd: TxMetaData[]; toEvict: string[] } {
    const toAdd: TxMetaData[] = [];
    const toEvict: string[] = [];

    for (const meta of txs) {
      const conflict = this.#checkNullifierConflict(meta);
      if (conflict.shouldIgnore) {
        // Lower priority than existing - don't add, mark for deletion
        toEvict.push(meta.txHash);
      } else {
        // Higher priority - evict existing conflicts
        toEvict.push(...conflict.txHashesToEvict);
        // Remove evicted from indices immediately for subsequent checks
        for (const evictHash of conflict.txHashesToEvict) {
          const evictMeta = this.#metadata.get(evictHash);
          if (evictMeta) {
            this.#removeFromPendingIndices(evictMeta);
          }
        }
        // Add to pending indices immediately so subsequent txs in the batch see this tx
        this.#addToPendingIndices(meta);
        toAdd.push(meta);
      }
    }

    return { toAdd, toEvict };
  }

  // --- State Transition Steps ---

  /** Clears the mined status from transactions, returning them for further processing */
  #unmineTxs(txs: TxMetaData[]): TxMetaData[] {
    for (const meta of txs) {
      meta.minedL2BlockId = undefined;
    }
    return txs;
  }

  /** Removes protection from tx hashes and clears them from the protected map */
  #clearProtection(txHashes: string[]): void {
    for (const txHashStr of txHashes) {
      this.#protectedTransactions.delete(txHashStr);
    }
  }

  // --- Batch Operation Steps ---

  /** Deletes a batch of transactions permanently */
  async #deleteTxsBatch(txHashes: string[]): Promise<void> {
    if (txHashes.length === 0) {
      return;
    }

    await this.#store.transactionAsync(async () => {
      for (const txHashStr of txHashes) {
        await this.#deleteTx(txHashStr);
      }
    });

    this.#callbacks.onTxsRemoved(txHashes);
  }

  // --- Block & Tx Info Steps ---

  /** Builds a block ID from a block header */
  async #buildBlockId(block: BlockHeader): Promise<L2BlockId> {
    return {
      number: block.globalVariables.blockNumber,
      hash: (await block.hash()).toString(),
    };
  }

  /**
   * Collects information from mined transactions for eviction rules.
   * Returns nullifiers, fee payers, and the found metadata entries.
   */
  #collectMinedTxInfo(txHashes: TxHash[]): { nullifiers: string[]; feePayers: string[]; found: TxMetaData[] } {
    const nullifiers: string[] = [];
    const feePayers: string[] = [];
    const found: TxMetaData[] = [];

    for (const txHash of txHashes) {
      const meta = this.#metadata.get(txHash.toString());
      if (!meta) {
        this.#log.debug(`Tx ${txHash} not found for marking as mined`);
        continue;
      }

      nullifiers.push(...meta.nullifiers);
      feePayers.push(meta.feePayer);
      found.push(meta);
    }

    return { nullifiers, feePayers, found };
  }

  /** Marks a batch of transactions as mined */
  #markTxsAsMined(metas: TxMetaData[], blockId: L2BlockId): void {
    for (const meta of metas) {
      this.#markAsMined(meta, blockId);
    }
  }

  // --- Add Transaction Steps ---

  /** Persists a transaction to the database */
  async #persistTx(txHashStr: string, tx: Tx): Promise<void> {
    await this.#txsDB.set(txHashStr, tx.toBuffer());
  }

  /** Adds a new transaction as protected, returning its metadata */
  async #addNewProtectedTx(tx: Tx, slotNumber: SlotNumber): Promise<TxMetaData> {
    const txHashStr = tx.getTxHash().toString();
    const meta = await buildTxMetaData(tx);

    this.#protectedTransactions.set(txHashStr, slotNumber);
    await this.#persistTx(txHashStr, tx);
    this.#metadata.set(txHashStr, meta);
    // Don't add to pending indices since it's protected

    this.#log.verbose(`Added protected tx ${txHashStr} for slot ${slotNumber}`);
    return meta;
  }

  /** Adds a new transaction as mined, returning its metadata */
  async #addNewMinedTx(tx: Tx, blockId: L2BlockId): Promise<TxMetaData> {
    const txHashStr = tx.getTxHash().toString();
    const meta = await buildTxMetaData(tx);
    meta.minedL2BlockId = blockId;

    await this.#persistTx(txHashStr, tx);
    this.#metadata.set(txHashStr, meta);
    // Don't add to pending indices since it's mined

    this.#log.verbose(`Added mined tx ${txHashStr} from block ${blockId.number}`);
    return meta;
  }

  // --- Hydration Steps ---

  /** Loads all transactions from the database, returning loaded txs and deserialization errors */
  async #loadAllTxsFromDb(): Promise<{
    loaded: { txHashStr: string; tx: Tx; meta: TxMetaData }[];
    errors: string[];
  }> {
    const loaded: { txHashStr: string; tx: Tx; meta: TxMetaData }[] = [];
    const errors: string[] = [];

    for await (const [txHashStr, buffer] of this.#txsDB.entriesAsync()) {
      try {
        const tx = Tx.fromBuffer(buffer);
        const meta = await buildTxMetaData(tx);
        loaded.push({ txHashStr, tx, meta });
      } catch (err) {
        this.#log.warn(`Failed to deserialize tx ${txHashStr}, deleting`, { err });
        errors.push(txHashStr);
      }
    }

    return { loaded, errors };
  }

  /** Checks mined status for transactions by querying the block source */
  async #checkMinedStatusBatch(txs: { txHashStr: string; meta: TxMetaData }[]): Promise<void> {
    for (const { txHashStr, meta } of txs) {
      try {
        const txEffect = await this.#l2BlockSource.getTxEffect(TxHash.fromString(txHashStr));
        if (txEffect) {
          meta.minedL2BlockId = {
            number: txEffect.l2BlockNumber,
            hash: txEffect.l2BlockHash.toString(),
          };
        }
      } catch (err) {
        this.#log.warn(`Failed to check mined status for tx ${txHashStr}`, { err });
      }
    }
  }

  /** Partitions transactions by mined status */
  #partitionByMinedStatus(txs: { txHashStr: string; tx: Tx; meta: TxMetaData }[]): {
    mined: { txHashStr: string; meta: TxMetaData }[];
    nonMined: { txHashStr: string; tx: Tx; meta: TxMetaData }[];
  } {
    const mined: { txHashStr: string; meta: TxMetaData }[] = [];
    const nonMined: { txHashStr: string; tx: Tx; meta: TxMetaData }[] = [];

    for (const entry of txs) {
      if (entry.meta.minedL2BlockId !== undefined) {
        mined.push({ txHashStr: entry.txHashStr, meta: entry.meta });
      } else {
        nonMined.push(entry);
      }
    }

    return { mined, nonMined };
  }

  /** Validates non-mined transactions, returning valid metadata and invalid hashes */
  async #validateNonMinedTxs(
    txs: { txHashStr: string; tx: Tx; meta: TxMetaData }[],
  ): Promise<{ valid: TxMetaData[]; invalid: string[] }> {
    const valid: TxMetaData[] = [];
    const invalid: string[] = [];

    for (const { txHashStr, tx, meta } of txs) {
      const result = await this.#pendingTxValidator.validateTx(tx);
      if (result.result === 'valid') {
        valid.push(meta);
      } else {
        this.#log.info(`Removing invalid tx ${txHashStr} on startup: ${result.reason?.join(', ')}`);
        invalid.push(txHashStr);
      }
    }

    return { valid, invalid };
  }

  /** Populates metadata index for mined transactions */
  #populateMinedIndices(txs: { txHashStr: string; meta: TxMetaData }[]): void {
    for (const { txHashStr, meta } of txs) {
      this.#metadata.set(txHashStr, meta);
    }
  }

  /** Populates all indices for pending transactions */
  #populatePendingIndices(metas: TxMetaData[]): void {
    for (const meta of metas) {
      this.#addToIndices(meta);
    }
  }

  // --- Add Pending Tx Steps ---

  /** State tracked during batch processing of pending txs */
  #createPendingTxBatchState(): {
    ignored: TxHash[];
    rejected: TxHash[];
    added: { tx: Tx; meta: TxMetaData }[];
    acceptedInBatch: Set<string>;
  } {
    return {
      ignored: [],
      rejected: [],
      added: [],
      acceptedInBatch: new Set(),
    };
  }

  /** Checks if a tx is a duplicate (already in pool) */
  #isDuplicateTx(txHashStr: string): boolean {
    return this.#metadata.has(txHashStr);
  }

  /** Adds a new pending tx to the pool, returning its metadata */
  async #addNewPendingTx(tx: Tx): Promise<TxMetaData> {
    const txHashStr = tx.getTxHash().toString();
    const meta = await buildTxMetaData(tx);

    await this.#persistTx(txHashStr, tx);
    this.#addToIndices(meta);

    this.#log.verbose(`Added tx ${txHashStr} to pool`, {
      eventName: 'tx-added-to-pool',
      state: this.#getTxState(meta),
    });

    return meta;
  }

  /**
   * Evicts conflicting txs and tracks intra-batch evictions.
   * Returns the tx hashes that were evicted from within this batch (for moving to ignored).
   */
  async #evictConflictsAndTrackBatch(
    txHashesToEvict: string[],
    newTxHashStr: string,
    acceptedInBatch: Set<string>,
  ): Promise<TxHash[]> {
    const evictedFromBatch: TxHash[] = [];

    for (const evictHashStr of txHashesToEvict) {
      await this.#deleteTx(evictHashStr);
      this.#log.debug(`Evicted tx ${evictHashStr} due to higher-fee tx ${newTxHashStr}`);

      // Track if this eviction affects a tx added earlier in this same batch
      if (acceptedInBatch.has(evictHashStr)) {
        acceptedInBatch.delete(evictHashStr);
        evictedFromBatch.push(TxHash.fromString(evictHashStr));
      }
    }

    return evictedFromBatch;
  }

  /**
   * Filters batch results to exclude txs that were evicted by later txs in the same batch.
   * Returns the final lists of accepted txs and their fee payers.
   */
  #filterIntraBatchEvictions(
    added: { tx: Tx; meta: TxMetaData }[],
    acceptedInBatch: Set<string>,
  ): { finalTxs: Tx[]; finalHashes: TxHash[]; finalFeePayers: string[] } {
    const finalTxs: Tx[] = [];
    const finalHashes: TxHash[] = [];
    const finalFeePayers: string[] = [];

    for (const { tx, meta } of added) {
      if (acceptedInBatch.has(meta.txHash)) {
        finalTxs.push(tx);
        finalHashes.push(TxHash.fromString(meta.txHash));
        finalFeePayers.push(meta.feePayer);
      }
    }

    return { finalTxs, finalHashes, finalFeePayers };
  }

  // ============================================================================
  // HELPER FUNCTIONS - Index Management
  // ============================================================================

  #addToIndices(meta: TxMetaData): void {
    this.#metadata.set(meta.txHash, meta);

    if (this.#getTxState(meta) === 'pending') {
      this.#addToPendingIndices(meta);
    }
    // Protected and mined txs don't go into pending indices
  }

  #addToPendingIndices(meta: TxMetaData): void {
    // Add to nullifier index
    for (const nullifier of meta.nullifiers) {
      this.#nullifierToTxHash.set(nullifier, meta.txHash);
    }

    // Add to fee payer index
    let feePayerSet = this.#feePayerToTxHashes.get(meta.feePayer);
    if (!feePayerSet) {
      feePayerSet = new Set();
      this.#feePayerToTxHashes.set(meta.feePayer, feePayerSet);
    }
    feePayerSet.add(meta.txHash);

    // Add to priority bucket
    let prioritySet = this.#pendingByPriority.get(meta.priorityFee);
    if (!prioritySet) {
      prioritySet = new Set();
      this.#pendingByPriority.set(meta.priorityFee, prioritySet);
    }
    prioritySet.add(meta.txHash);
  }

  #removeFromPendingIndices(meta: TxMetaData): void {
    // Remove from nullifier index
    for (const nullifier of meta.nullifiers) {
      this.#nullifierToTxHash.delete(nullifier);
    }

    // Remove from fee payer index
    const feePayerSet = this.#feePayerToTxHashes.get(meta.feePayer);
    if (feePayerSet) {
      feePayerSet.delete(meta.txHash);
      if (feePayerSet.size === 0) {
        this.#feePayerToTxHashes.delete(meta.feePayer);
      }
    }

    // Remove from priority map
    const hashSet = this.#pendingByPriority.get(meta.priorityFee);
    if (hashSet) {
      hashSet.delete(meta.txHash);
      if (hashSet.size === 0) {
        this.#pendingByPriority.delete(meta.priorityFee);
      }
    }
  }

  /**
   * Checks if a transaction (by metadata) conflicts with existing pending txs via nullifiers.
   * Used when restoring txs to pending (unprotect, un-mine) where we have metadata but not full Tx.
   * @returns shouldIgnore=true if incoming should be dropped, or txHashesToEvict if existing should be evicted
   */
  #checkNullifierConflict(incomingMeta: TxMetaData): { shouldIgnore: boolean; txHashesToEvict: string[] } {
    const txHashesToEvict: string[] = [];

    for (const nullifier of incomingMeta.nullifiers) {
      const existingTxHashStr = this.#nullifierToTxHash.get(nullifier);
      if (!existingTxHashStr || existingTxHashStr === incomingMeta.txHash) {
        continue;
      }

      const existingMeta = this.#metadata.get(existingTxHashStr);
      if (!existingMeta) {
        continue;
      }

      // Compare priorities - higher priority wins
      if (incomingMeta.priorityFee > existingMeta.priorityFee) {
        // Incoming has higher priority - evict existing
        if (!txHashesToEvict.includes(existingTxHashStr)) {
          txHashesToEvict.push(existingTxHashStr);
        }
      } else {
        // Existing has equal or higher priority - ignore incoming
        return { shouldIgnore: true, txHashesToEvict: [] };
      }
    }

    return { shouldIgnore: false, txHashesToEvict };
  }

  #updateProtection(txHashStr: string, slotNumber: SlotNumber): void {
    const currentSlot = this.#protectedTransactions.get(txHashStr);

    // Only update if not already protected at an equal or later slot
    if (currentSlot !== undefined && currentSlot >= slotNumber) {
      return;
    }

    // Remove from pending indices if transitioning from pending to protected
    if (currentSlot === undefined) {
      const meta = this.#metadata.get(txHashStr);
      if (meta) {
        this.#removeFromPendingIndices(meta);
      }
    }

    this.#protectedTransactions.set(txHashStr, slotNumber);
  }

  #markAsMined(meta: TxMetaData, blockId: L2BlockId): void {
    meta.minedL2BlockId = blockId;
    // Safe to call unconditionally - removeFromPendingIndices is idempotent
    this.#removeFromPendingIndices(meta);
  }

  async #deleteTx(txHashStr: string): Promise<void> {
    const meta = this.#metadata.get(txHashStr);
    if (!meta) {
      return;
    }

    // Remove from all indices
    this.#metadata.delete(txHashStr);
    this.#protectedTransactions.delete(txHashStr);
    this.#removeFromPendingIndices(meta);

    // Remove from persistence
    await this.#txsDB.delete(txHashStr);
  }

  // ============================================================================
  // HELPER FUNCTIONS - Adapters
  // ============================================================================

  /** Gets all pending transactions for a given fee payer. */
  #getFeePayerPendingTxs(feePayer: string): TxMetaData[] {
    const txHashes = this.#feePayerToTxHashes.get(feePayer);
    if (!txHashes) {
      return [];
    }
    const result: TxMetaData[] = [];
    for (const txHashStr of txHashes) {
      const meta = this.#metadata.get(txHashStr);
      if (meta && this.#getTxState(meta) === 'pending') {
        result.push(meta);
      }
    }
    return result;
  }

  /**
   * Creates a PoolOperations adapter for use with the eviction manager.
   */
  #createPoolOperations(): PoolOperations {
    return {
      getPendingTxs: (): TxMetaData[] => {
        const result: TxMetaData[] = [];
        for (const hashSet of this.#pendingByPriority.values()) {
          for (const txHashStr of hashSet) {
            const meta = this.#metadata.get(txHashStr);
            if (meta) {
              result.push(meta);
            }
          }
        }
        return result;
      },
      getPendingFeePayers: (): string[] => {
        return Array.from(this.#feePayerToTxHashes.keys());
      },
      getFeePayerPendingTxs: (feePayer: string): TxMetaData[] => {
        return this.#getFeePayerPendingTxs(feePayer);
      },
      getPendingTxCount: (): number => {
        return this.getPendingTxCount();
      },
      getLowestPriorityPending: (limit: number): string[] => {
        return this.getLowestPriorityPending(limit).map(h => h.toString());
      },
      deleteTxs: async (txHashes: string[]): Promise<void> => {
        await this.#store.transactionAsync(async () => {
          for (const txHashStr of txHashes) {
            await this.#deleteTx(txHashStr);
          }
        });
        this.#callbacks.onTxsRemoved(txHashes);
      },
    };
  }

  /**
   * Creates a PreAddPoolAccess adapter for use with pre-add eviction rules.
   * All methods work with strings and TxMetaData for efficiency.
   */
  #createPreAddPoolAccess(): PreAddPoolAccess {
    return {
      getMetadata: (txHashStr: string): TxMetaData | undefined => {
        const meta = this.#metadata.get(txHashStr);
        if (!meta || this.#getTxState(meta) !== 'pending') {
          return undefined;
        }
        return meta;
      },
      getTxHashByNullifier: (nullifier: string): string | undefined => {
        return this.#nullifierToTxHash.get(nullifier);
      },
      getFeePayerBalance: async (feePayer: string): Promise<bigint> => {
        const db = this.#worldStateSynchronizer.getCommitted();
        const publicStateSource = new DatabasePublicStateSource(db);
        const balance = await publicStateSource.storageRead(
          ProtocolContractAddress.FeeJuice,
          await computeFeePayerBalanceStorageSlot(AztecAddress.fromString(feePayer)),
        );
        return balance.toBigInt();
      },
      getFeePayerPendingTxs: (feePayer: string): TxMetaData[] => {
        return this.#getFeePayerPendingTxs(feePayer);
      },
      getPendingTxCount: (): number => {
        return this.getPendingTxCount();
      },
      getLowestPriorityPendingTx: (): TxMetaData | undefined => {
        // Iterate in ascending order to find the lowest priority
        for (const txHashStr of this.#iteratePendingByPriority('asc')) {
          const meta = this.#metadata.get(txHashStr);
          if (meta) {
            return meta;
          }
        }
        return undefined;
      },
    };
  }
}
