import { insertIntoSortedArray } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import type { TxAddedToPoolStats } from '@aztec/stdlib/stats';
import { DatabasePublicStateSource } from '@aztec/stdlib/trees';
import { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import assert from 'assert';
import EventEmitter from 'node:events';

import { ArchiveCache } from '../../msg_validators/tx_validator/archive_cache.js';
import { GasTxValidator } from '../../msg_validators/tx_validator/gas_validator.js';
import { PoolInstrumentation, PoolName, type PoolStatsCallback } from '../instrumentation.js';
import { EvictionManager } from './eviction/eviction_manager.js';
import type { PendingTxInfo, TxBlockReference, TxPoolOperations } from './eviction/eviction_strategy.js';
import { InvalidTxsAfterMiningRule } from './eviction/invalid_txs_after_mining_rule.js';
import { InvalidTxsAfterReorgRule } from './eviction/invalid_txs_after_reorg_rule.js';
import { LowPriorityEvictionRule } from './eviction/low_priority_eviction_rule.js';
import { OutOfBalanceTxsAfterMining } from './eviction/out_of_balance_tx_rule.js';
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

  #txInfo: AztecAsyncMap<
    string,
    {
      size: number;
      historicalHeaderHash: string;
    }
  >;

  /** The tx evicion logic will kick after pool size is greater than maxTxPoolSize * txPoolOverflowFactor */
  txPoolOverflowFactor: number = 1;

  /** Index from tx hash to the block number in which they were mined, filtered by mined txs. */
  #minedTxHashToBlock: AztecAsyncMap<string, number>;

  /** Index from tx priority (stored as hex) to its tx hash, filtered by pending txs. */
  #pendingTxPriorityToHash: AztecAsyncMultiMap<string, string>;

  #historicalHeaderToTxHash: AztecAsyncMultiMap<string, string>;
  #feePayerToTxHash: AztecAsyncMultiMap<string, string>;

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

  #log: Logger;

  #metrics: PoolInstrumentation<Tx>;

  #evictionManager: EvictionManager;
  #maxSizeEvictionRule: LowPriorityEvictionRule;

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
    this.updateConfig(config);

    this.#txs = store.openMap('txs');
    this.#txInfo = store.openMap('txInfo');
    this.#minedTxHashToBlock = store.openMap('txHashToBlockMined');
    this.#pendingTxPriorityToHash = store.openMultiMap('pendingTxFeeToHash');
    this.#historicalHeaderToTxHash = store.openMultiMap('historicalHeaderToPendingTxHash');
    this.#feePayerToTxHash = store.openMultiMap('feePayerToPendingTxHash');
    this.#pendingTxSize = store.openSingleton('pendingTxSize');

    this.#pendingTxs = new Map<string, Tx>();
    this.#nonEvictableTxs = new Set<string>();

    this.#archivedTxs = archive.openMap('archivedTxs');
    this.#archivedTxIndices = archive.openMap('archivedTxIndices');

    this.#store = store;
    this.#archive = archive;
    this.#metrics = new PoolInstrumentation(telemetry, PoolName.TX_POOL, this.countTxs, () => store.estimateSize());

    this.#maxSizeEvictionRule = new LowPriorityEvictionRule({
      overflowFactor: config.txPoolOverflowFactor ?? 1,
      maxPoolSize: config.maxTxPoolSize ?? 0,
    });
    this.#evictionManager = new EvictionManager(this);
    this.#evictionManager.registerRule(this.#maxSizeEvictionRule);
    this.#evictionManager.registerRule(new InvalidTxsAfterMiningRule());
    this.#evictionManager.registerRule(new InvalidTxsAfterReorgRule(worldState));
    this.#evictionManager.registerRule(new OutOfBalanceTxsAfterMining(worldState));
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

    const minedNullifiers: Fr[] = [];
    const minedFeePayers: AztecAddress[] = [];

    await this.#store.transactionAsync(async () => {
      let pendingTxSize = (await this.#pendingTxSize.getAsync()) ?? 0;
      for (const hash of txHashes) {
        const key = hash.toString();
        await this.#minedTxHashToBlock.set(key, blockHeader.globalVariables.blockNumber);

        const tx = await this.getPendingTxByHash(hash);
        if (tx) {
          const nullifiers = tx.data.getNonEmptyNullifiers();

          nullifiers.forEach(nullifier => insertIntoSortedArray(minedNullifiers, nullifier, Fr.cmp, false));
          insertIntoSortedArray(minedFeePayers, tx.data.feePayer, (a, b) => a.toField().cmp(b.toField()), false);

          pendingTxSize -= tx.getSize();
          await this.removePendingTxIndices(tx, key);
        }
      }
      await this.#pendingTxSize.set(pendingTxSize);

      try {
        await this.#evictionManager.evictAfterNewBlock(blockHeader, minedNullifiers, minedFeePayers);
      } catch (err) {
        this.#log.warn('Unexpected error running evictAfterNewBlock', { err });
      }
    });
    // We update this after the transaction above. This ensures that the non-evictable transactions are not evicted
    // until any that have been mined are marked as such.
    // The non-evictable set is not considered when evicting transactions that are invalid after a block is mined.
    this.#nonEvictableTxs.clear();
  }

  public async markMinedAsPending(block: BlockHeader, txHashes: TxHash[]): Promise<void> {
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

      try {
        await this.#evictionManager.evictAfterChainPrune(block);
      } catch (err) {
        this.#log.warn('Unexpected error running evictAfterChainPrune', { err });
      }
    });
  }

  public async getPendingTxHashes(): Promise<TxHash[]> {
    const vals = await toArray(this.#pendingTxPriorityToHash.valuesAsync({ reverse: true }));
    return vals.map(x => TxHash.fromString(x));
  }

  public async getPendingTxs(): Promise<PendingTxInfo[]> {
    const vals = await toArray(this.#pendingTxPriorityToHash.valuesAsync());
    return Promise.all(vals.map(val => this.getTxInfo(TxHash.fromString(val))));
  }

  private async getTxInfo(txHash: TxHash): Promise<PendingTxInfo> {
    let info = await this.#txInfo.getAsync(txHash.toString());
    // Not all tx might have this index created.
    if (!info) {
      const tx = await this.getTxByHash(txHash);
      if (!tx) {
        throw new Error(`Tx ${txHash} not found`);
      }

      info = {
        historicalHeaderHash: (await tx.data.constants.historicalHeader.hash()).toString(),
        size: tx.getSize(),
      };
    }

    return {
      txHash,
      size: info.size,
      blockHash: Fr.fromString(info.historicalHeaderHash),
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
      result.push(...(await Promise.all(chunk.map(txHash => this.getTxInfo(TxHash.fromString(txHash))))));
    }

    return result;
  }

  public async getMinedTxHashes(): Promise<[TxHash, number][]> {
    const vals = await toArray(this.#minedTxHashToBlock.entriesAsync());
    return vals.map(([txHash, blockNumber]) => [TxHash.fromString(txHash), blockNumber]);
  }

  public async getPendingTxCount(): Promise<number> {
    return (await this.#pendingTxPriorityToHash.sizeAsync()) ?? 0;
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
    const addedTxs: Tx[] = [];
    const hashesAndStats = txs.map(tx => ({ txHash: tx.getTxHash(), txStats: tx.getStats() }));
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
          addedTxs.push(tx as Tx);
          await this.#txInfo.set(key, {
            size: tx.getSize(),
            historicalHeaderHash: (await tx.data.constants.historicalHeader.hash()).toString(),
          });

          if (!(await this.#minedTxHashToBlock.hasAsync(key))) {
            pendingTxSize += tx.getSize();
            await this.addPendingTxIndices(tx, key);
            this.#metrics.recordSize(tx);
          }
        }),
      );

      await this.#pendingTxSize.set(pendingTxSize);

      try {
        await this.#evictionManager.evictAfterNewTxs(
          addedTxs.map(({ txHash }) => txHash),
          pendingTxSize,
        );
      } catch (err) {
        this.#log.warn('Unexpected error running evictAfterNewTxs', { err });
      }
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
    if (txHashes.length === 0) {
      return Promise.resolve();
    }
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
    this.#log.debug(`Deleted ${txHashes.length} txs from pool`, { txHashes });
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
    if (typeof txPoolOverflowFactor === 'number') {
      assert(txPoolOverflowFactor >= 1, 'txPoolOveflowFactor must be greater or equal to 1');
      this.txPoolOverflowFactor = txPoolOverflowFactor;
      this.#log.info(`Allowing tx pool size to grow above limit`, { maxTxPoolSize, txPoolOverflowFactor });
    }

    if (typeof archivedTxLimit === 'number') {
      assert(archivedTxLimit >= 0, 'archivedTxLimit must be greater or equal to 0');
      this.#archivedTxLimit = archivedTxLimit;
    }

    if (this.#maxSizeEvictionRule) {
      this.#maxSizeEvictionRule.updateConfig({ maxPoolSize: maxTxPoolSize, overflowFactor: txPoolOverflowFactor });
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
    if (txs.length === 0) {
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
            ClientIvcProof.empty(),
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

  private async addPendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    return await this.#store.transactionAsync(async () => {
      await this.#pendingTxPriorityToHash.set(getPendingTxPriority(tx), txHash);
      await this.#historicalHeaderToTxHash.set((await tx.data.constants.historicalHeader.hash()).toString(), txHash);
      await this.#feePayerToTxHash.set(tx.data.feePayer.toString(), txHash);
    });
  }

  private async removePendingTxIndices(tx: Tx, txHash: string): Promise<void> {
    return await this.#store.transactionAsync(async () => {
      await this.#pendingTxPriorityToHash.deleteValue(getPendingTxPriority(tx), txHash);
      this.#pendingTxs.delete(txHash);
      await this.#historicalHeaderToTxHash.deleteValue(
        (await tx.data.constants.historicalHeader.hash()).toString(),
        txHash,
      );
      await this.#feePayerToTxHash.deleteValue(tx.data.feePayer.toString(), txHash);
    });
  }
}
