import { median } from '@aztec/foundation/collection';

import { formatGwei } from 'viem';

import type { ViemClient } from '../../types.js';
import { calculatePercentile } from '../../utils.js';
import { WEI_CONST } from '../constants.js';
import {
  HISTORICAL_BLOCK_COUNT,
  type PriorityFeeStrategy,
  type PriorityFeeStrategyContext,
  type PriorityFeeStrategyResult,
} from './types.js';

/**
 * Type for the promises required by the competitive strategy
 */
type P75AllTxsStrategyPromises = {
  networkEstimate: Promise<bigint>;
  pendingBlock: Promise<Awaited<ReturnType<ViemClient['getBlock']>> | null>;
  feeHistory: Promise<Awaited<ReturnType<ViemClient['getFeeHistory']>> | null>;
};

/**
 * Our current competitive priority fee strategy.
 * Analyzes p75 of pending transactions and 5-block fee history to determine a competitive priority fee.
 * Falls back to network estimate if data is unavailable.
 */
export const P75AllTxsPriorityFeeStrategy: PriorityFeeStrategy<P75AllTxsStrategyPromises> = {
  name: 'Competitive (P75 + History) - CURRENT',
  id: 'p75_pending_txs_and_history_all_txs',

  getRequiredPromises(client: ViemClient): P75AllTxsStrategyPromises {
    return {
      networkEstimate: client.estimateMaxPriorityFeePerGas().catch(() => 0n),
      pendingBlock: client.getBlock({ blockTag: 'pending', includeTransactions: true }).catch(() => null),
      feeHistory: client
        .getFeeHistory({
          blockCount: HISTORICAL_BLOCK_COUNT,
          rewardPercentiles: [75],
          blockTag: 'latest',
        })
        .catch(() => null),
    };
  },

  calculate(
    results: {
      [K in keyof P75AllTxsStrategyPromises]: PromiseSettledResult<Awaited<P75AllTxsStrategyPromises[K]>>;
    },
    context: PriorityFeeStrategyContext,
  ): PriorityFeeStrategyResult {
    const { logger } = context;

    // Extract network estimate from settled result
    const networkEstimate =
      results.networkEstimate.status === 'fulfilled' && typeof results.networkEstimate.value === 'bigint'
        ? results.networkEstimate.value
        : 0n;

    let competitiveFee = networkEstimate;
    const debugInfo: Record<string, string | number> = {
      networkEstimateGwei: formatGwei(networkEstimate),
    };

    // Extract pending block from settled result
    const pendingBlock = results.pendingBlock.status === 'fulfilled' ? results.pendingBlock.value : null;

    // Analyze pending block transactions
    if (pendingBlock?.transactions && pendingBlock.transactions.length > 0) {
      const pendingFees = pendingBlock.transactions
        .map(tx => {
          if (typeof tx === 'string') {
            return 0n;
          }
          const fee = tx.maxPriorityFeePerGas || 0n;

          return fee;
        })
        .filter((fee: bigint) => fee > 0n);

      if (pendingFees.length > 0) {
        // Use 75th percentile of pending fees to be competitive
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

    // Extract fee history from settled result
    const feeHistory = results.feeHistory.status === 'fulfilled' ? results.feeHistory.value : null;

    // Analyze fee history
    if (feeHistory?.reward && feeHistory.reward.length > 0) {
      // Extract 75th percentile fees from each block
      const percentile75Fees = feeHistory.reward.map(rewards => rewards[0] || 0n).filter(fee => fee > 0n);

      if (percentile75Fees.length > 0) {
        // Calculate median of the 75th percentile fees across blocks
        const medianHistoricalFee = median(percentile75Fees) ?? 0n;

        // Debug: Log suspicious fees from history
        if (medianHistoricalFee > 100n * WEI_CONST) {
          logger?.warn('Suspicious high fee in history', {
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

    // Sanity check: cap competitive fee at 100x network estimate to avoid using unrealistic fees
    const maxReasonableFee = networkEstimate * 100n;
    if (competitiveFee > maxReasonableFee && networkEstimate > 0n) {
      logger?.warn('Competitive fee exceeds sanity cap, using capped value', {
        competitiveFee: formatGwei(competitiveFee),
        networkEstimate: formatGwei(networkEstimate),
        cappedTo: formatGwei(maxReasonableFee),
      });
      competitiveFee = maxReasonableFee;
      debugInfo.cappedToGwei = formatGwei(maxReasonableFee);
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
      debugInfo,
    };
  },
};
