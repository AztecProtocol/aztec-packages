import { SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource } from '@aztec/stdlib/trees';
import { BlockHeader, Tx, TxHash, type TxValidator } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import EventEmitter from 'node:events';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
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
  type TxPoolV2,
  type TxPoolV2Config,
  type TxPoolV2Dependencies,
  type TxPoolV2Events,
} from './interfaces.js';
import { type TxMetaData, type TxState, buildTxMetaData } from './tx_metadata.js';

/**
 * Implementation of TxPoolV2 with explicit state management.
 *
 * All operations are serialized through a handler queue
 * to prevent race conditions. In-memory indices enable fast lookups
 * while persistence ensures durability across restarts.
 */
export class AztecKVTxPoolV2 extends (EventEmitter as new () => TypedEventEmitter<TxPoolV2Events>) implements TxPoolV2 {
  // === Persistence ===
  #store: AztecAsyncKVStore;
  #txsDB: AztecAsyncMap<string, Buffer>;

  // === Dependencies ===
  #l2BlockSource: L2BlockSource;
  #worldStateSynchronizer: WorldStateSynchronizer;
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
  /** Protected transactions: txHash -> slotNumber. Includes txs we have and txs we expect to receive. */
  #protectedTransactions: Map<string, SlotNumber> = new Map();

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
    this.#worldStateSynchronizer = deps.worldStateSynchronizer;
    this.#pendingTxValidator = deps.pendingTxValidator;

    this.#config = { ...DEFAULT_TX_POOL_V2_CONFIG, ...config };
    this.#archive = new TxArchive(archiveStore, this.#config.archivedTxLimit, log);
    this.#log = log;

    this.#queue = new SerialQueue();

    // Setup eviction manager with rules
    // Pass an adapter that accesses internal state directly (no queue) since eviction rules run inside queue tasks
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

    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, this.#countTxs, () => store.estimateSize());
  }

  // === Core Operations ===

  addPendingTxs(txs: Tx[], opts: { source?: string } = {}): Promise<AddTxsResult> {
    return this.#queue.put(() => this.#doAddPendingTxs(txs, opts));
  }

  canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored'> {
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

  // === Queries ===
  // All queries go through the queue to ensure consistency with pending writes.

  getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#queue.put(async () => {
      const buffer = await this.#txsDB.getAsync(txHash.toString());
      return buffer ? Tx.fromBuffer(buffer) : undefined;
    });
  }

  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.#queue.put(async () => {
      const results: (Tx | undefined)[] = [];
      for (const h of txHashes) {
        const buffer = await this.#txsDB.getAsync(h.toString());
        results.push(buffer ? Tx.fromBuffer(buffer) : undefined);
      }
      return results;
    });
  }

  hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return this.#queue.put(async () => {
      const results: boolean[] = [];
      for (const h of txHashes) {
        results.push(await this.#txsDB.hasAsync(h.toString()));
      }
      return results;
    });
  }

  getTxStatus(txHash: TxHash): Promise<TxState | 'deleted' | undefined> {
    return this.#queue.put(() => {
      const meta = this.#metadata.get(txHash.toString());
      if (!meta) {
        return undefined;
      }
      return this.#getTxState(meta);
    });
  }

  getPendingTxHashes(): Promise<TxHash[]> {
    return this.#queue.put(() => this.#doGetPendingTxHashes());
  }

  getPendingTxCount(): Promise<number> {
    return this.#queue.put(() => this.#doGetPendingTxCount());
  }

  getMinedTxHashes(): Promise<[TxHash, L2BlockId][]> {
    return this.#queue.put(() => {
      const result: [TxHash, L2BlockId][] = [];
      for (const [txHash, meta] of this.#metadata) {
        if (meta.minedL2BlockId !== undefined) {
          result.push([TxHash.fromString(txHash), meta.minedL2BlockId]);
        }
      }
      return result;
    });
  }

  getMinedTxCount(): Promise<number> {
    return this.#queue.put(() => this.#doGetMinedTxCount());
  }

  isEmpty(): Promise<boolean> {
    return this.#queue.put(() => this.#metadata.size === 0);
  }

  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#queue.put(() => this.#archive.getTxByHash(txHash));
  }

  getLowestPriorityEvictable(limit: number): Promise<TxHash[]> {
    return this.#queue.put(() => this.#doGetLowestPriorityEvictable(limit));
  }

  // === Configuration ===

  updateConfig(config: Partial<TxPoolV2Config>): Promise<void> {
    return this.#queue.put(() => {
      if (config.maxPendingTxCount !== undefined) {
        this.#config.maxPendingTxCount = config.maxPendingTxCount;
      }
      if (config.archivedTxLimit !== undefined) {
        this.#config.archivedTxLimit = config.archivedTxLimit;
        this.#archive.updateLimit(config.archivedTxLimit);
      }
      // Update eviction rules with new config
      this.#evictionManager.updateConfig(config);
    });
  }

  // === Private Query Implementations ===

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
          ? [...hashesAtFee].sort((a, b) => b.localeCompare(a))
          : [...hashesAtFee].sort((a, b) => a.localeCompare(b));
      for (const hash of sortedHashes) {
        yield hash;
      }
    }
  }

  #doGetPendingTxHashes(): TxHash[] {
    return [...this.#iteratePendingByPriority('desc')].map(hash => TxHash.fromString(hash));
  }

  #doGetPendingTxCount(): number {
    let count = 0;
    for (const hashes of this.#pendingByPriority.values()) {
      count += hashes.size;
    }
    return count;
  }

  #doGetMinedTxCount(): number {
    let count = 0;
    for (const meta of this.#metadata.values()) {
      if (meta.minedL2BlockId !== undefined) {
        count++;
      }
    }
    return count;
  }

  #doGetLowestPriorityEvictable(limit: number): TxHash[] {
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
      `Transaction pool started with ${this.#metadata.size} transactions (${this.#doGetPendingTxCount()} pending, ${this.#doGetMinedTxCount()} mined)`,
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
    const ignored: TxHash[] = [];
    const addedTxs: Tx[] = [];
    const feePayers: string[] = [];
    const poolAccess = this.#createPreAddPoolAccess();

    // Track which txs from this batch have been accepted (for intra-batch eviction tracking)
    const acceptedInBatch = new Set<string>();

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

        // Build metadata first so we can use it for pre-add rules
        const meta = await buildTxMetaData(tx);

        // Run pre-add eviction rules (nullifier conflict check, etc.) using metadata
        const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);
        if (preAddResult.shouldIgnore) {
          this.#log.debug(`Ignoring tx ${txHashStr}: ${preAddResult.reason}`);
          ignored.push(txHash);
          continue;
        }

        // Evict conflicting txs identified by pre-add rules
        for (const evictHashStr of preAddResult.txHashesToEvict) {
          await this.#deleteTx(evictHashStr, { permanently: true });
          this.#log.verbose(`Evicted tx ${evictHashStr} due to higher-fee tx ${txHashStr}`);

          // If the evicted tx was accepted earlier in this same batch, move it to ignored
          if (acceptedInBatch.has(evictHashStr)) {
            acceptedInBatch.delete(evictHashStr);
            ignored.push(TxHash.fromString(evictHashStr));
          }
        }

        // Add the transaction
        await this.#txsDB.set(txHashStr, tx.toBuffer());
        this.#addToIndices(meta);

        acceptedInBatch.add(txHashStr);
        addedTxs.push(tx);
        feePayers.push(meta.feePayer);

        this.#log.verbose(`Added tx ${txHashStr} to pool`, {
          eventName: 'tx-added-to-pool',
          state: this.#getTxState(meta),
        });
      }
    });

    // Build final accepted list from what remains in acceptedInBatch
    // Also filter addedTxs and feePayers to only include txs that weren't evicted within the batch
    const finalAddedTxs: Tx[] = [];
    const finalFeePayers: string[] = [];
    for (let i = 0; i < addedTxs.length; i++) {
      const txHashStr = addedTxs[i].getTxHash().toString();
      if (acceptedInBatch.has(txHashStr)) {
        accepted.push(TxHash.fromString(txHashStr));
        finalAddedTxs.push(addedTxs[i]);
        finalFeePayers.push(feePayers[i]);
      }
    }

    // Run post-add eviction rules (low priority eviction, etc.)
    if (accepted.length > 0) {
      await this.#evictionManager.evictAfterNewTxs(
        accepted.map(h => h.toString()),
        finalFeePayers,
      );
    }

    if (finalAddedTxs.length > 0) {
      this.#metrics.transactionsAdded(finalAddedTxs);
      this.emit('txs-added', { txs: finalAddedTxs, ...opts });
    }

    return { accepted, ignored };
  }

  async #doCanAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored'> {
    const txHashStr = tx.getTxHash().toString();

    // Check if already in pool
    if (this.#metadata.has(txHashStr)) {
      return 'ignored';
    }

    // Build metadata and use pre-add rules
    const meta = await buildTxMetaData(tx);
    const poolAccess = this.#createPreAddPoolAccess();
    const preAddResult = await this.#evictionManager.runPreAddRules(meta, poolAccess);

    return preAddResult.shouldIgnore ? 'ignored' : 'accepted';
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
          // Update protection even if mined - handles race condition where reorg
          // may un-mine the tx, and it should retain protection from later proposals
          this.#updateProtection(txHashStr, slotNumber);
          continue;
        }

        // New transaction - add as protected
        const meta = await buildTxMetaData(tx);
        this.#protectedTransactions.set(txHashStr, slotNumber);

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
        // Set the transaction as protected in case it is added later as pending
        this.#protectedTransactions.set(txHashStr, slotNumber);
        missing.push(txHash);
        continue;
      }

      // Update protection even if mined - handles race condition where reorg
      // may un-mine the tx, and it should retain protection from later proposals
      this.#updateProtection(txHashStr, slotNumber);
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
    const minedNullifiers: string[] = [];
    const minedFeePayers: string[] = [];

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();
      const meta = this.#metadata.get(txHashStr);

      if (!meta) {
        this.#log.debug(`Tx ${txHashStr} not found for marking as mined`);
        continue;
      }

      // Collect nullifiers and fee payer from this mined tx
      minedNullifiers.push(...meta.nullifiers);
      minedFeePayers.push(meta.feePayer);

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

    // Find protected txs from earlier slots (that we have metadata for)
    for (const [txHashStr, protectedSlot] of this.#protectedTransactions) {
      if (protectedSlot >= slotNumber) {
        continue;
      }
      // Only unprotect if we have the tx and it's not mined
      const meta = this.#metadata.get(txHashStr);
      if (meta && meta.minedL2BlockId === undefined) {
        txsToUnprotect.push(txHashStr);
      }
      // Always remove from protected map (cleans up stale entries for txs we never received)
      this.#protectedTransactions.delete(txHashStr);
    }

    if (txsToUnprotect.length === 0) {
      return;
    }

    this.#log.info(`Preparing for slot ${slotNumber}: unprotecting ${txsToUnprotect.length} txs`);

    const unprotectedHashes: string[] = [];
    const feePayers: string[] = [];
    const txsToDelete: string[] = [];

    for (const txHashStr of txsToUnprotect) {
      const meta = this.#metadata.get(txHashStr);
      if (!meta) {
        continue;
      }

      // Validate tx before restoring to pending (it may have become invalid while protected)
      if (this.#pendingTxValidator) {
        const buffer = await this.#txsDB.getAsync(txHashStr);
        if (!buffer) {
          this.#log.warn(`Tx ${txHashStr} not found in DB during unprotect`);
          txsToDelete.push(txHashStr);
          continue;
        }
        const tx = Tx.fromBuffer(buffer);
        const validationResult = await this.#pendingTxValidator.validateTx(tx);
        if (validationResult.result !== 'valid') {
          this.#log.info(
            `Deleting unprotected tx ${txHashStr}: validation failed - ${validationResult.reason?.join(', ')}`,
          );
          txsToDelete.push(txHashStr);
          continue;
        }
      }

      // Check for nullifier conflicts with existing pending txs
      const conflictResult = this.#checkNullifierConflict(meta);
      if (conflictResult.shouldIgnore) {
        // Existing pending tx has higher priority - delete this one
        this.#log.debug(`Deleting unprotected tx ${txHashStr}: nullifier conflict with higher priority pending tx`);
        txsToDelete.push(txHashStr);
        continue;
      }

      // Evict lower priority conflicting txs
      for (const evictHashStr of conflictResult.txHashesToEvict) {
        this.#log.debug(`Evicting pending tx ${evictHashStr} for higher priority unprotected tx ${txHashStr}`);
        txsToDelete.push(evictHashStr);
        // Remove from pending indices immediately so later unprotected txs see correct state
        const evictMeta = this.#metadata.get(evictHashStr);
        if (evictMeta) {
          this.#removeFromPendingIndices(evictMeta);
        }
      }

      // Re-add to pending indices
      this.#addToPendingIndices(meta);

      unprotectedHashes.push(txHashStr);
      feePayers.push(meta.feePayer);
    }

    // Delete evicted/ignored txs
    if (txsToDelete.length > 0) {
      await this.#store.transactionAsync(async () => {
        for (const txHashStr of txsToDelete) {
          await this.#deleteTx(txHashStr, { permanently: true });
        }
      });
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

    const txsToDelete: string[] = [];
    const restoredHashes: TxHash[] = [];
    const restoredFeePayers: AztecAddress[] = [];

    for (const meta of txsToUnmine) {
      meta.minedL2BlockId = undefined;

      // Only add to pending indices if not protected (protection is managed by prepareForSlot)
      if (this.#protectedTransactions.has(meta.txHash)) {
        continue;
      }

      // Validate tx before restoring to pending (it may have become invalid while mined)
      if (this.#pendingTxValidator) {
        const buffer = await this.#txsDB.getAsync(meta.txHash);
        if (!buffer) {
          this.#log.warn(`Tx ${meta.txHash} not found in DB during un-mine`);
          txsToDelete.push(meta.txHash);
          continue;
        }
        const tx = Tx.fromBuffer(buffer);
        const validationResult = await this.#pendingTxValidator.validateTx(tx);
        if (validationResult.result !== 'valid') {
          this.#log.info(
            `Deleting un-mined tx ${meta.txHash}: validation failed - ${validationResult.reason?.join(', ')}`,
          );
          txsToDelete.push(meta.txHash);
          continue;
        }
      }

      // Check for nullifier conflicts with existing pending txs
      const conflictResult = this.#checkNullifierConflict(meta);
      if (conflictResult.shouldIgnore) {
        // Existing pending tx has higher priority - delete this one
        this.#log.debug(`Deleting un-mined tx ${meta.txHash}: nullifier conflict with higher priority pending tx`);
        txsToDelete.push(meta.txHash);
        continue;
      }

      // Evict lower priority conflicting txs
      for (const evictHashStr of conflictResult.txHashesToEvict) {
        this.#log.debug(`Evicting pending tx ${evictHashStr} for higher priority un-mined tx ${meta.txHash}`);
        txsToDelete.push(evictHashStr);
        // Remove from pending indices immediately so later un-mined txs see correct state
        const evictMeta = this.#metadata.get(evictHashStr);
        if (evictMeta) {
          this.#removeFromPendingIndices(evictMeta);
        }
      }

      this.#addToPendingIndices(meta);
      restoredHashes.push(TxHash.fromString(meta.txHash));
      restoredFeePayers.push(AztecAddress.fromString(meta.feePayer));
    }

    // Delete evicted/invalid txs
    if (txsToDelete.length > 0) {
      await this.#store.transactionAsync(async () => {
        for (const txHashStr of txsToDelete) {
          await this.#deleteTx(txHashStr, { permanently: true });
        }
      });
      this.#metrics.transactionsRemoved(txsToDelete);
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
        // Read directly from DB without going through queue (we're already in a queue task)
        const buffer = await this.#txsDB.getAsync(txHashStr);
        if (buffer) {
          txsToArchive.push(Tx.fromBuffer(buffer));
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

  async #deleteTx(txHashStr: string, _opts?: { permanently?: boolean }): Promise<void> {
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

  // === PoolOperations Adapter (for EvictionManager) ===

  /**
   * Creates a PoolOperations adapter for use with the eviction manager.
   * This adapter accesses internal state directly without going through the queue,
   * since eviction rules are called from within queue tasks.
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
      },
      getPendingTxCount: (): number => {
        return this.#doGetPendingTxCount();
      },
      getLowestPriorityEvictable: (limit: number): string[] => {
        return this.#doGetLowestPriorityEvictable(limit).map(h => h.toString());
      },
      deleteTxs: async (txHashes: string[]): Promise<void> => {
        await this.#store.transactionAsync(async () => {
          for (const txHashStr of txHashes) {
            await this.#deleteTx(txHashStr, { permanently: true });
          }
        });
        this.#metrics.transactionsRemoved(txHashes);
      },
    };
  }

  // === PreAddPoolAccess Implementation ===

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
      },
      getPendingTxCount: (): number => {
        return this.#doGetPendingTxCount();
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
      const state = this.#getTxState(meta);
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
