import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { FifoSet } from '@aztec/foundation/fifo-set';
import type { Logger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block, L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource } from '@aztec/stdlib/trees';
import { BlockHeader, Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { TxArchive } from './archive/index.js';
import { DeletedPool } from './deleted_pool.js';
import {
  EvictionManager,
  FeePayerBalanceEvictionRule,
  FeePayerBalancePreAddRule,
  InsufficientFeePerGasEvictionRule,
  InvalidTxsAfterMiningRule,
  InvalidTxsAfterReorgRule,
  LowPriorityEvictionRule,
  LowPriorityPreAddRule,
  NullifierConflictRule,
  type PoolOperations,
  type PreAddContext,
  type PreAddPoolAccess,
  TxPoolRejectionCode,
  type TxPoolRejectionError,
} from './eviction/index.js';
import { TxPoolV2Instrumentation } from './instrumentation.js';
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
 * Maximum number of finalized txs to archive or hard-delete per serial-queue item. Bounds both
 * peak memory (~23k txs/epoch at 10 TPS would otherwise OOM the node) and, more importantly, how
 * long finalization occupies the pool's serial queue per item: gossip tx validation waits on that
 * queue, so each item must stay well under the gossipsub mcache eviction window.
 */
export const FINALIZE_BLOCK_CHUNK_SIZE = 16;

/**
 * Callbacks for the implementation to notify the outer class about events and metrics.
 */
/** A tx that has just transitioned to mined, with the time it spent in the pool. */
export interface MinedTxInfo {
  txHash: string;
  /** Wall-clock ms from receipt into the pool to being marked mined. Undefined when the
   * receive time is unknown (e.g. a tx hydrated from the DB on restart, receivedAt === 0). */
  minedDelayMs?: number;
}

export interface TxPoolV2Callbacks {
  onTxsAdded: (txs: Tx[], opts: { source?: string }) => void;
  onTxsRemoved: (txHashes: string[] | bigint[]) => void;
  onTxsMined: (minedTxs: MinedTxInfo[]) => void;
}

/**
 * Implementation of TxPoolV2 logic.
 *
 * This class contains all the actual transaction pool logic.
 */
export class TxPoolV2Impl {
  // === Persistence ===
  #store: AztecAsyncKVStore;
  /** Tx data without its proof. Proofs live in #proofsDB so a tx can be read without loading its proof. */
  #txsDB: AztecAsyncMap<string, Buffer>;
  /** Tx proofs, keyed by tx hash. Written and deleted in lockstep with #txsDB. */
  #proofsDB: AztecAsyncMap<string, Buffer>;

  // === Dependencies ===
  #l2BlockSource: L2BlockSource;
  #worldStateSynchronizer: WorldStateSynchronizer;
  #createTxValidator: TxPoolV2Dependencies['createTxValidator'];
  #checkAllowedSetupCalls: TxPoolV2Dependencies['checkAllowedSetupCalls'];

  // === In-Memory Indices ===
  #indices: TxPoolIndices = new TxPoolIndices();

  // === Config & Services ===
  #config: TxPoolV2Config;
  #archive: TxArchive;
  #deletedPool: DeletedPool;
  #evictionManager: EvictionManager;
  #dateProvider: DateProvider;
  #instrumentation: TxPoolV2Instrumentation;
  #evictedTxHashes: FifoSet<string>;
  #log: Logger;
  #callbacks: TxPoolV2Callbacks;

  constructor(
    store: AztecAsyncKVStore,
    archiveStore: AztecAsyncKVStore,
    deps: TxPoolV2Dependencies,
    callbacks: TxPoolV2Callbacks,
    telemetry: TelemetryClient,
    config: Partial<TxPoolV2Config> = {},
    dateProvider: DateProvider,
    log: Logger,
  ) {
    this.#store = store;
    this.#txsDB = store.openMap('txs');
    this.#proofsDB = store.openMap('tx_proofs');

    this.#l2BlockSource = deps.l2BlockSource;
    this.#worldStateSynchronizer = deps.worldStateSynchronizer;
    this.#createTxValidator = deps.createTxValidator;
    this.#checkAllowedSetupCalls = deps.checkAllowedSetupCalls;

    this.#config = { ...DEFAULT_TX_POOL_V2_CONFIG, ...config };
    this.#evictedTxHashes = FifoSet.withLimit<string>(this.#config.evictedTxCacheSize);
    this.#archive = new TxArchive(archiveStore, this.#config.archivedTxLimit, log);
    this.#deletedPool = new DeletedPool(store, txHashStr => this.#deleteTxData(txHashStr), log);
    this.#dateProvider = dateProvider;
    this.#instrumentation = new TxPoolV2Instrumentation(telemetry, () => this.#indices.getTotalMetadataBytes());
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
    this.#evictionManager.registerRule(new InsufficientFeePerGasEvictionRule(deps.blockMinFeesProvider));
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

    // Step 1: Stream txs from DB, building metadata and mined status one at a time.
    const minedMetas: TxMetaData[] = [];
    const pendingMetas: TxMetaData[] = [];
    const deserializationErrors: string[] = [];

    for await (const [txHashStr, buffer] of this.#txsDB.entriesAsync()) {
      // Skip soft-deleted transactions - they stay in DB but not in indices
      if (this.#deletedPool.isSoftDeleted(txHashStr)) {
        continue;
      }

      let meta: TxMetaData;
      let txEffect: Awaited<ReturnType<L2BlockSource['getTxEffect']>>;
      try {
        const tx = Tx.fromBuffer(buffer);
        // Resolve allowed-setup-calls and the tx effect concurrently
        // getTxEffect failures are non-fatal (we just treat the tx as not-yet-mined), so
        // its rejection is swallowed before the Promise.all so it can't fail-fast the batch.
        const txEffectPromise = this.#l2BlockSource.getTxEffect(tx.getTxHash()).catch(err => {
          this.#log.warn(`Failed to check mined status for tx ${txHashStr}`, { err });
          return undefined;
        });
        const [allowedSetupCalls, fetchedTxEffect] = await Promise.all([
          this.#checkAllowedSetupCalls(tx),
          txEffectPromise,
        ]);
        meta = await buildTxMetaData(tx, allowedSetupCalls);
        txEffect = fetchedTxEffect;
      } catch (err) {
        this.#log.warn(`Failed to deserialize tx ${txHashStr}, deleting`, { err });
        deserializationErrors.push(txHashStr);
        continue;
      }

      if (txEffect) {
        meta.minedL2BlockId = {
          number: txEffect.l2BlockNumber,
          hash: txEffect.l2BlockHash.toString(),
        };
      }

      if (meta.minedL2BlockId !== undefined) {
        minedMetas.push(meta);
      } else {
        pendingMetas.push(meta);
      }
    }

    // Step 2: Validate non-mined transactions
    const { valid, invalid } = await this.#revalidateMetadata(pendingMetas, 'on startup');

    // Step 3: Populate mined indices (these don't need conflict resolution)
    for (const meta of minedMetas) {
      this.#indices.addMined(meta);
    }

    // Step 4: Rebuild pending pool by running pre-add rules for each tx
    // This resolves nullifier conflicts, fee payer balance issues, and pool size limits
    const { rejected } = await this.#rebuildPendingPool(valid);

    // Step 5: Delete invalid and rejected txs from DB only (indices were never populated for these)
    const toDelete = [...deserializationErrors, ...invalid, ...rejected];
    if (toDelete.length === 0) {
      return;
    }
    await this.#store.transactionAsync(async () => {
      for (const txHashStr of toDelete) {
        await this.#deleteTxData(txHashStr);
      }
    });
    this.#log.info(`Deleted ${toDelete.length} invalid/rejected transactions on startup`, { txHashes: toDelete });
  }

  async addPendingTxs(txs: Tx[], opts: { source?: string; feeComparisonOnly?: boolean }): Promise<AddTxsResult> {
    const accepted: TxHash[] = [];
    const ignored: TxHash[] = [];
    const rejected: TxHash[] = [];
    const errors = new Map<string, TxPoolRejectionError>();
    const acceptedPending = new Set<string>();

    // Phase 1: Pre-compute all throwable I/O outside the transaction.
    // If any pre-computation throws, the entire call fails before mutations happen.
    const precomputed = new Map<string, { meta: TxMetaData; minedBlockId: L2BlockId | undefined; isValid: boolean }>();

    const validator = await this.#createTxValidator();

    for (const tx of txs) {
      const txHash = tx.getTxHash();
      const txHashStr = txHash.toString();

      const meta = await buildTxMetaData(tx);
      const minedBlockId = await this.#getMinedBlockId(txHash);

      // Validate non-mined txs (mined and pre-protected txs bypass validation inside the transaction)
      let isValid = true;
      if (!minedBlockId) {
        isValid = await this.#validateMeta(meta, validator);
      }

      precomputed.set(txHashStr, { meta, minedBlockId, isValid });
    }

    // Phase 2: Apply mutations inside the transaction using only pre-computed results,
    // in-memory reads, and buffered DB writes. Nothing here can throw an unhandled exception.
    const poolAccess = this.#createPreAddPoolAccess();
    const preAddContext: PreAddContext | undefined =
      opts.feeComparisonOnly !== undefined
        ? { feeComparisonOnly: opts.feeComparisonOnly, priceBumpPercentage: this.#config.priceBumpPercentage }
        : undefined;

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        // Skip duplicates
        if (this.#indices.has(txHashStr)) {
          ignored.push(txHash);
          continue;
        }

        const { meta, minedBlockId, isValid } = precomputed.get(txHashStr)!;
        const preProtectedSlot = this.#indices.getProtectionSlot(txHashStr);

        if (minedBlockId) {
          // Already mined - add directly (protection already set if pre-protected)
          await this.#addTx(tx, { mined: minedBlockId }, opts, meta);
          accepted.push(txHash);
        } else if (preProtectedSlot !== undefined) {
          // Pre-protected and not mined - add as protected (bypass validation)
          await this.#addTx(tx, { protected: preProtectedSlot }, opts, meta);
          accepted.push(txHash);
        } else if (!isValid) {
          // Failed pre-computed validation
          rejected.push(txHash);
        } else {
          // Regular pending tx - run pre-add rules using pre-computed metadata
          const result = await this.#tryAddRegularPendingTx(
            tx,
            meta,
            opts,
            poolAccess,
            acceptedPending,
            ignored,
            errors,
            preAddContext,
          );
          if (result.status === 'accepted') {
            acceptedPending.add(txHashStr);
          } else {
            ignored.push(txHash);
          }
        }
      }

      // Run post-add eviction rules for pending txs (inside transaction for atomicity)
      if (acceptedPending.size > 0) {
        const feePayers = Array.from(acceptedPending).map(txHash => this.#indices.getMetadata(txHash)!.feePayer);
        const uniqueFeePayers = new Set<string>(feePayers);
        await this.#evictionManager.evictAfterNewTxs(Array.from(acceptedPending), [...uniqueFeePayers]);
      }
    });

    // Build final accepted list for pending txs (excludes intra-batch evictions)
    for (const txHashStr of acceptedPending) {
      accepted.push(TxHash.fromString(txHashStr));
    }

    // Record metrics
    if (ignored.length > 0) {
      this.#instrumentation.recordIgnored(ignored.length);
    }
    if (rejected.length > 0) {
      this.#instrumentation.recordRejected(rejected.length);
    }

    return { accepted, ignored, rejected, ...(errors.size > 0 ? { errors } : {}) };
  }

  /** Adds a validated pending tx, running pre-add rules and evicting conflicts. */
  async #tryAddRegularPendingTx(
    tx: Tx,
    precomputedMeta: TxMetaData,
    opts: { source?: string },
    poolAccess: PreAddPoolAccess,
    acceptedPending: Set<string>,
    ignored: TxHash[],
    errors: Map<string, TxPoolRejectionError>,
    preAddContext?: PreAddContext,
  ): Promise<{ status: 'accepted' | 'ignored' }> {
    const txHashStr = tx.getTxHash().toString();

    // Run pre-add rules
    const preAddResult = await this.#evictionManager.runPreAddRules(precomputedMeta, poolAccess, preAddContext);

    if (preAddResult.shouldIgnore) {
      this.#log.debug(`Ignoring tx ${txHashStr}: ${preAddResult.reason?.message ?? 'unknown reason'}`);
      if (preAddResult.reason && preAddResult.reason.code !== TxPoolRejectionCode.INTERNAL_ERROR) {
        errors.set(txHashStr, preAddResult.reason);
      }
      return { status: 'ignored' };
    }

    // Evict conflicts, grouped by rule name for metrics
    if (preAddResult.evictions && preAddResult.evictions.length > 0) {
      const byReason = new Map<string, string[]>();
      for (const { txHash: evictHash, reason } of preAddResult.evictions) {
        const group = byReason.get(reason);
        if (group) {
          group.push(evictHash);
        } else {
          byReason.set(reason, [evictHash]);
        }
      }
      for (const [reason, hashes] of byReason) {
        await this.#evictTxs(hashes, reason);
      }
      for (const evictHashStr of preAddResult.txHashesToEvict) {
        this.#log.debug(`Evicted tx ${evictHashStr} due to higher-fee tx ${txHashStr}`, {
          evictedTxHash: evictHashStr,
          replacementTxHash: txHashStr,
        });
        if (acceptedPending.has(evictHashStr)) {
          // Evicted tx was from this batch - mark as ignored in result
          acceptedPending.delete(evictHashStr);
          ignored.push(TxHash.fromString(evictHashStr));
        }
      }
    }

    // Randomly drop the transaction for testing purposes (report as accepted so it propagates)
    if (this.#config.dropTransactionsProbability > 0 && Math.random() < this.#config.dropTransactionsProbability) {
      this.#log.debug(`Dropping tx ${txHashStr} (simulated drop for testing)`);
      return { status: 'accepted' };
    }

    // Add the transaction
    await this.#addTx(tx, 'pending', opts, precomputedMeta);
    return { status: 'accepted' };
  }

  async canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored'> {
    const txHashStr = tx.getTxHash().toString();

    // Check if already in pool
    if (this.#indices.has(txHashStr)) {
      this.#log.verbose(`canAddPendingTx: tx ${txHashStr} already in pool`);
      return 'ignored';
    }

    // Build metadata and check pre-add rules
    const meta = await buildTxMetaData(tx);
    const poolAccess = this.#createPreAddPoolAccess();
    const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

    if (preAddResult.shouldIgnore) {
      this.#log.verbose(`canAddPendingTx: tx ${txHashStr} ignored by pre-add rule`, {
        reason: preAddResult.reason?.message ?? 'no reason provided',
      });
      return 'ignored';
    }
    return 'accepted';
  }

  async addProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    const slotNumber = block.globalVariables.slotNumber;

    // Precompute setup-call allow-list flags outside the store transaction
    const allowedFlags = await Promise.all(txs.map(tx => this.#checkAllowedSetupCalls(tx)));

    await this.#store.transactionAsync(async () => {
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();
        const isNew = !this.#indices.has(txHashStr);
        const minedBlockId = await this.#getMinedBlockId(txHash);

        if (isNew) {
          const meta = await buildTxMetaData(tx, allowedFlags[i]);
          // New tx - add as mined or protected (callback emitted by #addTx)
          if (minedBlockId) {
            await this.#addTx(tx, { mined: minedBlockId }, opts, meta);
            this.#indices.setProtection(txHashStr, slotNumber);
          } else {
            await this.#addTx(tx, { protected: slotNumber }, opts, meta);
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

  async protectTxs(txHashes: TxHash[], block: BlockHeader): Promise<TxHash[]> {
    const slotNumber = block.globalVariables.slotNumber;
    const missing: TxHash[] = [];
    let softDeletedHits = 0;
    let missingPreviouslyEvicted = 0;

    await this.#store.transactionAsync(async () => {
      for (const txHash of txHashes) {
        const txHashStr = txHash.toString();

        if (this.#indices.has(txHashStr)) {
          // Update protection for existing tx
          this.#indices.updateProtection(txHashStr, slotNumber);
        } else if (this.#deletedPool.isSoftDeleted(txHashStr)) {
          // Resurrect soft-deleted tx as protected. Load the proof too: #addTx rewrites both entries, so re-adding
          // a proofless tx would wipe the stored proof.
          const buffer = await this.#txsDB.getAsync(txHashStr);
          if (buffer) {
            const tx = await this.#loadTxWithProof(txHashStr, buffer);
            await this.#addTx(tx, { protected: slotNumber });
            softDeletedHits++;
          } else {
            // Data missing despite soft-delete flag — treat as truly missing
            this.#indices.setProtection(txHashStr, slotNumber);
            missing.push(txHash);
          }
        } else {
          // Truly missing — pre-record protection for tx we don't have yet
          this.#indices.setProtection(txHashStr, slotNumber);
          missing.push(txHash);
          if (this.#evictedTxHashes.has(txHashStr)) {
            missingPreviouslyEvicted++;
          }
        }
      }
    });

    // Record metrics
    if (softDeletedHits > 0) {
      this.#instrumentation.recordSoftDeletedHits(softDeletedHits);
    }
    if (missing.length > 0) {
      this.#log.debug(`protectTxs missing tx hashes: ${missing.map(h => h.toString()).join(', ')}`);
      this.#instrumentation.recordMissingOnProtect(missing.length);
    }
    if (missingPreviouslyEvicted > 0) {
      this.#instrumentation.recordMissingPreviouslyEvicted(missingPreviouslyEvicted);
    }

    this.#log.info(
      `Protected ${txHashes.length} txs, missing: ${missing.length}, soft-deleted hits: ${softDeletedHits}`,
    );

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
        await this.#deletedPool.clearIfMinedHigher(txHashStr, blockId.number);
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

    await this.#store.transactionAsync(async () => {
      // Step 4: Mark txs as mined (only those we have in the pool)
      for (const meta of found) {
        this.#indices.markAsMined(meta, blockId);
        await this.#deletedPool.clearIfMinedHigher(meta.txHash, blockId.number);
      }

      // Step 5: Run post-event eviction rules (inside transaction for atomicity)
      await this.#evictionManager.evictAfterNewBlock(block.header, nullifiers, feePayers);
    });

    if (found.length > 0) {
      // receivedAt is 0 for txs hydrated from the DB on restart (true receive time lost) — leave
      // their delay undefined so the metric isn't polluted by epoch-sized values.
      const now = this.#dateProvider.now();
      this.#callbacks.onTxsMined(
        found.map(m => ({
          txHash: m.txHash,
          minedDelayMs: m.receivedAt > 0 ? now - m.receivedAt : undefined,
        })),
      );
    }

    this.#log.info(`Marked ${found.length} txs as mined in block ${blockId.number}`);
  }

  async prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    await this.#store.transactionAsync(async () => {
      // Step 0: Clean up slot-deleted txs from previous slots
      await this.#deletedPool.cleanupSlotDeleted(slotNumber);

      // Step 1: Find expired protected txs
      const expiredProtected = this.#indices.findExpiredProtectedTxs(slotNumber);

      // Step 2: Clear protection for all expired entries (including those without metadata)
      this.#indices.clearProtection(expiredProtected);

      // Step 3: Filter to only txs that have metadata and are not mined
      const txsToRestore = this.#indices.filterRestorable(expiredProtected);
      if (txsToRestore.length === 0) {
        this.#log.debug(`Preparing for slot ${slotNumber}, no txs to unprotect`);
        return;
      }

      this.#log.info(`Preparing for slot ${slotNumber}: unprotecting ${txsToRestore.length} txs`);
      await this.#restoreUnprotectedToPending(txsToRestore, 'during prepareForSlot');
    });
  }

  async unprotectTxs(txHashes: TxHash[], slotNumber: SlotNumber): Promise<void> {
    const hashStrs = txHashes.map(h => h.toString());

    await this.#store.transactionAsync(async () => {
      // Only release entries still recorded at this exact slot. A tx that another, still-live proposal
      // raised to a higher slot via updateProtection must keep that protection. Mined txs have no
      // protection entry and so are never matched here.
      const matching = this.#indices.findProtectedTxsAtSlot(hashStrs, slotNumber);
      if (matching.length === 0) {
        this.#log.debug(`Unprotecting txs for slot ${slotNumber}: no matching protections to release`);
        return;
      }

      this.#indices.clearProtection(matching);

      const txsToRestore = this.#indices.filterRestorable(matching);
      if (txsToRestore.length === 0) {
        return;
      }

      this.#log.info(`Unprotecting ${txsToRestore.length} txs from failed proposal at slot ${slotNumber}`);
      await this.#restoreUnprotectedToPending(txsToRestore, 'during unprotectTxs');
    });
  }

  /**
   * Returns just-unprotected txs to the pending pool: revalidates them, resolves nullifier
   * conflicts, deletes losers, then enforces the pool size limit. Must run inside a store
   * transaction; callers clear the protection entries before invoking.
   */
  async #restoreUnprotectedToPending(txsToRestore: TxMetaData[], context: string): Promise<void> {
    // Step 1: Validate for pending pool
    const { valid, invalid } = await this.#revalidateMetadata(txsToRestore, context);

    // Step 2: Resolve nullifier conflicts and add winners to pending indices
    const { added, toEvict } = this.#applyNullifierConflictResolution(valid);

    // Step 3: Delete invalid txs and evict conflict losers
    await this.#deleteTxsBatch(invalid);
    await this.#evictTxs(toEvict, 'NullifierConflict');

    // Step 4: Run eviction rules (enforce pool size limit)
    if (added.length > 0) {
      const feePayers = added.map(meta => meta.feePayer);
      const uniqueFeePayers = new Set<string>(feePayers);
      await this.#evictionManager.evictAfterNewTxs(
        added.map(m => m.txHash),
        [...uniqueFeePayers],
      );
    }
  }

  async handlePrunedBlocks(latestBlock: L2BlockId, options?: { deleteAllTxs?: boolean }): Promise<void> {
    // Step 1: Find transactions mined after the prune point
    const txsToUnmine = this.#indices.findTxsMinedAfter(latestBlock.number);
    if (txsToUnmine.length === 0) {
      this.#log.debug(`No transactions to un-mine for prune to block ${latestBlock.number}`);
      return;
    }

    this.#log.info(`Handling prune to block ${latestBlock.number}: un-mining ${txsToUnmine.length} txs`);

    await this.#store.transactionAsync(async () => {
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

      // If deleteAllTxs is set (epoch prune), delete all un-mined txs and return early
      if (options?.deleteAllTxs) {
        const allTxHashes = txsToUnmine.map(m => m.txHash);
        await this.#deleteTxsBatch(allTxHashes);
        this.#log.info(
          `Handled prune to block ${latestBlock.number} with deleteAllTxs: deleted ${allTxHashes.length} txs`,
        );
        return;
      }

      // Step 4: Filter out protected txs (they'll be handled by prepareForSlot)
      const unprotectedTxs = this.#indices.filterUnprotected(txsToUnmine);

      // Step 5: Validate for pending pool
      const { valid, invalid } = await this.#revalidateMetadata(unprotectedTxs, 'during handlePrunedBlocks');

      // Step 6: Resolve nullifier conflicts and add winners to pending indices
      const { toEvict } = this.#applyNullifierConflictResolution(valid);

      // Step 7: Delete invalid txs and evict conflict losers
      await this.#deleteTxsBatch(invalid);
      await this.#evictTxs(toEvict, 'NullifierConflict');

      this.#log.info(
        `Handled prune to block ${latestBlock.number}: ${valid.length} txs restored to pending, ${invalid.length} invalid, ${toEvict.length} evicted due to nullifier conflicts`,
        { txHashesRestored: valid.map(m => m.txHash), txHashesInvalid: invalid, txHashesEvicted: toEvict },
      );

      // Step 8: Run eviction rules for ALL pending txs (not just restored ones)
      // This handles cases like existing pending txs with invalid fee payer balances
      await this.#evictionManager.evictAfterChainPrune(latestBlock.number);
    });
  }

  async handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    await this.#store.transactionAsync(async () => {
      await this.#deleteTxsBatch(txHashes.map(h => h.toString()));
    });

    this.#log.info(`Deleted ${txHashes.length} failed txs`, { txHashes: txHashes.map(h => h.toString()) });
  }

  /**
   * Resolves what a finalized block event should process: the cutoff block and the mined txs at or
   * before it. The wrapper feeds the result to archiveFinalizedTxs / finalizeTxs in chunks, each as
   * its own serial-queue item, so gossip-driven pool operations can interleave with finalization
   * instead of stalling behind an entire epoch's worth of tx processing.
   */
  async prepareFinalization(block: BlockHeader): Promise<{ cutoffBlock: BlockNumber; txHashes: string[] }> {
    // Hold finalized txs for a configurable margin behind the finalized tip so a prover still
    // proving an epoch with already-finalized blocks isn't starved of its txs. 0 deletes at the finalized tip.
    const cutoffBlock = await this.#finalizationCutoffBlock(block);
    return { cutoffBlock, txHashes: this.#indices.findTxsMinedAtOrBefore(cutoffBlock) };
  }

  /**
   * Copies the given finalized txs into the archive. The pool stores txs proof-stripped, which is
   * exactly the archive format, so buffers are copied as-is without deserialization.
   */
  async archiveFinalizedTxs(txHashes: string[]): Promise<void> {
    if (!this.#archive.isEnabled()) {
      return;
    }
    const entries: { txHash: string; buffer: Buffer }[] = [];
    for (const txHash of txHashes) {
      const buffer = await this.#txsDB.getAsync(txHash);
      if (buffer) {
        entries.push({ txHash, buffer });
      }
    }
    await this.#archive.archiveTxBuffers(entries);
  }

  /**
   * Deletes a batch of finalized mined txs from the active pool. Callers may invoke this in
   * chunks: a crash between chunks leaves some finalized txs mined, and the next finalized-block
   * event lists and deletes them again (the operation is idempotent), so per-chunk atomicity is
   * sufficient.
   */
  async deleteFinalizedTxs(txHashes: string[]): Promise<void> {
    await this.#store.transactionAsync(async () => {
      await this.#deleteTxsBatch(txHashes);
    });
  }

  /** Finalizes soft-deleted txs up to the cutoff and logs the completed finalization. */
  async completeFinalization(
    txHashes: string[],
    cutoffBlock: BlockNumber,
    finalizedBlockNumber: BlockNumber,
  ): Promise<void> {
    await this.#store.transactionAsync(async () => {
      await this.#deletedPool.finalizeBlock(cutoffBlock);
    });

    if (txHashes.length > 0) {
      this.#log.info(`Finalized ${txHashes.length} mined txs from blocks up to ${cutoffBlock}`, {
        txHashes,
        finalizedBlockNumber,
        cutoffBlock,
      });
    }
  }

  /**
   * Resolves the block up to which finalized txs may be deleted, given `keepFinalizedTxsForSlots`.
   * With a margin of 0 this is just the finalized block. Otherwise we keep txs whose block is within
   * the margin (in slots) of the finalized tip: take the target slot `finalizedSlot - margin`, find the
   * latest checkpoint at or before it with a single reverse range query (`limit: 1`), and use that
   * checkpoint's last block as the cutoff. This rounds to a checkpoint boundary, so it can retain slightly
   * more than the configured margin but never less, and never deletes past the finalized block.
   */
  async #finalizationCutoffBlock(block: BlockHeader): Promise<BlockNumber> {
    const keepSlots = this.#config.keepFinalizedTxsForSlots;
    if (keepSlots <= 0) {
      return block.globalVariables.blockNumber;
    }

    // The goal here really is to ensure we keep transactions long enough for them to be proven.
    // So we could be smart and calculate the number of slots until the end of the proof submission window.
    // Our approach here is a lot simpler however and we just keep transactions for the configured number
    // of slots past L1 finalisation. This means we may keep transactions in the mined pool for longer
    // than strictly necessary.
    const targetSlot = block.getSlot() - keepSlots;
    if (targetSlot < 0) {
      // The margin reaches past genesis: keep everything.
      return BlockNumber(0);
    }

    const [checkpoint] = await this.#l2BlockSource.getCheckpointsData({
      fromSlot: SlotNumber(targetSlot),
      limit: 1,
      reverse: true,
    });
    // No checkpoint at or before the target slot (e.g. early chain): keep everything.
    return checkpoint ? BlockNumber(checkpoint.startBlock + checkpoint.blockCount - 1) : BlockNumber(0);
  }

  // === Query Methods ===

  async getTxByHash(txHash: TxHash, opts: { includeProof?: boolean } = {}): Promise<Tx | undefined> {
    const txHashStr = txHash.toString();
    const buffer = await this.#txsDB.getAsync(txHashStr);
    if (!buffer) {
      return undefined;
    }
    return opts.includeProof === false ? Tx.fromBuffer(buffer) : this.#loadTxWithProof(txHashStr, buffer);
  }

  async getTxsByHash(txHashes: TxHash[], opts: { includeProof?: boolean } = {}): Promise<(Tx | undefined)[]> {
    const results: (Tx | undefined)[] = [];
    for (const h of txHashes) {
      results.push(await this.getTxByHash(h, opts));
    }
    return results;
  }

  /** Deserializes a tx blob loaded from #txsDB together with its separately-stored proof. */
  async #loadTxWithProof(txHashStr: string, buffer: Buffer): Promise<Tx> {
    const proofBuffer = await this.#proofsDB.getAsync(txHashStr);
    if (!proofBuffer) {
      // #addTx always writes a proof entry (an empty proof serializes to a 4-byte sentinel), so a missing entry
      // means the blob/proof invariant is broken. Return the proofless tx but flag it, since a consumer that needs
      // the proof (eg serving peers) would otherwise fail far away from the root cause.
      this.#log.warn(`Missing stored proof for tx ${txHashStr}`, { txHash: txHashStr });
      return Tx.fromBuffer(buffer);
    }
    return Tx.fromBuffers(buffer, proofBuffer);
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

  getEligiblePendingTxHashes(): TxHash[] {
    const maxReceivedAt = this.#dateProvider.now() - this.#config.minTxPoolAgeMs;
    return [...this.#indices.iterateEligiblePendingByPriority('desc', maxReceivedAt)].map(hash =>
      TxHash.fromString(hash),
    );
  }

  getPendingTxCount(): number {
    return this.#indices.getPendingTxCount();
  }

  hasEligiblePendingTxs(minCount: number): boolean {
    const maxReceivedAt = this.#dateProvider.now() - this.#config.minTxPoolAgeMs;
    return this.#indices.hasEligiblePendingTxs(maxReceivedAt, minCount);
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
    if (config.minTxPoolAgeMs !== undefined) {
      this.#config.minTxPoolAgeMs = config.minTxPoolAgeMs;
    }
    if (config.keepFinalizedTxsForSlots !== undefined) {
      this.#config.keepFinalizedTxsForSlots = config.keepFinalizedTxsForSlots;
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

  countTxs(): {
    pending: number;
    protected: number;
    mined: number;
    softDeleted: number;
    totalMetadataBytes: number;
  } {
    return {
      ...this.#indices.countTxs(),
      softDeleted: this.#deletedPool.getSoftDeletedCount(),
    };
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
    precomputedMeta?: TxMetaData,
  ): Promise<TxMetaData> {
    const txHashStr = tx.getTxHash().toString();
    const meta = precomputedMeta ?? (await buildTxMetaData(tx));
    meta.receivedAt = this.#dateProvider.now();

    await this.#txsDB.set(txHashStr, tx.withoutProof().toBuffer());
    await this.#proofsDB.set(txHashStr, tx.chonkProof.toBuffer());
    await this.#deletedPool.clearSoftDeleted(txHashStr);
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
    this.#log.debug(`Added tx ${txHashStr} as ${stateStr}`, {
      eventName: 'tx-added-to-pool',
      txHash: txHashStr,
      state: stateStr,
      source: opts.source,
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

  /** Hard-deletes a tx's stored data (tx blob and proof) from the DB. */
  async #deleteTxData(txHashStr: string): Promise<void> {
    await this.#txsDB.delete(txHashStr);
    await this.#proofsDB.delete(txHashStr);
  }

  /** Deletes a batch of transactions, emitting callbacks individually for each. */
  async #deleteTxsBatch(txHashes: string[]): Promise<void> {
    for (const txHashStr of txHashes) {
      await this.#deleteTx(txHashStr);
    }
  }

  /** Evicts transactions: records eviction metric with reason, caches hashes, then deletes. */
  async #evictTxs(txHashes: string[], reason: string): Promise<void> {
    if (txHashes.length === 0) {
      return;
    }
    this.#instrumentation.recordEvictions(txHashes.length, reason);
    for (const txHashStr of txHashes) {
      this.#log.debug(`Evicting tx ${txHashStr}`, { txHash: txHashStr, reason });
      this.#evictedTxHashes.add(txHashStr);
    }
    await this.#deleteTxsBatch(txHashes);
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
        this.#log.debug(
          `Rejected tx ${meta.txHash} during rebuild: ${preAddResult.reason?.message ?? 'unknown reason'}`,
        );
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
      deleteTxs: (txHashes: string[], reason?: string) => this.#evictTxs(txHashes, reason ?? 'unknown'),
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
          await computeFeePayerBalanceStorageSlot(AztecAddress.fromStringUnsafe(feePayer)),
        );
        return balance.toBigInt();
      },
      getFeePayerPendingTxs: (feePayer: string) => this.#indices.getFeePayerPendingTxs(feePayer),
      getPendingTxCount: () => this.#indices.getPendingTxCount(),
      getLowestPriorityPendingTx: () => this.#indices.getLowestPriorityPendingTx(),
    };
  }
}
