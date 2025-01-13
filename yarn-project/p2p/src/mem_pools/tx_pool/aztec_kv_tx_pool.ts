import { Tx, TxHash } from '@aztec/circuit-types';
import { type TxAddedToPoolStats } from '@aztec/circuit-types/stats';
import { ClientIvcProof } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type AztecKVStore,
  type AztecMap,
  type AztecMapWithSize,
  type AztecMultiMap,
  type AztecSingleton,
} from '@aztec/kv-store';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { getP2PConfigFromEnv } from '../../config.js';
import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { getPendingTxPriority } from './priority.js';
import { type TxPool } from './tx_pool.js';

/**
 * KV implementation of the Transaction Pool.
 */
export class AztecKVTxPool implements TxPool {
  #store: AztecKVStore;

  /** Our tx pool, stored as a Map, with K: tx hash and V: the transaction. */
  #txs: AztecMap<string, Buffer>;

  /** Index from tx hash to the block number in which they were mined, filtered by mined txs. */
  #minedTxHashToBlock: AztecMap<string, number>;

  /** Index from tx priority (stored as hex) to its tx hash, filtered by pending txs. */
  #pendingTxPriorityToHash: AztecMultiMap<string, string>;

  /** Archived txs map for future lookup. */
  #archivedTxs: AztecMapWithSize<string, Buffer>;

  /** Indexes of the archived txs by insertion order. */
  #archivedTxIndices: AztecMap<number, string>;

  /** Index of the most recently inserted archived tx. */
  #archivedTxHead: AztecSingleton<number>;

  /** Index of the oldest archived tx. */
  #archivedTxTail: AztecSingleton<number>;

  /** Number of txs to archive. */
  #archivedTxLimit: number;

  #log: Logger;

  #metrics: PoolInstrumentation<Tx>;

  /**
   * Class constructor for KV TxPool. Initiates our transaction pool as an AztecMap.
   * @param store - A KV store.
   * @param log - A logger.
   */
  constructor(
    store: AztecKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    archivedTxLimit = getP2PConfigFromEnv().archivedTxLimit,
    log = createLogger('p2p:tx_pool'),
  ) {
    this.#txs = store.openMap('txs');
    this.#minedTxHashToBlock = store.openMap('txHashToBlockMined');
    this.#pendingTxPriorityToHash = store.openMultiMap('pendingTxFeeToHash');

    this.#archivedTxs = store.openMapWithSize('archivedTxs');
    this.#archivedTxIndices = store.openMap('archivedTxIndicies');
    this.#archivedTxHead = store.openSingleton('archivedTxHead');
    this.#archivedTxTail = store.openSingleton('archivedTxTail');
    this.#archivedTxLimit = archivedTxLimit;

    this.#store = store;
    this.#log = log;
    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, () => store.estimateSize());
  }

  public markAsMined(txHashes: TxHash[], blockNumber: number): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    let deletedPending = 0;
    return this.#store.transaction(() => {
      for (const hash of txHashes) {
        const key = hash.toString();
        void this.#minedTxHashToBlock.set(key, blockNumber);

        const tx = this.getTxByHash(hash);
        if (tx) {
          deletedPending++;
          const fee = getPendingTxPriority(tx);
          void this.#pendingTxPriorityToHash.deleteValue(fee, key);
        }
      }
      this.#metrics.recordAddedObjects(txHashes.length, 'mined');
      this.#metrics.recordRemovedObjects(deletedPending, 'pending');
    });
  }

  public markMinedAsPending(txHashes: TxHash[]): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    let markedAsPending = 0;
    return this.#store.transaction(() => {
      for (const hash of txHashes) {
        const key = hash.toString();
        void this.#minedTxHashToBlock.delete(key);

        const tx = this.getTxByHash(hash);
        if (tx) {
          void this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), key);
          markedAsPending++;
        }
      }

      this.#metrics.recordAddedObjects(markedAsPending, 'pending');
      this.#metrics.recordRemovedObjects(markedAsPending, 'mined');
    });
  }

  public getPendingTxHashes(): TxHash[] {
    return Array.from(this.#pendingTxPriorityToHash.values({ reverse: true })).map(x => TxHash.fromString(x));
  }

  public getMinedTxHashes(): [TxHash, number][] {
    return Array.from(this.#minedTxHashToBlock.entries()).map(([txHash, blockNumber]) => [
      TxHash.fromString(txHash),
      blockNumber,
    ]);
  }

  public getTxStatus(txHash: TxHash): 'pending' | 'mined' | undefined {
    const key = txHash.toString();
    if (this.#minedTxHashToBlock.has(key)) {
      return 'mined';
    } else if (this.#txs.has(key)) {
      return 'pending';
    } else {
      return undefined;
    }
  }

  /**
   * Checks if a transaction exists in the pool and returns it.
   * @param txHash - The generated tx hash.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  public getTxByHash(txHash: TxHash): Tx | undefined {
    const buffer = this.#txs.get(txHash.toString());
    if (buffer) {
      const tx = Tx.fromBuffer(buffer);
      tx.setTxHash(txHash);
      return tx;
    }
    return undefined;
  }

  /**
   * Checks if an archived tx exists and returns it.
   * @param txHash - The tx hash.
   * @returns The transaction metadata, if found, 'undefined' otherwise.
   */
  public getArchivedTxByHash(txHash: TxHash): Tx | undefined {
    const buffer = this.#archivedTxs.get(txHash.toString());
    if (buffer) {
      const tx = Tx.fromBuffer(buffer);
      tx.setTxHash(txHash);
      return tx;
    }
    return undefined;
  }

  /**
   * Adds a list of transactions to the pool. Duplicates are ignored.
   * @param txs - An array of txs to be added to the pool.
   * @returns Empty promise.
   */
  public addTxs(txs: Tx[]): Promise<void> {
    return this.#store.transaction(() => {
      let pendingCount = 0;
      for (const tx of txs) {
        const txHash = tx.getTxHash();
        this.#log.verbose(`Adding tx ${txHash.toString()} to pool`, {
          eventName: 'tx-added-to-pool',
          ...tx.getStats(),
        } satisfies TxAddedToPoolStats);

        const key = txHash.toString();
        void this.#txs.set(key, tx.toBuffer());

        if (!this.#minedTxHashToBlock.has(key)) {
          pendingCount++;
          // REFACTOR: Use an lmdb conditional write to avoid race conditions with this write tx
          void this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), key);
          this.#metrics.recordSize(tx);
        }

        if (this.#archivedTxLimit) {
          void this.archiveTx(tx);
        }
      }

      this.#metrics.recordAddedObjects(pendingCount, 'pending');
    });
  }

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * @param txHashes - An array of tx hashes to be removed from the tx pool.
   * @returns The number of transactions that was deleted from the pool.
   */
  public deleteTxs(txHashes: TxHash[]): Promise<void> {
    let pendingDeleted = 0;
    let minedDeleted = 0;

    return this.#store.transaction(() => {
      for (const hash of txHashes) {
        const key = hash.toString();
        const tx = this.getTxByHash(hash);

        if (tx) {
          const fee = getPendingTxPriority(tx);
          void this.#pendingTxPriorityToHash.deleteValue(fee, key);

          const isMined = this.#minedTxHashToBlock.has(key);
          if (isMined) {
            minedDeleted++;
          } else {
            pendingDeleted++;
          }

          void this.#txs.delete(key);
          void this.#minedTxHashToBlock.delete(key);
        }
      }

      this.#metrics.recordRemovedObjects(pendingDeleted, 'pending');
      this.#metrics.recordRemovedObjects(minedDeleted, 'mined');
    });
  }

  /**
   * Gets all the transactions stored in the pool.
   * @returns Array of tx objects in the order they were added to the pool.
   */
  public getAllTxs(): Tx[] {
    return Array.from(this.#txs.entries()).map(([hash, buffer]) => {
      const tx = Tx.fromBuffer(buffer);
      tx.setTxHash(TxHash.fromString(hash));
      return tx;
    });
  }

  /**
   * Gets the hashes of all transactions currently in the tx pool.
   * @returns An array of transaction hashes found in the tx pool.
   */
  public getAllTxHashes(): TxHash[] {
    return Array.from(this.#txs.keys()).map(x => TxHash.fromString(x));
  }

  /**
   * Archive a tx for future reference.
   * @param tx - The transaction to archive.
   */
  private archiveTx(tx: Tx) {
    while (this.#archivedTxs.size() >= this.#archivedTxLimit) {
      const tailIdx = this.#archivedTxTail.get() ?? 0;
      const txHash = this.#archivedTxIndices.get(tailIdx);
      if (txHash) {
        void this.#archivedTxs.delete(txHash);
        void this.#archivedTxIndices.delete(tailIdx);
      }
      void this.#archivedTxTail.set(tailIdx + 1);
    }

    const archivedTx: Tx = new Tx(
      tx.data,
      ClientIvcProof.empty(),
      tx.unencryptedLogs,
      tx.contractClassLogs,
      tx.enqueuedPublicFunctionCalls,
      tx.publicTeardownFunctionCall,
    );
    const txHash = tx.getTxHash().toString();
    void this.#archivedTxs.set(txHash, archivedTx.toBuffer());
    const headIdx = this.#archivedTxHead.get() ?? 0;
    void this.#archivedTxIndices.set(headIdx, txHash);
    void this.#archivedTxHead.set(headIdx + 1);
  }
}
