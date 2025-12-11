import type { Logger } from '@aztec/foundation/log';

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
  /** Optional debug info about how the fee was calculated */
  debugInfo?: Record<string, string | number>;
}

/**
 * Context passed to the strategy calculation function (excluding promise results)
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
 * Each strategy defines what promises it needs and how to calculate the fee from their results.
 * This design allows strategies to be plugged into both L1FeeAnalyzer and ReadOnlyL1TxUtils.
 */
export interface PriorityFeeStrategy<TPromises extends Record<string, Promise<any>> = Record<string, Promise<any>>> {
  /** Human-readable name for logging */
  name: string;
  /** Unique identifier for metrics */
  id: string;
  /**
   * Returns the promises that need to be executed for this strategy.
   * These will be run in parallel with Promise.allSettled.
   * @param client - The viem client to use for RPC calls
   * @returns An object of promises keyed by name
   */
  getRequiredPromises(client: ViemClient, opts: Partial<PriorityFeeStrategyContext>): TPromises;
  /**
   * Calculate the priority fee based on the settled promise results.
   * @param results - The settled results of the promises from getRequiredPromises
   * @param context - Contains gas config, whether it's a blob tx, and logger
   * @returns The calculated priority fee result
   */
  calculate(
    results: { [K in keyof TPromises]: PromiseSettledResult<Awaited<TPromises[K]>> },
    context: PriorityFeeStrategyContext,
  ): PriorityFeeStrategyResult;
}

/**
 * Helper function to execute a strategy's promises and calculate the result.
 * This can be used by both L1FeeAnalyzer and ReadOnlyL1TxUtils.
 * @param strategy - The strategy to execute
 * @param client - The viem client to use for RPC calls
 * @param context - The context for calculation
 * @returns The strategy result
 */
export async function executeStrategy<TPromises extends Record<string, Promise<any>>>(
  strategy: PriorityFeeStrategy<TPromises>,
  client: ViemClient,
  context: PriorityFeeStrategyContext,
): Promise<PriorityFeeStrategyResult> {
  const promises = strategy.getRequiredPromises(client, { isBlobTx: context.isBlobTx });
  const keys = Object.keys(promises) as Array<keyof TPromises>;
  const promiseArray = keys.map(k => promises[k]);

  const settledResults = await Promise.allSettled(promiseArray);

  // Reconstruct the results object with the same keys, preserving the type mapping
  const results = {} as { [K in keyof TPromises]: PromiseSettledResult<Awaited<TPromises[K]>> };
  keys.forEach((key, index) => {
    results[key] = settledResults[index] as PromiseSettledResult<Awaited<TPromises[typeof key]>>;
  });

  return strategy.calculate(results, context);
}
