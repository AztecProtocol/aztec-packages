import { SlotNumber } from '@aztec/foundation/branded-types';
import { chunk } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2Block, L2BlockId } from '@aztec/stdlib/block';
import { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import EventEmitter from 'node:events';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { TxPoolQueueInstrumentation } from './instrumentation.js';
import type {
  AddTxsResult,
  PoolReadAccess,
  TxPoolV2,
  TxPoolV2Config,
  TxPoolV2Dependencies,
  TxPoolV2Events,
} from './interfaces.js';
import type { TxState } from './tx_metadata.js';
import type { MinedTxInfo } from './tx_pool_v2_impl.js';
import { FINALIZE_BLOCK_CHUNK_SIZE, TxPoolV2Impl } from './tx_pool_v2_impl.js';

/**
 * Implementation of TxPoolV2 with explicit state management.
 *
 * This class is a thin wrapper that manages the serial queue and delegates
 * all operations to TxPoolV2Impl.
 */
export class AztecKVTxPoolV2 extends (EventEmitter as new () => TypedEventEmitter<TxPoolV2Events>) implements TxPoolV2 {
  #queue: SerialQueue;
  #queueMetrics: TxPoolQueueInstrumentation;
  /** Serializes finalizations so their chunked #queue items never interleave with each other. */
  #finalizationQueue = new SerialQueue();
  #impl: TxPoolV2Impl;
  #metrics?: PoolInstrumentation<Tx>;
  #store: AztecAsyncKVStore;
  #telemetry: TelemetryClient;
  #log: Logger;
  #started = false;

  constructor(
    store: AztecAsyncKVStore,
    archiveStore: AztecAsyncKVStore,
    deps: TxPoolV2Dependencies,
    telemetry: TelemetryClient = getTelemetryClient(),
    config: Partial<TxPoolV2Config> = {},
    dateProvider: DateProvider = new DateProvider(),
    log = createLogger('p2p:tx_pool_v2'),
  ) {
    super();

    this.#store = store;
    this.#telemetry = telemetry;
    this.#log = log;
    this.#queue = new SerialQueue();
    this.#queueMetrics = new TxPoolQueueInstrumentation(telemetry, () => this.#queue.length());

    // Create callbacks that the impl uses to notify us about events and metrics
    const callbacks = {
      onTxsAdded: (txs: Tx[], opts: { source?: string }) => {
        this.emit('txs-added', { txs, ...opts });
      },
      onTxsRemoved: (txHashes: string[] | bigint[]) => {
        // Convert to TxHash objects for the event
        const hashes = txHashes.map(h => (typeof h === 'string' ? TxHash.fromString(h) : TxHash.fromBigInt(h)));
        this.emit('txs-removed', { txHashes: hashes });
      },
      onTxsMined: (minedTxs: MinedTxInfo[]) => {
        // Pending-to-mined delay is derived from the tx's persisted receivedAt at the mined
        // transition (see TxPoolV2Impl.handleMinedBlock), not the add/remove timestamp map —
        // so eviction no longer pollutes MEMPOOL_TX_MINED_DELAY.
        for (const { minedDelayMs } of minedTxs) {
          if (minedDelayMs !== undefined) {
            this.#metrics?.recordMinedDelay(minedDelayMs);
          }
        }
      },
    };

    // Create the implementation
    this.#impl = new TxPoolV2Impl(store, archiveStore, deps, callbacks, telemetry, config, dateProvider, log);
  }

  // ============================================================================
  // PUBLIC API - All methods queue to the implementation
  // ============================================================================

  /**
   * Enqueues an operation on the serial queue, recording how long it waited behind other queued
   * work and how long it took to execute once running.
   */
  #run<T>(operation: string, fn: () => T | Promise<T>): Promise<Awaited<T>> {
    const waitTimer = new Timer();
    return this.#queue.put(async () => {
      const waitMs = waitTimer.ms();
      const executionTimer = new Timer();
      try {
        return await fn();
      } finally {
        this.#queueMetrics.record(operation, waitMs, executionTimer.ms());
      }
    });
  }

  // === Core Operations ===

  addPendingTxs(txs: Tx[], opts: { source?: string; feeComparisonOnly?: boolean } = {}): Promise<AddTxsResult> {
    return this.#run('addPendingTxs', () => this.#impl.addPendingTxs(txs, opts));
  }

  canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored'> {
    return this.#run('canAddPendingTx', () => this.#impl.canAddPendingTx(tx));
  }

  addProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string } = {}): Promise<void> {
    return this.#run('addProtectedTxs', () => this.#impl.addProtectedTxs(txs, block, opts));
  }

  protectTxs(txHashes: TxHash[], block: BlockHeader): Promise<TxHash[]> {
    return this.#run('protectTxs', () => this.#impl.protectTxs(txHashes, block));
  }

  addMinedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string } = {}): Promise<void> {
    return this.#run('addMinedTxs', () => this.#impl.addMinedTxs(txs, block, opts));
  }

  // === State Transition Handlers ===

  handleMinedBlock(block: L2Block): Promise<void> {
    return this.#run('handleMinedBlock', () => this.#impl.handleMinedBlock(block));
  }

  prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    return this.#run('prepareForSlot', () => this.#impl.prepareForSlot(slotNumber));
  }

  unprotectTxs(txHashes: TxHash[], slotNumber: SlotNumber): Promise<void> {
    return this.#run('unprotectTxs', () => this.#impl.unprotectTxs(txHashes, slotNumber));
  }

  handlePrunedBlocks(latestBlock: L2BlockId, options?: { deleteAllTxs?: boolean }): Promise<void> {
    return this.#run('handlePrunedBlocks', () => this.#impl.handlePrunedBlocks(latestBlock, options));
  }

  handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    return this.#run('handleFailedExecution', () => this.#impl.handleFailedExecution(txHashes));
  }

  /**
   * Handles a finalized block by archiving and deleting the mined txs it finalizes. The work is
   * split into chunk-sized serial-queue items rather than one long-running item, so gossip-driven
   * pool operations (canAddPendingTx / addPendingTxs) interleave with finalization instead of
   * stalling behind an entire epoch's worth of tx processing. Finalizations run on their own serial
   * queue so two concurrent calls never interleave their chunks with each other.
   */
  handleFinalizedBlock(block: BlockHeader): Promise<void> {
    return this.#finalizationQueue.put(() => this.#handleFinalizedBlock(block));
  }

  async #handleFinalizedBlock(block: BlockHeader): Promise<void> {
    const { cutoffBlock, txHashes } = await this.#run('prepareFinalization', () =>
      this.#impl.prepareFinalization(block),
    );
    const batches = chunk(txHashes, FINALIZE_BLOCK_CHUNK_SIZE);
    for (const batch of batches) {
      await this.#run('archiveFinalizedTxs', () => this.#impl.archiveFinalizedTxs(batch));
    }
    for (const batch of batches) {
      await this.#run('deleteFinalizedTxs', () => this.#impl.deleteFinalizedTxs(batch, cutoffBlock));
    }
    await this.#run('completeFinalization', () =>
      this.#impl.completeFinalization(txHashes, cutoffBlock, block.globalVariables.blockNumber),
    );
  }

  // === Queries ===

  getTxByHash(txHash: TxHash, opts?: { includeProof?: boolean }): Promise<Tx | undefined> {
    return this.#run('getTxByHash', () => this.#impl.getTxByHash(txHash, opts));
  }

  getTxsByHash(txHashes: TxHash[], opts?: { includeProof?: boolean }): Promise<(Tx | undefined)[]> {
    return this.#run('getTxsByHash', () => this.#impl.getTxsByHash(txHashes, opts));
  }

  hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return this.#run('hasTxs', () => this.#impl.hasTxs(txHashes));
  }

  getTxStatus(txHash: TxHash): Promise<TxState | 'deleted' | undefined> {
    return this.#run('getTxStatus', () => this.#impl.getTxStatus(txHash));
  }

  getPendingTxHashes(): Promise<TxHash[]> {
    return this.#run('getPendingTxHashes', () => this.#impl.getPendingTxHashes());
  }

  getEligiblePendingTxHashes(): Promise<TxHash[]> {
    return this.#run('getEligiblePendingTxHashes', () => this.#impl.getEligiblePendingTxHashes());
  }

  getPendingTxCount(): Promise<number> {
    return this.#run('getPendingTxCount', () => this.#impl.getPendingTxCount());
  }

  hasEligiblePendingTxs(minCount: number): Promise<boolean> {
    return this.#run('hasEligiblePendingTxs', () => this.#impl.hasEligiblePendingTxs(minCount));
  }

  getMinedTxHashes(): Promise<[TxHash, L2BlockId][]> {
    return this.#run('getMinedTxHashes', () => this.#impl.getMinedTxHashes());
  }

  getMinedTxCount(): Promise<number> {
    return this.#run('getMinedTxCount', () => this.#impl.getMinedTxCount());
  }

  isEmpty(): Promise<boolean> {
    return this.#run('isEmpty', () => this.#impl.isEmpty());
  }

  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#run('getArchivedTxByHash', () => this.#impl.getArchivedTxByHash(txHash));
  }

  getLowestPriorityPending(limit: number): Promise<TxHash[]> {
    return this.#run('getLowestPriorityPending', () => this.#impl.getLowestPriorityPending(limit));
  }

  /** Returns read-only access to the pool. Used for testing. */
  getPoolReadAccess(): PoolReadAccess {
    return this.#impl.getPoolReadAccess();
  }

  // === Configuration ===

  updateConfig(config: Partial<TxPoolV2Config>): Promise<void> {
    return this.#queue.put(() => {
      this.#impl.updateConfig(config);
      return Promise.resolve();
    });
  }

  // === Lifecycle ===

  /**
   * Starts the pool and initializes state from persistence.
   */
  async start(): Promise<void> {
    if (this.#started) {
      return;
    }

    this.#log.info('Starting transaction pool...');

    // Start the serial queues
    this.#queue.start();
    this.#finalizationQueue.start();
    this.#started = true;

    // Setup metrics - created after queue is started so callbacks can safely queue
    this.#metrics = new PoolInstrumentation(
      this.#telemetry,
      PoolName.TX_POOL,
      () =>
        this.#queue.put(() => {
          const counts = this.#impl.countTxs();
          return Promise.resolve({
            itemCount: {
              pending: counts.pending,
              protected: counts.protected,
              mined: counts.mined,
              softDeleted: counts.softDeleted,
            },
          });
        }),
      () => this.#store.estimateSize(),
    );

    // Hydrate state from persistence (runs in queue)
    await this.#queue.put(() => this.#impl.hydrateFromDatabase());

    this.#log.info(
      `Transaction pool started with ${this.#impl.getTxCount()} transactions (${this.#impl.getPendingTxCount()} pending, ${this.#impl.getMinedTxCount()} mined)`,
    );
  }

  async stop(): Promise<void> {
    if (this.#started) {
      // End the finalization queue first: an in-flight finalization still needs #queue to run its chunks.
      await this.#finalizationQueue.end();
      await this.#queue.end();
      this.#started = false;
    }
  }
}
