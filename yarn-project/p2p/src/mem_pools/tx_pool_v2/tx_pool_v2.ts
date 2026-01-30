import { SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2BlockId } from '@aztec/stdlib/block';
import { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import EventEmitter from 'node:events';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import type { AddTxsResult, TxPoolV2, TxPoolV2Config, TxPoolV2Dependencies, TxPoolV2Events } from './interfaces.js';
import type { TxState } from './tx_metadata.js';
import { TxPoolV2Impl } from './tx_pool_v2_impl.js';

/**
 * Implementation of TxPoolV2 with explicit state management.
 *
 * This class is a thin wrapper that manages the serial queue and delegates
 * all operations to TxPoolV2Impl.
 */
export class AztecKVTxPoolV2 extends (EventEmitter as new () => TypedEventEmitter<TxPoolV2Events>) implements TxPoolV2 {
  #queue: SerialQueue;
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
    log = createLogger('p2p:tx_pool_v2'),
  ) {
    super();

    this.#store = store;
    this.#telemetry = telemetry;
    this.#log = log;
    this.#queue = new SerialQueue();

    // Create callbacks that the impl uses to notify us about events and metrics
    const callbacks = {
      onTxsAdded: (txs: Tx[], opts: { source?: string }) => {
        this.#metrics?.transactionsAdded(txs);
        this.emit('txs-added', { txs, ...opts });
      },
      onTxsRemoved: (txHashes: string[] | bigint[]) => {
        this.#metrics?.transactionsRemoved(txHashes);
      },
    };

    // Create the implementation
    this.#impl = new TxPoolV2Impl(store, archiveStore, deps, callbacks, config, log);
  }

  // ============================================================================
  // PUBLIC API - All methods queue to the implementation
  // ============================================================================

  // === Core Operations ===

  addPendingTxs(txs: Tx[], opts: { source?: string } = {}): Promise<AddTxsResult> {
    return this.#queue.put(() => this.#impl.addPendingTxs(txs, opts));
  }

  canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored' | 'rejected'> {
    return this.#queue.put(() => this.#impl.canAddPendingTx(tx));
  }

  addProtectedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string } = {}): Promise<void> {
    return this.#queue.put(() => this.#impl.addProtectedTxs(txs, block, opts));
  }

  protectTxs(txHashes: TxHash[], block: BlockHeader): Promise<TxHash[]> {
    return this.#queue.put(() => Promise.resolve(this.#impl.protectTxs(txHashes, block)));
  }

  addMinedTxs(txs: Tx[], block: BlockHeader, opts: { source?: string } = {}): Promise<void> {
    return this.#queue.put(() => this.#impl.addMinedTxs(txs, block, opts));
  }

  // === State Transition Handlers ===

  handleMinedBlock(txHashes: TxHash[], block: BlockHeader): Promise<void> {
    return this.#queue.put(() => this.#impl.handleMinedBlock(txHashes, block));
  }

  prepareForSlot(slotNumber: SlotNumber): Promise<void> {
    return this.#queue.put(() => this.#impl.prepareForSlot(slotNumber));
  }

  handlePrunedBlocks(latestBlock: L2BlockId): Promise<void> {
    return this.#queue.put(() => this.#impl.handlePrunedBlocks(latestBlock));
  }

  handleFailedExecution(txHashes: TxHash[]): Promise<void> {
    return this.#queue.put(() => this.#impl.handleFailedExecution(txHashes));
  }

  handleFinalizedBlock(block: BlockHeader): Promise<void> {
    return this.#queue.put(() => this.#impl.handleFinalizedBlock(block));
  }

  // === Queries ===

  getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#queue.put(() => this.#impl.getTxByHash(txHash));
  }

  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.#queue.put(() => this.#impl.getTxsByHash(txHashes));
  }

  hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return this.#queue.put(() => this.#impl.hasTxs(txHashes));
  }

  getTxStatus(txHash: TxHash): Promise<TxState | 'deleted' | undefined> {
    return this.#queue.put(() => Promise.resolve(this.#impl.getTxStatus(txHash)));
  }

  getPendingTxHashes(): Promise<TxHash[]> {
    return this.#queue.put(() => Promise.resolve(this.#impl.getPendingTxHashes()));
  }

  getPendingTxCount(): Promise<number> {
    return this.#queue.put(() => Promise.resolve(this.#impl.getPendingTxCount()));
  }

  getMinedTxHashes(): Promise<[TxHash, L2BlockId][]> {
    return this.#queue.put(() => Promise.resolve(this.#impl.getMinedTxHashes()));
  }

  getMinedTxCount(): Promise<number> {
    return this.#queue.put(() => Promise.resolve(this.#impl.getMinedTxCount()));
  }

  isEmpty(): Promise<boolean> {
    return this.#queue.put(() => Promise.resolve(this.#impl.isEmpty()));
  }

  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.#queue.put(() => this.#impl.getArchivedTxByHash(txHash));
  }

  getLowestPriorityEvictable(limit: number): Promise<TxHash[]> {
    return this.#queue.put(() => Promise.resolve(this.#impl.getLowestPriorityEvictable(limit)));
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

    // Start the serial queue
    this.#queue.start();
    this.#started = true;

    // Setup metrics - created after queue is started so callbacks can safely queue
    this.#metrics = new PoolInstrumentation(
      this.#telemetry,
      PoolName.TX_POOL,
      () =>
        this.#queue.put(() => {
          const counts = this.#impl.countTxs();
          return Promise.resolve({
            itemCount: { pending: counts.pending, protected: counts.protected, mined: counts.mined },
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
      await this.#queue.end();
      this.#started = false;
    }
  }
}
