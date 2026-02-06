import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
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
import { DeletedPool } from './deleted_pool.js';
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
import { type TxMetaData, type TxState, buildTxMetaData, checkNullifierConflict } from './tx_metadata.js';
import { TxPoolIndices } from './tx_pool_indices.js';

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
  #createTxValidator: TxPoolV2Dependencies['createTxValidator'];

  // === In-Memory Indices ===
  #indices: TxPoolIndices = new TxPoolIndices();

  // === Config & Services ===
  #config: TxPoolV2Config;
  #archive: TxArchive;
  #deletedPool: DeletedPool;
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
    this.#createTxValidator = deps.createTxValidator;

    this.#config = { ...DEFAULT_TX_POOL_V2_CONFIG, ...config };
    this.#archive = new TxArchive(archiveStore, this.#config.archivedTxLimit, log);
    this.#deletedPool = new DeletedPool(store, this.#txsDB, log);
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
    // Step 0: Hydrate deleted pool state
    await this.#deletedPool.hydrateFromDatabase();

    // Step 1: Load all transactions from DB (excluding soft-deleted)
    const { loaded, errors: deserializationErrors } = await this.#loadAllTxsFromDb();

    // Step 2: Check mined status for each tx
    await this.#markMinedStatusBatch(loaded.map(l => l.meta));

    // Step 3: Partition by mined status
    const mined: TxMetaData[] = [];
    const nonMined: { tx: Tx; meta: TxMetaData }[] = [];
    for (const entry of loaded) {
      if (entry.meta.minedL2BlockId !== undefined) {
        mined.push(entry.meta);
      } else {
        nonMined.push(entry);
      }
    }

    // Step 4: Validate non-mined transactions
    const { valid, invalid } = await this.#revalidateMetadata(
      nonMined.map(e => e.meta),
      'on startup',
    );

    // Step 5: Populate mined indices (these don't need conflict resolution)
    for (const meta of mined) {
      this.#indices.addMined(meta);
    }

    // Step 6: Rebuild pending pool by running pre-add rules for each tx
    // This resolves nullifier conflicts, fee payer balance issues, and pool size limits
    const { rejected } = await this.#rebuildPendingPool(valid);

    // Step 7: Delete invalid and rejected txs from DB only (indices were never populated for these)
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
    const acceptedPending = new Set<string>();

    const poolAccess = this.#createPreAddPoolAccess();

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        // Skip duplicates
        if (this.#indices.has(txHashStr)) {
          ignored.push(txHash);
          continue;
        }

        // Check mined status first (applies to all paths)
        const minedBlockId = await this.#getMinedBlockId(txHash);
        const preProtectedSlot = this.#indices.getProtectionSlot(txHashStr);

        if (minedBlockId) {
          // Already mined - add directly (protection already set if pre-protected)
          await this.#addTx(tx, { mined: minedBlockId }, opts);
          accepted.push(txHash);
        } else if (preProtectedSlot !== undefined) {
          // Pre-protected and not mined - add as protected (bypass validation)
          await this.#addTx(tx, { protected: preProtectedSlot }, opts);
          accepted.push(txHash);
        } else {
          // Regular pending tx - validate and run pre-add rules
          const result = await this.#tryAddRegularPendingTx(tx, opts, poolAccess, acceptedPending, ignored);
          if (result.status === 'accepted') {
            acceptedPending.add(txHashStr);
          } else if (result.status === 'rejected') {
            rejected.push(txHash);
          } else {
            ignored.push(txHash);
          }
        }
      }
    });

    // Build final accepted list for pending txs (excludes intra-batch evictions)
    for (const txHashStr of acceptedPending) {
      accepted.push(TxHash.fromString(txHashStr));
    }

    // Run post-add eviction rules for pending txs
    if (acceptedPending.size > 0) {
      const feePayers = Array.from(acceptedPending).map(txHash => this.#indices.getMetadata(txHash)!.feePayer);
      const uniqueFeePayers = new Set<string>(feePayers);
      await this.#evictionManager.evictAfterNewTxs(Array.from(acceptedPending), [...uniqueFeePayers]);
    }

    return { accepted, ignored, rejected };
  }

  /** Validates and adds a regular pending tx. Returns status. */
  async #tryAddRegularPendingTx(
    tx: Tx,
    opts: { source?: string },
    poolAccess: PreAddPoolAccess,
    acceptedPending: Set<string>,
    ignored: TxHash[],
  ): Promise<{ status: 'accepted' | 'ignored' | 'rejected' }> {
    const txHash = tx.getTxHash();
    const txHashStr = txHash.toString();

    // Build metadata and validate using metadata
    const meta = await buildTxMetaData(tx);
    if (!(await this.#validateMeta(meta))) {
      return { status: 'rejected' };
    }

    // Run pre-add rules
    const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

    if (preAddResult.shouldIgnore) {
      this.#log.debug(`Ignoring tx ${txHashStr}: ${preAddResult.reason}`);
      return { status: 'ignored' };
    }

    // Evict conflicts
    for (const evictHashStr of preAddResult.txHashesToEvict) {
      await this.#deleteTx(evictHashStr);
      this.#log.debug(`Evicted tx ${evictHashStr} due to higher-fee tx ${txHashStr}`);
      if (acceptedPending.has(evictHashStr)) {
        // Evicted tx was from this batch - mark as ignored in result
        acceptedPending.delete(evictHashStr);
        ignored.push(TxHash.fromString(evictHashStr));
      }
    }

    // Add the transaction
    await this.#addTx(tx, 'pending', opts);
    return { status: 'accepted' };
  }

  async canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored' | 'rejected'> {
    const txHashStr = tx.getTxHash().toString();

    // Check if already in pool
    if (this.#indices.has(txHashStr)) {
      return 'ignored';
    }

    // Build metadata and validate using metadata
    const meta = await buildTxMetaData(tx);
    const validationResult = await this.#validateMeta(meta, undefined, 'can add pending');
    if (validationResult !== true) {
      return 'rejected';
    }

    // Use pre-add rules
    const poolAccess = this.#createPreAddPoolAccess();
    const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

    return preAddResult.shouldIgnore ? 'ignored' : 'accepted';
  }

  async addProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    const slotNumber = block.globalVariables.slotNumber;

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();
        const isNew = !this.#indices.has(txHashStr);
        const minedBlockId = await this.#getMinedBlockId(txHash);

        if (isNew) {
          // New tx - add as mined or protected (callback emitted by #addTx)
          if (minedBlockId) {
            await this.#addTx(tx, { mined: minedBlockId }, opts);
            this.#indices.setProtection(txHashStr, slotNumber);
          } else {
            await this.#addTx(tx, { protected: slotNumber }, opts);
          }
        } else {
          // Existing tx - update protection and mined status
          this.#indices.updateProtection(txHashStr, slotNumber);
          if (minedBlockId) {
            const meta = this.#indices.getMetadata(txHashStr)!;
            this.#indices.markAsMined(meta, minedBlockId);
          }
        }
      }
    });
  }

  protectTxs(txHashes: TxHash[], block: BlockHeader): TxHash[] {
    const slotNumber = block.globalVariables.slotNumber;
    const missing: TxHash[] = [];

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();

      if (this.#indices.has(txHashStr)) {
        // Update protection for existing tx
        this.#indices.updateProtection(txHashStr, slotNumber);
      } else {
        // Pre-record protection for tx we don't have yet
        this.#indices.setProtection(txHashStr, slotNumber);
        missing.push(txHash);
      }
    }

    return missing;
  }

  async addMinedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    // Step 1: Build block ID
    const blockId = await this.#buildBlockId(block);

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHashStr = tx.getTxHash().toString();
        const existingMeta = this.#indices.getMetadata(txHashStr);

        if (existingMeta) {
          // Mark existing tx as mined
          this.#indices.markAsMined(existingMeta, blockId);
        } else {
          // Add new mined tx (callback emitted by #addTx)
          await this.#addTx(tx, { mined: blockId }, opts);
        }
      }
    });
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
      const meta = this.#indices.getMetadata(txHash.toString());
      if (meta) {
        feePayers.push(meta.feePayer);
        found.push(meta);
      }
    }

    // Step 4: Mark txs as mined (only those we have in the pool)
    for (const meta of found) {
      this.#indices.markAsMined(meta, blockId);
    }

    // Step 5: Run eviction rules (remove pending txs with conflicting nullifiers/expired timestamps)
    await this.#evictionManager.evictAfterNewBlock(block.header, nullifiers, feePayers);

    this.#log.info(`Marked ${found.length} txs as mined in block ${blockId.number}`);
  }

  async prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    // Step 1: Find expired protected txs
    const expiredProtected = this.#indices.findExpiredProtectedTxs(slotNumber);

    // Step 2: Clear protection for all expired entries (including those without metadata)
    this.#indices.clearProtection(expiredProtected);

    // Step 3: Filter to only txs that have metadata and are not mined
    const txsToRestore = this.#indices.filterRestorable(expiredProtected);
    if (txsToRestore.length === 0) {
      return;
    }

    this.#log.info(`Preparing for slot ${slotNumber}: unprotecting ${txsToRestore.length} txs`);

    // Step 4: Validate for pending pool
    const { valid, invalid } = await this.#revalidateMetadata(txsToRestore, 'during prepareForSlot');

    // Step 5: Resolve nullifier conflicts and add winners to pending indices
    const { added, toEvict } = this.#applyNullifierConflictResolution(valid);

    // Step 6: Delete invalid and evicted txs
    await this.#deleteTxsBatch([...invalid, ...toEvict]);

    // Step 7: Run eviction rules (enforce pool size limit)
    if (added.length > 0) {
      const feePayers = added.map(meta => meta.feePayer);
      const uniqueFeePayers = new Set<string>(feePayers);
      await this.#evictionManager.evictAfterNewTxs(
        added.map(m => m.txHash),
        [...uniqueFeePayers],
      );
    }
  }

  async handlePrunedBlocks(latestBlock: L2BlockId): Promise<void> {
    // Step 1: Find transactions mined after the prune point
    const txsToUnmine = this.#indices.findTxsMinedAfter(latestBlock.number);
    if (txsToUnmine.length === 0) {
      this.#log.debug(`No transactions to un-mine for prune to block ${latestBlock.number}`);
      return;
    }

    this.#log.info(`Handling prune to block ${latestBlock.number}: un-mining ${txsToUnmine.length} txs`);

    // Step 2: Mark ALL un-mined txs with their original mined block number
    // This ensures they get soft-deleted if removed later, and only hard-deleted
    // when their original mined block is finalized
    await this.#deletedPool.markFromPrunedBlock(
      txsToUnmine.map(m => ({
        txHash: m.txHash,
        minedAtBlock: BlockNumber(m.minedL2BlockId!.number),
      })),
    );

    // Step 3: Unmine - clear mined status from metadata
    for (const meta of txsToUnmine) {
      this.#indices.markAsUnmined(meta);
    }

    // Step 4: Filter out protected txs (they'll be handled by prepareForSlot)
    const unprotectedTxs = this.#indices.filterUnprotected(txsToUnmine);

    // Step 4: Validate for pending pool
    const { valid, invalid } = await this.#revalidateMetadata(unprotectedTxs, 'during handlePrunedBlocks');

    // Step 6: Resolve nullifier conflicts and add winners to pending indices
    const { toEvict } = this.#applyNullifierConflictResolution(valid);

    // Step 7: Delete invalid and evicted txs
    await this.#deleteTxsBatch([...invalid, ...toEvict]);

    // Step 8: Run eviction rules for ALL pending txs (not just restored ones)
    // This handles cases like existing pending txs with invalid fee payer balances
    await this.#evictionManager.evictAfterChainPrune(latestBlock.number);
  }

  async handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    // Delete failed txs
    await this.#deleteTxsBatch(txHashes.map(h => h.toString()));

    this.#log.info(`Deleted ${txHashes.length} failed txs`);
  }

  async handleFinalizedBlock(block: BlockHeader): Promise<void> {
    const blockNumber = block.globalVariables.blockNumber;

    // Step 1: Find mined txs at or before finalized block
    const minedTxsToFinalize = this.#indices.findTxsMinedAtOrBefore(blockNumber);

    // Step 2: Collect mined txs for archiving (before deletion)
    const txsToArchive: Tx[] = [];
    if (this.#archive.isEnabled()) {
      for (const txHashStr of minedTxsToFinalize) {
        const buffer = await this.#txsDB.getAsync(txHashStr);
        if (buffer) {
          txsToArchive.push(Tx.fromBuffer(buffer));
        }
      }
    }

    // Step 3: Delete mined txs from active pool
    await this.#deleteTxsBatch(minedTxsToFinalize);

    // Step 4: Finalize soft-deleted txs
    await this.#deletedPool.finalizeBlock(blockNumber);

    // Step 5: Archive mined txs
    if (txsToArchive.length > 0) {
      await this.#archive.archiveTxs(txsToArchive);
    }

    if (minedTxsToFinalize.length > 0) {
      this.#log.info(`Finalized ${minedTxsToFinalize.length} mined txs from blocks up to ${blockNumber}`);
    }
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
    return txHashes.map(h => {
      const hashStr = h.toString();
      return this.#indices.has(hashStr) || this.#deletedPool.isSoftDeleted(hashStr);
    });
  }

  getTxStatus(txHash: TxHash): TxState | undefined {
    const txHashStr = txHash.toString();
    const meta = this.#indices.getMetadata(txHashStr);
    if (meta) {
      return this.#indices.getTxState(meta);
    }
    // Check if soft-deleted
    if (this.#deletedPool.isSoftDeleted(txHashStr)) {
      return 'deleted';
    }
    return undefined;
  }

  getPendingTxHashes(): TxHash[] {
    return [...this.#indices.iteratePendingByPriority('desc')].map(hash => TxHash.fromString(hash));
  }

  getPendingTxCount(): number {
    return this.#indices.getPendingTxCount();
  }

  getMinedTxHashes(): [TxHash, L2BlockId][] {
    return this.#indices.getMinedTxs().map(([hash, blockId]) => [TxHash.fromString(hash), blockId]);
  }

  getMinedTxCount(): number {
    let count = 0;
    for (const [, meta] of this.#indices.iterateMetadata()) {
      if (meta.minedL2BlockId !== undefined) {
        count++;
      }
    }
    return count;
  }

  isEmpty(): boolean {
    return this.#indices.isEmpty();
  }

  getTxCount(): number {
    return this.#indices.getTxCount();
  }

  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#archive.getTxByHash(txHash);
  }

  getLowestPriorityPending(limit: number): TxHash[] {
    return this.#indices.getLowestPriorityPending(limit).map(h => TxHash.fromString(h));
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
      getMetadata: (txHash: string) => this.#indices.getMetadata(txHash),
      getTxHashByNullifier: (nullifier: string) => this.#indices.getTxHashByNullifier(nullifier),
      getTxHashesByFeePayer: (feePayer: string) => this.#indices.getTxHashesByFeePayer(feePayer),
      getPendingTxCount: () => this.#indices.getPendingTxCount(),
    };
  }

  // === Metrics ===

  countTxs(): { pending: number; protected: number; mined: number } {
    return this.#indices.countTxs();
  }

  // ============================================================================
  // PRIVATE HELPERS - Transaction Management
  // ============================================================================

  /**
   * Adds a new transaction to the pool with the specified state.
   * Emits onTxsAdded callback immediately after DB write.
   */
  async #addTx(
    tx: Tx,
    state: 'pending' | { protected: SlotNumber } | { mined: L2BlockId },
    opts: { source?: string } = {},
  ): Promise<TxMetaData> {
    const txHashStr = tx.getTxHash().toString();
    const meta = await buildTxMetaData(tx);

    await this.#txsDB.set(txHashStr, tx.toBuffer());
    this.#callbacks.onTxsAdded([tx], opts);

    if (state === 'pending') {
      this.#indices.addPending(meta);
    } else if ('protected' in state) {
      this.#indices.addProtected(meta, state.protected);
    } else {
      meta.minedL2BlockId = state.mined;
      this.#indices.addMined(meta);
    }

    const stateStr = typeof state === 'string' ? state : Object.keys(state)[0];
    this.#log.verbose(`Added ${stateStr} tx ${txHashStr}`, {
      eventName: 'tx-added-to-pool',
      state: stateStr,
    });

    return meta;
  }

  /**
   * Deletes a transaction from both indices and DB.
   * Emits onTxsRemoved callback immediately after DB delete.
   */
  /**
   * Deletes a transaction from the pool.
   * Delegates to DeletedPool which decides soft vs hard delete based on whether
   * the tx is from a pruned block.
   */
  async #deleteTx(txHashStr: string): Promise<void> {
    this.#indices.remove(txHashStr);
    this.#callbacks.onTxsRemoved([txHashStr]);
    await this.#deletedPool.deleteTx(txHashStr);
  }

  /** Deletes a batch of transactions, emitting callbacks individually for each. */
  async #deleteTxsBatch(txHashes: string[]): Promise<void> {
    for (const txHashStr of txHashes) {
      await this.#deleteTx(txHashStr);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS - Validation & Conflict Resolution
  // ============================================================================

  /** Validates transaction metadata, returning true if valid */
  async #validateMeta(meta: TxMetaData, validator?: TxValidator<TxMetaData>, context?: string): Promise<boolean> {
    const txValidator = validator ?? (await this.#createTxValidator());
    const result = await txValidator.validateTx(meta);
    if (result.result !== 'valid') {
      const contextStr = context ? ` ${context}` : '';
      this.#log.info(`Tx ${meta.txHash}${contextStr} failed validation: ${result.reason?.join(', ')}`);
      return false;
    }
    return true;
  }

  /** Validates metadata directly */
  async #revalidateMetadata(
    metas: TxMetaData[],
    context?: string,
  ): Promise<{ valid: TxMetaData[]; invalid: string[] }> {
    const valid: TxMetaData[] = [];
    const invalid: string[] = [];
    const validator = await this.#createTxValidator();
    for (const meta of metas) {
      if (await this.#validateMeta(meta, validator, context)) {
        valid.push(meta);
      } else {
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
        nullifier => this.#indices.getTxHashByNullifier(nullifier),
        txHash => this.#indices.getMetadata(txHash),
      );
      if (conflict.shouldIgnore) {
        // Lower priority than existing - don't add, mark for deletion
        toEvict.push(meta.txHash);
      } else {
        // Higher priority - evict existing conflicts
        toEvict.push(...conflict.txHashesToEvict);
        // Remove evicted from indices immediately for subsequent checks
        for (const evictHash of conflict.txHashesToEvict) {
          const evictMeta = this.#indices.getMetadata(evictHash);
          if (evictMeta) {
            this.#indices.removeFromPendingIndices(evictMeta);
          }
        }
        // Add to pending indices immediately so subsequent txs in the batch see this tx
        this.#indices.addToPendingIndices(meta);
        added.push(meta);
      }
    }

    return { added, toEvict };
  }

  // ============================================================================
  // PRIVATE HELPERS - Block & Hydration
  // ============================================================================

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

  /** Loads all transactions from the database, returning loaded txs and deserialization errors */
  async #loadAllTxsFromDb(): Promise<{
    loaded: { tx: Tx; meta: TxMetaData }[];
    errors: string[];
  }> {
    const loaded: { tx: Tx; meta: TxMetaData }[] = [];
    const errors: string[] = [];

    for await (const [txHashStr, buffer] of this.#txsDB.entriesAsync()) {
      // Skip soft-deleted transactions - they stay in DB but not in indices
      if (this.#deletedPool.isSoftDeleted(txHashStr)) {
        continue;
      }

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
        const evictMeta = this.#indices.getMetadata(evictHashStr);
        if (evictMeta) {
          this.#indices.removeFromPendingIndices(evictMeta);
          this.#indices.remove(evictHashStr);
          rejected.push(evictHashStr);
          accepted.delete(evictHashStr);
          this.#log.debug(`Evicted tx ${evictHashStr} during rebuild due to conflict with ${meta.txHash}`);
        }
      }

      // Add to indices
      this.#indices.addPending(meta);
      accepted.add(meta.txHash);
    }

    this.#log.info(`Rebuilt pending pool: ${accepted.size} accepted, ${rejected.length} rejected`);
    return { accepted: [...accepted], rejected };
  }

  // ============================================================================
  // PRIVATE HELPERS - Pool Access Adapters
  // ============================================================================

  #createPoolOperations(): PoolOperations {
    return {
      getPendingTxs: () => this.#indices.getPendingTxs(),
      getPendingFeePayers: () => this.#indices.getPendingFeePayers(),
      getFeePayerPendingTxs: (feePayer: string) => this.#indices.getFeePayerPendingTxs(feePayer),
      getPendingTxCount: () => this.#indices.getPendingTxCount(),
      getLowestPriorityPending: (limit: number) => this.#indices.getLowestPriorityPending(limit),
      deleteTxs: (txHashes: string[]) => this.#deleteTxsBatch(txHashes),
    };
  }

  #createPreAddPoolAccess(): PreAddPoolAccess {
    return {
      getMetadata: (txHashStr: string) => {
        const meta = this.#indices.getMetadata(txHashStr);
        if (!meta || this.#indices.getTxState(meta) !== 'pending') {
          return undefined;
        }
        return meta;
      },
      getTxHashByNullifier: (nullifier: string) => this.#indices.getTxHashByNullifier(nullifier),
      getFeePayerBalance: async (feePayer: string) => {
        const db = this.#worldStateSynchronizer.getCommitted();
        const publicStateSource = new DatabasePublicStateSource(db);
        const balance = await publicStateSource.storageRead(
          ProtocolContractAddress.FeeJuice,
          await computeFeePayerBalanceStorageSlot(AztecAddress.fromString(feePayer)),
        );
        return balance.toBigInt();
      },
      getFeePayerPendingTxs: (feePayer: string) => this.#indices.getFeePayerPendingTxs(feePayer),
      getPendingTxCount: () => this.#indices.getPendingTxCount(),
      getLowestPriorityPendingTx: () => this.#indices.getLowestPriorityPendingTx(),
    };
  }
}
