import { insertIntoSortedArray } from '@aztec/foundation/array';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { MerkleTreeReadOperations, ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { ChonkProof } from '@aztec/stdlib/proofs';
import type { TxAddedToPoolStats } from '@aztec/stdlib/stats';
import { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import assert from 'assert';
import EventEmitter from 'node:events';

import { ArchiveCache } from '../../msg_validators/tx_validator/archive_cache.js';
import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import { EvictionManager } from './eviction/eviction_manager.js';
import type { PendingTxInfo, TxBlockReference, TxPoolOperations } from './eviction/eviction_strategy.js';
import { InsufficientFeePayerBalanceRule } from './eviction/insufficient_fee_payer_balance_rule.js';
import { InvalidTxsAfterMiningRule } from './eviction/invalid_txs_after_mining_rule.js';
import { InvalidTxsAfterReorgRule } from './eviction/invalid_txs_after_reorg_rule.js';
import { LowPriorityEvictionRule } from './eviction/low_priority_eviction_rule.js';
import { getPendingTxPriority } from './priority.js';
import type { TxPool, TxPoolEvents, TxPoolOptions } from './tx_pool.js';

/**
 * KV implementation of the Transaction Pool.
 */
export class AztecKVTxPool
  extends (EventEmitter as new () => TypedEventEmitter<TxPoolEvents>)
  implements TxPool, TxPoolOperations
{
  #store: AztecAsyncKVStore;

  /** Our tx pool, stored as a Map, with K: tx hash and V: the transaction. */
  #txs: AztecAsyncMap<string, Buffer>;

  /** Holds the historical block for each tx */
  #pendingTxHashToHistoricalBlockHeaderHash: AztecAsyncMap<string, string>;

  /** Index from tx hash to the block number in which they were mined, filtered by mined txs. */
  #minedTxHashToBlock: AztecAsyncMap<string, BlockNumber>;

  /** Index from tx priority (stored as hex) to its tx hash, filtered by pending txs. */
  #pendingTxPriorityToHash: AztecAsyncMultiMap<string, string>;

  /** Map from tx hash to the block number it was originally mined in (for soft-deleted txs). */
  #deletedMinedTxHashes: AztecAsyncMap<string, BlockNumber>;

  /** MultiMap from block number to deleted mined tx hashes for efficient cleanup. */
  #blockToDeletedMinedTxHash: AztecAsyncMultiMap<BlockNumber, string>;

  #historicalHeaderToTxHash: AztecAsyncMultiMap<string, string>;

  #feePayerToTxHash: AztecAsyncMultiMap<string, string>;

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

  #evictionManager: EvictionManager;

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
    worldState: ReadonlyWorldStateAccess,
    telemetry: TelemetryClient = getTelemetryClient(),
    config: TxPoolOptions = {},
    log = createLogger('p2p:tx_pool'),
  ) {
    super();

    this.#log = log;

    this.#evictionManager = new EvictionManager(this);
    this.#evictionManager.registerRule(new InvalidTxsAfterMiningRule());
    this.#evictionManager.registerRule(new InvalidTxsAfterReorgRule(worldState));
    this.#evictionManager.registerRule(new InsufficientFeePayerBalanceRule(worldState));
    this.#evictionManager.registerRule(
      new LowPriorityEvictionRule({
        //NOTE: 0 effectively disables low priority eviction
        maxPoolSize: config.maxPendingTxCount ?? 0,
      }),
    );

    this.updateConfig(config);

    this.#txs = store.openMap('txs');
    this.#minedTxHashToBlock = store.openMap('txHashToBlockMined');
    this.#pendingTxPriorityToHash = store.openMultiMap('pendingTxFeeToHash');
    this.#deletedMinedTxHashes = store.openMap('deletedMinedTxHashes');
    this.#blockToDeletedMinedTxHash = store.openMultiMap('blockToDeletedMinedTxHash');

    this.#pendingTxHashToHistoricalBlockHeaderHash = store.openMap('txHistoricalBlock');
    this.#historicalHeaderToTxHash = store.openMultiMap('historicalHeaderToPendingTxHash');
    this.#feePayerToTxHash = store.openMultiMap('feePayerToPendingTxHash');

    this.#pendingTxs = new Map<string, Tx>();
    this.#nonEvictableTxs = new Set<string>();

    this.#archivedTxs = archive.openMap('archivedTxs');
    this.#archivedTxIndices = archive.openMap('archivedTxIndices');

    this.#store = store;
    this.#archive = archive;

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

    const uniqueMinedNullifiers: Fr[] = [];
    const uniqueMinedFeePayers: AztecAddress[] = [];

    try {
      await this.#store.transactionAsync(async () => {
        for (const hash of txHashes) {
          const key = hash.toString();
          await this.#minedTxHashToBlock.set(key, blockHeader.globalVariables.blockNumber);

          const tx = await this.getPendingTxByHash(hash);
          if (tx) {
            const nullifiers = tx.data.getNonEmptyNullifiers();

            nullifiers.forEach(nullifier => insertIntoSortedArray(uniqueMinedNullifiers, nullifier, Fr.cmp, false));
            insertIntoSortedArray(
              uniqueMinedFeePayers,
              tx.data.feePayer,
              (a, b) => a.toField().cmp(b.toField()),
              false,
            );

            await this.removePendingTxIndicesInDbTx(tx, key);
          }

          // If this tx was previously soft-deleted, remove it from the deleted sets
          if (await this.#deletedMinedTxHashes.hasAsync(key)) {
            const originalBlock = await this.#deletedMinedTxHashes.getAsync(key);
            await this.#deletedMinedTxHashes.delete(key);
            // Remove from block-to-hash mapping
            if (originalBlock !== undefined) {
              await this.#blockToDeletedMinedTxHash.deleteValue(originalBlock, key);
            }
          }
        }
      });

      await this.#evictionManager.evictAfterNewBlock(blockHeader, uniqueMinedNullifiers, uniqueMinedFeePayers);

      this.#metrics.transactionsRemoved(txHashes.map(hash => hash.toBigInt()));
    } catch (err) {
      this.#log.warn('Unexpected error when marking txs as mined', { err });
    }
  }

  public async markMinedAsPending(txHashes: TxHash[], latestBlock: BlockNumber): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }
    try {
      await this.#store.transactionAsync(async () => {
        for (const hash of txHashes) {
          const key = hash.toString();
          await this.#minedTxHashToBlock.delete(key);

          // Rehydrate the tx in the in-memory pending txs mapping
          const tx = await this.getPendingTxByHash(hash);
          if (tx) {
            await this.addPendingTxIndicesInDbTx(tx, key);
          }
        }
      });

      await this.#evictionManager.evictAfterChainPrune(latestBlock);
    } catch (err) {
      this.#log.warn('Unexpected error when marking mined txs as pending', { err });
    }
  }

  public async getPendingTxHashes(): Promise<TxHash[]> {
    const vals = await toArray(this.#pendingTxPriorityToHash.valuesAsync({ reverse: true }));
    return vals.map(TxHash.fromString);
  }

  /**
   * Checks if a transaction exists in the pool and returns it.
   * @param txHash - The generated tx hash.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  public async getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#txs.getAsync(txHash.toString());
    return buffer ? Tx.fromBuffer(buffer) : undefined;
  }

  async getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const txs = await Promise.all(txHashes.map(txHash => this.#txs.getAsync(txHash.toString())));
    return txs.map(buffer => (buffer ? Tx.fromBuffer(buffer) : undefined));
  }

  async hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return await Promise.all(txHashes.map(txHash => this.#txs.hasAsync(txHash.toString())));
  }

  async hasTx(txHash: TxHash): Promise<boolean> {
    const result = await this.hasTxs([txHash]);
    return result[0];
  }

  /**
   * Checks if an archived tx exists and returns it.
   * @param txHash - The tx hash.
   * @returns The transaction metadata, if found, 'undefined' otherwise.
   */
  public async getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#archivedTxs.getAsync(txHash.toString());
    return buffer ? Tx.fromBuffer(buffer) : undefined;
  }

  /**
   * Adds a list of transactions to the pool. Duplicates are ignored.
   * @param txs - An array of txs to be added to the pool.
   * @returns count of added transactions
   */
  public async addTxs(txs: Tx[], opts: { source?: string } = {}): Promise<number> {
    if (txs.length === 0) {
      return Promise.resolve(0);
    }

    const addedTxs: Tx[] = [];
    const hashesAndStats = txs.map(tx => ({ txHash: tx.getTxHash(), txStats: tx.getStats() }));
    try {
      await this.#store.transactionAsync(async () => {
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
            addedTxs.push(tx as Tx);
            await this.#pendingTxHashToHistoricalBlockHeaderHash.set(
              key,
              (await tx.data.constants.anchorBlockHeader.hash()).toString(),
            );

            if (!(await this.#minedTxHashToBlock.hasAsync(key))) {
              await this.addPendingTxIndicesInDbTx(tx, key);
              this.#metrics.recordSize(tx);
            }
          }),
        );
      });

      await this.#evictionManager.evictAfterNewTxs(addedTxs.map(({ txHash }) => txHash));
    } catch (err) {
      this.#log.warn('Unexpected error when adding txs', { err });
    }

    if (addedTxs.length > 0) {
      this.#metrics.transactionsAdded(addedTxs);
      this.emit('txs-added', { ...opts, txs: addedTxs });
    }
    return addedTxs.length;
  }

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * Mined transactions are soft-deleted with a timestamp, pending transactions are permanently deleted.
   * @param txHashes - An array of tx hashes to be deleted from the tx pool.
   * @returns Empty promise.
   */
  public deleteTxs(txHashes: TxHash[], opts?: { permanently?: boolean }): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    const deletedTxs: Tx[] = [];
    const poolDbTx = this.#store.transactionAsync(async () => {
      for (const hash of txHashes) {
        const key = hash.toString();
        const tx = await this.getTxByHash(hash);
        if (!tx) {
          this.#log.trace(`Skipping deletion of missing tx ${key} from pool`);
          continue;
        }

        const minedBlockNumber = await this.#minedTxHashToBlock.getAsync(key);
        const txIsPending = minedBlockNumber === undefined;
        if (txIsPending) {
          await this.deletePendingTx(tx, key);
        } else {
          await this.deleteMinedTx(key, minedBlockNumber!, opts?.permanently ?? false);
          const shouldArchiveTx = this.#archivedTxLimit && !opts?.permanently;
          if (shouldArchiveTx) {
            deletedTxs.push(tx);
          }
        }
      }
    });
    this.#metrics.transactionsRemoved(txHashes.map(hash => hash.toBigInt()));
    this.#log.debug(`Deleted ${txHashes.length} txs from pool`, { txHashes });

    return this.#archivedTxLimit ? poolDbTx.then(() => this.archiveTxs(deletedTxs)) : poolDbTx;
  }

  private async deleteMinedTx(txHash: `0x${string}`, minedBlockNumber: BlockNumber, permanently: boolean) {
    await this.#minedTxHashToBlock.delete(txHash);
    if (permanently) {
      this.#log.trace(`Deleting mined tx ${txHash} from pool`);
      await this.#txs.delete(txHash);
      return;
    }

    // Soft-delete mined transactions: remove from mined set but keep in storage
    this.#log.trace(`Soft-deleting mined tx ${txHash} from pool`);
    await this.#deletedMinedTxHashes.set(txHash, minedBlockNumber);
    await this.#blockToDeletedMinedTxHash.set(minedBlockNumber, txHash);
  }

  private async deletePendingTx(tx: Tx, txHash: `0x${string}`) {
    // We always permanently delete pending transactions
    this.#log.trace(`Deleting pending tx ${txHash} from pool`);
    await this.removePendingTxIndices(tx, txHash);
    await this.#txs.delete(txHash);
    await this.#pendingTxHashToHistoricalBlockHeaderHash.delete(txHash);
  }

  /**
   * Gets all the transactions stored in the pool.
   * @returns Array of tx objects in the order they were added to the pool.
   */
  public async getAllTxs(): Promise<Tx[]> {
    const vals = await toArray(this.#txs.valuesAsync());
    return vals.map(buffer => Tx.fromBuffer(buffer));
  }

  /**
   * Gets the hashes of all transactions currently in the tx pool.
   * @returns An array of transaction hashes found in the tx pool.
   */
  public async getAllTxHashes(): Promise<TxHash[]> {
    const vals = await toArray(this.#txs.keysAsync());
    return vals.map(x => TxHash.fromString(x));
  }

  public async getPendingTxInfos(): Promise<PendingTxInfo[]> {
    const vals = await toArray(this.#pendingTxPriorityToHash.valuesAsync());
    const results = await Promise.all(vals.map(val => this.getPendingTxInfo(TxHash.fromString(val))));
    return results.filter((info): info is PendingTxInfo => info !== undefined);
  }

  private async getPendingTxInfo(txHash: TxHash): Promise<PendingTxInfo | undefined> {
    let historicalBlockHash = await this.#pendingTxHashToHistoricalBlockHeaderHash.getAsync(txHash.toString());
    // Not all tx might have this index created.
    if (!historicalBlockHash) {
      const tx = await this.getPendingTxByHash(txHash);
      if (!tx) {
        this.#log.warn(`PendingTxInfo:tx ${txHash} not found`);
        return undefined;
      }

      historicalBlockHash = (await tx.data.constants.anchorBlockHeader.hash()).toString();
      await this.#pendingTxHashToHistoricalBlockHeaderHash.set(txHash.toString(), historicalBlockHash);
    }

    return {
      txHash,
      blockHash: Fr.fromString(historicalBlockHash),
      isEvictable: !this.#nonEvictableTxs.has(txHash.toString()),
    };
  }

  public async getPendingTxsReferencingBlocks(blockHashes: Fr[]): Promise<TxBlockReference[]> {
    const result: TxBlockReference[] = [];
    for (const blockHash of blockHashes) {
      const chunk = await toArray(this.#historicalHeaderToTxHash.getValuesAsync(blockHash.toString()));
      result.push(
        ...chunk.map(txHash => ({
          txHash: TxHash.fromString(txHash),
          blockHash,
          isEvictable: !this.#nonEvictableTxs.has(txHash),
        })),
      );
    }

    return result;
  }

  public async getPendingTxsWithFeePayer(feePayers: AztecAddress[]): Promise<PendingTxInfo[]> {
    const result: PendingTxInfo[] = [];
    for (const feePayer of feePayers) {
      const chunk = await toArray(this.#feePayerToTxHash.getValuesAsync(feePayer.toString()));
      const infos = await Promise.all(chunk.map(txHash => this.getPendingTxInfo(TxHash.fromString(txHash))));
      result.push(...infos.filter((info): info is PendingTxInfo => info !== undefined));
    }

    return result;
  }

  public async getMinedTxHashes(): Promise<[TxHash, BlockNumber][]> {
    const vals = await toArray(this.#minedTxHashToBlock.entriesAsync());
    return vals.map(([txHash, blockNumber]) => [TxHash.fromString(txHash), blockNumber]);
  }

  public async getPendingTxCount(): Promise<number> {
    return (await this.#pendingTxPriorityToHash.sizeAsync()) ?? 0;
  }

  public async getMinedTxCount(): Promise<number> {
    return (await this.#minedTxHashToBlock.sizeAsync()) ?? 0;
  }

  public async getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined> {
    const key = txHash.toString();
    const [isMined, isKnown, isDeleted] = await Promise.all([
      this.#minedTxHashToBlock.hasAsync(key),
      this.#txs.hasAsync(key),
      this.#deletedMinedTxHashes.hasAsync(key),
    ]);

    if (isDeleted) {
      return 'deleted';
    } else if (isMined) {
      return 'mined';
    } else if (isKnown) {
      return 'pending';
    } else {
      return undefined;
    }
  }

  public updateConfig(cfg: TxPoolOptions): void {
    if (typeof cfg.archivedTxLimit === 'number') {
      assert(cfg.archivedTxLimit >= 0, 'archivedTxLimit must be greater or equal to 0');
      this.#archivedTxLimit = cfg.archivedTxLimit;
    }

    if (this.#evictionManager) {
      this.#evictionManager.updateConfig(cfg);
    }
  }

  public markTxsAsNonEvictable(txHashes: TxHash[]): Promise<void> {
    txHashes.forEach(txHash => this.#nonEvictableTxs.add(txHash.toString()));
    return Promise.resolve();
  }

  public clearNonEvictableTxs(): Promise<void> {
    // Clear the non-evictable set after completing the DB updates above.
    // This ensures pinned (non-evictable) txs are protected while we mark mined txs,
    // but they won't remain pinned indefinitely across blocks. Note that eviction rules
    // (including post-mining invalidation) respect the non-evictable flag while it is set.
    this.#nonEvictableTxs.clear();
    return Promise.resolve();
  }

  /**
   * Permanently deletes deleted mined transactions from blocks up to and including the specified block number.
   * @param blockNumber - Block number threshold. Deleted mined txs from this block or earlier will be permanently deleted.
   * @returns The number of transactions permanently deleted.
   */
  public async cleanupDeletedMinedTxs(blockNumber: BlockNumber): Promise<number> {
    let deletedCount = 0;
    await this.#store.transactionAsync(async () => {
      const txHashesToDelete: string[] = [];
      const blocksToDelete: BlockNumber[] = [];

      // Iterate through all entries and check block numbers
      for await (const [block, txHash] of this.#blockToDeletedMinedTxHash.entriesAsync()) {
        if (block <= blockNumber) {
          // Permanently delete the transaction
          await this.#txs.delete(txHash);
          await this.#deletedMinedTxHashes.delete(txHash);
          txHashesToDelete.push(txHash);
          if (!blocksToDelete.includes(block)) {
            blocksToDelete.push(block);
          }
          deletedCount++;
        }
      }
      this.#metrics.transactionsRemoved(txHashesToDelete);

      // Clean up block-to-hash mapping - delete all values for each block
      for (const block of blocksToDelete) {
        const txHashesForBlock = await toArray(this.#blockToDeletedMinedTxHash.getValuesAsync(block));
        for (const txHash of txHashesForBlock) {
          await this.#blockToDeletedMinedTxHash.deleteValue(block, txHash);
        }
      }
    });

    if (deletedCount > 0) {
      this.#log.debug(`Permanently deleted ${deletedCount} deleted mined txs from blocks up to ${blockNumber}`);
    }
    return deletedCount;
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
   * Note: Pending txs should not be archived, only finalized txs
   * @param txs - The list of transactions to archive.
   * @returns Empty promise.
   */
  private async archiveTxs(txs: Tx[]): Promise<void> {
    if (txs.length === 0) {
      return;
    }
    if (this.#archivedTxLimit === 0) {
      return;
    }

    try {
      const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
      await this.#archive.transactionAsync(async () => {
        // calculate the head and tail indices of the archived txs by insertion order.
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
            tx.txHash,
            tx.data,
            ChonkProof.empty(),
            tx.contractClassLogFields,
            tx.publicFunctionCalldata,
          );
          const txHash = txHashes[i].toString();
          await this.#archivedTxs.set(txHash, archivedTx.toBuffer());
          await this.#archivedTxIndices.set(headIdx, txHash);
          headIdx++;
        }
        this.#log.debug(`Archived ${txs.length} txs`, { txHashes });
        this.#log.debug(`Total archived txs: ${headIdx - tailIdx}`);
      });
    } catch (error) {
      this.#log.error(`Error archiving txs`, { error });
    }
  }

  // Assumes being called within a DB transaction
  private async addPendingTxIndicesInDbTx(tx: Tx, txHash: string): Promise<void> {
    await this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), txHash);
    await this.#historicalHeaderToTxHash.set((await tx.data.constants.anchorBlockHeader.hash()).toString(), txHash);
    await this.#feePayerToTxHash.set(tx.data.feePayer.toString(), txHash);
  }

  private async addPendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    return await this.#store.transactionAsync(async () => {
      await this.addPendingTxIndicesInDbTx(tx, txHash);
    });
  }

  // Assumes being called within a DB transaction
  private async removePendingTxIndicesInDbTx(tx: Tx, txHash: string): Promise<void> {
    await this.#pendingTxPriorityToHash.deleteValue(getPendingTxPriority(tx), txHash);
    this.#pendingTxs.delete(txHash);
    await this.#historicalHeaderToTxHash.deleteValue(
      (await tx.data.constants.anchorBlockHeader.hash()).toString(),
      txHash,
    );
    await this.#feePayerToTxHash.deleteValue(tx.data.feePayer.toString(), txHash);
  }

  private async removePendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    return await this.#store.transactionAsync(async () => {
      await this.removePendingTxIndicesInDbTx(tx, txHash);
    });
  }

  /**
   * Returns up to `limit` lowest-priority evictable pending tx hashes without hydrating transactions.
   * Iterates the priority index in ascending order and skips non-evictable txs.
   */
  public async getLowestPriorityEvictable(limit: number): Promise<TxHash[]> {
    const txsToEvict: TxHash[] = [];
    if (limit <= 0) {
      return txsToEvict;
    }

    for await (const txHashStr of this.#pendingTxPriorityToHash.valuesAsync()) {
      if (this.#nonEvictableTxs.has(txHashStr)) {
        continue;
      }

      txsToEvict.push(TxHash.fromString(txHashStr));
      if (txsToEvict.length >= limit) {
        break;
      }
    }

    return txsToEvict;
  }
}
