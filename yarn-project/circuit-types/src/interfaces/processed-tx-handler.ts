import { type ProcessedTx } from '../tx/processed_tx.js';

/** Receives processed txs as part of block simulation or proving. */
export interface ProcessedTxHandler {
  /**
   * Handles processed txs.
   * @param txs - The transactions to be handled.
   */
  addTxs(txs: ProcessedTx[]): Promise<void>;
}
