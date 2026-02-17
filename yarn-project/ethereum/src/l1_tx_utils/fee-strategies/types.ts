import type { Logger } from '@aztec/foundation/log';

import type { Block } from 'viem';

import type { ViemClient } from '../../types.js';
import type { L1TxUtilsConfig } from '../config.js';

/**
 * Historical block count for fee history queries
 */
export const HISTORICAL_BLOCK_COUNT = 5;

/**
 * Result from a priority fee strategy calculation
 */
export interface PriorityFeeStrategyResult {
  /** The calculated priority fee in wei */
  priorityFee: bigint;
  /** The latest block (fetched as part of the strategy) */
  latestBlock: Block;
  /** The blob base fee (only present for blob transactions) */
  blobBaseFee?: bigint;
  /** Optional debug info about how the fee was calculated */
  debugInfo?: Record<string, string | number>;
}

/**
 * Context passed to the strategy function
 */
export interface PriorityFeeStrategyContext {
  /** Gas configuration */
  gasConfig: L1TxUtilsConfig;
  /** Whether this is for a blob transaction */
  isBlobTx: boolean;
  /** Logger for debugging */
  logger?: Logger;
}

/**
 * A strategy for calculating the priority fee for L1 transactions.
 * The function handles all RPC calls and returns
 * the priority fee, along with any block data needed by the caller.
 */
export type PriorityFeeStrategy = {
  /** Human-readable name for logging */
  name: string;
  /** Unique identifier for metrics */
  id: string;
  /**
   * Calculate the priority fee.
   * @param client - The viem client to use for RPC calls
   * @param context - Contains gas config, whether it's a blob tx, and logger
   * @returns The calculated priority fee result including block data
   */
  execute: (client: ViemClient, context: PriorityFeeStrategyContext) => Promise<PriorityFeeStrategyResult>;
};
