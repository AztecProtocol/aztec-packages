import { Tx, TxHash } from '@aztec/circuit-types';
import { type TxAddedToPoolStats } from '@aztec/circuit-types/stats';
import { createDebugLogger } from '@aztec/foundation/log';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation } from '../instrumentation.js';
import { type TxPool } from './tx_pool.js';

/**
 * In-memory implementation of the Transaction Pool.
 */
export class InMemoryTxPool implements TxPool {
  /** Our tx pool, stored as a Map in-memory, with K: tx hash and V: the transaction. */
  private txs: Map<bigint, Tx>;
  /** Map from block number to tx hashes mined in that block. */
  private minedTxs: Map<number, Set<bigint>>;
  /** Set of pending tx hashes. */
  private pendingTxs: Set<bigint>;

  private metrics: PoolInstrumentation<Tx>;

  /**
   * Class constructor for in-memory TxPool. Initiates our transaction pool as a JS Map.
   * @param log - A logger.
   */
  constructor(telemetry: TelemetryClient, private log = createDebugLogger('aztec:tx_pool')) {
    this.txs = new Map<bigint, Tx>();
    this.minedTxs = new Map<number, Set<bigint>>();
    this.pendingTxs = new Set();
    this.metrics = new PoolInstrumentation(telemetry, 'InMemoryTxPool');
  }

  public markAsMined(txHashes: TxHash[], blockNumber: number): Promise<void> {
    const keys = txHashes.map(x => x.toBigInt());

    const mined = this.minedTxs.get(blockNumber) ?? new Set();
    this.minedTxs.set(blockNumber, mined);

    keys.forEach(key => mined.add(key));
    keys.forEach(key => this.pendingTxs.delete(key));

    this.metrics.recordRemovedObjects(txHashes.length, 'pending');
    this.metrics.recordAddedObjects(txHashes.length, 'mined');
    return Promise.resolve();
  }

  public markAsPending(blockNumber: number): Promise<void> {
    const mined = this.minedTxs.get(blockNumber) ?? [];
    mined.forEach(key => this.pendingTxs.add(key));
    return Promise.resolve();
  }

  public getPendingTxHashes(): TxHash[] {
    return Array.from(this.pendingTxs).map(x => TxHash.fromBigInt(x));
  }

  public getMinedTxHashes(): TxHash[] {
    return Array.from(this.minedTxs.values())
      .flatMap(set => Array.from(set))
      .map(key => TxHash.fromBigInt(key));
  }

  public getTxStatus(txHash: TxHash): 'pending' | 'mined' | undefined {
    const key = txHash.toBigInt();
    if (this.pendingTxs.has(key)) {
      return 'pending';
    }
    if (Array.from(this.minedTxs.values()).find(set => set.has(key))) {
      return 'mined';
    }
    return undefined;
  }

  /**
   * Checks if a transaction exists in the pool and returns it.
   * @param txHash - The generated tx hash.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  public getTxByHash(txHash: TxHash): Tx | undefined {
    const result = this.txs.get(txHash.toBigInt());
    return result === undefined ? undefined : Tx.clone(result);
  }

  /**
   * Adds a list of transactions to the pool. Duplicates are ignored.
   * @param txs - An array of txs to be added to the pool.
   * @returns Empty promise.
   */
  public addTxs(txs: Tx[]): Promise<void> {
    let pending = 0;
    for (const tx of txs) {
      const txHash = tx.getTxHash();
      this.log.debug(`Adding tx with id ${txHash.toString()}`, {
        eventName: 'tx-added-to-pool',
        ...tx.getStats(),
      } satisfies TxAddedToPoolStats);

      const key = txHash.toBigInt();
      this.txs.set(key, tx);
      if (this.getTxStatus(txHash) === undefined) {
        pending++;
        this.metrics.recordSize(tx);
        this.pendingTxs.add(key);
      }
    }

    this.metrics.recordAddedObjects(pending, 'pending');
    return Promise.resolve();
  }

  public deleteMinedTxs(blockNumber: number): Promise<void> {
    const txHashes = this.minedTxs.get(blockNumber) ?? new Set();
    txHashes.forEach(key => this.txs.delete(key));
    this.minedTxs.delete(blockNumber);
    this.metrics.recordRemovedObjects(txHashes.size, 'mined');
    return Promise.resolve();
  }

  public deletePendingTxs(txHashes: TxHash[]): Promise<void> {
    txHashes.forEach(key => this.txs.delete(key.toBigInt()));
    this.metrics.recordRemovedObjects(txHashes.length, 'pending');
    return Promise.resolve();
  }

  /**
   * Gets all the transactions stored in the pool.
   * @returns Array of tx objects in the order they were added to the pool.
   */
  public getAllTxs(): Tx[] {
    return Array.from(this.txs.values()).map(x => Tx.clone(x));
  }

  /**
   * Gets the hashes of all transactions currently in the tx pool.
   * @returns An array of transaction hashes found in the tx pool.
   */
  public getAllTxHashes(): TxHash[] {
    return Array.from(this.txs.keys()).map(x => TxHash.fromBigInt(x));
  }
}
