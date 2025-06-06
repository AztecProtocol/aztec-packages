import type { EthAddress } from '@aztec/foundation/eth-address';
import type { TypedEventEmitter } from '@aztec/foundation/types';

import { z } from 'zod';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import type { BlockHeader } from '../tx/block_header.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import type { TxHash } from '../tx/tx_hash.js';
import type { TxReceipt } from '../tx/tx_receipt.js';
import type { L2Block } from './l2_block.js';
import type { PublishedL2Block } from './published_l2_block.js';

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
  getBlockNumber(): Promise<number>;

  /**
   * Gets the number of the latest L2 block proven seen by the block source implementation.
   * @returns The number of the latest L2 block proven seen by the block source implementation.
   */
  getProvenBlockNumber(): Promise<number>;

  /**
   * Gets an l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  getBlock(number: number): Promise<L2Block | undefined>;

  /**
   * Gets an l2 block header.
   * @param number - The block number to return or 'latest' for the most recent one.
   * @returns The requested L2 block header.
   */
  getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined>;

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The maximum number of blocks to return.
   * @param proven - If true, only return blocks that have been proven.
   * @returns The requested L2 blocks.
   */
  getBlocks(from: number, limit: number, proven?: boolean): Promise<L2Block[]>;

  /** Equivalent to getBlocks but includes publish data. */
  getPublishedBlocks(from: number, limit: number, proven?: boolean): Promise<PublishedL2Block[]>;

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
   * Returns the current L2 slot number based on the current L1 timestamp.
   */
  getL2SlotNumber(): Promise<bigint>;

  /**
   * Returns the current L2 epoch number based on the current L1 timestamp.
   */
  getL2EpochNumber(): Promise<bigint>;

  /**
   * Returns all blocks for a given epoch.
   * @dev Use this method only with recent epochs, since it walks the block list backwards.
   * @param epochNumber - The epoch number to return blocks for.
   */
  getBlocksForEpoch(epochNumber: bigint): Promise<L2Block[]>;

  /**
   * Returns all block headers for a given epoch.
   * @dev Use this method only with recent epochs, since it walks the block list backwards.
   * @param epochNumber - The epoch number to return headers for.
   */
  getBlockHeadersForEpoch(epochNumber: bigint): Promise<BlockHeader[]>;

  /**
   * Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
   * @param epochNumber - The epoch number to check.
   */
  isEpochComplete(epochNumber: bigint): Promise<boolean>;

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;

  /**
   * Returns the rollup constants for the current chain.
   */
  getL1Constants(): Promise<L1RollupConstants>;

  /** Latest synced L1 timestamp. */
  getL1Timestamp(): Promise<bigint>;

  /** Force a sync. */
  syncImmediate(): Promise<void>;
}

/**
 * L2BlockSource that emits events upon pending / proven chain changes.
 * see L2BlockSourceEvents for the events emitted.
 */

export type ArchiverEmitter = TypedEventEmitter<{
  [L2BlockSourceEvents.L2PruneDetected]: (args: L2BlockSourceEvent) => void;
  [L2BlockSourceEvents.L2BlockProven]: (args: L2BlockSourceEvent) => void;
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
export type L2BlockId = z.infer<typeof L2BlockIdSchema>;

/** Creates an L2 block id */
export function makeL2BlockId(number: number, hash?: string): L2BlockId {
  if (number !== 0 && !hash) {
    throw new Error(`Hash is required for non-genesis blocks (got block number ${number})`);
  }
  return { number, hash: hash! };
}

// TODO(palla/schemas): This package should know what is the block hash of the genesis block 0.
const L2BlockIdSchema = z.union([
  z.object({
    number: z.literal(0),
    hash: z.undefined(),
  }),
  z.object({
    number: z.number(),
    hash: z.string(),
  }),
]);

export const L2TipsSchema = z.object({
  latest: L2BlockIdSchema,
  proven: L2BlockIdSchema,
  finalized: L2BlockIdSchema,
}) satisfies z.ZodType<L2Tips>;

export enum L2BlockSourceEvents {
  L2PruneDetected = 'l2PruneDetected',
  L2BlockProven = 'l2BlockProven',
}

export type L2BlockSourceEvent = {
  type: 'l2PruneDetected' | 'l2BlockProven';
  blockNumber: bigint;
  slotNumber: bigint;
  epochNumber: bigint;
};
