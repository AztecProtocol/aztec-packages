import {
  BlockNumber,
  BlockNumberSchema,
  CheckpointNumber,
  type EpochNumber,
  type SlotNumber,
} from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { TypedEventEmitter } from '@aztec/foundation/types';

import { z } from 'zod';

import type { Checkpoint } from '../checkpoint/checkpoint.js';
import type { PublishedCheckpoint } from '../checkpoint/published_checkpoint.js';
import type { L1RollupConstants } from '../epoch-helpers/index.js';
import type { BlockHeader } from '../tx/block_header.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import type { TxHash } from '../tx/tx_hash.js';
import type { TxReceipt } from '../tx/tx_receipt.js';
import { type CheckpointedL2Block, PublishedL2Block } from './checkpointed_l2_block.js';
import type { L2Block } from './l2_block.js';
import type { L2BlockNew } from './l2_block_new.js';
import type { ValidateBlockNegativeResult, ValidateBlockResult } from './validate_block_result.js';

/**
 * Interface of classes allowing for the retrieval of L2 blocks.
 */
export interface L2BlockSource {
  /**
   * Method to fetch the rollup contract address at the base-layer.
   * @returns The rollup address.
   */
  getRollupAddress(): Promise<EthAddress>;

  /**
   * Method to fetch the registry contract address at the base-layer.
   * @returns The registry address.
   */
  getRegistryAddress(): Promise<EthAddress>;

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  getBlockNumber(): Promise<BlockNumber>;

  /**
   * Gets the number of the latest L2 block proven seen by the block source implementation.
   * @returns The number of the latest L2 block proven seen by the block source implementation.
   */
  getProvenBlockNumber(): Promise<BlockNumber>;

  /**
   * Gets an l2 block header.
   * @param number - The block number to return or 'latest' for the most recent one.
   * @returns The requested L2 block header.
   */
  getBlockHeader(number: BlockNumber | 'latest'): Promise<BlockHeader | undefined>;

  /**
   * Gets a checkpointed L2 block by block number.
   * Returns undefined if the block doesn't exist or hasn't been checkpointed yet.
   * @param number - The block number to retrieve.
   * @returns The requested checkpointed L2 block (or undefined if not found or not checkpointed).
   */
  getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined>;

  /**
   * Retrieves a collection of published checkpoints
   * @param checkpointNumber The first checkpoint to be retrieved
   * @param limit The number of checkpoints to be retrieved
   * @returns The collection of complete checkpoints
   */
  getPublishedCheckpoints(checkpointNumber: CheckpointNumber, limit: number): Promise<PublishedCheckpoint[]>;

  /**
   * Gets the checkpoints for a given epoch
   * @param epochNumber - Epoch for which we want checkpoint data
   */
  getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]>;

  /**
   * Gets a block header by its hash.
   * @param blockHash - The block hash to retrieve.
   * @returns The requested block header (or undefined if not found).
   */
  getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined>;

  /**
   * Gets a block header by its archive root.
   * @param archive - The archive root to retrieve.
   * @returns The requested block header (or undefined if not found).
   */
  getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined>;

  /**
   * Gets an L2 block by block number.
   * @param number - The block number to return.
   * @returns The requested L2 block (or undefined if not found).
   */
  getL2BlockNew(number: BlockNumber): Promise<L2BlockNew | undefined>;

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined>;

  /**
   * Returns the current L2 slot number based on the currently synced L1 timestamp.
   */
  getL2SlotNumber(): Promise<SlotNumber | undefined>;

  /**
   * Returns the current L2 epoch number based on the currently synced L1 timestamp.
   */
  getL2EpochNumber(): Promise<EpochNumber | undefined>;

  /**
   * Returns all block headers for a given epoch.
   * @dev Use this method only with recent epochs, since it walks the block list backwards.
   * @param epochNumber - The epoch number to return headers for.
   */
  getBlockHeadersForEpoch(epochNumber: EpochNumber): Promise<BlockHeader[]>;

  /**
   * Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
   * @param epochNumber - The epoch number to check.
   */
  isEpochComplete(epochNumber: EpochNumber): Promise<boolean>;

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;

  /**
   * Returns the rollup constants for the current chain.
   */
  getL1Constants(): Promise<L1RollupConstants>;

  /** Returns values for the genesis block */
  getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }>;

  /** Latest synced L1 timestamp. */
  getL1Timestamp(): Promise<bigint | undefined>;

  /**
   * Returns whether the latest block in the pending chain on L1 is invalid (ie its attestations are incorrect).
   * Note that invalid blocks do not get synced, so the latest block returned by the block source is always a valid one.
   */
  isPendingChainInvalid(): Promise<boolean>;

  /**
   * Returns the status of the pending chain validation. If the chain is invalid, reports the earliest consecutive block
   * that is invalid, along with the reason for being invalid, which can be used to trigger an invalidation.
   */
  getPendingChainValidationStatus(): Promise<ValidateBlockResult>;

  /** Force a sync. */
  syncImmediate(): Promise<void>;

  /* Legacy APIS */

  /**
   * Gets an l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   * @deprecated Use getL2BlockNew instead.
   */
  getBlock(number: BlockNumber): Promise<L2Block | undefined>;

  /**
   * Returns all blocks for a given epoch.
   * @dev Use this method only with recent epochs, since it walks the block list backwards.
   * @param epochNumber - The epoch number to return blocks for.
   */
  getBlocksForEpoch(epochNumber: EpochNumber): Promise<L2Block[]>;

  /**
   * Gets a published block by its block hash.
   * @param blockHash - The block hash to retrieve.
   * @returns The requested block (or undefined if not found).
   */
  getPublishedBlockByHash(blockHash: Fr): Promise<PublishedL2Block | undefined>;

  /**
   * Gets a block by its hash (including synced blocks that are not yet checkpointed).
   * @param blockHash - The block hash to retrieve.
   * @returns The requested L2 block (or undefined if not found).
   */
  getBlockByHash(blockHash: Fr): Promise<L2Block | undefined>;

  /**
   * Gets a published block by its archive root.
   * @param archive - The archive root to retrieve.
   * @returns The requested block (or undefined if not found).
   */
  getPublishedBlockByArchive(archive: Fr): Promise<PublishedL2Block | undefined>;

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The maximum number of blocks to return.
   * @param proven - If true, only return blocks that have been proven.
   * @returns The requested L2 blocks.
   */
  getBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<L2Block[]>;

  /** Equivalent to getBlocks but includes publish data. */
  getPublishedBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<PublishedL2Block[]>;
}

/**
 * Interface for classes that can receive and store L2 blocks.
 */
export interface L2BlockSink {
  /**
   * Adds a block to the store.
   * @param block - The L2 block to add.
   * @throws If block number is not incremental (i.e., not exactly one more than the last stored block).
   */
  addBlock(block: L2BlockNew): Promise<void>;
}

/**
 * L2BlockSource that emits events upon pending / proven chain changes.
 * see L2BlockSourceEvents for the events emitted.
 */
export type ArchiverEmitter = TypedEventEmitter<{
  [L2BlockSourceEvents.L2PruneDetected]: (args: L2BlockPruneEvent) => void;
  [L2BlockSourceEvents.L2BlockProven]: (args: L2BlockProvenEvent) => void;
  [L2BlockSourceEvents.InvalidAttestationsBlockDetected]: (args: InvalidBlockDetectedEvent) => void;
}>;
export interface L2BlockSourceEventEmitter extends L2BlockSource, ArchiverEmitter {}

/**
 * Identifier for L2 block tags.
 * - latest: Latest block pushed to L1.
 * - proven: Proven block on L1.
 * - finalized: Proven block on a finalized L1 block (not implemented, set to proven for now).
 */
export type L2BlockTag = 'latest' | 'proven' | 'finalized';

/** Tips of the L2 chain. */
export type L2Tips = Record<L2BlockTag, L2BlockId>;

/** Identifies a block by number and hash. */
export type L2BlockId = { number: BlockNumber; hash: string };

/** Creates an L2 block id */
export function makeL2BlockId(number: BlockNumber, hash?: string): L2BlockId {
  if (number !== 0 && !hash) {
    throw new Error(`Hash is required for non-genesis blocks (got block number ${number})`);
  }
  return { number, hash: hash! };
}

const L2BlockIdSchema = z.object({
  number: BlockNumberSchema,
  hash: z.string(),
});

export const L2TipsSchema = z.object({
  latest: L2BlockIdSchema,
  proven: L2BlockIdSchema,
  finalized: L2BlockIdSchema,
});

export enum L2BlockSourceEvents {
  L2PruneDetected = 'l2PruneDetected',
  L2BlockProven = 'l2BlockProven',
  InvalidAttestationsBlockDetected = 'invalidBlockDetected',
}

export type L2BlockProvenEvent = {
  type: 'l2BlockProven';
  blockNumber: BlockNumber;
  slotNumber: SlotNumber;
  epochNumber: EpochNumber;
};

export type L2BlockPruneEvent = {
  type: 'l2PruneDetected';
  epochNumber: EpochNumber;
  blocks: L2Block[];
};

export type InvalidBlockDetectedEvent = {
  type: 'invalidBlockDetected';
  validationResult: ValidateBlockNegativeResult;
};
