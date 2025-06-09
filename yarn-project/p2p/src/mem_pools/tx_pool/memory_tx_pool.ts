import { createLogger } from '@aztec/foundation/log';
import type { TxAddedToPoolStats } from '@aztec/stdlib/stats';
import { Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import { getPendingTxPriority } from './priority.js';
import type { TxPool, TxPoolOptions } from './tx_pool.js';

/**
 * In-memory implementation of the Transaction Pool.
 */
export class InMemoryTxPool implements TxPool {
  /**
   * Our tx pool, stored as a Map in-memory, with K: tx hash and V: the transaction.
   */
  private txs: Map<bigint, Tx>;
  private minedTxs: Map<bigint, number>;
  private pendingTxs: Set<bigint>;

  private metrics: PoolInstrumentation<Tx>;

  /**
   * Class constructor for in-memory TxPool. Initiates our transaction pool as a JS Map.
   * @param log - A logger.
   */
  constructor(
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('p2p:tx_pool'),
  ) {
    this.txs = new Map<bigint, Tx>();
    this.minedTxs = new Map();
    this.pendingTxs = new Set();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, this.countTx);
  }

  private countTx: PoolStatsCallback = () => {
    return Promise.resolve({
      itemCount: {
        mined: this.minedTxs.size,
        pending: this.pendingTxs.size,
      },
    });
  };

  public isEmpty(): Promise<boolean> {
    return Promise.resolve(this.txs.size === 0);
  }

  public markAsMined(txHashes: TxHash[], blockNumber: number): Promise<void> {
    const keys = txHashes.map(x => x.toBigInt());
    for (const key of keys) {
      this.minedTxs.set(key, blockNumber);
      this.pendingTxs.delete(key);
    }
    return Promise.resolve();
  }

  public markMinedAsPending(txHashes: TxHash[]): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    const keys = txHashes.map(x => x.toBigInt());
    for (const key of keys) {
      this.minedTxs.delete(key);

      // only add back to the pending set if we have the tx object
      if (this.txs.has(key)) {
        this.pendingTxs.add(key);
      }
    }

    return Promise.resolve();
  }

  public async getPendingTxHashes(): Promise<TxHash[]> {
    const txs = (await this.getAllTxs()).sort(
      (tx1, tx2) => -getPendingTxPriority(tx1).localeCompare(getPendingTxPriority(tx2)),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    return txHashes.filter(txHash => this.pendingTxs.has(txHash.toBigInt()));
  }

  public getMinedTxHashes(): Promise<[TxHash, number][]> {
    return Promise.resolve(
      Array.from(this.minedTxs.entries()).map(([txHash, blockNumber]) => [TxHash.fromBigInt(txHash), blockNumber]),
    );
  }

  public getPendingTxCount(): Promise<number> {
    return Promise.resolve(this.pendingTxs.size);
  }

  public getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | undefined> {
    const key = txHash.toBigInt();
    if (this.pendingTxs.has(key)) {
      return Promise.resolve('pending');
    }
    if (this.minedTxs.has(key)) {
      return Promise.resolve('mined');
    }
    return Promise.resolve(undefined);
  }

  /**
   * Checks if a transaction exists in the pool and returns it.
   * @param txHash - The generated tx hash.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  public getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const result = this.txs.get(txHash.toBigInt());
    return Promise.resolve(result === undefined ? undefined : Tx.clone(result));
  }

  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return Promise.all(txHashes.map(txHash => this.getTxByHash(txHash)));
  }
  hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return Promise.resolve(txHashes.map(txHash => this.txs.has(txHash.toBigInt())));
  }

  public getArchivedTxByHash(): Promise<Tx | undefined> {
    return Promise.resolve(undefined);
  }

  /**
   * Adds a list of transactions to the pool. Duplicates are ignored.
   * @param txs - An array of txs to be added to the pool.
   * @returns Empty promise.
   */
  public async addTxs(txs: Tx[]): Promise<number> {
    let pending = 0;
    for (const tx of txs) {
      const txHash = await tx.getTxHash();
      this.log.verbose(`Adding tx ${txHash.toString()} to pool`, {
        eventName: 'tx-added-to-pool',
        ...(await tx.getStats()),
      } satisfies TxAddedToPoolStats);

      const key = txHash.toBigInt();
      this.txs.set(key, tx);
      if (!this.minedTxs.has(key)) {
        pending++;
        this.metrics.recordSize(tx);
        this.pendingTxs.add(key);
      }
    }
    return pending;
  }

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * @param txHashes - An array of tx hashes to be removed from the tx pool.
   * @returns The number of transactions that was deleted from the pool.
   */
  public deleteTxs(txHashes: TxHash[]): Promise<void> {
    for (const txHash of txHashes) {
      const key = txHash.toBigInt();
      this.txs.delete(key);
      this.pendingTxs.delete(key);
      this.minedTxs.delete(key);
    }

    return Promise.resolve();
  }

  /**
   * Gets all the transactions stored in the pool.
   * @returns Array of tx objects in the order they were added to the pool.
   */
  public getAllTxs(): Promise<Tx[]> {
    return Promise.resolve(Array.from(this.txs.values()).map(x => Tx.clone(x)));
  }

  /**
   * Gets the hashes of all transactions currently in the tx pool.
   * @returns An array of transaction hashes found in the tx pool.
   */
  public getAllTxHashes(): Promise<TxHash[]> {
    return Promise.resolve(Array.from(this.txs.keys()).map(x => TxHash.fromBigInt(x)));
  }

  updateConfig(_config: TxPoolOptions): void {}

  markTxsAsNonEvictable(_: TxHash[]): Promise<void> {
    return Promise.resolve();
  }
}
