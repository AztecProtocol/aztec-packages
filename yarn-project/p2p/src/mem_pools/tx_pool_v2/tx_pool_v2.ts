import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import { BlockHeader, Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import EventEmitter from 'node:events';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { ArchiveFilter } from '../tx_pool/eviction/archive_filter.js';
import { EvictionManager } from '../tx_pool/eviction/eviction_manager.js';
import {
  FeePayerTxInfo,
  type PendingTxInfo,
  type PreAddPoolAccess,
  type PrePendingFilterContext,
  type TxBlockReference,
  type TxPoolOperations,
  type TxValidationFields,
} from '../tx_pool/eviction/eviction_strategy.js';
import { FeePayerBalanceEvictionRule } from '../tx_pool/eviction/fee_payer_balance_eviction_rule.js';
import { InvalidTxsAfterMiningRule } from '../tx_pool/eviction/invalid_txs_after_mining_rule.js';
import { InvalidTxsAfterReorgRule } from '../tx_pool/eviction/invalid_txs_after_reorg_rule.js';
import { LowPriorityEvictionRule } from '../tx_pool/eviction/low_priority_eviction_rule.js';
import { NullifierConflictPreAddRule } from '../tx_pool/eviction/nullifier_conflict_pre_add_rule.js';
import { getTxPriorityFee } from '../tx_pool/priority.js';
import { TxArchive } from './archive/index.js';
import {
  type AddTxsResult,
  DEFAULT_TX_POOL_V2_CONFIG,
  type PoolReadAccess,
  type TxPoolV2,
  type TxPoolV2Config,
  type TxPoolV2Dependencies,
  type TxPoolV2Events,
} from './interfaces.js';
import { type TxMetaData, type TxState, buildTxMetaData, getTxState } from './tx_metadata.js';

/**
 * Implementation of TxPoolV2 with explicit state management.
 *
 * All state-mutating operations are serialized through a handler queue
 * to prevent race conditions. In-memory indices enable fast lookups
 * while persistence ensures durability across restarts.
 */
export class AztecKVTxPoolV2
  extends (EventEmitter as new () => TypedEventEmitter<TxPoolV2Events>)
  implements TxPoolV2, TxPoolOperations
{
  // === Persistence ===
  #store: AztecAsyncKVStore;
  #txsDB: AztecAsyncMap<string, Buffer>;

  // === Dependencies ===
  #l2BlockSource: L2BlockSource;
  #pendingTxValidator?: TxValidator<Tx>;

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
  /** Pre-protected txHashes: hashes we should protect when received */
  #preProtectedHashes: Map<string, SlotNumber> = new Map();

  // === Queue & Config ===
  #queue: SerialQueue;
  #config: TxPoolV2Config;
  #archive: TxArchive;
  #evictionManager: EvictionManager;
  #log: Logger;
  #metrics: PoolInstrumentation<Tx>;
  #started = false;

  constructor(
    store: AztecAsyncKVStore,
    archiveStore: AztecAsyncKVStore,
    deps: TxPoolV2Dependencies,
    telemetry: TelemetryClient = getTelemetryClient(),
    config: Partial<TxPoolV2Config> = {},
    log = createLogger('p2p:tx_pool_v2'),
  ) {
    super();

    this.#store = store;
    this.#txsDB = store.openMap('txs');

    this.#l2BlockSource = deps.l2BlockSource;
    this.#pendingTxValidator = deps.pendingTxValidator;

    this.#config = { ...DEFAULT_TX_POOL_V2_CONFIG, ...config };
    this.#archive = new TxArchive(archiveStore, this.#config.archivedTxLimit, log);
    this.#log = log;

    this.#queue = new SerialQueue();

    // Setup eviction manager with rules and filters
    this.#evictionManager = new EvictionManager(this, log);

    // Pre-add rules (run during addPendingTxs)
    this.#evictionManager.registerPreAddRule(new NullifierConflictPreAddRule());

    // Pre-pending filters (run before restoring txs to pending after reorg/unprotect)
    // These filter out invalid txs BEFORE adding to pending indices, avoiding wasted index operations
    this.#evictionManager.registerPrePendingFilter(new ArchiveFilter(deps.worldStateSynchronizer));

    // Post-event eviction rules (run after events to check ALL pending txs, not just restored ones)
    this.#evictionManager.registerRule(new InvalidTxsAfterMiningRule());
    this.#evictionManager.registerRule(new InvalidTxsAfterReorgRule(deps.worldStateSynchronizer));
    this.#evictionManager.registerRule(new FeePayerBalanceEvictionRule(deps.worldStateSynchronizer));
    this.#evictionManager.registerRule(new LowPriorityEvictionRule({ maxPoolSize: this.#config.maxPendingTxCount }));

    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, this.#countTxs, () => store.estimateSize());
  }

  // === Core Operations ===

  addPendingTxs(txs: Tx[], opts: { source?: string } = {}): Promise<AddTxsResult> {
    return this.#queue.put(() => this.#doAddPendingTxs(txs, opts));
  }

  canAddPendingTx(tx: Tx): Promise<'accepted' | 'rejected' | 'ignored'> {
    return this.#queue.put(() => this.#doCanAddPendingTx(tx));
  }

  addProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string } = {}): Promise<void> {
    return this.#queue.put(() => this.#doAddProtectedTxs(txs, block, opts));
  }

  protectTxs(txHashes: TxHash[], block: BlockHeader): Promise<TxHash[]> {
    return this.#queue.put(() => this.#doProtectTxs(txHashes, block));
  }

  addMinedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string } = {}): Promise<void> {
    return this.#queue.put(() => this.#doAddMinedTxs(txs, block, opts));
  }

  // === State Transition Handlers ===

  handleMinedBlock(txHashes: TxHash[], block: BlockHeader): Promise<void> {
    return this.#queue.put(() => this.#doHandleMinedBlock(txHashes, block));
  }

  prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    return this.#queue.put(() => this.#doPrepareForSlot(slotNumber));
  }

  handlePrunedBlocks(latestBlock: L2BlockId): Promise<void> {
    return this.#queue.put(() => this.#doHandlePrunedBlocks(latestBlock));
  }

  handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    return this.#queue.put(() => this.#doHandleFailedExecution(txHashes));
  }

  handleFinalizedBlock(block: BlockHeader): Promise<void> {
    return this.#queue.put(() => this.#doHandleFinalizedBlock(block));
  }

  // === Queries (can run outside queue since they're read-only) ===

  async getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#txsDB.getAsync(txHash.toString());
    return buffer ? Tx.fromBuffer(buffer) : undefined;
  }

  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return Promise.all(txHashes.map(h => this.getTxByHash(h)));
  }

  hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return Promise.all(txHashes.map(h => this.#txsDB.hasAsync(h.toString())));
  }

  getTxStatus(txHash: TxHash): TxState | 'deleted' | undefined {
    const meta = this.#metadata.get(txHash.toString());
    if (!meta) {
      return undefined;
    }
    return getTxState(meta);
  }

  getPendingTxHashes(): TxHash[] {
    // Sort priority fees descending (highest first), then sort hashes within each fee level descending
    const sortedFees = [...this.#pendingByPriority.keys()].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));

    const result: TxHash[] = [];
    for (const fee of sortedFees) {
      const hashesAtFee = this.#pendingByPriority.get(fee)!;
      // Sort hashes descending within the same fee level
      const sortedHashes = [...hashesAtFee].sort((a, b) => b.localeCompare(a));
      for (const hash of sortedHashes) {
        result.push(TxHash.fromString(hash));
      }
    }
    return result;
  }

  getPendingTxCount(): Promise<number> {
    let count = 0;
    for (const hashes of this.#pendingByPriority.values()) {
      count += hashes.size;
    }
    return Promise.resolve(count);
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

  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#archive.getTxByHash(txHash);
  }

  getLowestPriorityEvictable(limit: number): Promise<TxHash[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    // Sort priority fees ascending (lowest first)
    const sortedFees = [...this.#pendingByPriority.keys()].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));

    const result: TxHash[] = [];
    for (const fee of sortedFees) {
      if (result.length >= limit) {
        break;
      }
      const hashesAtFee = this.#pendingByPriority.get(fee)!;
      // Sort hashes ascending within the same fee level (lowest first for eviction)
      const sortedHashes = [...hashesAtFee].sort((a, b) => a.localeCompare(b));
      for (const hash of sortedHashes) {
        result.push(TxHash.fromString(hash));
        if (result.length >= limit) {
          break;
        }
      }
    }
    return Promise.resolve(result);
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

  // === Lifecycle ===

  /**
   * Starts the pool and initializes state from persistence.
   * - Reads all transactions from the database
   * - Checks each against the Archiver to determine mined status
   * - Validates all non-mined transactions
   * - Populates in-memory indices
   */
  async start(): Promise<void> {
    if (this.#started) {
      return;
    }

    this.#log.info('Starting transaction pool...');

    // Start the serial queue
    this.#queue.start();
    this.#started = true;

    // Hydrate state from persistence
    await this.#hydrateFromDatabase();

    this.#log.info(
      `Transaction pool started with ${this.#metadata.size} transactions (${await this.getPendingTxCount()} pending, ${this.getMinedTxCount()} mined)`,
    );
  }

  async stop(): Promise<void> {
    if (this.#started) {
      await this.#queue.end();
      this.#started = false;
    }
  }

  /**
   * Hydrates the in-memory state from the database on startup.
   * For each transaction:
   * 1. Build metadata from the stored transaction
   * 2. Check if it's mined by querying the Archiver
   * 3. Validate non-mined transactions
   * 4. Add valid transactions to indices
   */
  async #hydrateFromDatabase(): Promise<void> {
    const txsToDelete: string[] = [];
    const allTxs: { txHashStr: string; tx: Tx; meta: TxMetaData }[] = [];

    // Phase 1: Load all transactions and build metadata
    for await (const [txHashStr, buffer] of this.#txsDB.entriesAsync()) {
      try {
        const tx = Tx.fromBuffer(buffer);
        const meta = await buildTxMetaData(tx);
        allTxs.push({ txHashStr, tx, meta });
      } catch (err) {
        this.#log.warn(`Failed to deserialize tx ${txHashStr}, deleting`, { err });
        txsToDelete.push(txHashStr);
      }
    }

    // Phase 2: Check mined status from Archiver
    for (const { txHashStr, meta } of allTxs) {
      try {
        const txEffect = await this.#l2BlockSource.getTxEffect(TxHash.fromString(txHashStr));
        if (txEffect) {
          // Transaction is mined - record the block ID
          meta.minedL2BlockId = {
            number: txEffect.l2BlockNumber,
            hash: txEffect.l2BlockHash.toString(),
          };
        }
      } catch (err) {
        this.#log.warn(`Failed to check mined status for tx ${txHashStr}`, { err });
      }
    }

    // Phase 3: Validate non-mined transactions and populate indices
    for (const { txHashStr, tx, meta } of allTxs) {
      if (meta.minedL2BlockId !== undefined) {
        // Mined transactions go directly into metadata (no pending indices)
        this.#metadata.set(txHashStr, meta);
        continue;
      }

      // Validate non-mined transactions before adding to pending pool
      if (this.#pendingTxValidator) {
        const result = await this.#pendingTxValidator.validateTx(tx);
        if (result.result !== 'valid') {
          this.#log.info(`Removing invalid tx ${txHashStr} on startup: ${result.reason?.join(', ')}`);
          txsToDelete.push(txHashStr);
          continue;
        }
      }

      // Add valid non-mined transaction
      this.#addToIndices(meta);
    }

    // Phase 4: Delete invalid transactions
    if (txsToDelete.length > 0) {
      await this.#store.transactionAsync(async () => {
        for (const txHashStr of txsToDelete) {
          await this.#txsDB.delete(txHashStr);
        }
      });
      this.#log.info(`Deleted ${txsToDelete.length} invalid transactions on startup`);
    }
  }

  // === Private Implementation ===

  async #doAddPendingTxs(txs: Tx[], opts: { source?: string }): Promise<AddTxsResult> {
    const accepted: TxHash[] = [];
    const rejected: TxHash[] = [];
    const ignored: TxHash[] = [];
    const addedTxs: Tx[] = [];
    const feePayers: AztecAddress[] = [];
    const poolAccess = this.#createPreAddPoolAccess();

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        // Skip if already in pool
        if (this.#metadata.has(txHashStr)) {
          this.#log.debug(`Tx ${txHashStr} already in pool`);
          ignored.push(txHash);
          continue;
        }

        // Run pre-add eviction rules (nullifier conflict check, etc.)
        const preAddResult = await this.#evictionManager.runPreAddRules(tx, poolAccess);
        if (preAddResult.shouldReject) {
          this.#log.debug(`Rejecting tx ${txHashStr}: ${preAddResult.reason}`);
          rejected.push(txHash);
          continue;
        }

        // Evict conflicting txs identified by pre-add rules
        for (const evictHash of preAddResult.txHashesToEvict) {
          await this.#deleteTx(evictHash.toString(), { permanently: true });
          this.#log.verbose(`Evicted tx ${evictHash.toString()} due to higher-fee tx ${txHashStr}`);
        }

        const meta = await buildTxMetaData(tx);

        // Check if we should protect this tx immediately (pre-recorded protection)
        const preProtectedSlot = this.#preProtectedHashes.get(txHashStr);
        if (preProtectedSlot !== undefined) {
          meta.protectedSlotNumber = preProtectedSlot;
          this.#preProtectedHashes.delete(txHashStr);
        }

        // Add the transaction
        await this.#txsDB.set(txHashStr, tx.toBuffer());
        this.#addToIndices(meta);

        accepted.push(txHash);
        addedTxs.push(tx);
        feePayers.push(tx.data.feePayer);

        this.#log.verbose(`Added tx ${txHashStr} to pool`, {
          eventName: 'tx-added-to-pool',
          state: getTxState(meta),
        });
      }
    });

    // Run post-add eviction rules (low priority eviction, etc.)
    if (accepted.length > 0) {
      await this.#evictionManager.evictAfterNewTxs(accepted, feePayers);
    }

    if (addedTxs.length > 0) {
      this.#metrics.transactionsAdded(addedTxs);
      this.emit('txs-added', { txs: addedTxs, ...opts });
    }

    return { accepted, rejected, ignored };
  }

  async #doCanAddPendingTx(tx: Tx): Promise<'accepted' | 'rejected' | 'ignored'> {
    const txHashStr = tx.getTxHash().toString();

    // Check if already in pool
    if (this.#metadata.has(txHashStr)) {
      return 'ignored';
    }

    // Use eviction manager's pre-add rules (nullifier conflict check, etc.)
    const poolAccess = this.#createPreAddPoolAccess();
    const preAddResult = await this.#evictionManager.runPreAddRules(tx, poolAccess);

    return preAddResult.shouldReject ? 'rejected' : 'accepted';
  }

  async #doAddProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    const slotNumber = block.globalVariables.slotNumber;
    const addedTxs: Tx[] = [];

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        const existingMeta = this.#metadata.get(txHashStr);
        if (existingMeta) {
          // Update protection if not mined
          if (existingMeta.minedL2BlockId === undefined) {
            this.#updateProtection(existingMeta, slotNumber);
          }
          continue;
        }

        // New transaction - add as protected
        const meta = await buildTxMetaData(tx);
        meta.protectedSlotNumber = slotNumber;

        await this.#txsDB.set(txHashStr, tx.toBuffer());
        this.#addToIndices(meta);

        addedTxs.push(tx);
        this.#log.verbose(`Added protected tx ${txHashStr} for slot ${slotNumber}`);
      }
    });

    if (addedTxs.length > 0) {
      this.#metrics.transactionsAdded(addedTxs);
      this.emit('txs-added', { txs: addedTxs, ...opts });
    }
  }

  #doProtectTxs(txHashes: TxHash[], block: BlockHeader): Promise<TxHash[]> {
    const slotNumber = block.globalVariables.slotNumber;
    const missing: TxHash[] = [];

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();
      const meta = this.#metadata.get(txHashStr);

      if (!meta) {
        // Record for future protection when tx arrives via gossip
        this.#preProtectedHashes.set(txHashStr, slotNumber);
        missing.push(txHash);
        continue;
      }

      // Update protection if not mined
      if (meta.minedL2BlockId === undefined) {
        this.#updateProtection(meta, slotNumber);
      }
    }

    return Promise.resolve(missing);
  }

  async #doAddMinedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string }): Promise<void> {
    const blockId: L2BlockId = {
      number: block.globalVariables.blockNumber,
      hash: (await block.hash()).toString(),
    };
    const addedTxs: Tx[] = [];

    await this.#store.transactionAsync(async () => {
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        const txHashStr = txHash.toString();

        const existingMeta = this.#metadata.get(txHashStr);
        if (existingMeta) {
          // Mark as mined
          this.#markAsMined(existingMeta, blockId);
          continue;
        }

        // New transaction - add as mined
        const meta = await buildTxMetaData(tx);
        meta.minedL2BlockId = blockId;

        await this.#txsDB.set(txHashStr, tx.toBuffer());
        this.#metadata.set(txHashStr, meta);
        // Don't add to pending indices since it's mined

        addedTxs.push(tx);
        this.#log.verbose(`Added mined tx ${txHashStr} from block ${blockId.number}`);
      }
    });

    if (addedTxs.length > 0) {
      this.#metrics.transactionsAdded(addedTxs);
      this.emit('txs-added', { txs: addedTxs, ...opts });
    }
  }

  async #doHandleMinedBlock(txHashes: TxHash[], block: BlockHeader): Promise<void> {
    const blockId: L2BlockId = {
      number: block.globalVariables.blockNumber,
      hash: (await block.hash()).toString(),
    };

    // Collect nullifiers and fee payers from mined transactions for eviction rules
    const minedNullifiers: Fr[] = [];
    const minedFeePayers: AztecAddress[] = [];

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();
      const meta = this.#metadata.get(txHashStr);

      if (!meta) {
        this.#log.debug(`Tx ${txHashStr} not found for marking as mined`);
        continue;
      }

      // Collect nullifiers and fee payer from this mined tx
      for (const nullifier of meta.nullifiers) {
        minedNullifiers.push(Fr.fromHexString(nullifier as `0x${string}`));
      }
      minedFeePayers.push(AztecAddress.fromString(meta.feePayer));

      this.#markAsMined(meta, blockId);
    }

    // Use eviction manager to handle invalidated pending transactions
    // (e.g., those with conflicting nullifiers or expired timestamps)
    await this.#evictionManager.evictAfterNewBlock(block, minedNullifiers, minedFeePayers);

    this.#metrics.transactionsRemoved(txHashes.map(h => h.toBigInt()));
    this.#log.info(`Marked ${txHashes.length} txs as mined in block ${blockId.number}`);
  }

  async #doPrepareForSlot(slotNumber: SlotNumber): Promise<void> {
    const txsToUnprotect: string[] = [];

    // Find protected txs from earlier slots
    for (const [txHashStr, meta] of this.#metadata) {
      if (meta.protectedSlotNumber !== undefined && meta.protectedSlotNumber < slotNumber) {
        txsToUnprotect.push(txHashStr);
      }
    }

    // Clean up stale pre-protected hashes
    for (const [txHashStr, protectedSlot] of this.#preProtectedHashes) {
      if (protectedSlot < slotNumber) {
        this.#preProtectedHashes.delete(txHashStr);
      }
    }

    if (txsToUnprotect.length === 0) {
      return;
    }

    this.#log.info(`Preparing for slot ${slotNumber}: unprotecting ${txsToUnprotect.length} txs`);

    const { AztecAddress: AztecAddressClass } = await import('@aztec/stdlib/aztec-address');
    const unprotectedHashes: TxHash[] = [];
    const feePayers: AztecAddress[] = [];

    for (const txHashStr of txsToUnprotect) {
      const meta = this.#metadata.get(txHashStr);
      if (!meta) {
        continue;
      }

      // Remove protection
      meta.protectedSlotNumber = undefined;

      // Re-add to pending indices
      this.#addToPendingIndices(meta);

      unprotectedHashes.push(TxHash.fromString(txHashStr));
      feePayers.push(AztecAddressClass.fromString(meta.feePayer));
    }

    // Use eviction manager to enforce pool size limit after unprotecting
    if (unprotectedHashes.length > 0) {
      await this.#evictionManager.evictAfterNewTxs(unprotectedHashes, feePayers);
    }
  }

  async #doHandlePrunedBlocks(latestBlock: L2BlockId): Promise<void> {
    const latestBlockNumber = latestBlock.number;

    // Find all txs mined in blocks beyond the latest valid block
    const txsToUnmine: TxMetaData[] = [];
    for (const [, meta] of this.#metadata) {
      if (meta.minedL2BlockId !== undefined && meta.minedL2BlockId.number > latestBlockNumber) {
        txsToUnmine.push(meta);
      }
    }

    if (txsToUnmine.length === 0) {
      this.#log.debug(`No transactions to un-mine for prune to block ${latestBlockNumber}`);
      return;
    }

    this.#log.info(`Handling prune to block ${latestBlockNumber}: un-mining ${txsToUnmine.length} txs`);

    // Filter out invalid txs BEFORE adding to pending indices
    const validationFields: TxValidationFields[] = txsToUnmine.map(meta => ({
      txHash: meta.txHash,
      anchorBlockHeaderHash: meta.anchorBlockHeaderHash,
      feePayer: meta.feePayer,
      feeLimit: meta.feeLimit,
    }));

    const ctx: PrePendingFilterContext = { event: 'CHAIN_PRUNED', blockNumber: latestBlockNumber };
    const { valid, invalid } = await this.#evictionManager.filterValidForPending(validationFields, ctx);

    // Delete invalid transactions directly (never touch pending indices)
    if (invalid.length > 0) {
      this.#log.info(
        `Deleting ${invalid.length} invalid txs after reorg (pruned anchor blocks or insufficient balance)`,
      );
      await this.#store.transactionAsync(async () => {
        for (const txHashStr of invalid) {
          await this.#deleteTx(txHashStr, { permanently: true });
        }
      });
      this.#metrics.transactionsRemoved(invalid);
    }

    // Only restore valid txs to pending
    const validSet = new Set(valid);
    for (const meta of txsToUnmine) {
      if (validSet.has(meta.txHash)) {
        meta.minedL2BlockId = undefined;
        this.#addToPendingIndices(meta);
      }
    }

    // Run eviction rules to check ALL pending txs (not just restored ones)
    // This handles cases like existing pending txs with invalid fee payer balances
    await this.#evictionManager.evictAfterChainPrune(latestBlockNumber);
  }

  async #doHandleFailedExecution(txHashes: TxHash[]): Promise<void> {
    await this.#store.transactionAsync(async () => {
      for (const txHash of txHashes) {
        await this.#deleteTx(txHash.toString(), { permanently: true });
      }
    });

    this.#metrics.transactionsRemoved(txHashes.map(h => h.toBigInt()));
    this.#log.info(`Deleted ${txHashes.length} failed txs`);
  }

  async #doHandleFinalizedBlock(block: BlockHeader): Promise<void> {
    const blockNumber = block.globalVariables.blockNumber;
    const txsToDelete: string[] = [];
    const txsToArchive: Tx[] = [];

    // Find txs mined at or before the finalized block
    for (const [txHashStr, meta] of this.#metadata) {
      if (meta.minedL2BlockId !== undefined && meta.minedL2BlockId.number <= blockNumber) {
        txsToDelete.push(txHashStr);
      }
    }

    if (txsToDelete.length === 0) {
      return;
    }

    // Collect txs to archive before deletion
    if (this.#archive.isEnabled()) {
      for (const txHashStr of txsToDelete) {
        const tx = await this.getTxByHash(TxHash.fromString(txHashStr));
        if (tx) {
          txsToArchive.push(tx);
        }
      }
    }

    await this.#store.transactionAsync(async () => {
      for (const txHashStr of txsToDelete) {
        await this.#deleteTx(txHashStr, { permanently: true });
      }
    });

    // Archive after deletion
    if (txsToArchive.length > 0) {
      await this.#archive.archiveTxs(txsToArchive);
    }

    this.#metrics.transactionsRemoved(txsToDelete);
    this.#log.info(`Finalized ${txsToDelete.length} txs from blocks up to ${blockNumber}`);
  }

  // === Index Management ===

  #addToIndices(meta: TxMetaData): void {
    this.#metadata.set(meta.txHash, meta);

    const state = getTxState(meta);
    if (state === 'pending') {
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

    // Add to priority-sorted pending list (maintain sorted order, highest first)
    this.#insertByPriority(meta);
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

  #insertByPriority(meta: TxMetaData): void {
    // Add to the bucket for this priority fee
    let hashSet = this.#pendingByPriority.get(meta.priorityFee);
    if (!hashSet) {
      hashSet = new Set();
      this.#pendingByPriority.set(meta.priorityFee, hashSet);
    }
    hashSet.add(meta.txHash);
  }

  #updateProtection(meta: TxMetaData, slotNumber: SlotNumber): void {
    const wasProtected = meta.protectedSlotNumber !== undefined;
    meta.protectedSlotNumber = slotNumber;

    if (!wasProtected && meta.minedL2BlockId === undefined) {
      // Moving from pending to protected - remove from pending indices
      this.#removeFromPendingIndices(meta);
    }
  }

  #markAsMined(meta: TxMetaData, blockId: L2BlockId): void {
    const wasPending = meta.protectedSlotNumber === undefined && meta.minedL2BlockId === undefined;

    meta.minedL2BlockId = blockId;
    meta.protectedSlotNumber = undefined;

    if (wasPending) {
      this.#removeFromPendingIndices(meta);
    }
    // If was protected, indices were already removed
  }

  async #deleteTx(txHashStr: string, _opts?: { permanently?: boolean }): Promise<void> {
    const meta = this.#metadata.get(txHashStr);
    if (!meta) {
      return;
    }

    // Remove from all indices
    this.#metadata.delete(txHashStr);
    this.#removeFromPendingIndices(meta);

    // Remove from persistence
    await this.#txsDB.delete(txHashStr);
  }

  // === TxPoolOperations Implementation (for EvictionManager) ===

  async deleteTxs(txHashes: TxHash[], opts?: { permanently?: boolean }): Promise<void> {
    await this.#store.transactionAsync(async () => {
      for (const txHash of txHashes) {
        await this.#deleteTx(txHash.toString(), opts);
      }
    });
    this.#metrics.transactionsRemoved(txHashes.map(h => h.toBigInt()));
  }

  getPendingTxInfos(): Promise<PendingTxInfo[]> {
    const result: PendingTxInfo[] = [];
    for (const hashSet of this.#pendingByPriority.values()) {
      for (const txHashStr of hashSet) {
        const meta = this.#metadata.get(txHashStr);
        if (meta) {
          result.push({
            txHash: TxHash.fromString(txHashStr),
            blockHash: Fr.fromHexString(meta.anchorBlockHeaderHash as `0x${string}`),
            isEvictable: true, // Pending txs are always evictable
          });
        }
      }
    }
    return Promise.resolve(result);
  }

  getPendingTxsReferencingBlocks(blockHashes: Fr[]): Promise<TxBlockReference[]> {
    const blockHashStrings = new Set<string>(blockHashes.map(h => h.toString()));
    const result: TxBlockReference[] = [];

    for (const hashSet of this.#pendingByPriority.values()) {
      for (const txHashStr of hashSet) {
        const meta = this.#metadata.get(txHashStr);
        if (meta && blockHashStrings.has(meta.anchorBlockHeaderHash)) {
          result.push({
            txHash: TxHash.fromString(txHashStr),
            blockHash: Fr.fromHexString(meta.anchorBlockHeaderHash as `0x${string}`),
            isEvictable: true,
          });
        }
      }
    }
    return Promise.resolve(result);
  }

  getPendingFeePayers(): Promise<AztecAddress[]> {
    const feePayers: AztecAddress[] = [];
    for (const feePayerStr of this.#feePayerToTxHashes.keys()) {
      feePayers.push(AztecAddress.fromString(feePayerStr));
    }
    return Promise.resolve(feePayers);
  }

  async *getFeePayerTxInfos(feePayer: AztecAddress): AsyncIterable<FeePayerTxInfo> {
    const feePayerStr = feePayer.toString();
    const txHashes = this.#feePayerToTxHashes.get(feePayerStr);
    if (!txHashes) {
      return;
    }

    for (const txHashStr of txHashes) {
      const meta = this.#metadata.get(txHashStr);
      if (meta) {
        yield new FeePayerTxInfo({
          txHash: TxHash.fromString(txHashStr),
          priority: meta.priorityFee,
          feeLimit: meta.feeLimit,
          claimAmount: meta.claimAmount,
          isEvictable: getTxState(meta) === 'pending',
        });
      }
    }
  }

  // === PreAddPoolAccess Implementation ===

  /**
   * Creates a PreAddPoolAccess adapter for use with eviction rules.
   */
  #createPreAddPoolAccess(): PreAddPoolAccess {
    return {
      getTxHashByNullifier: (nullifier: Fr): Promise<TxHash | undefined> => {
        const txHashStr = this.#nullifierToTxHash.get(nullifier.toString());
        return Promise.resolve(txHashStr ? TxHash.fromString(txHashStr) : undefined);
      },
      getPendingTxByHash: async (hash: TxHash): Promise<Tx | undefined> => {
        const meta = this.#metadata.get(hash.toString());
        if (!meta || getTxState(meta) !== 'pending') {
          return undefined;
        }
        return await this.getTxByHash(hash);
      },
      getTxPriority: (tx: Tx): string => {
        return getTxPriorityFee(tx).toString(16).padStart(32, '0');
      },
    };
  }

  // === Pool Read Access ===

  getPoolReadAccess(): PoolReadAccess {
    return {
      getMetadata: (txHash: string) => this.#metadata.get(txHash),
      getTxHashByNullifier: (nullifier: string) => this.#nullifierToTxHash.get(nullifier),
      getTxHashesByFeePayer: (feePayer: string) => this.#feePayerToTxHashes.get(feePayer),
      getPendingTxCount: () => {
        let count = 0;
        for (const hashes of this.#pendingByPriority.values()) {
          count += hashes.size;
        }
        return count;
      },
    };
  }

  // === Metrics ===

  #countTxs = () => {
    let pending = 0;
    let protected_ = 0;
    let mined = 0;

    for (const meta of this.#metadata.values()) {
      const state = getTxState(meta);
      if (state === 'pending') {
        pending++;
      } else if (state === 'protected') {
        protected_++;
      } else if (state === 'mined') {
        mined++;
      }
    }

    return Promise.resolve({
      itemCount: { pending, protected: protected_, mined },
    });
  };
}
