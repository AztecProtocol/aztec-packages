import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import type { TxAddedToPoolStats } from '@aztec/stdlib/stats';
import { DatabasePublicStateSource } from '@aztec/stdlib/trees';
import { BlockHeader, Tx, TxHash, type TxWithHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import assert from 'assert';
import EventEmitter from 'node:events';

import { ArchiveCache } from '../../msg_validators/tx_validator/archive_cache.js';
import { GasTxValidator } from '../../msg_validators/tx_validator/gas_validator.js';
import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import { getPendingTxPriority } from './priority.js';
import type { TxPool, TxPoolEvents, TxPoolOptions } from './tx_pool.js';

/**
 * KV implementation of the Transaction Pool.
 */
export class AztecKVTxPool extends (EventEmitter as new () => TypedEventEmitter<TxPoolEvents>) implements TxPool {
  #store: AztecAsyncKVStore;

  /** Our tx pool, stored as a Map, with K: tx hash and V: the transaction. */
  #txs: AztecAsyncMap<string, Buffer>;

  /** The maximum cumulative tx size that the pending txs in the pool take up. */
  #maxTxPoolSize: number = 0;

  /** The tx evicion logic will kick after pool size is greater than maxTxPoolSize * txPoolOverflowFactor */
  txPoolOverflowFactor: number = 1;

  /** Index from tx hash to the block number in which they were mined, filtered by mined txs. */
  #minedTxHashToBlock: AztecAsyncMap<string, number>;

  /** Index from tx priority (stored as hex) to its tx hash, filtered by pending txs. */
  #pendingTxPriorityToHash: AztecAsyncMultiMap<string, string>;

  /** Index from tx hash to its tx size (in bytes), filtered by pending txs. */
  #pendingTxHashToSize: AztecAsyncMap<string, number>;

  /** Index from tx hash to its header hash, filtered by pending txs. */
  #pendingTxHashToHeaderHash: AztecAsyncMap<string, string>;

  /** The cumulative tx size in bytes that the pending txs in the pool take up. */
  #pendingTxSize: AztecAsyncSingleton<number>;

  /** In-memory mapping of pending tx hashes to the hydrated pending tx in the pool. */
  #pendingTxs: Map<string, Tx>;

  /** In-memory set of txs that should not be evicted from the pool. */
  #nonEvictableTxs: Set<string>;

  /** KV store for archived txs. */
  #archive: AztecAsyncKVStore;

  /** Archived txs map for future lookup. */
  #archivedTxs: AztecAsyncMap<string, Buffer>;

  /** Indexes of the archived txs by insertion order. */
  #archivedTxIndices: AztecAsyncMap<number, string>;

  /** Number of txs to archive. */
  #archivedTxLimit: number = 0;

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
    config: TxPoolOptions = {},
    log = createLogger('p2p:tx_pool'),
  ) {
    super();

    this.#log = log;
    this.updateConfig(config);

    this.#txs = store.openMap('txs');
    this.#minedTxHashToBlock = store.openMap('txHashToBlockMined');
    this.#pendingTxPriorityToHash = store.openMultiMap('pendingTxFeeToHash');
    this.#pendingTxHashToSize = store.openMap('pendingTxHashToSize');
    this.#pendingTxHashToHeaderHash = store.openMap('pendingTxHashToHeaderHash');
    this.#pendingTxSize = store.openSingleton('pendingTxSize');

    this.#pendingTxs = new Map<string, Tx>();
    this.#nonEvictableTxs = new Set<string>();

    this.#archivedTxs = archive.openMap('archivedTxs');
    this.#archivedTxIndices = archive.openMap('archivedTxIndices');

    this.#store = store;
    this.#archive = archive;
    this.#worldStateSynchronizer = worldStateSynchronizer;
    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, this.countTxs, () => store.estimateSize());
  }

  private countTxs: PoolStatsCallback = async () => {
    const [pending = 0, mined = 0] = await Promise.all([this.getPendingTxCount(), this.getMinedTxCount()]);

    return Promise.resolve({
      itemCount: {
        pending,
        mined,
      },
    });
  };

  public async isEmpty(): Promise<boolean> {
    for await (const _ of this.#txs.entriesAsync()) {
      return false;
    }
    return true;
  }
  /**
   * Marks transactions as mined in a block and updates the pool state accordingly.
   * Removes the transactions from the pending set and adds them to the mined set.
   * Also evicts any transactions that become invalid after the block is mined.
   * @param txHashes - Array of transaction hashes that were mined
   * @param blockHeader - The header of the block the transactions were mined in
   */
  public async markAsMined(txHashes: TxHash[], blockHeader: BlockHeader): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    const minedNullifiers = new Set<string>();
    const minedFeePayers = new Set<string>();

    await this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      for (const hash of txHashes) {
        const key = hash.toString();
        await this.#minedTxHashToBlock.set(key, blockHeader.globalVariables.blockNumber);

        const tx = await this.getPendingTxByHash(hash);
        if (tx) {
          const nullifiers = tx.data.getNonEmptyNullifiers();
          nullifiers.forEach(nullifier => minedNullifiers.add(nullifier.toString()));
          minedFeePayers.add(tx.data.feePayer.toString());
          pendingTxSize -= tx.getSize();
          await this.removePendingTxIndices(tx, key);
        }
      }
      await this.#pendingTxSize.set(pendingTxSize);

      await this.evictInvalidTxsAfterMining(txHashes, blockHeader, minedNullifiers, minedFeePayers);
    });
    // We update this after the transaction above. This ensures that the non-evictable transactions are not evicted
    // until any that have been mined are marked as such.
    // The non-evictable set is not considered when evicting transactions that are invalid after a block is mined.
    this.#nonEvictableTxs.clear();
  }

  public async markMinedAsPending(txHashes: TxHash[]): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }
    await this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      for (const hash of txHashes) {
        const key = hash.toString();
        await this.#minedTxHashToBlock.delete(key);

        // Rehydrate the tx in the in-memory pending txs mapping
        const tx = await this.getPendingTxByHash(hash);
        if (tx) {
          await this.addPendingTxIndices(tx, key);
          pendingTxSize += tx.getSize();
        }
      }

      await this.#pendingTxSize.set(pendingTxSize);
    });

    await this.evictInvalidTxsAfterReorg(txHashes);
    await this.evictLowPriorityTxs(txHashes);
  }

  public async getPendingTxHashes(): Promise<TxHash[]> {
    const vals = await toArray(this.#pendingTxPriorityToHash.valuesAsync({ reverse: true }));
    return vals.map(x => TxHash.fromString(x));
  }

  public async getMinedTxHashes(): Promise<[TxHash, number][]> {
    const vals = await toArray(this.#minedTxHashToBlock.entriesAsync());
    return vals.map(([txHash, blockNumber]) => [TxHash.fromString(txHash), blockNumber]);
  }

  public async getPendingTxCount(): Promise<number> {
    return (await this.#pendingTxHashToHeaderHash.sizeAsync()) ?? 0;
  }

  public async getMinedTxCount(): Promise<number> {
    return (await this.#minedTxHashToBlock.sizeAsync()) ?? 0;
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

  async getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const txs = await Promise.all(txHashes.map(txHash => this.#txs.getAsync(txHash.toString())));
    return txs.map((buffer, index) => {
      if (buffer) {
        const tx = Tx.fromBuffer(buffer);
        tx.setTxHash(txHashes[index]);
        return tx;
      }
      return undefined;
    });
  }

  async hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return await Promise.all(txHashes.map(txHash => this.#txs.hasAsync(txHash.toString())));
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
  public async addTxs(txs: Tx[], opts: { source?: string } = {}): Promise<number> {
    const addedTxs: TxWithHash[] = [];
    const hashesAndStats = await Promise.all(
      txs.map(async tx => ({ txHash: await tx.getTxHash(), txStats: await tx.getStats() })),
    );
    await this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      await Promise.all(
        txs.map(async (tx, i) => {
          const { txHash, txStats } = hashesAndStats[i];
          const key = txHash.toString();
          if (await this.#txs.hasAsync(key)) {
            this.#log.debug(`Tx ${txHash.toString()} already exists in the pool`);
            return;
          }

          this.#log.verbose(`Adding tx ${txHash.toString()} to pool`, {
            eventName: 'tx-added-to-pool',
            ...txStats,
          } satisfies TxAddedToPoolStats);

          await this.#txs.set(key, tx.toBuffer());
          addedTxs.push(tx as TxWithHash);

          if (!(await this.#minedTxHashToBlock.hasAsync(key))) {
            pendingTxSize += tx.getSize();
            await this.addPendingTxIndices(tx, key);
            this.#metrics.recordSize(tx);
          }
        }),
      );

      await this.#pendingTxSize.set(pendingTxSize);
      await this.evictLowPriorityTxs(hashesAndStats.map(({ txHash }) => txHash));
    });

    if (addedTxs.length > 0) {
      this.emit('txs-added', { ...opts, txs: addedTxs });
    }
    return addedTxs.length;
  }

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * @param txHashes - An array of tx hashes to be removed from the tx pool.
   * @returns Empty promise.
   */
  public deleteTxs(txHashes: TxHash[], eviction = false): Promise<void> {
    const deletedTxs: Tx[] = [];
    const poolDbTx = this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      for (const hash of txHashes) {
        const key = hash.toString();
        const tx = await this.getTxByHash(hash);

        if (tx) {
          const isMined = await this.#minedTxHashToBlock.hasAsync(key);
          if (!isMined) {
            pendingTxSize -= tx.getSize();
            await this.removePendingTxIndices(tx, key);
          }

          if (!eviction && this.#archivedTxLimit) {
            deletedTxs.push(tx);
          }

          await this.#txs.delete(key);
          await this.#minedTxHashToBlock.delete(key);
        }
      }

      await this.#pendingTxSize.set(pendingTxSize);
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

  public updateConfig({ maxTxPoolSize, txPoolOverflowFactor, archivedTxLimit }: TxPoolOptions): void {
    if (typeof maxTxPoolSize === 'number') {
      assert(maxTxPoolSize >= 0, 'maxTxPoolSize must be greater or equal to 0');
      this.#maxTxPoolSize = maxTxPoolSize;

      if (maxTxPoolSize === 0) {
        this.#log.info(`Disabling maximum tx mempool size. Tx eviction stopped`);
      } else {
        this.#log.info(`Setting maximum tx mempool size`, { maxTxPoolSize });
      }
    }

    if (typeof txPoolOverflowFactor === 'number') {
      assert(txPoolOverflowFactor >= 1, 'txPoolOveflowFactor must be greater or equal to 1');
      this.txPoolOverflowFactor = txPoolOverflowFactor;
      this.#log.info(`Allowing tx pool size to grow above limit`, { maxTxPoolSize, txPoolOverflowFactor });
    }

    if (typeof archivedTxLimit === 'number') {
      assert(archivedTxLimit >= 0, 'archivedTxLimit must be greater or equal to 0');
      this.#archivedTxLimit = archivedTxLimit;
    }
  }

  public markTxsAsNonEvictable(txHashes: TxHash[]): Promise<void> {
    txHashes.forEach(txHash => this.#nonEvictableTxs.add(txHash.toString()));
    return Promise.resolve();
  }

  /**
   * Creates a GasTxValidator instance.
   * @param db - DB for the validator to use
   * @returns A GasTxValidator instance
   */
  protected createGasTxValidator(db: MerkleTreeReadOperations): GasTxValidator {
    return new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, GasFees.empty());
  }

  /**
   * Creates an ArchiveCache instance.
   * @param db - DB for the cache to use
   * @returns An ArchiveCache instance
   */
  protected createArchiveCache(db: MerkleTreeReadOperations): ArchiveCache {
    return new ArchiveCache(db);
  }

  /**
   * Checks if a cached transaction exists in the in-memory pending tx pool and returns it.
   * Otherwise, it checks the tx pool, updates the pending tx pool, and returns the tx.
   * @param txHash - The generated tx hash.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  private async getPendingTxByHash(txHash: TxHash | string): Promise<Tx | undefined> {
    let key;
    if (typeof txHash === 'string') {
      key = txHash;
      txHash = TxHash.fromString(txHash);
    } else {
      key = txHash.toString();
    }

    if (this.#pendingTxs.has(key)) {
      return this.#pendingTxs.get(key);
    }
    const tx = await this.getTxByHash(txHash);
    if (tx) {
      this.#pendingTxs.set(key, tx);
      return tx;
    }
    return undefined;
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
          tx.contractClassLogFields,
          tx.publicFunctionCalldata,
        );
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
    if (this.#maxTxPoolSize === undefined || this.#maxTxPoolSize === 0) {
      return { numLowPriorityTxsEvicted: 0, numNewTxsEvicted: 0 };
    }

    let numNewTxsEvicted = 0;
    const txsToEvict: TxHash[] = [];

    let pendingTxsSize = (await this.#pendingTxSize.getAsync()) ?? 0;
    if (pendingTxsSize > this.#maxTxPoolSize * this.txPoolOverflowFactor) {
      for await (const txHash of this.#pendingTxPriorityToHash.valuesAsync()) {
        if (this.#nonEvictableTxs.has(txHash.toString())) {
          continue;
        }
        const txSize =
          (await this.#pendingTxHashToSize.getAsync(txHash.toString())) ??
          (await this.getPendingTxByHash(txHash))?.getSize();

        this.#log.verbose(`Evicting tx ${txHash} from pool due to low priority to satisfy max tx size limit`, {
          txHash,
          txSize,
        });

        txsToEvict.push(TxHash.fromString(txHash));

        if (txSize) {
          pendingTxsSize -= txSize;
          if (pendingTxsSize <= this.#maxTxPoolSize) {
            break;
          }
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
   *   - txs with an expiration timestamp lower than that of the mined block
   *
   * @param minedTxHashes - The tx hashes of the txs mined in the block.
   * @param blockHeader - The header of the mined block.
   * @returns The total number of txs evicted from the pool.
   */
  private async evictInvalidTxsAfterMining(
    minedTxHashes: TxHash[],
    blockHeader: BlockHeader,
    minedNullifiers: Set<string>,
    minedFeePayers: Set<string>,
  ): Promise<number> {
    if (minedTxHashes.length === 0) {
      return 0;
    }

    const { blockNumber, timestamp } = blockHeader.globalVariables;

    // Wait for world state to be synced to at least the mined block number
    await this.#worldStateSynchronizer.syncImmediate(blockNumber);

    const db = this.#worldStateSynchronizer.getCommitted();
    const gasTxValidator = this.createGasTxValidator(db);

    const txsToEvict: TxHash[] = [];
    for await (const txHash of this.#pendingTxPriorityToHash.valuesAsync()) {
      const tx = await this.getPendingTxByHash(txHash);
      if (!tx) {
        continue;
      }

      // Evict pending txs that share nullifiers with mined txs
      const txNullifiers = tx.data.getNonEmptyNullifiers();
      if (txNullifiers.some(nullifier => minedNullifiers.has(nullifier.toString()))) {
        this.#log.verbose(`Evicting tx ${txHash} from pool due to a duplicate nullifier with a mined tx`);
        txsToEvict.push(TxHash.fromString(txHash));
        continue;
      }

      // Evict pending txs with an insufficient fee payer balance
      if (
        minedFeePayers.has(tx.data.feePayer.toString()) &&
        (await gasTxValidator.validateTxFee(tx)).result === 'invalid'
      ) {
        this.#log.verbose(`Evicting tx ${txHash} from pool due to an insufficient fee payer balance`);
        txsToEvict.push(TxHash.fromString(txHash));
        continue;
      }

      // Evict pending txs with an expiration timestamp less than or equal to the mined block timestamp
      const includeByTimestamp = tx.data.rollupValidationRequests.includeByTimestamp;
      if (includeByTimestamp.isSome && includeByTimestamp.value <= timestamp) {
        this.#log.verbose(
          `Evicting tx ${txHash} from pool due to the tx being expired (includeByTimestamp: ${includeByTimestamp.value}, mined block timestamp: ${timestamp})`,
        );
        txsToEvict.push(TxHash.fromString(txHash));
        continue;
      }
    }

    if (txsToEvict.length > 0) {
      await this.deleteTxs(txsToEvict, true);
    }
    return txsToEvict.length;
  }

  /**
   * Evicts pending txs that no longer have valid archive roots or fee payer balances from the pool after a reorg.
   *
   * @param txHashes - The tx hashes of the txs that were moved from mined to pending.
   * @returns The total number of txs evicted from the pool.
   */
  private async evictInvalidTxsAfterReorg(txHashes: TxHash[]): Promise<number> {
    if (txHashes.length === 0) {
      return 0;
    }

    await this.#worldStateSynchronizer.syncImmediate();
    const db = this.#worldStateSynchronizer.getCommitted();
    const archiveCache = this.createArchiveCache(db);
    const gasTxValidator = this.createGasTxValidator(db);

    const txsToEvict: TxHash[] = [];

    for await (const [txHash, headerHash] of this.#pendingTxHashToHeaderHash.entriesAsync()) {
      const tx = await this.getPendingTxByHash(txHash);
      if (!tx) {
        continue;
      }

      const [index] = await archiveCache.getArchiveIndices([Fr.fromString(headerHash)]);
      if (index === undefined) {
        this.#log.verbose(`Evicting tx ${txHash} from pool due to an invalid archive root`);
        txsToEvict.push(TxHash.fromString(txHash));
        continue;
      }

      if ((await gasTxValidator.validateTxFee(tx)).result === 'invalid') {
        this.#log.verbose(`Evicting tx ${txHash} from pool due to an insufficient fee payer balance`);
        txsToEvict.push(TxHash.fromString(txHash));
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
    await this.#pendingTxHashToHeaderHash.set(txHash, (await tx.data.constants.historicalHeader.hash()).toString());
  }

  private async removePendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    await this.#pendingTxPriorityToHash.deleteValue(getPendingTxPriority(tx), txHash);
    await this.#pendingTxHashToSize.delete(txHash);
    await this.#pendingTxHashToHeaderHash.delete(txHash);
    this.#pendingTxs.delete(txHash);
  }
}
