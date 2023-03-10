import { Tx } from './tx.js';
import { TxPool } from './tx_pool.js';

// TODO: place in/use from foundation repo
/**
 * Helper to tranform Buffer IDs to a bigint.
 */
const toBigInt = (buf: Buffer): bigint => {
  const hex = buf.toString('hex');
  if (hex.length === 0) {
    return BigInt(0);
  }
  return BigInt(`0x${hex}`);
};

/**
 * In-memory implementation of the Transaction Pool.
 */
export class InMemoryTxPool implements TxPool {
  /**
   * Our tx pool, stored as a Map in-memory, with K: tx ID and V: the transaction.
   */
  private txs: Map<bigint, Tx>;

  /**
   * Class constructor for in-memory TxPool. Initiates our transaction pool as a JS Map.
   */
  constructor() {
    this.txs = new Map<bigint, Tx>();
  }

  /**
   * Checks if a transaction exists in the pool and returns it.
   * @param txId - The generated tx ID.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  public getTx(txId: Buffer): Tx | undefined {
    const result = this.txs.get(toBigInt(txId));
    return result;
  }

  /**
   * Adds a list of transactions to the pool. Duplicates are ignored.
   * @param txs - An array of txs to be added to the pool.
   */
  public addTxs(txs: Tx[]): void {
    txs.forEach(tx => this.txs.set(toBigInt(tx.txId), tx));
  }

  /**
   * Deletes transactions from the pool. Tx IDs that are not present are ignored.
   * @param txIds - An array of tx IDs to be removed from the tx pool.
   */
  public deleteTxs(txIds: Buffer[]): void {
    txIds.forEach(txId => this.txs.delete(toBigInt(txId)));
  }

  /**
   * Gets all the transactions stored in the pool.
   * @returns Array of tx objects in the order they were added to the pool.
   */
  public getAllTxs(): Tx[] {
    return Array.from(this.txs.values());
  }
}
