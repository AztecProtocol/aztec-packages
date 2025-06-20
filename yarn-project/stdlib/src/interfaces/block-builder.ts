import type { Fr } from '@aztec/foundation/fields';
import type { Timer } from '@aztec/foundation/timer';

import type { L2Block } from '../block/l2_block.js';
import type { Gas } from '../gas/gas.js';
import type { MerkleTreeWriteOperations } from '../trees/index.js';
import type { BlockHeader } from '../tx/block_header.js';
import type { GlobalVariables } from '../tx/global_variables.js';
import type { FailedTx, ProcessedTx } from '../tx/processed_tx.js';
import { Tx } from '../tx/tx.js';
import type { TxValidator } from '../tx/validator/tx_validator.js';
import type { ProcessedTxHandler } from './processed-tx-handler.js';

/** The interface to a block builder. Generates an L2 block out of a set of processed txs. */
export interface IBlockFactory extends ProcessedTxHandler {
  /**
   * Prepares to build a new block. Updates the L1 to L2 message tree.
   * @param globalVariables - The global variables for this block.
   * @param l1ToL2Messages - The set of L1 to L2 messages to be included in this block.
   * @param previousBlockHeader - The header of the previous block.
   */
  startNewBlock(
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    previousBlockHeader: BlockHeader,
  ): Promise<void>;

  /**
   * Adds all processed txs to the block. Updates world state with the effects from this tx.
   * @param txs - The transactions to be added.
   */
  addTxs(txs: ProcessedTx[]): Promise<void>;

  /**
   * Assembles the block and updates the archive tree.
   */
  setBlockCompleted(expectedBlockHeader?: BlockHeader): Promise<L2Block>;
}

export interface PublicProcessorLimits {
  maxTransactions?: number;
  maxBlockSize?: number;
  maxBlockGas?: Gas;
  deadline?: Date;
}

export interface PublicProcessorValidator {
  preprocessValidator?: TxValidator<Tx>;
  nullifierCache?: { addNullifiers: (nullifiers: Buffer[]) => void };
}
export interface BuildBlockResult {
  block: L2Block;
  publicGas: Gas;
  publicProcessorDuration: number;
  numMsgs: number;
  numTxs: number;
  failedTxs: FailedTx[];
  blockBuildingTimer: Timer;
  usedTxs: Tx[];
}

export interface IFullNodeBlockBuilder {
  getConfig(): {
    l1GenesisTime: bigint;
    slotDuration: number;
    l1ChainId: number;
    rollupVersion: number;
  };

  buildBlock(
    txs: Iterable<Tx> | AsyncIterable<Tx>,
    l1ToL2Messages: Fr[],
    globalVariables: GlobalVariables,
    options: PublicProcessorLimits,
    fork?: MerkleTreeWriteOperations,
  ): Promise<BuildBlockResult>;

  getFork(blockNumber: number): Promise<MerkleTreeWriteOperations>;
}
