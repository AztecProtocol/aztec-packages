import { ClientIvcProof } from '@aztec/circuits.js/proofs';
import { type TxAddedToPoolStats } from '@aztec/circuits.js/stats';
import { Tx, TxHash } from '@aztec/circuits.js/tx';
import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { getPendingTxPriority } from './priority.js';
import { type TxPool } from './tx_pool.js';

/**
 * KV implementation of the Transaction Pool.
 */
export class AztecKVTxPool implements TxPool {
  #store: AztecAsyncKVStore;

  /** Our tx pool, stored as a Map, with K: tx hash and V: the transaction. */
  #txs: AztecAsyncMap<string, Buffer>;

  /** Index from tx hash to the block number in which they were mined, filtered by mined txs. */
  #minedTxHashToBlock: AztecAsyncMap<string, number>;

  /** Index from tx priority (stored as hex) to its tx hash, filtered by pending txs. */
  #pendingTxPriorityToHash: AztecAsyncMultiMap<string, string>;

  /** KV store for archived txs. */
  #archive: AztecAsyncKVStore;

  /** Archived txs map for future lookup. */
  #archivedTxs: AztecAsyncMap<string, Buffer>;

  /** Indexes of the archived txs by insertion order. */
  #archivedTxIndices: AztecAsyncMap<number, string>;

  /** Number of txs to archive. */
  #archivedTxLimit: number;

  #log: Logger;

  #metrics: PoolInstrumentation<Tx>;

  /**
   * Class constructor for KV TxPool. Initiates our transaction pool as an AztecMap.
   * @param store - A KV store for live txs in the pool.
   * @param archive - A KV store for archived txs.
   * @param telemetry - A telemetry client.
   * @param archivedTxLimit - The number of txs to archive.
   * @param log - A logger.
   */
  constructor(
    store: AztecAsyncKVStore,
    archive: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
    archivedTxLimit: number = 0,
    log = createLogger('p2p:tx_pool'),
  ) {
    this.#txs = store.openMap('txs');
    this.#minedTxHashToBlock = store.openMap('txHashToBlockMined');
    this.#pendingTxPriorityToHash = store.openMultiMap('pendingTxFeeToHash');

    this.#archivedTxs = archive.openMap('archivedTxs');
    this.#archivedTxIndices = archive.openMap('archivedTxIndices');
    this.#archivedTxLimit = archivedTxLimit;

    this.#store = store;
    this.#archive = archive;
    this.#log = log;
    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, () => store.estimateSize());
  }

  public markAsMined(txHashes: TxHash[], blockNumber: number): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    let deletedPending = 0;
    return this.#store.transactionAsync(async () => {
      for (const hash of txHashes) {
        const key = hash.toString();
        await this.#minedTxHashToBlock.set(key, blockNumber);

        const tx = await this.getTxByHash(hash);
        if (tx) {
          deletedPending++;
          const fee = getPendingTxPriority(tx);
          await this.#pendingTxPriorityToHash.deleteValue(fee, key);
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
    return this.#store.transactionAsync(async () => {
      for (const hash of txHashes) {
        const key = hash.toString();
        await this.#minedTxHashToBlock.delete(key);

        const tx = await this.getTxByHash(hash);
        if (tx) {
          await this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), key);
          markedAsPending++;
        }
      }

      this.#metrics.recordAddedObjects(markedAsPending, 'pending');
      this.#metrics.recordRemovedObjects(markedAsPending, 'mined');
    });
  }

  public async getPendingTxHashes(): Promise<TxHash[]> {
    const vals = await toArray(this.#pendingTxPriorityToHash.valuesAsync({ reverse: true }));
    return vals.map(x => TxHash.fromString(x));
  }

  public async getMinedTxHashes(): Promise<[TxHash, number][]> {
    const vals = await toArray(this.#minedTxHashToBlock.entriesAsync());
    return vals.map(([txHash, blockNumber]) => [TxHash.fromString(txHash), blockNumber]);
  }

  public async getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | undefined> {
    const key = txHash.toString();
    const [isMined, isKnown] = await Promise.all([this.#minedTxHashToBlock.hasAsync(key), this.#txs.hasAsync(key)]);

    if (isMined) {
      return 'mined';
    } else if (isKnown) {
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
  public async getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#txs.getAsync(txHash.toString());
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
  public async getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#archivedTxs.getAsync(txHash.toString());
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
  public async addTxs(txs: Tx[]): Promise<void> {
    const hashesAndStats = await Promise.all(
      txs.map(async tx => ({ txHash: await tx.getTxHash(), txStats: await tx.getStats() })),
    );
    await this.#store.transactionAsync(async () => {
      let pendingCount = 0;
      await Promise.all(
        txs.map(async (tx, i) => {
          const { txHash, txStats } = hashesAndStats[i];
          this.#log.verbose(`Adding tx ${txHash.toString()} to pool`, {
            eventName: 'tx-added-to-pool',
            ...txStats,
          } satisfies TxAddedToPoolStats);

          const key = txHash.toString();
          await this.#txs.set(key, tx.toBuffer());

          if (!(await this.#minedTxHashToBlock.hasAsync(key))) {
            pendingCount++;
            // REFACTOR: Use an lmdb conditional write to avoid race conditions with this write tx
            await this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), key);
            this.#metrics.recordSize(tx);
          }
        }),
      );

      this.#metrics.recordAddedObjects(pendingCount, 'pending');
    });
  }

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * @param txHashes - An array of tx hashes to be removed from the tx pool.
   * @returns Empty promise.
   */
  public deleteTxs(txHashes: TxHash[]): Promise<void> {
    let pendingDeleted = 0;
    let minedDeleted = 0;

    const deletedTxs: Tx[] = [];
    const poolDbTx = this.#store.transactionAsync(async () => {
      for (const hash of txHashes) {
        const key = hash.toString();
        const tx = await this.getTxByHash(hash);

        if (tx) {
          const fee = getPendingTxPriority(tx);
          await this.#pendingTxPriorityToHash.deleteValue(fee, key);

          const isMined = await this.#minedTxHashToBlock.hasAsync(key);
          if (isMined) {
            minedDeleted++;
          } else {
            pendingDeleted++;
          }

          if (this.#archivedTxLimit) {
            deletedTxs.push(tx);
          }

          await this.#txs.delete(key);
          await this.#minedTxHashToBlock.delete(key);
        }
      }

      this.#metrics.recordRemovedObjects(pendingDeleted, 'pending');
      this.#metrics.recordRemovedObjects(minedDeleted, 'mined');
    });

    return this.#archivedTxLimit ? poolDbTx.then(() => this.archiveTxs(deletedTxs)) : poolDbTx;
  }

  /**
   * Gets all the transactions stored in the pool.
   * @returns Array of tx objects in the order they were added to the pool.
   */
  public async getAllTxs(): Promise<Tx[]> {
    const vals = await toArray(this.#txs.entriesAsync());
    return vals.map(([hash, buffer]) => {
      const tx = Tx.fromBuffer(buffer);
      tx.setTxHash(TxHash.fromString(hash));
      return tx;
    });
  }

  /**
   * Gets the hashes of all transactions currently in the tx pool.
   * @returns An array of transaction hashes found in the tx pool.
   */
  public async getAllTxHashes(): Promise<TxHash[]> {
    const vals = await toArray(this.#txs.keysAsync());
    return vals.map(x => TxHash.fromString(x));
  }

  /**
   * Archives a list of txs for future reference. The number of archived txs is limited by the specified archivedTxLimit.
   * @param txs - The list of transactions to archive.
   * @returns Empty promise.
   */
  private async archiveTxs(txs: Tx[]): Promise<void> {
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    await this.#archive.transactionAsync(async () => {
      // calcualte the head and tail indices of the archived txs by insertion order.
      let headIdx =
        ((await this.#archivedTxIndices.entriesAsync({ limit: 1, reverse: true }).next()).value?.[0] ?? -1) + 1;
      let tailIdx = (await this.#archivedTxIndices.entriesAsync({ limit: 1 }).next()).value?.[0] ?? 0;

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        while (headIdx - tailIdx >= this.#archivedTxLimit) {
          const txHash = await this.#archivedTxIndices.getAsync(tailIdx);
          if (txHash) {
            await this.#archivedTxs.delete(txHash);
            await this.#archivedTxIndices.delete(tailIdx);
          }
          tailIdx++;
        }

        const archivedTx: Tx = new Tx(
          tx.data,
          ClientIvcProof.empty(),
          tx.contractClassLogs,
          tx.enqueuedPublicFunctionCalls,
          tx.publicTeardownFunctionCall,
        );
        const txHash = txHashes[i].toString();
        await this.#archivedTxs.set(txHash, archivedTx.toBuffer());
        await this.#archivedTxIndices.set(headIdx, txHash);
        headIdx++;
      }
    });
  }
}
