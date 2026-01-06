import type { SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';

import { type Block, type FormattedTransaction, type Hex, formatGwei } from 'viem';

import type { ViemClient } from '../types.js';
import { calculatePercentile, isBlobTransaction } from '../utils.js';
import type { L1TxUtilsConfig } from './config.js';
import { BLOB_CAPACITY_SCHEDULE, GAS_PER_BLOB, WEI_CONST } from './constants.js';
import {
  DEFAULT_PRIORITY_FEE_STRATEGIES,
  type PriorityFeeStrategy,
  type PriorityFeeStrategyContext,
} from './fee-strategies/index.js';
import type { L1BlobInputs, L1TxRequest } from './types.js';

/**
 * Information about a blob transaction in the pending pool or mined block
 */
export interface BlobTxInfo {
  hash: Hex;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  maxFeePerBlobGas: bigint;
  blobCount: number;
  gas: bigint;
}

/**
 * Snapshot of the pending block state at the time of analysis
 */
export interface PendingBlockSnapshot {
  /** Timestamp when the snapshot was taken */
  timestamp: number;
  /** The latest L1 block number at the time of snapshot */
  latestBlockNumber: bigint;
  /** Base fee per gas of the latest block */
  baseFeePerGas: bigint;
  /** Blob base fee at the time of snapshot */
  blobBaseFee: bigint;
  /** Total number of transactions in the pending block */
  pendingTxCount: number;
  /** Number of blob transactions in the pending block */
  pendingBlobTxCount: number;
  /** Total number of blobs in pending blob transactions */
  pendingBlobCount: number;
  /** Details of blob transactions in the pending pool */
  pendingBlobTxs: BlobTxInfo[];
  /** 75th percentile priority fee from pending transactions */
  pendingP75PriorityFee: bigint;
  /** 75th percentile priority fee from pending blob transactions */
  pendingBlobP75PriorityFee: bigint;
}

/**
 * Result of a strategy's priority fee calculation for analysis
 */
export interface StrategyAnalysisResult {
  /** Strategy ID */
  strategyId: string;
  /** Strategy name */
  strategyName: string;
  /** Calculated priority fee from this strategy */
  calculatedPriorityFee: bigint;
  /** Debug info from the strategy calculation */
  debugInfo?: Record<string, string | number>;
  /** Whether this transaction would have been included with this strategy's fee */
  wouldBeIncluded?: boolean;
  /** If not included, reason why */
  exclusionReason?: 'priority_fee_too_low' | 'block_full';
  /** Priority fee delta compared to minimum included fee */
  priorityFeeDelta?: bigint;
  /** Estimated total cost in ETH for this strategy */
  estimatedCostEth?: number;
  /** Estimated overpayment in ETH vs minimum required */
  estimatedOverpaymentEth?: number;
}

/**
 * Transaction metadata and strategy analysis results
 */
export interface ComputedGasPrices {
  /** Estimated gas limit for the transaction */
  gasLimit: bigint;
  /** Number of blobs in our transaction */
  blobCount: number;
  /** Results from all strategies analyzed */
  strategyResults?: StrategyAnalysisResult[];
}

/**
 * Information about what actually got included in the mined block
 */
export interface MinedBlockInfo {
  /** The block number that was mined */
  blockNumber: bigint;
  /** The block hash */
  blockHash: Hex;
  /** Timestamp of the mined block */
  blockTimestamp: bigint;
  /** Base fee per gas in the mined block */
  baseFeePerGas: bigint;
  /** Blob gas used in the mined block */
  blobGasUsed: bigint;
  /** Total number of transactions in the mined block */
  txCount: number;
  /** Number of blob transactions that got included */
  includedBlobTxCount: number;
  /** Total number of blobs included in the block */
  includedBlobCount: number;
  /** Details of blob transactions that got included */
  includedBlobTxs: BlobTxInfo[];
  /** Minimum priority fee among included transactions */
  minIncludedPriorityFee: bigint;
  /** Minimum priority fee among included blob transactions */
  minIncludedBlobPriorityFee: bigint;
}

/**
 * Complete fee analysis result comparing our estimates to what happened
 */
export interface L1FeeAnalysisResult {
  /** Unique identifier for this analysis */
  id: string;
  /** L2 slot number this analysis was performed for */
  l2SlotNumber: SlotNumber;
  /** Snapshot of pending state when we computed our fees */
  pendingSnapshot: PendingBlockSnapshot;
  /** Our computed gas prices */
  computedPrices: ComputedGasPrices;
  /** Information about what we were trying to send */
  txInfo: {
    requestCount: number;
    hasBlobData: boolean;
    totalEstimatedGas: bigint;
  };
  /** Information about the block that was eventually mined (populated after block mines) */
  minedBlock?: MinedBlockInfo;
  /** Analysis results (populated after block mines) */
  analysis?: {
    /** Time in ms between our snapshot and block mining */
    timeBeforeBlockMs: number;
    /** How many blob txs from pending actually got included */
    pendingBlobTxsIncludedCount: number;
    /** How many blob txs from pending were NOT included */
    pendingBlobTxsExcludedCount: number;
    /** Number of blobs in the mined block */
    blobsInBlock: number;
    /** Maximum blob capacity for this block */
    maxBlobCapacity: number;
    /** Whether the block's blob space was full */
    blockBlobsFull: boolean;
    /** Actual cost in ETH if this analysis is linked to a mined tx */
    actualCostEth?: number;
    /** Strategy results ranked by estimated cost */
    costRanking?: Array<{
      strategyId: string;
      strategyName: string;
      estimatedCostEth: number;
      wouldBeIncluded: boolean;
    }>;
  };
}

/** Callback type for when an analysis is completed */
export type L1FeeAnalysisCallback = (analysis: L1FeeAnalysisResult) => void;

/**
 * Result of processing transactions to extract blob tx info and priority fees
 */
interface ProcessedTransactions {
  blobTxs: BlobTxInfo[];
  allPriorityFees: bigint[];
  blobPriorityFees: bigint[];
  totalBlobCount: number;
}

/**
 * Gets the maximum blob capacity for a given block timestamp
 */
function getMaxBlobCapacity(blockTimestamp: bigint): number {
  const timestamp = Number(blockTimestamp);
  // Find the applicable schedule entry (sorted by timestamp descending)
  for (const schedule of BLOB_CAPACITY_SCHEDULE) {
    if (timestamp >= schedule.timestamp) {
      return schedule.max;
    }
  }
  // Fallback (should never hit)
  return BLOB_CAPACITY_SCHEDULE[BLOB_CAPACITY_SCHEDULE.length - 1].max;
}

/**
 * Processes a list of transactions to extract blob transaction info and priority fees.
 * Handles both pending and mined transactions.
 * Note: Only works with blocks fetched with includeTransactions: true
 */
function processTransactions(transactions: readonly FormattedTransaction[] | undefined): ProcessedTransactions {
  const blobTxs: BlobTxInfo[] = [];
  const allPriorityFees: bigint[] = [];
  const blobPriorityFees: bigint[] = [];
  let totalBlobCount = 0;

  if (!transactions) {
    return { blobTxs, allPriorityFees, blobPriorityFees, totalBlobCount };
  }

  for (const tx of transactions) {
    const priorityFee = tx.maxPriorityFeePerGas || 0n;
    if (priorityFee > 0n) {
      allPriorityFees.push(priorityFee);
    }

    // Check if this is a blob transaction
    if (isBlobTransaction(tx)) {
      const blobCount = tx.blobVersionedHashes.length;
      totalBlobCount += blobCount;

      if (priorityFee > 0n) {
        blobPriorityFees.push(priorityFee);
      }

      blobTxs.push({
        hash: tx.hash,
        maxPriorityFeePerGas: priorityFee,
        maxFeePerGas: tx.maxFeePerGas || 0n,
        maxFeePerBlobGas: tx.maxFeePerBlobGas,
        blobCount,
        gas: tx.gas,
      });
    }
  }

  return { blobTxs, allPriorityFees, blobPriorityFees, totalBlobCount };
}

/**
 * Analyzes L1 transaction fees in fisherman mode.
 * Captures pending block state, records gas calculations, and compares to what gets included.
 * Supports multiple priority fee calculation strategies for comparison.
 */
export class L1FeeAnalyzer {
  private pendingAnalyses: Map<string, L1FeeAnalysisResult> = new Map();
  private pendingCallbacks: Map<string, L1FeeAnalysisCallback> = new Map();
  private completedAnalyses: L1FeeAnalysisResult[] = [];
  private analysisCounter = 0;
  private strategies: PriorityFeeStrategy[];

  constructor(
    private client: ViemClient,
    private dateProvider: DateProvider = new DateProvider(),
    private logger: Logger = createLogger('ethereum:l1-fee-analyzer'),
    private maxCompletedAnalyses: number = 100,
    strategies: PriorityFeeStrategy[] = DEFAULT_PRIORITY_FEE_STRATEGIES,
    private gasConfig: L1TxUtilsConfig = {},
  ) {
    this.strategies = strategies;
  }

  /**
   * Executes all configured strategies and returns their results.
   * Each strategy handles its own RPC calls internally.
   * @param isBlobTx - Whether this is a blob transaction
   * @returns Array of strategy results
   */
  async executeAllStrategies(isBlobTx: boolean): Promise<StrategyAnalysisResult[]> {
    const results: StrategyAnalysisResult[] = [];
    const context: PriorityFeeStrategyContext = {
      gasConfig: this.gasConfig,
      isBlobTx,
      logger: this.logger,
    };

    for (const strategy of this.strategies) {
      try {
        const result = await strategy.execute(this.client, context);

        results.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          calculatedPriorityFee: result.priorityFee,
          debugInfo: result.debugInfo,
        });

        this.logger.debug(`Strategy "${strategy.name}" calculated priority fee`, {
          strategyId: strategy.id,
          priorityFee: formatGwei(result.priorityFee),
          ...result.debugInfo,
        });
      } catch (err) {
        this.logger.error(`Error calculating priority fee for strategy "${strategy.name}"`, err, {
          strategyId: strategy.id,
        });
      }
    }

    return results;
  }

  /**
   * Captures a snapshot of the current pending block state
   */
  async capturePendingSnapshot(): Promise<PendingBlockSnapshot> {
    const timestamp = this.dateProvider.now();

    // Fetch data in parallel
    const [latestBlock, pendingBlock, blobBaseFee] = await Promise.all([
      this.client.getBlock({ blockTag: 'latest' }),
      this.client.getBlock({ blockTag: 'pending', includeTransactions: true }).catch(() => null),
      this.client.getBlobBaseFee().catch(() => 0n),
    ]);

    const baseFeePerGas = latestBlock.baseFeePerGas || 0n;
    const latestBlockNumber = latestBlock.number;

    // Extract blob transaction info from pending block
    const {
      blobTxs: pendingBlobTxs,
      allPriorityFees: allPendingPriorityFees,
      blobPriorityFees: pendingBlobPriorityFees,
      totalBlobCount: pendingBlobCount,
    } = processTransactions(pendingBlock?.transactions);

    // Calculate 75th percentile priority fees
    const pendingP75PriorityFee = calculatePercentile(allPendingPriorityFees, 75);
    const pendingBlobP75PriorityFee = calculatePercentile(pendingBlobPriorityFees, 75);

    const pendingTxCount = pendingBlock?.transactions?.length || 0;

    return {
      timestamp,
      latestBlockNumber,
      baseFeePerGas,
      blobBaseFee,
      pendingTxCount,
      pendingBlobTxCount: pendingBlobTxs.length,
      pendingBlobCount,
      pendingBlobTxs,
      pendingP75PriorityFee,
      pendingBlobP75PriorityFee,
    };
  }

  /**
   * Starts a fee analysis for a transaction bundle
   * @param l2SlotNumber - The L2 slot this analysis is for
   * @param gasLimit - The estimated gas limit
   * @param requests - The transaction requests being analyzed
   * @param blobInputs - Blob inputs if this is a blob transaction
   * @param onComplete - Optional callback to invoke when analysis completes
   * @returns The analysis ID for tracking
   */
  async startAnalysis(
    l2SlotNumber: SlotNumber,
    gasLimit: bigint,
    requests: L1TxRequest[],
    blobInputs?: L1BlobInputs,
    onComplete?: L1FeeAnalysisCallback,
  ): Promise<string> {
    const id = `fee-analysis-${++this.analysisCounter}-${Date.now()}`;

    const blobCount = blobInputs?.blobs?.length || 0;
    const isBlobTx = blobCount > 0;

    // Execute all strategies and capture pending snapshot in parallel
    const [pendingSnapshot, strategyResults] = await Promise.all([
      this.capturePendingSnapshot(),
      this.executeAllStrategies(isBlobTx),
    ]);

    const analysis: L1FeeAnalysisResult = {
      id,
      l2SlotNumber,
      pendingSnapshot,
      computedPrices: {
        gasLimit,
        blobCount,
        strategyResults,
      },
      txInfo: {
        requestCount: requests.length,
        hasBlobData: isBlobTx,
        totalEstimatedGas: gasLimit,
      },
    };

    this.pendingAnalyses.set(id, analysis);
    if (onComplete) {
      this.pendingCallbacks.set(id, onComplete);
    }

    // Log strategy calculations
    const strategyLogInfo = strategyResults.reduce(
      (acc, s) => {
        acc[`strategy_${s.strategyId}`] = formatGwei(s.calculatedPriorityFee);
        return acc;
      },
      {} as Record<string, string>,
    );

    this.logger.debug('Started fee analysis with strategy calculations', {
      id,
      l2SlotNumber: l2SlotNumber.toString(),
      pendingBlobTxCount: pendingSnapshot.pendingBlobTxCount,
      pendingBlobCount: pendingSnapshot.pendingBlobCount,
      pendingBlobP75: formatGwei(pendingSnapshot.pendingBlobP75PriorityFee),
      strategiesAnalyzed: strategyResults.length,
      ...strategyLogInfo,
    });

    // Start watching for the next block
    void this.watchForNextBlock(id, pendingSnapshot.latestBlockNumber);

    return id;
  }

  /**
   * Watches for the next block to be mined and completes the analysis
   */
  private async watchForNextBlock(analysisId: string, startBlockNumber: bigint): Promise<void> {
    const analysis = this.pendingAnalyses.get(analysisId);
    if (!analysis) {
      return;
    }

    try {
      // wait for next block
      await retryUntil(
        async () => {
          const currentBlockNumber = await this.client.getBlockNumber();
          if (currentBlockNumber > startBlockNumber) {
            return true;
          }
          return false;
        },
        'Wait for next block',
        13_000,
        0.5,
      );

      const minedBlock = await this.client.getBlock({
        includeTransactions: true,
      });
      this.completeAnalysis(analysisId, minedBlock);
    } catch (err) {
      this.logger.error('Error waiting for next block in fee analysis', err, { analysisId });
    } finally {
      this.pendingAnalyses.delete(analysisId);
    }
  }

  /**
   * Completes the analysis once the next block is mined
   */
  private completeAnalysis(analysisId: string, minedBlock: Block<bigint, true, 'latest'>): void {
    const analysis = this.pendingAnalyses.get(analysisId);
    if (!analysis) {
      return;
    }

    // Extract blob transaction info from mined block
    const {
      blobTxs: includedBlobTxs,
      allPriorityFees: includedPriorityFees,
      blobPriorityFees: includedBlobPriorityFees,
      totalBlobCount: includedBlobCount,
    } = processTransactions(minedBlock.transactions);

    // Get minimum included fees
    const minIncludedPriorityFee = includedPriorityFees.length > 0 ? this.minBigInt(includedPriorityFees) : 0n;
    const minIncludedBlobPriorityFee =
      includedBlobPriorityFees.length > 0 ? this.minBigInt(includedBlobPriorityFees) : 0n;

    // Populate mined block info
    analysis.minedBlock = {
      blockNumber: minedBlock.number,
      blockHash: minedBlock.hash,
      blockTimestamp: minedBlock.timestamp,
      baseFeePerGas: minedBlock.baseFeePerGas || 0n,
      blobGasUsed: minedBlock.blobGasUsed || 0n,
      txCount: minedBlock.transactions?.length || 0,
      includedBlobTxCount: includedBlobTxs.length,
      includedBlobCount,
      includedBlobTxs,
      minIncludedPriorityFee,
      minIncludedBlobPriorityFee,
    };

    // Calculate time before block mined
    const blockTimestampMs = Number(minedBlock.timestamp) * 1000;
    const timeBeforeBlockMs = blockTimestampMs - analysis.pendingSnapshot.timestamp;

    // Calculate how many blobs were actually in the mined block
    const blobsInBlock = minedBlock.blobGasUsed > 0n ? Number(minedBlock.blobGasUsed / GAS_PER_BLOB) : 0;
    const maxBlobCapacity = getMaxBlobCapacity(minedBlock.timestamp);
    const blockBlobsFull = blobsInBlock >= maxBlobCapacity;

    // Count how many pending blob txs actually got included
    const pendingBlobHashes = new Set(analysis.pendingSnapshot.pendingBlobTxs.map(tx => tx.hash));
    const includedBlobHashes = new Set(includedBlobTxs.map(tx => tx.hash));
    const pendingBlobTxsIncludedCount = [...pendingBlobHashes].filter(h => includedBlobHashes.has(h)).length;
    const pendingBlobTxsExcludedCount = analysis.pendingSnapshot.pendingBlobTxCount - pendingBlobTxsIncludedCount;

    analysis.analysis = {
      timeBeforeBlockMs,
      pendingBlobTxsIncludedCount,
      pendingBlobTxsExcludedCount,
      blobsInBlock,
      maxBlobCapacity,
      blockBlobsFull,
    };

    // Evaluate each strategy against the mined block
    const isBlobTx = analysis.computedPrices.blobCount > 0;
    const minPriorityFeeToCompare = isBlobTx ? minIncludedBlobPriorityFee : minIncludedPriorityFee;
    const gasLimit = analysis.computedPrices.gasLimit;

    if (analysis.computedPrices.strategyResults) {
      for (const strategyResult of analysis.computedPrices.strategyResults) {
        const strategyPriorityFee = strategyResult.calculatedPriorityFee;
        const strategyPriorityFeeDelta = strategyPriorityFee - minPriorityFeeToCompare;

        // Determine if this strategy would have resulted in inclusion
        let strategyWouldBeIncluded = true;
        let strategyExclusionReason: 'priority_fee_too_low' | 'block_full' | undefined;

        if (isBlobTx) {
          // For blob txs, only consider priority fee if blob space was full
          if (
            includedBlobPriorityFees.length > 0 &&
            strategyPriorityFee < minIncludedBlobPriorityFee &&
            blockBlobsFull
          ) {
            strategyWouldBeIncluded = false;
            strategyExclusionReason = 'priority_fee_too_low';
          }
        } else {
          // For non-blob txs, use the old logic
          if (includedPriorityFees.length > 0 && strategyPriorityFee < minIncludedPriorityFee) {
            strategyWouldBeIncluded = false;
            strategyExclusionReason = 'priority_fee_too_low';
          }
        }

        // Calculate estimated cost in ETH for this strategy
        // Cost = gasLimit * (baseFee + priorityFee)
        const baseFee = analysis.minedBlock.baseFeePerGas;

        // Execution cost: gasLimit * (baseFee + priorityFee)
        const executionCostWei = gasLimit * (baseFee + strategyPriorityFee);
        const estimatedCostEth = Number(executionCostWei) / 1e18;

        // Calculate minimum cost needed for inclusion
        const minExecutionCostWei = gasLimit * (baseFee + minPriorityFeeToCompare);
        const minCostEth = Number(minExecutionCostWei) / 1e18;

        // Overpayment is the difference
        const estimatedOverpaymentEth = estimatedCostEth - minCostEth;

        // Update the strategy result with analysis data
        strategyResult.wouldBeIncluded = strategyWouldBeIncluded;
        strategyResult.exclusionReason = strategyExclusionReason;
        strategyResult.priorityFeeDelta = strategyPriorityFeeDelta;
        strategyResult.estimatedCostEth = estimatedCostEth;
        strategyResult.estimatedOverpaymentEth = estimatedOverpaymentEth;

        // Log per-strategy results
        this.logger.info(`Strategy "${strategyResult.strategyName}" analysis`, {
          id: analysisId,
          strategyId: strategyResult.strategyId,
          strategyName: strategyResult.strategyName,
          calculatedPriorityFee: formatGwei(strategyPriorityFee),
          minIncludedPriorityFee: formatGwei(minPriorityFeeToCompare),
          priorityFeeDelta: formatGwei(strategyPriorityFeeDelta),
          wouldBeIncluded: strategyWouldBeIncluded,
          exclusionReason: strategyExclusionReason,
          estimatedCostEth: estimatedCostEth.toFixed(6),
          estimatedOverpaymentEth: estimatedOverpaymentEth.toFixed(6),
        });
      }

      // Create cost ranking
      const costRanking = analysis.computedPrices.strategyResults
        .map(s => ({
          strategyId: s.strategyId,
          strategyName: s.strategyName,
          estimatedCostEth: s.estimatedCostEth!,
          wouldBeIncluded: s.wouldBeIncluded!,
        }))
        .sort((a, b) => a.estimatedCostEth - b.estimatedCostEth);

      analysis.analysis!.costRanking = costRanking;

      // Log cost ranking summary
      this.logger.info('Strategy cost ranking', {
        id: analysisId,
        cheapestStrategy: costRanking[0]?.strategyName,
        cheapestCost: costRanking[0]?.estimatedCostEth.toFixed(6),
        cheapestWouldBeIncluded: costRanking[0]?.wouldBeIncluded,
        mostExpensiveStrategy: costRanking[costRanking.length - 1]?.strategyName,
        mostExpensiveCost: costRanking[costRanking.length - 1]?.estimatedCostEth.toFixed(6),
        mostExpensiveWouldBeIncluded: costRanking[costRanking.length - 1]?.wouldBeIncluded,
        costSpread:
          costRanking.length > 1
            ? (costRanking[costRanking.length - 1].estimatedCostEth - costRanking[0].estimatedCostEth).toFixed(6)
            : '0',
      });
    }

    // Log the overall results
    this.logger.info('Fee analysis completed', {
      id: analysisId,
      l2SlotNumber: analysis.l2SlotNumber.toString(),
      timeBeforeBlockMs,
      pendingBlobTxCount: analysis.pendingSnapshot.pendingBlobTxCount,
      includedBlobTxCount: analysis.minedBlock.includedBlobTxCount,
      pendingBlobTxsIncludedCount,
      pendingBlobTxsExcludedCount,
      blobsInBlock,
      maxBlobCapacity,
      blockBlobsFull,
      minIncludedPriorityFee: formatGwei(minIncludedPriorityFee),
      minIncludedBlobPriorityFee: formatGwei(minIncludedBlobPriorityFee),
      strategiesAnalyzed: analysis.computedPrices.strategyResults?.length ?? 0,
    });

    // Move to completed analyses
    this.pendingAnalyses.delete(analysisId);
    this.completedAnalyses.push(analysis);

    // Trim old completed analyses if needed
    while (this.completedAnalyses.length > this.maxCompletedAnalyses) {
      this.completedAnalyses.shift();
    }

    // Invoke the callback for this specific analysis
    const callback = this.pendingCallbacks.get(analysisId);
    if (callback) {
      try {
        callback(analysis);
      } catch (err) {
        this.logger.error('Error in analysis complete callback', err);
      }
      this.pendingCallbacks.delete(analysisId);
    }
  }

  /**
   * Gets a specific analysis result by ID
   */
  getAnalysis(id: string): L1FeeAnalysisResult | undefined {
    return this.pendingAnalyses.get(id) || this.completedAnalyses.find(a => a.id === id);
  }

  /**
   * Gets all completed analyses
   */
  getCompletedAnalyses(): L1FeeAnalysisResult[] {
    return [...this.completedAnalyses];
  }

  /**
   * Gets statistics about all completed analyses
   */
  getAnalysisStats(): {
    totalAnalyses: number;
    avgTimeBeforeBlockMs: number;
    avgBlobsInBlock: number;
    blocksBlobsFull: number;
  } {
    const completed = this.completedAnalyses.filter(a => a.analysis);

    if (completed.length === 0) {
      return {
        totalAnalyses: 0,
        avgTimeBeforeBlockMs: 0,
        avgBlobsInBlock: 0,
        blocksBlobsFull: 0,
      };
    }

    const avgTimeBeforeBlockMs =
      completed.reduce((sum, a) => sum + a.analysis!.timeBeforeBlockMs, 0) / completed.length;

    const avgBlobsInBlock = completed.reduce((sum, a) => sum + a.analysis!.blobsInBlock, 0) / completed.length;

    const blocksBlobsFull = completed.filter(a => a.analysis!.blockBlobsFull).length;

    return {
      totalAnalyses: completed.length,
      avgTimeBeforeBlockMs,
      avgBlobsInBlock,
      blocksBlobsFull,
    };
  }

  /**
   * Gets comparative statistics for all strategies across completed analyses
   */
  getStrategyComparison(): Array<{
    strategyId: string;
    strategyName: string;
    totalAnalyses: number;
    inclusionCount: number;
    inclusionRate: number;
    avgEstimatedCostEth: number;
    totalEstimatedCostEth: number;
    avgOverpaymentEth: number;
    totalOverpaymentEth: number;
    avgPriorityFeeDeltaGwei: number;
  }> {
    const completed = this.completedAnalyses.filter(a => a.analysis);

    if (completed.length === 0) {
      return [];
    }

    // Collect data by strategy ID
    const strategyData = new Map<
      string,
      {
        strategyName: string;
        analyses: number;
        inclusions: number;
        totalCostEth: number;
        totalOverpaymentEth: number;
        totalPriorityFeeDelta: number;
      }
    >();

    for (const analysis of completed) {
      if (!analysis.computedPrices.strategyResults) {
        continue;
      }

      for (const strategyResult of analysis.computedPrices.strategyResults) {
        if (!strategyData.has(strategyResult.strategyId)) {
          strategyData.set(strategyResult.strategyId, {
            strategyName: strategyResult.strategyName,
            analyses: 0,
            inclusions: 0,
            totalCostEth: 0,
            totalOverpaymentEth: 0,
            totalPriorityFeeDelta: 0,
          });
        }

        const data = strategyData.get(strategyResult.strategyId)!;
        data.analyses++;

        if (strategyResult.wouldBeIncluded) {
          data.inclusions++;
        }

        if (strategyResult.estimatedCostEth !== undefined) {
          data.totalCostEth += strategyResult.estimatedCostEth;
        }

        if (strategyResult.estimatedOverpaymentEth !== undefined) {
          data.totalOverpaymentEth += strategyResult.estimatedOverpaymentEth;
        }

        if (strategyResult.priorityFeeDelta !== undefined) {
          data.totalPriorityFeeDelta += Number(strategyResult.priorityFeeDelta);
        }
      }
    }

    // Convert to output format
    const results = Array.from(strategyData.entries()).map(([strategyId, data]) => ({
      strategyId,
      strategyName: data.strategyName,
      totalAnalyses: data.analyses,
      inclusionCount: data.inclusions,
      inclusionRate: data.analyses > 0 ? data.inclusions / data.analyses : 0,
      avgEstimatedCostEth: data.analyses > 0 ? data.totalCostEth / data.analyses : 0,
      totalEstimatedCostEth: data.totalCostEth,
      avgOverpaymentEth: data.analyses > 0 ? data.totalOverpaymentEth / data.analyses : 0,
      totalOverpaymentEth: data.totalOverpaymentEth,
      avgPriorityFeeDeltaGwei: data.analyses > 0 ? data.totalPriorityFeeDelta / data.analyses / Number(WEI_CONST) : 0,
    }));

    // Sort by inclusion rate descending, then by avg cost ascending
    return results.sort((a, b) => {
      if (Math.abs(a.inclusionRate - b.inclusionRate) > 0.01) {
        return b.inclusionRate - a.inclusionRate;
      }
      return a.avgEstimatedCostEth - b.avgEstimatedCostEth;
    });
  }

  /**
   * Gets the minimum value from an array of bigints
   */
  private minBigInt(values: bigint[]): bigint {
    if (values.length === 0) {
      return 0n;
    }
    return values.reduce((min, val) => (val < min ? val : min), values[0]);
  }
}
