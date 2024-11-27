import { type ProcessedTx } from '../tx/processed_tx.js';

/** Receives processed txs as part of block simulation or proving. */
export interface ProcessedTxHandler {
  /**
   * Handles a processed txs.
   * @param tx - The transaction to be handled.
   */
  addNewTx(tx: ProcessedTx): Promise<void>;
}
