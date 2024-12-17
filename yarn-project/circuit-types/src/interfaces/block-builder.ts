import { type BlockHeader, type Fr, type GlobalVariables } from '@aztec/circuits.js';

import { type L2Block } from '../l2_block.js';
import { type ProcessedTx } from '../tx/processed_tx.js';
import { type ProcessedTxHandler } from './processed-tx-handler.js';

/** The interface to a block builder. Generates an L2 block out of a set of processed txs. */
export interface BlockBuilder extends ProcessedTxHandler {
  /**
   * Prepares to build a new block. Updates the L1 to L2 message tree.
   * @param globalVariables - The global variables for this block.
   * @param l1ToL2Messages - The set of L1 to L2 messages to be included in this block.
   */
  startNewBlock(globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<void>;

  /**
   * Adds all processed txs to the block. Updates world state with the effects from this tx.
   * @param txs - The transactions to be added.
   */
  addTxs(txs: ProcessedTx[]): Promise<void>;

  /**
   * Pads the block with empty txs if it hasn't reached the declared number of txs.
   * Assembles the block and updates the archive tree.
   */
  setBlockCompleted(expectedBlockHeader?: BlockHeader): Promise<L2Block>;
}
