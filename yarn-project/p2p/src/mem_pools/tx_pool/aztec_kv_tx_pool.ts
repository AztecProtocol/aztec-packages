import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ArchiveCache } from '@aztec/sequencer-client';
import { GasFees } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import type { TxAddedToPoolStats } from '@aztec/stdlib/stats';
import { DatabasePublicStateSource } from '@aztec/stdlib/trees';
import { Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { GasTxValidator } from '../../msg_validators/index.js';
import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { getPendingTxPriority } from './priority.js';
import type { TxPool } from './tx_pool.js';

/**
 * KV implementation of the Transaction Pool.
 */
export class AztecKVTxPool implements TxPool {
  #store: AztecAsyncKVStore;

  /** Our tx pool, stored as a Map, with K: tx hash and V: the transaction. */
  #txs: AztecAsyncMap<string, Buffer>;

  /** The maximum cumulative tx size that the pending txs in the pool take up. */
  #maxTxPoolSize: number | undefined;

  /** Index from tx hash to the block number in which they were mined, filtered by mined txs. */
  #minedTxHashToBlock: AztecAsyncMap<string, number>;

  /** Index from tx priority (stored as hex) to its tx hash, filtered by pending txs. */
  #pendingTxPriorityToHash: AztecAsyncMultiMap<string, string>;

  /** Index from tx hash to its tx size, filtered by pending txs. */
  #pendingTxHashToSize: AztecAsyncMultiMap<string, number>;

  /** The cumulative tx size in bytes that the pending txs in the pool take up. */
  #pendingTxSize: AztecAsyncSingleton<number>;

  /** KV store for archived txs. */
  #archive: AztecAsyncKVStore;

  /** Archived txs map for future lookup. */
  #archivedTxs: AztecAsyncMap<string, Buffer>;

  /** Indexes of the archived txs by insertion order. */
  #archivedTxIndices: AztecAsyncMap<number, string>;

  /** Number of txs to archive. */
  #archivedTxLimit: number;

  /** The world state synchronizer used in the node. */
  #worldStateSynchronizer: WorldStateSynchronizer;

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
    worldStateSynchronizer: WorldStateSynchronizer,
    telemetry: TelemetryClient = getTelemetryClient(),
    config:
      | {
          maxTxPoolSize?: number;
          archivedTxLimit?: number;
        }
      | undefined = undefined,
    log = createLogger('p2p:tx_pool'),
  ) {
    this.#txs = store.openMap('txs');
    this.#minedTxHashToBlock = store.openMap('txHashToBlockMined');
    this.#pendingTxPriorityToHash = store.openMultiMap('pendingTxFeeToHash');
    this.#pendingTxHashToSize = store.openMultiMap('pendingTxHashToSize');
    this.#pendingTxSize = store.openSingleton('pendingTxSize');
    this.#maxTxPoolSize = config?.maxTxPoolSize;

    this.#archivedTxs = archive.openMap('archivedTxs');
    this.#archivedTxIndices = archive.openMap('archivedTxIndices');
    this.#archivedTxLimit = config?.archivedTxLimit ?? 0;

    this.#store = store;
    this.#archive = archive;
    this.#worldStateSynchronizer = worldStateSynchronizer;
    this.#log = log;
    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, () => store.estimateSize());
  }

  public markAsMined(txHashes: TxHash[], blockNumber: number): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    let deletedPending = 0;
    return this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      for (const hash of txHashes) {
        const key = hash.toString();
        await this.#minedTxHashToBlock.set(key, blockNumber);

        const tx = await this.getTxByHash(hash);
        if (tx) {
          deletedPending++;
          pendingTxSize -= tx.getSize();
          await this.removePendingTxIndices(tx, key);
        }
      }
      this.#metrics.recordAddedObjects(txHashes.length, 'mined');
      await this.#pendingTxSize.set(pendingTxSize);

      const numTxsEvicted = await this.evictInvalidTxsAfterMining(txHashes, blockNumber);
      this.#metrics.recordRemovedObjects(deletedPending + numTxsEvicted, 'pending');
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
          await this.addPendingTxIndices(tx, key);
          markedAsPending++;
        }
      }

      const numInvalidTxsEvicted = await this.evictInvalidTxsAfterReorg(txHashes);
      const { numLowPriorityTxsEvicted, numNewTxsEvicted } = await this.evictLowPriorityTxs(txHashes);

      this.#metrics.recordAddedObjects(markedAsPending - numNewTxsEvicted, 'pending');
      this.#metrics.recordRemovedObjects(numInvalidTxsEvicted + numLowPriorityTxsEvicted - numNewTxsEvicted, 'pending');
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
    // TODO: benchmark performance with an alternate approach that checks tx priority before inserting txs into the pool instead of adding and then evicting low priority txs after
    await this.#store.transactionAsync(async () => {
      let pendingCount = 0;
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
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
            pendingTxSize += tx.getSize();
            await this.addPendingTxIndices(tx, key);
            this.#metrics.recordSize(tx);
          }
        }),
      );

      await this.#pendingTxSize.set(pendingTxSize);

      const { numLowPriorityTxsEvicted, numNewTxsEvicted } = await this.evictLowPriorityTxs(
        hashesAndStats.map(({ txHash }) => txHash),
      );

      this.#metrics.recordAddedObjects(pendingCount - numNewTxsEvicted, 'pending');
      this.#metrics.recordRemovedObjects(numLowPriorityTxsEvicted - numNewTxsEvicted, 'pending');
    });
  }

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * @param txHashes - An array of tx hashes to be removed from the tx pool.
   * @returns Empty promise.
   */
  public deleteTxs(txHashes: TxHash[], eviction = false): Promise<void> {
    let pendingDeleted = 0;
    let minedDeleted = 0;

    const deletedTxs: Tx[] = [];
    const poolDbTx = this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      for (const hash of txHashes) {
        const key = hash.toString();
        const tx = await this.getTxByHash(hash);

        if (tx) {
          await this.removePendingTxIndices(tx, key);

          const isMined = await this.#minedTxHashToBlock.hasAsync(key);
          if (isMined) {
            minedDeleted++;
          } else {
            pendingDeleted++;
            pendingTxSize -= tx.getSize();
          }

          if (!eviction && this.#archivedTxLimit) {
            deletedTxs.push(tx);
          }

          await this.#txs.delete(key);
          await this.#minedTxHashToBlock.delete(key);
        }
      }

      await this.#pendingTxSize.set(pendingTxSize);
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

        const archivedTx: Tx = new Tx(tx.data, ClientIvcProof.empty(), tx.contractClassLogs, tx.publicFunctionCalldata);
        const txHash = txHashes[i].toString();
        await this.#archivedTxs.set(txHash, archivedTx.toBuffer());
        await this.#archivedTxIndices.set(headIdx, txHash);
        headIdx++;
      }
    });
  }

  /**
   * Evicts pending txs with the lowest priority fees from the pool to accomodate the max tx count and cumulative max tx size
   * after new txs are added.
   *
   * @param newTxHashes - The tx hashes of the new txs added to the pool.
   * @returns The total number of txs evicted from the pool and the number of new txs that were evicted.
   */
  private async evictLowPriorityTxs(
    newTxHashes: TxHash[],
  ): Promise<{ numLowPriorityTxsEvicted: number; numNewTxsEvicted: number }> {
    if (this.#maxTxPoolSize === undefined) {
      return { numLowPriorityTxsEvicted: 0, numNewTxsEvicted: 0 };
    }

    let numNewTxsEvicted = 0;
    const txsToEvict: TxHash[] = [];

    let pendingTxsSize = (await this.#pendingTxSize.getAsync()) ?? 0;
    if (pendingTxsSize > this.#maxTxPoolSize) {
      for await (const txHash of this.#pendingTxPriorityToHash.valuesAsync()) {
        this.#log.verbose(`Evicting tx ${txHash} from pool due to low priority to satisfy max tx size limit`);
        txsToEvict.push(TxHash.fromString(txHash));

        const txSize = (await this.#pendingTxHashToSize.getAsync(txHash.toString())) ?? 0;
        pendingTxsSize -= txSize;
        if (pendingTxsSize <= this.#maxTxPoolSize) {
          break;
        }
      }
      numNewTxsEvicted += newTxHashes.filter(txHash => txsToEvict.includes(txHash)).length;
    }

    if (txsToEvict.length > 0) {
      await this.deleteTxs(txsToEvict, true);
    }
    return {
      numLowPriorityTxsEvicted: txsToEvict.length,
      numNewTxsEvicted,
    };
  }

  /**
   * Evicts invalid pending txs from the pool after a txs from a block are mined.
   * Eviction criteria includes:
   *   - txs with nullifiers that are already included in the mined block
   *   - txs with an insufficient fee payer balance
   *   - txs with a max block number lower than the mined block
   *
   * @param minedTxHashes - The tx hashes of the txs mined in the block.
   * @param blockNumber - The block number of the mined block.
   * @returns The total number of txs evicted from the pool.
   */
  private async evictInvalidTxsAfterMining(minedTxHashes: TxHash[], blockNumber: number): Promise<number> {
    if (minedTxHashes.length === 0) {
      return 0;
    }

    const pendingTxHashes = await this.getPendingTxHashes();
    const minedTxs = await Promise.all(minedTxHashes.map(async hash => await this.getTxByHash(hash)));
    const minedNullifiers = new Set<string>();
    for (const tx of minedTxs) {
      if (tx) {
        const nullifiers = tx.data.getNonEmptyNullifiers();
        nullifiers.forEach(nullifier => minedNullifiers.add(nullifier.toString()));
      }
    }
    const pendingTxs = await Promise.all(
      pendingTxHashes.map(async hash => ({
        hash,
        // TODO: keep an eye on the cost of rehydrating txs, we may have to store them to avoid recomputing
        tx: await this.getTxByHash(hash),
      })),
    );

    // Wait for world state to be synced to at least the mined block number
    await this.#worldStateSynchronizer.syncImmediate(blockNumber);

    const db = this.#worldStateSynchronizer.getCommitted();
    const gasTxValidator = new GasTxValidator(
      new DatabasePublicStateSource(db),
      ProtocolContractAddress.FeeJuice,
      GasFees.empty(),
    );

    const txsToEvict: TxHash[] = [];
    for (const { hash, tx } of pendingTxs) {
      if (!tx) {
        continue;
      }

      // Evict pending txs that share nullifiers with mined txs
      const txNullifiers = tx.data.getNonEmptyNullifiers();
      if (txNullifiers.some(nullifier => minedNullifiers.has(nullifier.toString()))) {
        this.#log.verbose(`Evicting tx ${hash.toString()} from pool due to a duplicate nullifier with a mined tx`);
        txsToEvict.push(hash);
        continue;
      }

      // Evict pending txs with an insufficient fee payer balance
      if ((await gasTxValidator.validateTxFee(tx)).result === 'invalid') {
        this.#log.verbose(`Evicting tx ${hash.toString()} from pool due to an insufficient fee payer balance`);
        txsToEvict.push(hash);
        continue;
      }

      // Evict pending txs with a max block number less than or equal to the mined block
      const maxBlockNumber = tx.data.rollupValidationRequests.maxBlockNumber;
      if (maxBlockNumber.isSome && maxBlockNumber.value.toNumber() <= blockNumber) {
        this.#log.verbose(`Evicting tx ${hash.toString()} from pool due to an invalid max block number`);
        txsToEvict.push(hash);
        continue;
      }
    }

    if (txsToEvict.length > 0) {
      await this.deleteTxs(txsToEvict, true);
    }
    return txsToEvict.length;
  }

  /**
   * Evicts pending txs that no longer have valid archive roots from the pool after a reorg.
   *
   * @param txHashes - The tx hashes of the txs that were moved from mined to pending.
   * @returns The total number of txs evicted from the pool.
   */
  private async evictInvalidTxsAfterReorg(txHashes: TxHash[]): Promise<number> {
    if (txHashes.length === 0) {
      return 0;
    }

    const db = this.#worldStateSynchronizer.getCommitted();
    const archiveCache = new ArchiveCache(db);
    const pendingTxHashes = await this.getPendingTxHashes();
    const pendingTxs = await Promise.all(
      pendingTxHashes.map(async hash => ({
        hash,
        // TODO: keep an eye on the cost of computing header hashes, we may have to store them to avoid recomputing
        headerHash: await (await this.getTxByHash(hash))?.data.constants.historicalHeader.hash(),
      })),
    );
    const txsToEvict: TxHash[] = [];

    for (const { hash, headerHash } of pendingTxs) {
      if (!headerHash) {
        continue;
      }
      const [index] = await archiveCache.getArchiveIndices([headerHash]);
      if (index === undefined) {
        this.#log.verbose(`Evicting tx ${hash.toString()} from pool due to an invalid archive root`);
        txsToEvict.push(hash);
      }
    }

    if (txsToEvict.length > 0) {
      await this.deleteTxs(txsToEvict, true);
    }
    return txsToEvict.length;
  }

  private async addPendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    await this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), txHash);
    await this.#pendingTxHashToSize.set(txHash, tx.getSize());
  }

  private async removePendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    await this.#pendingTxPriorityToHash.deleteValue(getPendingTxPriority(tx), txHash);
    await this.#pendingTxHashToSize.deleteValue(txHash, tx.getSize());
  }
}
