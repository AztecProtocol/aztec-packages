import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

export type TxPoolOptions = {
  maxTxPoolSize?: number;
  txPoolOverflowFactor?: number;
  archivedTxLimit?: number;
};

export type TxPoolEvents = {
  ['txs-added']: (args: { txs: Tx[]; source?: string }) => void | Promise<void>;
};

/**
 * Interface of a transaction pool. The pool includes tx requests and is kept up-to-date by a P2P client.
 */
export interface TxPool extends TypedEventEmitter<TxPoolEvents> {
  /**
   * Adds a list of transactions to the pool. Duplicates are ignored.
   * @param txs - An array of txs to be added to the pool.
   * @returns The number of txs added to the pool. Note if the transaction already exists, it will not be added again.
   */
  addTxs(txs: Tx[], opts?: { source?: string }): Promise<number>;

  /**
   * Checks if a transaction exists in the pool and returns it.
   * @param txHash - The hash of the transaction, used as an ID.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Checks if transactions exist in the pool and returns them.
   * @param txHashes - The hashes of the transactions
   * @returns The transactions, if found, 'undefined' otherwise.
   */
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;

  /**
   * Checks if transactions exist in the pool
   * @param txHashes - The hashes of the transactions to check for
   * @returns True or False for each tx hash
   */
  hasTxs(txHashes: TxHash[]): Promise<boolean[]>;

  /**
   * Checks if an archived transaction exists in the pool and returns it.
   * @param txHash - The hash of the transaction, used as an ID.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Marks the set of txs as mined, as opposed to pending.
   * @param txHashes - Hashes of the txs to flag as mined.
   * @param blockHeader - The header of the mined block.
   */
  markAsMined(txHashes: TxHash[], blockHeader: BlockHeader): Promise<void>;

  /**
   * Moves mined txs back to the pending set in the case of a reorg.
   * Note: txs not known by this peer will be ignored.
   * @param txHashes - Hashes of the txs to flag as pending.
   */
  markMinedAsPending(txHashes: TxHash[]): Promise<void>;

  /**
   * Deletes transactions from the pool. Tx hashes that are not present are ignored.
   * @param txHashes - An array of tx hashes to be removed from the tx pool.
   */
  deleteTxs(txHashes: TxHash[]): Promise<void>;

  /**
   * Gets all transactions currently in the tx pool.
   * @returns An array of transaction objects found in the tx pool.
   */
  getAllTxs(): Promise<Tx[]>;

  /**
   * Gets the hashes of all transactions currently in the tx pool.
   * @returns An array of transaction hashes found in the tx pool.
   */
  getAllTxHashes(): Promise<TxHash[]>;

  /**
   * Gets the hashes of pending transactions currently in the tx pool sorted by priority (see getPendingTxPriority).
   * @returns An array of pending transaction hashes found in the tx pool.
   */
  getPendingTxHashes(): Promise<TxHash[]>;

  /** Returns the number of pending txs in the pool. */
  getPendingTxCount(): Promise<number>;

  /**
   * Gets the hashes of mined transactions currently in the tx pool.
   * @returns An array of mined transaction hashes found in the tx pool.
   */
  getMinedTxHashes(): Promise<[tx: TxHash, blockNumber: number][]>;

  /**
   * Returns whether the given tx hash is flagged as pending or mined.
   * @param txHash - Hash of the tx to query.
   * @returns Pending or mined depending on its status, or undefined if not found.
   */
  getTxStatus(txHash: TxHash): Promise<'pending' | 'mined' | undefined>;

  /**
   * Configure the maximum size of the tx pool
   * @param maxSizeBytes - The maximum size in bytes of the mempool. Set to undefined to disable it
   */
  updateConfig(config: TxPoolOptions): void;

  /** Returns whether the pool is empty. */
  isEmpty(): Promise<boolean>;

  /**
   * Marks transactions as non-evictible in the pool.
   * @param txHashes - Hashes of the transactions to mark as non-evictible.
   */
  markTxsAsNonEvictable(txHashes: TxHash[]): Promise<void>;
}
