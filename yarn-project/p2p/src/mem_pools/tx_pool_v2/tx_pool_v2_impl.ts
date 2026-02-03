import { SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block, L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
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
import {
  type TxMetaData,
  type TxState,
  buildTxMetaData,
  checkNullifierConflict,
  compareFee,
  compareTxHash,
} from './tx_metadata.js';

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
   * Pipeline: Load → Check Mined Status → Partition → Validate Non-Mined → Rebuild Pending Pool → Delete Invalid
   *
   * Note: Protected status is lost on restart. All non-mined txs are rebuilt as pending
   * by running pre-add rules to resolve nullifier conflicts, balance checks, and pool size limits.
   */
  async hydrateFromDatabase(): Promise<void> {
    // Step 1: Load all transactions from DB
    const { loaded, errors: deserializationErrors } = await this.#loadAllTxsFromDb();

    // Step 2: Check mined status for each tx
    await this.#markMinedStatusBatch(loaded.map(l => l.meta));

    // Step 3: Partition by mined status
    const { mined, nonMined } = this.#partitionByMinedStatus(loaded);

    // Step 4: Validate non-mined transactions
    const { valid, invalid } = await this.#validateNonMinedTxs(nonMined);

    // Step 5: Populate mined indices (these don't need conflict resolution)
    this.#populateMinedIndices(mined);

    // Step 6: Rebuild pending pool by running pre-add rules for each tx
    // This resolves nullifier conflicts, fee payer balance issues, and pool size limits
    const { rejected } = await this.#rebuildPendingPool(valid);

    // Step 7: Delete invalid and rejected txs from DB
    const toDelete = [...deserializationErrors, ...invalid, ...rejected];
    if (toDelete.length === 0) {
      return;
    }
    await this.#store.transactionAsync(async () => {
      for (const txHashStr of toDelete) {
        await this.#txsDB.delete(txHashStr);
      }
    });
    this.#log.info(`Deleted ${toDelete.length} invalid/rejected transactions on startup`);
  }

  async addPendingTxs(txs: Tx[], opts: { source?: string }): Promise<AddTxsResult> {
    const accepted: TxHash[] = [];
    const ignored: TxHash[] = [];
    const rejected: TxHash[] = [];
    const newlyAdded: Tx[] = [];
    const pendingAdded: { txHash: string; feePayer: string }[] = [];

    const poolAccess = this.#createPreAddPoolAccess();
    const acceptedInBatch = new Set<string>();

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        // Skip duplicates
        if (this.#isDuplicateTx(txHashStr)) {
          ignored.push(txHash);
          continue;
        }

        // Check mined status first (applies to all paths)
        const minedBlockId = await this.#getMinedBlockId(txHash);
        const preProtectedSlot = this.#protectedTransactions.get(txHashStr);

        if (minedBlockId) {
          // Already mined - add directly, preserving protection if pre-protected
          await this.#addNewMinedTx(tx, minedBlockId);
          if (preProtectedSlot !== undefined) {
            this.#protectedTransactions.set(txHashStr, preProtectedSlot);
          }
          accepted.push(txHash);
          newlyAdded.push(tx);
        } else if (preProtectedSlot !== undefined) {
          // Pre-protected and not mined - add as protected (bypass validation)
          await this.#addNewProtectedTx(tx, preProtectedSlot);
          accepted.push(txHash);
          newlyAdded.push(tx);
        } else {
          // Regular pending tx - validate and run pre-add rules
          const result = await this.#tryAddRegularPendingTx(tx, poolAccess, acceptedInBatch, ignored);
          if (result.status === 'accepted') {
            acceptedInBatch.add(txHashStr);
            newlyAdded.push(tx);
            pendingAdded.push({ txHash: txHashStr, feePayer: result.feePayer });
          } else if (result.status === 'rejected') {
            rejected.push(txHash);
          } else {
            ignored.push(txHash);
          }
        }
      }
    });

    // Build final accepted list (pending txs need intra-batch eviction filtering)
    for (const { txHash } of pendingAdded) {
      if (acceptedInBatch.has(txHash)) {
        accepted.push(TxHash.fromString(txHash));
      }
    }

    // Run post-add eviction rules for pending txs
    const pendingFeePayers = pendingAdded.filter(p => acceptedInBatch.has(p.txHash)).map(p => p.feePayer);
    if (pendingFeePayers.length > 0) {
      await this.#evictionManager.evictAfterNewTxs(
        pendingAdded.filter(p => acceptedInBatch.has(p.txHash)).map(p => p.txHash),
        pendingFeePayers,
      );
    }

    // Emit events
    if (newlyAdded.length > 0) {
      this.#callbacks.onTxsAdded(newlyAdded, opts);
    }

    return { accepted, ignored, rejected };
  }

  /** Validates and adds a regular pending tx. Returns status and fee payer if accepted. */
  async #tryAddRegularPendingTx(
    tx: Tx,
    poolAccess: PreAddPoolAccess,
    acceptedInBatch: Set<string>,
    ignored: TxHash[],
  ): Promise<{ status: 'accepted'; feePayer: string } | { status: 'ignored' | 'rejected' }> {
    const txHash = tx.getTxHash();
    const txHashStr = txHash.toString();

    // Validate transaction
    const validationResult = await this.#pendingTxValidator.validateTx(tx);
    if (validationResult.result !== 'valid') {
      this.#log.info(`Rejecting tx ${txHashStr}: ${validationResult.reason?.join(', ')}`);
      return { status: 'rejected' };
    }

    // Build metadata and run pre-add rules
    const meta = await buildTxMetaData(tx);
    const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

    if (preAddResult.shouldIgnore) {
      this.#log.debug(`Ignoring tx ${txHashStr}: ${preAddResult.reason}`);
      return { status: 'ignored' };
    }

    // Evict conflicts (tracking intra-batch evictions)
    for (const evictHashStr of preAddResult.txHashesToEvict) {
      await this.#deleteTx(evictHashStr);
      this.#log.debug(`Evicted tx ${evictHashStr} due to higher-fee tx ${txHashStr}`);
      if (acceptedInBatch.has(evictHashStr)) {
        acceptedInBatch.delete(evictHashStr);
        ignored.push(TxHash.fromString(evictHashStr));
      }
    }

    // Add the transaction
    await this.#addNewPendingTx(tx);
    return { status: 'accepted', feePayer: meta.feePayer };
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
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();
        const isNew = !this.#metadata.has(txHashStr);
        const minedBlockId = await this.#getMinedBlockId(txHash);

        if (isNew) {
          // New tx - add as mined or protected
          if (minedBlockId) {
            await this.#addNewMinedTx(tx, minedBlockId);
            this.#protectedTransactions.set(txHashStr, slotNumber);
          } else {
            await this.#addNewProtectedTx(tx, slotNumber);
          }
          newlyAdded.push(tx);
        } else {
          // Existing tx - update protection and mined status
          this.#updateProtection(txHashStr, slotNumber);
          if (minedBlockId) {
            this.#markAsMined(this.#metadata.get(txHashStr)!, minedBlockId);
          }
        }
      }
    });

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

  async handleMinedBlock(block: L2Block): Promise<void> {
    // Step 1: Build block ID
    const blockId = await this.#buildBlockId(block.header);

    // Step 2: Extract tx hashes and nullifiers directly from the block
    const txHashes = block.body.txEffects.map(tx => tx.txHash);
    const nullifiers = block.body.txEffects.flatMap(tx => tx.nullifiers.map(n => n.toString()));

    // Step 3: Collect fee payers from txs we have in the pool (for balance-based eviction)
    const feePayers: string[] = [];
    const found: TxMetaData[] = [];
    for (const txHash of txHashes) {
      const meta = this.#metadata.get(txHash.toString());
      if (meta) {
        feePayers.push(meta.feePayer);
        found.push(meta);
      }
    }

    // Step 4: Mark txs as mined (only those we have in the pool)
    this.#markTxsAsMined(found, blockId);

    // Step 5: Run eviction rules (remove pending txs with conflicting nullifiers/expired timestamps)
    await this.#evictionManager.evictAfterNewBlock(block.header, nullifiers, feePayers);

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
    const { added, toEvict } = this.#applyNullifierConflictResolution(valid);

    // Step 6: Delete invalid and evicted txs
    await this.#deleteTxsBatch([...invalid, ...toEvict]);

    // Step 7: Run eviction rules (enforce pool size limit)
    if (added.length > 0) {
      const feePayers = added.map(meta => meta.feePayer);
      await this.#evictionManager.evictAfterNewTxs(
        added.map(m => m.txHash),
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
    const { toEvict } = this.#applyNullifierConflictResolution(valid);

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

  hasTxs(txHashes: TxHash[]): boolean[] {
    return txHashes.map(h => this.#metadata.has(h.toString()));
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
    // Use shared comparators, negating for descending order
    const feeCompareFn =
      order === 'desc' ? (a: bigint, b: bigint) => compareFee(b, a) : (a: bigint, b: bigint) => compareFee(a, b);
    const hashCompareFn =
      order === 'desc' ? (a: string, b: string) => compareTxHash(b, a) : (a: string, b: string) => compareTxHash(a, b);

    const sortedFees = [...this.#pendingByPriority.keys()].sort(feeCompareFn);

    for (const fee of sortedFees) {
      const hashesAtFee = this.#pendingByPriority.get(fee)!;
      const sortedHashes = [...hashesAtFee].sort(hashCompareFn);
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
  #applyNullifierConflictResolution(txs: TxMetaData[]): { added: TxMetaData[]; toEvict: string[] } {
    const added: TxMetaData[] = [];
    const toEvict: string[] = [];

    for (const meta of txs) {
      const conflict = checkNullifierConflict(
        meta,
        nullifier => this.#nullifierToTxHash.get(nullifier),
        txHash => this.#metadata.get(txHash),
      );
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
        added.push(meta);
      }
    }

    return { added, toEvict };
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

  /** Checks if a tx is already mined and returns its block ID if so */
  async #getMinedBlockId(txHash: TxHash): Promise<L2BlockId | undefined> {
    const txEffect = await this.#l2BlockSource.getTxEffect(txHash);
    if (!txEffect) {
      return undefined;
    }
    return {
      number: txEffect.l2BlockNumber,
      hash: txEffect.l2BlockHash.toString(),
    };
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
    loaded: { tx: Tx; meta: TxMetaData }[];
    errors: string[];
  }> {
    const loaded: { tx: Tx; meta: TxMetaData }[] = [];
    const errors: string[] = [];

    for await (const [txHashStr, buffer] of this.#txsDB.entriesAsync()) {
      try {
        const tx = Tx.fromBuffer(buffer);
        const meta = await buildTxMetaData(tx);
        loaded.push({ tx, meta });
      } catch (err) {
        this.#log.warn(`Failed to deserialize tx ${txHashStr}, deleting`, { err });
        errors.push(txHashStr);
      }
    }

    return { loaded, errors };
  }

  /** Queries block source and marks mined status on transaction metadata */
  async #markMinedStatusBatch(metas: TxMetaData[]): Promise<void> {
    for (const meta of metas) {
      try {
        const txEffect = await this.#l2BlockSource.getTxEffect(TxHash.fromString(meta.txHash));
        if (txEffect) {
          meta.minedL2BlockId = {
            number: txEffect.l2BlockNumber,
            hash: txEffect.l2BlockHash.toString(),
          };
        }
      } catch (err) {
        this.#log.warn(`Failed to check mined status for tx ${meta.txHash}`, { err });
      }
    }
  }

  /** Partitions transactions by mined status */
  #partitionByMinedStatus(txs: { tx: Tx; meta: TxMetaData }[]): {
    mined: TxMetaData[];
    nonMined: { tx: Tx; meta: TxMetaData }[];
  } {
    const mined: TxMetaData[] = [];
    const nonMined: { tx: Tx; meta: TxMetaData }[] = [];

    for (const entry of txs) {
      if (entry.meta.minedL2BlockId !== undefined) {
        mined.push(entry.meta);
      } else {
        nonMined.push(entry);
      }
    }

    return { mined, nonMined };
  }

  /** Validates non-mined transactions, returning valid metadata and invalid hashes */
  async #validateNonMinedTxs(txs: { tx: Tx; meta: TxMetaData }[]): Promise<{ valid: TxMetaData[]; invalid: string[] }> {
    const valid: TxMetaData[] = [];
    const invalid: string[] = [];

    for (const { tx, meta } of txs) {
      const result = await this.#pendingTxValidator.validateTx(tx);
      if (result.result === 'valid') {
        valid.push(meta);
      } else {
        this.#log.info(`Removing invalid tx ${meta.txHash} on startup: ${result.reason?.join(', ')}`);
        invalid.push(meta.txHash);
      }
    }

    return { valid, invalid };
  }

  /** Populates metadata index for mined transactions */
  #populateMinedIndices(metas: TxMetaData[]): void {
    for (const meta of metas) {
      this.#metadata.set(meta.txHash, meta);
    }
  }

  /**
   * Rebuilds the pending pool by processing each tx through pre-add rules.
   * Starts with an empty pending pool and adds txs one by one, resolving conflicts.
   * Returns the list of accepted and rejected tx hashes.
   */
  async #rebuildPendingPool(metas: TxMetaData[]): Promise<{ accepted: string[]; rejected: string[] }> {
    const accepted = new Set<string>();
    const rejected: string[] = [];
    const poolAccess = this.#createPreAddPoolAccess();

    for (const meta of metas) {
      // Run pre-add rules against current pending pool state (metadata not yet in pool)
      const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

      if (preAddResult.shouldIgnore) {
        // Transaction rejected - mark for deletion from DB
        rejected.push(meta.txHash);
        this.#log.debug(`Rejected tx ${meta.txHash} during rebuild: ${preAddResult.reason}`);
        continue;
      }

      // Evict any conflicting txs identified by pre-add rules
      for (const evictHashStr of preAddResult.txHashesToEvict) {
        const evictMeta = this.#metadata.get(evictHashStr);
        if (evictMeta) {
          this.#removeFromPendingIndices(evictMeta);
          this.#metadata.delete(evictHashStr);
          rejected.push(evictHashStr);
          accepted.delete(evictHashStr);
          this.#log.debug(`Evicted tx ${evictHashStr} during rebuild due to conflict with ${meta.txHash}`);
        }
      }

      // Add to metadata and pending indices
      this.#addToIndices(meta);
      accepted.add(meta.txHash);
    }

    this.#log.info(`Rebuilt pending pool: ${accepted.size} accepted, ${rejected.length} rejected`);
    return { accepted: [...accepted], rejected };
  }

  // --- Add Pending Tx Steps ---

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
