import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { LoggerBindings } from '@aztec/foundation/log';

import type { BlockHash } from '../block/block_hash.js';
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

/** Limits passed to the public processor for tx processing within a block. */
export type PublicProcessorLimits = {
  /** Maximum number of txs to process. */
  maxTransactions?: number;
  /** L2 and DA gas limits. */
  maxBlockGas?: Gas;
  /** Maximum number of blob fields allowed. */
  maxBlobFields?: number;
  /** Deadline for processing the txs. Processor will stop as soon as it hits this time. */
  deadline?: Date;
  /** Signal for interrupting processing before the deadline. */
  signal?: AbortSignal;
  /** Whether this processor is building a proposal (as opposed to re-executing one). Skipping txs due to gas or blob limits is only done during proposal building. */
  isBuildingProposal?: boolean;
};

/** Base fields shared by both proposer and validator block builder options. */
type BlockBuilderOptionsBase = PublicProcessorLimits & {
  /** Minimum number of successfully processed txs required. Block is rejected if fewer succeed. */
  minValidTxs: number;
  /**
   * L1-to-L2 message leaves this block consumes, inserted into the fork's L1-to-L2 message tree before the block
   * header is built (AZIP-22 Fast Inbox streaming). Omitted (or empty) in the legacy flow, where the whole
   * checkpoint's messages are inserted up front at `startCheckpoint`.
   */
  l1ToL2Messages?: Fr[];
};

/** Proposer mode: redistribution params are required. */
type ProposerBlockBuilderOptions = BlockBuilderOptionsBase & {
  isBuildingProposal: true;
  /** Maximum number of blocks per checkpoint, derived from the timetable. */
  maxBlocksPerCheckpoint: number;
  /** Per-block gas budget multiplier. Budget = (remaining / remainingBlocks) * multiplier. */
  perBlockAllocationMultiplier: number;
  /** Per-block budget multiplier for DA gas and blob fields. Falls back to perBlockAllocationMultiplier when unset. */
  perBlockDAAllocationMultiplier?: number;
};

/** Validator mode: no redistribution params needed. */
type ValidatorBlockBuilderOptions = BlockBuilderOptionsBase & {
  isBuildingProposal: false;
};

/** Options for building a block within a checkpoint. When proposing, redistribution params are required. */
export type BlockBuilderOptions = ProposerBlockBuilderOptions | ValidatorBlockBuilderOptions;

export interface PublicProcessorValidator {
  preprocessValidator?: TxValidator<Tx>;
  nullifierCache?: { addNullifiers: (nullifiers: Buffer[]) => void };
}

export type FullNodeBlockBuilderConfig = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'rollupManaLimit'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<
    SequencerConfig,
    | 'txPublicSetupAllowListExtend'
    | 'fakeProcessingDelayPerTxMs'
    | 'fakeThrowAfterProcessingTxCount'
    | 'maxTxsPerBlock'
    | 'maxTxsPerCheckpoint'
    | 'maxL2BlockGas'
    | 'maxDABlockGas'
  >;

export const FullNodeBlockBuilderConfigKeys: (keyof FullNodeBlockBuilderConfig)[] = [
  'l1GenesisTime',
  'slotDuration',
  'l1ChainId',
  'rollupVersion',
  'txPublicSetupAllowListExtend',
  'fakeProcessingDelayPerTxMs',
  'fakeThrowAfterProcessingTxCount',
  'maxTxsPerBlock',
  'maxTxsPerCheckpoint',
  'maxL2BlockGas',
  'maxDABlockGas',
  'rollupManaLimit',
] as const;

/** Thrown when the number of successfully processed transactions is below the required minimum. */
export class InsufficientValidTxsError extends Error {
  constructor(
    public readonly processedCount: number,
    public readonly minRequired: number,
    public readonly failedTxs: FailedTx[],
  ) {
    super(`Insufficient valid txs: got ${processedCount} but need ${minRequired}`);
    this.name = 'InsufficientValidTxsError';
  }
}

/** Result of building a block within a checkpoint. */
export type BuildBlockInCheckpointResult = {
  block: L2Block;
  publicProcessorDuration: number;
  numTxs: number;
  failedTxs: FailedTx[];
  usedTxs: Tx[];
};

/** Interface for building blocks within a checkpoint context. */
export interface ICheckpointBlockBuilder {
  /** Builds a single block within this checkpoint. Throws InsufficientValidTxsError if fewer than minValidTxs succeed. */
  buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    timestamp: bigint,
    opts: BlockBuilderOptions,
  ): Promise<BuildBlockInCheckpointResult>;
}

/** Interface for creating checkpoint builders. */
export interface ICheckpointsBuilder {
  /**
   * Syncs world state to `blockNumber` and returns a fork of it at that block. When `blockHash` is
   * provided it is verified against the synced block, triggering a resync on mismatch (reorg detection).
   */
  getFork(blockNumber: BlockNumber, blockHash?: BlockHash): Promise<MerkleTreeWriteOperations>;

  startCheckpoint(
    checkpointNumber: CheckpointNumber,
    constants: CheckpointGlobalVariables,
    feeAssetPriceModifier: bigint,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    previousInboxRollingHash: Fr,
    fork: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
    // When true, the checkpoint's messages are inserted per block (via `buildBlock`'s `l1ToL2Messages`) rather than
    // as one padded bundle up front, so `l1ToL2Messages` here must be empty (AZIP-22 Fast Inbox streaming).
    insertMessagesPerBlock?: boolean,
  ): Promise<ICheckpointBlockBuilder>;
}
