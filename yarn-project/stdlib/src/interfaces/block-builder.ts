import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { LoggerBindings } from '@aztec/foundation/log';

import type { L2Block } from '../block/l2_block.js';
import type { ChainConfig, SequencerConfig } from '../config/chain-config.js';
import type { L1RollupConstants } from '../epoch-helpers/index.js';
import type { Gas } from '../gas/gas.js';
import type { BlockHeader } from '../tx/block_header.js';
import type { CheckpointGlobalVariables, GlobalVariables } from '../tx/global_variables.js';
import type { FailedTx, ProcessedTx } from '../tx/processed_tx.js';
import { Tx } from '../tx/tx.js';
import type { TxValidator } from '../tx/validator/tx_validator.js';
import type { MerkleTreeWriteOperations } from './merkle_tree_operations.js';
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

export type FullNodeBlockBuilderConfig = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<SequencerConfig, 'txPublicSetupAllowList' | 'fakeProcessingDelayPerTxMs' | 'fakeThrowAfterProcessingTxCount'>;

export const FullNodeBlockBuilderConfigKeys: (keyof FullNodeBlockBuilderConfig)[] = [
  'l1GenesisTime',
  'slotDuration',
  'l1ChainId',
  'rollupVersion',
  'txPublicSetupAllowList',
  'fakeProcessingDelayPerTxMs',
  'fakeThrowAfterProcessingTxCount',
] as const;

/** Thrown when no valid transactions are available to include in a block after processing, and this is not the first block in a checkpoint. */
export class NoValidTxsError extends Error {
  constructor(public readonly failedTxs: FailedTx[]) {
    super('No valid transactions to include in block');
    this.name = 'NoValidTxsError';
  }
}

/** Result of building a block within a checkpoint. */
export type BuildBlockInCheckpointResult = {
  block: L2Block;
  publicGas: Gas;
  publicProcessorDuration: number;
  numTxs: number;
  failedTxs: FailedTx[];
  usedTxs: Tx[];
  usedTxBlobFields: number;
};

/** Interface for building blocks within a checkpoint context. */
export interface ICheckpointBlockBuilder {
  buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    timestamp: bigint,
    opts: PublicProcessorLimits,
  ): Promise<BuildBlockInCheckpointResult>;
}

/** Interface for creating checkpoint builders. */
export interface ICheckpointsBuilder {
  getFork(blockNumber: BlockNumber): Promise<MerkleTreeWriteOperations>;

  startCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    fork: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
  ): Promise<ICheckpointBlockBuilder>;
}
