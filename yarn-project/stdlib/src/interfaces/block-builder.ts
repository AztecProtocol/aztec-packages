import type { Fr } from '@aztec/foundation/fields';
import type { Timer } from '@aztec/foundation/timer';

import type { L2Block } from '../block/l2_block.js';
import type { ChainConfig, SequencerConfig } from '../config/chain-config.js';
import type { L1RollupConstants } from '../epoch-helpers/index.js';
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
   */
  startNewBlock(globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<void>;

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
  maxBlobFields?: number;
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

export type FullNodeBlockBuilderConfig = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<SequencerConfig, 'txPublicSetupAllowList' | 'fakeProcessingDelayPerTxMs'>;

export interface IFullNodeBlockBuilder {
  getConfig(): FullNodeBlockBuilderConfig;

  updateConfig(config: Partial<FullNodeBlockBuilderConfig>): void;

  buildBlock(
    txs: Iterable<Tx> | AsyncIterable<Tx>,
    l1ToL2Messages: Fr[],
    globalVariables: GlobalVariables,
    options: PublicProcessorLimits,
    fork?: MerkleTreeWriteOperations,
  ): Promise<BuildBlockResult>;

  getFork(blockNumber: number): Promise<MerkleTreeWriteOperations>;
}
