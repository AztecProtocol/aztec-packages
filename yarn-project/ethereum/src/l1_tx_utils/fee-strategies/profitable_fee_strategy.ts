import { median } from '@aztec/foundation/collection';

import { formatGwei } from 'viem';

import type { FeeAssetPriceOracle } from '../../contracts/fee_asset_price_oracle.js';
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
 * Extended context for the profitable fee strategy that includes oracle and revenue data
 */
export interface ProfitableFeeStrategyContext extends PriorityFeeStrategyContext {
  /** Oracle for querying fee asset prices */
  feeAssetPriceOracle: FeeAssetPriceOracle;
  /** Total L2 transaction fees collected in this checkpoint (in Fee Asset wei) */
  l2FeesCollected: bigint;
  /** Checkpoint reward per block in Fee Asset wei (e.g., 280e18 / blocks_in_checkpoint) */
  checkpointRewardPerBlock: bigint;
  /** Estimated L1 gas for the propose transaction (not including priority fee) */
  estimatedL1Gas: bigint;
  /** Estimated blob gas for the propose transaction */
  estimatedBlobGas: bigint;
}

/**
 * A profit-aware priority fee strategy that ensures sequencer profitability.
 *
 * This strategy:
 * 1. Calculates competitive priority fee (same as P75AllTxsPriorityFeeStrategy)
 * 2. Queries the Uniswap oracle for current ETH/FeeAsset market price
 * 3. Converts total revenue (L2 fees + checkpoint rewards) from Fee Asset to ETH
 * 4. Calculates max affordable priority fee that maintains profitability
 * 5. Uses the minimum of competitive and profitable fees
 *
 * Formula:
 *   total_revenue_fee_asset = l2_fees + checkpoint_reward_per_block
 *   revenue_eth = total_revenue_fee_asset * eth_per_fee_asset / 1e12
 *   l1_base_cost = (estimated_gas × base_fee) + (blob_gas × blob_fee)
 *   max_priority_fee = (revenue_eth - l1_base_cost) / estimated_gas
 *   final_fee = min(competitive_fee, max_priority_fee)
 *
 * This ensures we only pay for speed when it's profitable to do so.
 */
export const ProfitablePriorityFeeStrategy: PriorityFeeStrategy = {
  name: 'Profitable (Oracle-aware)',
  id: 'profitable_oracle_aware',

  async execute(client: ViemClient, context: PriorityFeeStrategyContext): Promise<PriorityFeeStrategyResult> {
    const extendedContext = context as ProfitableFeeStrategyContext;
    const {
      isBlobTx,
      logger,
      feeAssetPriceOracle,
      l2FeesCollected,
      checkpointRewardPerBlock,
      estimatedL1Gas,
      estimatedBlobGas,
    } = extendedContext;

    // Fire all RPC calls in parallel
    const [latestBlockResult, blobBaseFeeResult, networkEstimateResult, pendingBlockResult, feeHistoryResult] =
      await Promise.allSettled([
        client.getBlock({ blockTag: 'latest' }),
        isBlobTx ? client.getBlobBaseFee() : Promise.resolve(undefined),
        client.estimateMaxPriorityFeePerGas().catch(() => 0n),
        client.getBlock({ blockTag: 'pending', includeTransactions: true }).catch(() => null),
        client
          .getFeeHistory({
            blockCount: HISTORICAL_BLOCK_COUNT,
            rewardPercentiles: [75],
            blockTag: 'latest',
          })
          .catch(() => null),
      ]);

    // Extract latest block
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

    const debugInfo: Record<string, string | number> = {};

    // Step 1: Calculate competitive fee (same as P75AllTxsPriorityFeeStrategy)
    const networkEstimate =
      networkEstimateResult.status === 'fulfilled' && typeof networkEstimateResult.value === 'bigint'
        ? networkEstimateResult.value
        : 0n;

    let competitiveFee = networkEstimate;
    debugInfo.networkEstimateGwei = formatGwei(networkEstimate);

    // Analyze pending block
    const pendingBlock = pendingBlockResult.status === 'fulfilled' ? pendingBlockResult.value : null;
    if (pendingBlock?.transactions && pendingBlock.transactions.length > 0) {
      const pendingFees = pendingBlock.transactions
        .map(tx => {
          if (typeof tx === 'string') {
            return 0n;
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
      }
    }

    // Analyze fee history
    const feeHistory = feeHistoryResult.status === 'fulfilled' ? feeHistoryResult.value : null;
    if (feeHistory?.reward && feeHistory.reward.length > 0) {
      const percentile75Fees = feeHistory.reward.map(rewards => rewards[0] || 0n).filter(fee => fee > 0n);
      if (percentile75Fees.length > 0) {
        const medianHistoricalFee = median(percentile75Fees) ?? 0n;
        if (medianHistoricalFee > competitiveFee) {
          competitiveFee = medianHistoricalFee;
        }
        debugInfo.historicalMedianGwei = formatGwei(medianHistoricalFee);
      }
    }

    debugInfo.competitiveFeeGwei = formatGwei(competitiveFee);

    // Step 2: Calculate profitability cap using oracle
    let profitableFee = competitiveFee; // Default to competitive if oracle fails

    try {
      // Get oracle price (ETH per FeeAsset, E12 scale)
      const oraclePriceE12 = await feeAssetPriceOracle.getOraclePrice();

      if (oraclePriceE12 !== undefined && oraclePriceE12 > 0n) {
        debugInfo.oraclePriceE12 = oraclePriceE12.toString();

        // Calculate total revenue: L2 transaction fees + checkpoint reward
        const totalRevenueFeeAsset = l2FeesCollected + checkpointRewardPerBlock;
        debugInfo.l2FeesCollectedFeeAsset = l2FeesCollected.toString();
        debugInfo.checkpointRewardPerBlockFeeAsset = checkpointRewardPerBlock.toString();
        debugInfo.totalRevenueFeeAsset = totalRevenueFeeAsset.toString();

        // Convert total revenue from FeeAsset to ETH
        // revenue_eth = total_revenue_fee_asset * eth_per_fee_asset / 1e12
        const revenueEth = (totalRevenueFeeAsset * oraclePriceE12) / 10n ** 12n;
        debugInfo.revenueEthWei = revenueEth.toString();
        debugInfo.revenueEthGwei = formatGwei(revenueEth);

        // Calculate base L1 costs (without priority fee)
        const baseFee = latestBlock.baseFeePerGas || 0n;
        const l1BaseCost = estimatedL1Gas * baseFee;
        const l1BlobCost = isBlobTx && blobBaseFee ? estimatedBlobGas * blobBaseFee : 0n;
        const totalL1BaseCost = l1BaseCost + l1BlobCost;

        debugInfo.l1BaseCostGwei = formatGwei(l1BaseCost);
        debugInfo.l1BlobCostGwei = formatGwei(l1BlobCost);
        debugInfo.totalL1BaseCostGwei = formatGwei(totalL1BaseCost);

        // Calculate remaining revenue after base costs
        const remainingRevenue = revenueEth > totalL1BaseCost ? revenueEth - totalL1BaseCost : 0n;
        debugInfo.remainingRevenueGwei = formatGwei(remainingRevenue);

        // Calculate max priority fee per gas that keeps us profitable
        // max_priority_fee_per_gas = remaining_revenue / estimated_gas
        if (estimatedL1Gas > 0n && remainingRevenue > 0n) {
          const maxProfitableFeePerGas = remainingRevenue / estimatedL1Gas;
          profitableFee = maxProfitableFeePerGas;
          debugInfo.maxProfitableFeeGwei = formatGwei(maxProfitableFeePerGas);

          logger?.info('Calculated profitable priority fee cap', {
            l2FeesCollected: l2FeesCollected.toString(),
            checkpointReward: checkpointRewardPerBlock.toString(),
            totalRevenue: totalRevenueFeeAsset.toString(),
            oraclePriceE12: oraclePriceE12.toString(),
            revenueEth: formatGwei(revenueEth),
            l1BaseCost: formatGwei(totalL1BaseCost),
            maxProfitableFee: formatGwei(maxProfitableFeePerGas),
          });
        } else {
          logger?.warn('Cannot calculate profitable fee: insufficient revenue or zero gas estimate', {
            remainingRevenue: remainingRevenue.toString(),
            estimatedL1Gas: estimatedL1Gas.toString(),
          });
          debugInfo.warning = 'Insufficient revenue or zero gas estimate';
        }
      } else {
        logger?.info('Oracle price unavailable, falling back to competitive fee only');
        debugInfo.warning = 'Oracle price unavailable';
      }
    } catch (err) {
      logger?.warn(`Failed to calculate profitable fee cap: ${err}`);
      debugInfo.error = String(err);
    }

    // Step 3: Choose the minimum of competitive and profitable
    // This ensures we're competitive when profitable, but protect ourselves when not
    const finalFee = competitiveFee < profitableFee ? competitiveFee : profitableFee;
    const reason = competitiveFee < profitableFee ? 'competitive' : 'profitable_cap';

    debugInfo.finalFeeGwei = formatGwei(finalFee);
    debugInfo.reason = reason;

    logger?.info('Selected priority fee', {
      competitive: formatGwei(competitiveFee),
      profitable: formatGwei(profitableFee),
      final: formatGwei(finalFee),
      reason,
    });

    return {
      priorityFee: finalFee,
      latestBlock,
      blobBaseFee,
      debugInfo,
    };
  },
};
