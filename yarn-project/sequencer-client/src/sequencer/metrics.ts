import { EthAddress } from '@aztec/aztec.js/addresses';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { L1FeeAnalysisResult } from '@aztec/ethereum/l1-fee-analysis';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import {
  Attributes,
  type Gauge,
  type Histogram,
  type Meter,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
} from '@aztec/telemetry-client';

import { type Hex, formatUnits } from 'viem';

import type { SequencerState } from './utils.js';

// TODO(palla/mbps): Review all metrics and add any missing ones per checkpoint
export class SequencerMetrics {
  public readonly tracer: Tracer;
  private meter: Meter;

  private blockCounter: UpDownCounter;
  private blockBuildDuration: Histogram;
  private blockBuildManaPerSecond: Gauge;
  private stateTransitionBufferDuration: Histogram;

  // these are gauges because for individual sequencers building a block is not something that happens often enough to warrant a histogram
  private timeToCollectAttestations: Gauge;
  private allowanceToCollectAttestations: Gauge;
  private requiredAttestions: Gauge;
  private collectedAttestions: Gauge;

  private rewards: Gauge;

  private slots: UpDownCounter;
  private filledSlots: UpDownCounter;

  private blockProposalFailed: UpDownCounter;
  private blockProposalSuccess: UpDownCounter;
  private blockProposalPrecheckFailed: UpDownCounter;
  private checkpointSuccess: UpDownCounter;
  private slashingAttempts: UpDownCounter;
  private blockAttestationDelay: Histogram;

  // Fisherman fee analysis metrics
  private fishermanWouldBeIncluded: UpDownCounter;
  private fishermanTimeBeforeBlock: Histogram;
  private fishermanPendingBlobTxCount: Histogram;
  private fishermanIncludedBlobTxCount: Histogram;
  private fishermanCalculatedPriorityFee: Histogram;
  private fishermanPriorityFeeDelta: Histogram;
  private fishermanEstimatedCost: Histogram;
  private fishermanEstimatedOverpayment: Histogram;
  private fishermanMinedBlobTxPriorityFee: Histogram;
  private fishermanMinedBlobTxTotalCost: Histogram;

  private lastSeenSlot?: SlotNumber;

  constructor(
    client: TelemetryClient,
    private rollup: RollupContract,
    name = 'Sequencer',
  ) {
    this.meter = client.getMeter(name);
    this.tracer = client.getTracer(name);

    this.blockCounter = this.meter.createUpDownCounter(Metrics.SEQUENCER_BLOCK_COUNT);

    this.blockBuildDuration = this.meter.createHistogram(Metrics.SEQUENCER_BLOCK_BUILD_DURATION);

    this.blockBuildManaPerSecond = this.meter.createGauge(Metrics.SEQUENCER_BLOCK_BUILD_MANA_PER_SECOND);

    this.stateTransitionBufferDuration = this.meter.createHistogram(Metrics.SEQUENCER_STATE_TRANSITION_BUFFER_DURATION);

    this.blockAttestationDelay = this.meter.createHistogram(Metrics.SEQUENCER_BLOCK_ATTESTATION_DELAY);

    // Init gauges and counters
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'failed',
    });
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'built',
    });

    this.rewards = this.meter.createGauge(Metrics.SEQUENCER_CURRENT_BLOCK_REWARDS);

    this.slots = this.meter.createUpDownCounter(Metrics.SEQUENCER_SLOT_COUNT);

    /**
     * NOTE: we do not track missed slots as a separate metric. That would be difficult to determine
     * Instead, use a computed metric, `slots - filledSlots` to get the number of slots a sequencer has missed.
     */
    this.filledSlots = this.meter.createUpDownCounter(Metrics.SEQUENCER_FILLED_SLOT_COUNT);

    this.timeToCollectAttestations = this.meter.createGauge(Metrics.SEQUENCER_COLLECT_ATTESTATIONS_DURATION);

    this.allowanceToCollectAttestations = this.meter.createGauge(Metrics.SEQUENCER_COLLECT_ATTESTATIONS_TIME_ALLOWANCE);

    this.requiredAttestions = this.meter.createGauge(Metrics.SEQUENCER_REQUIRED_ATTESTATIONS_COUNT);

    this.collectedAttestions = this.meter.createGauge(Metrics.SEQUENCER_COLLECTED_ATTESTATIONS_COUNT);

    this.blockProposalFailed = this.meter.createUpDownCounter(Metrics.SEQUENCER_BLOCK_PROPOSAL_FAILED_COUNT);

    this.blockProposalSuccess = this.meter.createUpDownCounter(Metrics.SEQUENCER_BLOCK_PROPOSAL_SUCCESS_COUNT);

    this.checkpointSuccess = this.meter.createUpDownCounter(Metrics.SEQUENCER_CHECKPOINT_SUCCESS_COUNT);

    this.blockProposalPrecheckFailed = this.meter.createUpDownCounter(
      Metrics.SEQUENCER_BLOCK_PROPOSAL_PRECHECK_FAILED_COUNT,
    );

    this.slashingAttempts = this.meter.createUpDownCounter(Metrics.SEQUENCER_SLASHING_ATTEMPTS_COUNT);

    // Fisherman fee analysis metrics
    this.fishermanWouldBeIncluded = this.meter.createUpDownCounter(Metrics.FISHERMAN_FEE_ANALYSIS_WOULD_BE_INCLUDED);

    this.fishermanTimeBeforeBlock = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_TIME_BEFORE_BLOCK);

    this.fishermanPendingBlobTxCount = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_PENDING_BLOB_TX_COUNT);

    this.fishermanIncludedBlobTxCount = this.meter.createHistogram(
      Metrics.FISHERMAN_FEE_ANALYSIS_INCLUDED_BLOB_TX_COUNT,
    );

    this.fishermanCalculatedPriorityFee = this.meter.createHistogram(
      Metrics.FISHERMAN_FEE_ANALYSIS_CALCULATED_PRIORITY_FEE,
    );

    this.fishermanPriorityFeeDelta = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_PRIORITY_FEE_DELTA);

    this.fishermanEstimatedCost = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_ESTIMATED_COST);

    this.fishermanEstimatedOverpayment = this.meter.createHistogram(
      Metrics.FISHERMAN_FEE_ANALYSIS_ESTIMATED_OVERPAYMENT,
    );

    this.fishermanMinedBlobTxPriorityFee = this.meter.createHistogram(
      Metrics.FISHERMAN_FEE_ANALYSIS_MINED_BLOB_TX_PRIORITY_FEE,
    );

    this.fishermanMinedBlobTxTotalCost = this.meter.createHistogram(
      Metrics.FISHERMAN_FEE_ANALYSIS_MINED_BLOB_TX_TOTAL_COST,
    );
  }

  public recordRequiredAttestations(requiredAttestationsCount: number, allowanceMs: number) {
    this.requiredAttestions.record(requiredAttestationsCount);
    this.allowanceToCollectAttestations.record(Math.ceil(allowanceMs));

    // reset
    this.collectedAttestions.record(0);
    this.timeToCollectAttestations.record(0);
  }

  public recordBlockAttestationDelay(duration: number) {
    this.blockAttestationDelay.record(duration);
  }

  public recordCollectedAttestations(count: number, durationMs: number) {
    this.collectedAttestions.record(count);
    this.timeToCollectAttestations.record(Math.ceil(durationMs));
  }

  recordBuiltBlock(buildDurationMs: number, totalMana: number) {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'built',
    });
    this.blockBuildDuration.record(Math.ceil(buildDurationMs));
    this.blockBuildManaPerSecond.record(Math.ceil((totalMana * 1000) / buildDurationMs));
  }

  recordFailedBlock() {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'failed',
    });
  }

  recordStateTransitionBufferMs(durationMs: number, state: SequencerState) {
    this.stateTransitionBufferDuration.record(durationMs, {
      [Attributes.SEQUENCER_STATE]: state,
    });
  }

  incOpenSlot(slot: SlotNumber, proposer: string) {
    // sequencer went through the loop a second time. Noop
    if (slot === this.lastSeenSlot) {
      return;
    }

    this.slots.add(1, {
      [Attributes.BLOCK_PROPOSER]: proposer,
    });

    this.lastSeenSlot = slot;
  }

  async incFilledSlot(proposer: string, coinbase: Hex | EthAddress | undefined): Promise<void> {
    this.filledSlots.add(1, {
      [Attributes.BLOCK_PROPOSER]: proposer,
    });
    this.lastSeenSlot = undefined;

    if (coinbase) {
      try {
        const rewards = await this.rollup.getSequencerRewards(coinbase);
        const fmt = parseFloat(formatUnits(rewards, 18));
        this.rewards.record(fmt, {
          [Attributes.COINBASE]: coinbase.toString(),
        });
      } catch {
        // no-op
      }
    }
  }

  recordCheckpointSuccess() {
    this.checkpointSuccess.add(1);
  }

  recordBlockProposalFailed(reason?: string) {
    this.blockProposalFailed.add(1, {
      ...(reason && { [Attributes.ERROR_TYPE]: reason }),
    });
  }

  recordBlockProposalSuccess() {
    this.blockProposalSuccess.add(1);
  }

  recordBlockProposalPrecheckFailed(checkType: string) {
    this.blockProposalPrecheckFailed.add(1, {
      [Attributes.ERROR_TYPE]: checkType,
    });
  }

  recordSlashingAttempt(actionCount: number) {
    this.slashingAttempts.add(actionCount);
  }

  /**
   * Records metrics for a completed fisherman fee analysis
   * @param analysis - The completed fee analysis result
   */
  recordFishermanFeeAnalysis(analysis: L1FeeAnalysisResult) {
    // In fisherman mode, we should always have strategy results
    if (!analysis.computedPrices.strategyResults || analysis.computedPrices.strategyResults.length === 0) {
      // This should never happen in fisherman mode - log an error
      // We don't record metrics without strategy IDs as that defeats the purpose
      throw new Error(
        `No strategy results found in fisherman fee analysis ${analysis.id}. This indicates a bug in the fee analysis.`,
      );
    }

    // Record metrics for each strategy separately
    for (const strategyResult of analysis.computedPrices.strategyResults) {
      const strategyAttributes = {
        [Attributes.FISHERMAN_FEE_STRATEGY_ID]: strategyResult.strategyId,
      };

      // Record pending block snapshot data (once per strategy for comparison)
      this.fishermanPendingBlobTxCount.record(analysis.pendingSnapshot.pendingBlobTxCount, strategyAttributes);

      // Record mined block data if available
      if (analysis.minedBlock) {
        this.fishermanIncludedBlobTxCount.record(analysis.minedBlock.includedBlobTxCount, strategyAttributes);

        // Record actual fees from blob transactions in the mined block
        for (const blobTx of analysis.minedBlock.includedBlobTxs) {
          // Record priority fee per gas in Gwei
          const priorityFeeGwei = Number(blobTx.maxPriorityFeePerGas) / 1e9;
          this.fishermanMinedBlobTxPriorityFee.record(priorityFeeGwei, strategyAttributes);

          // Calculate total cost in ETH
          // Cost = (gas * (baseFee + priorityFee)) + (blobCount * blobGasPerBlob * blobBaseFee)
          const baseFee = analysis.minedBlock.baseFeePerGas;
          const effectiveGasPrice = baseFee + blobTx.maxPriorityFeePerGas;

          // Calculate execution cost using actual gas limit from the transaction
          const executionCost = blobTx.gas * effectiveGasPrice;

          // Calculate blob cost using maxFeePerBlobGas * blobCount * GAS_PER_BLOB
          const blobCost = blobTx.maxFeePerBlobGas * BigInt(blobTx.blobCount) * 131072n; // 128KB per blob

          const totalCostWei = executionCost + blobCost;
          const totalCostEth = Number(totalCostWei) / 1e18;

          this.fishermanMinedBlobTxTotalCost.record(totalCostEth, strategyAttributes);
        }
      }

      // Record the calculated priority fee for this strategy
      const calculatedPriorityFeeGwei = Number(strategyResult.calculatedPriorityFee) / 1e9;
      this.fishermanCalculatedPriorityFee.record(calculatedPriorityFeeGwei, strategyAttributes);

      // Record analysis results if available
      if (analysis.analysis) {
        this.fishermanTimeBeforeBlock.record(Math.ceil(analysis.analysis.timeBeforeBlockMs), strategyAttributes);

        // Record strategy-specific inclusion result
        if (strategyResult.wouldBeIncluded !== undefined) {
          if (strategyResult.wouldBeIncluded) {
            this.fishermanWouldBeIncluded.add(1, { ...strategyAttributes, [Attributes.OK]: true });
          } else {
            this.fishermanWouldBeIncluded.add(1, {
              ...strategyAttributes,
              [Attributes.OK]: false,
              ...(strategyResult.exclusionReason && { [Attributes.ERROR_TYPE]: strategyResult.exclusionReason }),
            });
          }
        }

        // Record strategy-specific priority fee delta
        if (strategyResult.priorityFeeDelta !== undefined) {
          const priorityFeeDeltaGwei = Number(strategyResult.priorityFeeDelta) / 1e9;
          this.fishermanPriorityFeeDelta.record(priorityFeeDeltaGwei, strategyAttributes);
        }

        // Record estimated cost if available
        if (strategyResult.estimatedCostEth !== undefined) {
          this.fishermanEstimatedCost.record(strategyResult.estimatedCostEth, strategyAttributes);
        }

        // Record estimated overpayment if available
        if (strategyResult.estimatedOverpaymentEth !== undefined) {
          this.fishermanEstimatedOverpayment.record(strategyResult.estimatedOverpaymentEth, strategyAttributes);
        }
      }
    }
  }
}
