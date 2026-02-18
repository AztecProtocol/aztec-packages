import { median } from '@aztec/foundation/collection';

import { type GetFeeHistoryReturnType, formatGwei } from 'viem';

import type { ViemClient } from '../../types.js';
import { calculatePercentile, isBlobTransaction } from '../../utils.js';
import { WEI_CONST } from '../constants.js';
import {
  HISTORICAL_BLOCK_COUNT,
  type PriorityFeeStrategy,
  type PriorityFeeStrategyContext,
  type PriorityFeeStrategyResult,
} from './types.js';

/**
 * Fetches historical blocks and calculates reward percentiles for blob transactions only.
 * Returns data in the same format as getFeeHistory for easy drop-in replacement.
 *
 * @param client - Viem client to use for RPC calls
 * @param blockCount - Number of historical blocks to fetch
 * @param rewardPercentiles - Array of percentiles to calculate (e.g., [75] for 75th percentile)
 * @returns Object with reward field containing percentile fees for each block, similar to getFeeHistory
 * @throws Error if fetching blocks fails
 */
export async function getBlobPriorityFeeHistory(
  client: ViemClient,
  blockCount: number,
  rewardPercentiles: number[],
): Promise<GetFeeHistoryReturnType> {
  const latestBlockNumber = await client.getBlockNumber();

  // Fetch multiple blocks in parallel
  const blockPromises = Array.from({ length: blockCount }, (_, i) =>
    client.getBlock({
      blockNumber: latestBlockNumber - BigInt(i),
      includeTransactions: true,
    }),
  );

  const blocks = await Promise.all(blockPromises);

  // Process each block to extract blob transaction fees and other data
  const baseFeePerGas: bigint[] = [];
  const gasUsedRatio: number[] = [];
  const reward: bigint[][] = [];

  for (const block of blocks) {
    // Collect base fee per gas
    baseFeePerGas.push(block.baseFeePerGas || 0n);

    // Calculate gas used ratio
    const gasUsed = block.gasUsed || 0n;
    const gasLimit = block.gasLimit || 1n; // Avoid division by zero
    gasUsedRatio.push(Number(gasUsed) / Number(gasLimit));

    if (!block.transactions || block.transactions.length === 0) {
      // No transactions in this block - return zeros for each percentile
      reward.push(rewardPercentiles.map(() => 0n));
      continue;
    }

    // Extract priority fees from blob transactions only
    const blobFees = block.transactions
      .map(tx => {
        // Transaction can be just a hash string
        if (typeof tx === 'string') {
          return 0n;
        }

        if (!isBlobTransaction(tx)) {
          return 0n;
        }
        return tx.maxPriorityFeePerGas || 0n;
      })
      .filter((fee: bigint) => fee > 0n);

    if (blobFees.length === 0) {
      // No blob transactions in this block - return zeros for each percentile
      reward.push(rewardPercentiles.map(() => 0n));
      continue;
    }

    // Calculate requested percentiles
    const percentiles = rewardPercentiles.map(percentile => calculatePercentile(blobFees, percentile));

    reward.push(percentiles);
  }

  // Calculate oldest block number (the last block in our array)
  const oldestBlock = latestBlockNumber - BigInt(blockCount - 1);

  // Reverse arrays to match getFeeHistory behavior (oldest first)
  return {
    baseFeePerGas: baseFeePerGas.reverse(),
    gasUsedRatio: gasUsedRatio.reverse(),
    oldestBlock,
    reward: reward.reverse(),
  };
}

/**
 * Similar to our current competitive priority fee strategy, but only considers blob transactions
 * when calculating competitive priority fee for blob transactions.
 * This strategy also has NO cap on the competitive fee if it's much higher than the network estimate.
 * Analyzes p75 of pending transactions and 5-block fee history to determine a competitive priority fee.
 * Falls back to network estimate if data is unavailable.
 */
export const P75BlobTxsOnlyPriorityFeeStrategy: PriorityFeeStrategy = {
  name: 'Competitive (P75 + History) - Blob Txs Only',
  id: 'p75_pending_txs_and_history_blob_txs_only',

  async execute(client: ViemClient, context: PriorityFeeStrategyContext): Promise<PriorityFeeStrategyResult> {
    const { isBlobTx, logger } = context;

    // Fire all RPC calls in parallel
    const [latestBlockResult, blobBaseFeeResult, networkEstimateResult, pendingBlockResult, feeHistoryResult] =
      await Promise.allSettled([
        client.getBlock({ blockTag: 'latest' }),
        isBlobTx ? client.getBlobBaseFee() : Promise.resolve(undefined),
        client.estimateMaxPriorityFeePerGas().catch(() => 0n),
        client.getBlock({ blockTag: 'pending', includeTransactions: true }).catch(() => null),
        isBlobTx
          ? getBlobPriorityFeeHistory(client, HISTORICAL_BLOCK_COUNT, [75])
          : client
              .getFeeHistory({
                blockCount: HISTORICAL_BLOCK_COUNT,
                rewardPercentiles: [75],
                blockTag: 'latest',
              })
              .catch(() => null),
      ]);

    // Extract latest block (required)
    if (latestBlockResult.status === 'rejected') {
      throw new Error(`Failed to get latest block: ${latestBlockResult.reason}`);
    }
    const latestBlock = latestBlockResult.value;

    // Extract blob base fee (only for blob txs)
    let blobBaseFee: bigint | undefined;
    if (isBlobTx) {
      if (blobBaseFeeResult.status === 'fulfilled' && typeof blobBaseFeeResult.value === 'bigint') {
        blobBaseFee = blobBaseFeeResult.value;
      } else {
        logger?.warn('Failed to get L1 blob base fee');
      }
    }

    // Extract network estimate
    const networkEstimate =
      networkEstimateResult.status === 'fulfilled' && typeof networkEstimateResult.value === 'bigint'
        ? networkEstimateResult.value
        : 0n;

    let competitiveFee = networkEstimate;
    const debugInfo: Record<string, string | number> = {
      networkEstimateGwei: formatGwei(networkEstimate),
    };

    // Extract pending block
    const pendingBlock = pendingBlockResult.status === 'fulfilled' ? pendingBlockResult.value : null;

    // Analyze pending block transactions
    if (pendingBlock?.transactions && pendingBlock.transactions.length > 0) {
      const pendingFees = pendingBlock.transactions
        .map(tx => {
          if (typeof tx === 'string') {
            return 0n;
          }
          if (isBlobTx) {
            if (!isBlobTransaction(tx)) {
              return 0n;
            }
          }
          return tx.maxPriorityFeePerGas || 0n;
        })
        .filter((fee: bigint) => fee > 0n);

      if (pendingFees.length > 0) {
        const pendingCompetitiveFee = calculatePercentile(pendingFees, 75);

        if (pendingCompetitiveFee > competitiveFee) {
          competitiveFee = pendingCompetitiveFee;
        }

        debugInfo.pendingTxCount = pendingFees.length;
        debugInfo.pendingP75Gwei = formatGwei(pendingCompetitiveFee);

        logger?.debug('Analyzed pending transactions for competitive pricing', {
          pendingTxCount: pendingFees.length,
          pendingP75: formatGwei(pendingCompetitiveFee),
        });
      }
    }

    // Extract fee history
    const feeHistory = feeHistoryResult.status === 'fulfilled' ? feeHistoryResult.value : null;

    // Analyze fee history
    if (feeHistory?.reward && feeHistory.reward.length > 0) {
      // Extract 75th percentile fees from each block
      const percentile75Fees = feeHistory.reward.map(rewards => rewards[0] || 0n).filter(fee => fee > 0n);

      if (percentile75Fees.length > 0) {
        // Calculate median of the 75th percentile fees across blocks
        const medianHistoricalFee = median(percentile75Fees) ?? 0n;

        // Debug: Log suspicious fees from history
        if (medianHistoricalFee > 100n * WEI_CONST) {
          logger?.debug('Suspicious high fee in history', {
            historicalMedian: formatGwei(medianHistoricalFee),
            allP75Fees: percentile75Fees.map(f => formatGwei(f)),
          });
        }

        if (medianHistoricalFee > competitiveFee) {
          competitiveFee = medianHistoricalFee;
        }

        debugInfo.historicalMedianGwei = formatGwei(medianHistoricalFee);

        logger?.debug('Analyzed fee history for competitive pricing', {
          historicalMedian: formatGwei(medianHistoricalFee),
        });
      }
    }

    // Log final decision
    if (competitiveFee > networkEstimate) {
      logger?.debug('Using competitive fee from market analysis', {
        networkEstimate: formatGwei(networkEstimate),
        competitive: formatGwei(competitiveFee),
      });
    }

    debugInfo.finalFeeGwei = formatGwei(competitiveFee);

    return {
      priorityFee: competitiveFee,
      latestBlock,
      blobBaseFee,
      debugInfo,
    };
  },
};
