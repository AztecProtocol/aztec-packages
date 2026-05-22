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
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

import { type Hex, formatUnits } from 'viem';

import type { SequencerState } from './utils.js';

export class SequencerMetrics {
  public readonly tracer: Tracer;
  private meter: Meter;

  private blockCounter: UpDownCounter;
  private blockBuildDuration: Histogram;
  private blockBuildManaPerSecond: Gauge;
  private stateTransitionBufferDuration: Histogram;
  private stateDuration: Histogram;

  // these are gauges because for individual sequencers building a block is not something that happens often enough to warrant a histogram
  private timeToCollectAttestations: Gauge;
  private allowanceToCollectAttestations: Gauge;
  private requiredAttestions: Gauge;
  private collectedAttestions: Gauge;

  private rewards: Gauge;

  private slots: UpDownCounter;
  private filledSlots: UpDownCounter;

  private blockProposalFailed: UpDownCounter;
  private checkpointProposalSuccess: UpDownCounter;
  private checkpointPrecheckFailed: UpDownCounter;
  private checkpointProposalFailed: UpDownCounter;
  private checkpointSuccess: UpDownCounter;
  private slashingAttempts: UpDownCounter;
  private pipelineDepth: Gauge;
  private pipelineDiscards: UpDownCounter;
  private pipelineParentCheckpointMismatches: UpDownCounter;

  // Fisherman fee analysis metrics
  private fishermanWouldBeIncluded: UpDownCounter;
  private fishermanTimeBeforeBlock: Histogram;
  private fishermanPendingBlobTxCount: Histogram;
  private fishermanIncludedBlobTxCount: Histogram;
  private fishermanPendingBlobCount: Histogram;
  private fishermanIncludedBlobCount: Histogram;
  private fishermanBlockBlobsFull: UpDownCounter;
  private fishermanMaxBlobCapacity: Histogram;
  private fishermanCalculatedPriorityFee: Histogram;
  private fishermanPriorityFeeDelta: Histogram;
  private fishermanEstimatedCost: Histogram;
  private fishermanEstimatedOverpayment: Histogram;
  private fishermanMinedBlobTxPriorityFee: Histogram;
  private fishermanMinedBlobTxTotalCost: Histogram;

  private blockInterBlockTime: Histogram;
  private lastBlockBuiltTimestamp?: number;
  private lastBlockBuiltSlot?: SlotNumber;

  private lastSeenSlot?: SlotNumber;

  constructor(
    client: TelemetryClient,
    private rollup: RollupContract,
    name = 'Sequencer',
  ) {
    this.meter = client.getMeter(name);
    this.tracer = client.getTracer(name);

    this.blockCounter = createUpDownCounterWithDefault(this.meter, Metrics.SEQUENCER_BLOCK_COUNT, {
      [Attributes.STATUS]: ['failed', 'built'],
    });

    this.blockBuildDuration = this.meter.createHistogram(Metrics.SEQUENCER_BLOCK_BUILD_DURATION);

    this.blockBuildManaPerSecond = this.meter.createGauge(Metrics.SEQUENCER_BLOCK_BUILD_MANA_PER_SECOND);

    this.blockInterBlockTime = this.meter.createHistogram(Metrics.SEQUENCER_BLOCK_INTER_BLOCK_TIME);

    this.stateTransitionBufferDuration = this.meter.createHistogram(Metrics.SEQUENCER_STATE_TRANSITION_BUFFER_DURATION);

    this.stateDuration = this.meter.createHistogram(Metrics.SEQUENCER_STATE_DURATION);

    this.rewards = this.meter.createGauge(Metrics.SEQUENCER_CURRENT_SLOT_REWARDS);

    this.slots = createUpDownCounterWithDefault(this.meter, Metrics.SEQUENCER_SLOT_COUNT);

    /**
     * NOTE: we do not track missed slots as a separate metric. That would be difficult to determine
     * Instead, use a computed metric, `slots - filledSlots` to get the number of slots a sequencer has missed.
     */
    this.filledSlots = createUpDownCounterWithDefault(this.meter, Metrics.SEQUENCER_FILLED_SLOT_COUNT);

    this.timeToCollectAttestations = this.meter.createGauge(Metrics.SEQUENCER_COLLECT_ATTESTATIONS_DURATION);

    this.allowanceToCollectAttestations = this.meter.createGauge(Metrics.SEQUENCER_COLLECT_ATTESTATIONS_TIME_ALLOWANCE);

    this.requiredAttestions = this.meter.createGauge(Metrics.SEQUENCER_REQUIRED_ATTESTATIONS_COUNT);

    this.collectedAttestions = this.meter.createGauge(Metrics.SEQUENCER_COLLECTED_ATTESTATIONS_COUNT);

    this.blockProposalFailed = createUpDownCounterWithDefault(
      this.meter,
      Metrics.SEQUENCER_BLOCK_PROPOSAL_FAILED_COUNT,
    );

    this.checkpointProposalSuccess = createUpDownCounterWithDefault(
      this.meter,
      Metrics.SEQUENCER_CHECKPOINT_PROPOSAL_SUCCESS_COUNT,
    );

    this.checkpointSuccess = createUpDownCounterWithDefault(this.meter, Metrics.SEQUENCER_CHECKPOINT_SUCCESS_COUNT);

    this.checkpointPrecheckFailed = createUpDownCounterWithDefault(
      this.meter,
      Metrics.SEQUENCER_CHECKPOINT_PRECHECK_FAILED_COUNT,
      {
        [Attributes.ERROR_TYPE]: [
          'slot_already_taken',
          'rollup_contract_check_failed',
          'slot_mismatch',
          'block_number_mismatch',
        ],
      },
    );

    this.checkpointProposalFailed = createUpDownCounterWithDefault(
      this.meter,
      Metrics.SEQUENCER_CHECKPOINT_PROPOSAL_FAILED_COUNT,
    );

    this.slashingAttempts = createUpDownCounterWithDefault(this.meter, Metrics.SEQUENCER_SLASHING_ATTEMPTS_COUNT);

    this.pipelineDepth = this.meter.createGauge(Metrics.SEQUENCER_PIPELINE_DEPTH);
    this.pipelineDiscards = createUpDownCounterWithDefault(this.meter, Metrics.SEQUENCER_PIPELINE_DISCARDS_COUNT);
    this.pipelineParentCheckpointMismatches = createUpDownCounterWithDefault(
      this.meter,
      Metrics.SEQUENCER_PIPELINE_PARENT_CHECKPOINT_MISMATCH_COUNT,
      {
        [Attributes.ERROR_TYPE]: [
          'archiver-sync-timeout',
          'parent-not-on-l1',
          'parent-hash-mismatch',
          'parent-invalid-attestations',
          'unexpected-parent-appeared',
        ],
      },
    );
    this.pipelineDepth.record(0);

    // Fisherman fee analysis metrics
    this.fishermanWouldBeIncluded = createUpDownCounterWithDefault(
      this.meter,
      Metrics.FISHERMAN_FEE_ANALYSIS_WOULD_BE_INCLUDED,
      {
        [Attributes.OK]: [true, false],
        [Attributes.BLOCK_FULL]: ['true', 'false'],
      },
    );

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

    this.fishermanPendingBlobCount = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_PENDING_BLOB_COUNT);

    this.fishermanIncludedBlobCount = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_INCLUDED_BLOB_COUNT);

    this.fishermanBlockBlobsFull = createUpDownCounterWithDefault(
      this.meter,
      Metrics.FISHERMAN_FEE_ANALYSIS_BLOCK_BLOBS_FULL,
      {
        [Attributes.OK]: [true, false],
      },
    );

    this.fishermanMaxBlobCapacity = this.meter.createHistogram(Metrics.FISHERMAN_FEE_ANALYSIS_MAX_BLOB_CAPACITY);
  }

  public recordRequiredAttestations(requiredAttestationsCount: number, allowanceMs: number) {
    this.requiredAttestions.record(requiredAttestationsCount);
    this.allowanceToCollectAttestations.record(Math.ceil(allowanceMs));

    // reset
    this.collectedAttestions.record(0);
    this.timeToCollectAttestations.record(0);
  }

  public recordCollectedAttestations(count: number, durationMs: number) {
    this.collectedAttestions.record(count);
    this.timeToCollectAttestations.record(Math.ceil(durationMs));
  }

  recordBuiltBlock(buildDurationMs: number, totalMana: number, slot: SlotNumber) {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'built',
    });
    this.blockBuildDuration.record(Math.ceil(buildDurationMs));
    this.blockBuildManaPerSecond.record(Math.ceil((totalMana * 1000) / buildDurationMs));

    // Only record inter-block time between blocks built within the same slot.
    const now = Date.now();
    if (this.lastBlockBuiltTimestamp !== undefined && this.lastBlockBuiltSlot === slot) {
      this.blockInterBlockTime.record(now - this.lastBlockBuiltTimestamp);
    }
    this.lastBlockBuiltTimestamp = now;
    this.lastBlockBuiltSlot = slot;
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

  recordStateDuration(durationMs: number, state: SequencerState) {
    this.stateDuration.record(Math.ceil(durationMs), {
      [Attributes.SEQUENCER_STATE]: state,
    });
  }

  recordPipelineDepth(depth: number) {
    this.pipelineDepth.record(depth);
  }

  recordPipelineDiscard(count = 1) {
    this.pipelineDiscards.add(count);
  }

  recordPipelineParentCheckpointMismatch(reason: string) {
    this.pipelineParentCheckpointMismatches.add(1, {
      [Attributes.ERROR_TYPE]: reason,
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

  recordCheckpointProposalSuccess() {
    this.checkpointProposalSuccess.add(1);
  }

  recordCheckpointPrecheckFailed(
    checkType: 'slot_already_taken' | 'rollup_contract_check_failed' | 'slot_mismatch' | 'block_number_mismatch',
  ) {
    this.checkpointPrecheckFailed.add(1, { [Attributes.ERROR_TYPE]: checkType });
  }

  recordCheckpointProposalFailed(reason?: string) {
    this.checkpointProposalFailed.add(1, {
      ...(reason && { [Attributes.ERROR_TYPE]: reason }),
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
      this.fishermanPendingBlobCount.record(analysis.pendingSnapshot.pendingBlobCount, strategyAttributes);

      // Record mined block data if available
      if (analysis.minedBlock) {
        this.fishermanIncludedBlobTxCount.record(analysis.minedBlock.includedBlobTxCount, strategyAttributes);
        this.fishermanIncludedBlobCount.record(analysis.minedBlock.includedBlobCount, strategyAttributes);

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

        // Record whether the block reached 100% blob capacity
        if (analysis.analysis.blockBlobsFull) {
          this.fishermanBlockBlobsFull.add(1, { ...strategyAttributes, [Attributes.OK]: true });
        } else {
          this.fishermanBlockBlobsFull.add(1, { ...strategyAttributes, [Attributes.OK]: false });
        }

        // Record the max blob capacity for this block
        this.fishermanMaxBlobCapacity.record(analysis.analysis.maxBlobCapacity, strategyAttributes);

        // Record strategy-specific inclusion result
        if (strategyResult.wouldBeIncluded !== undefined) {
          const inclusionAttributes = {
            ...strategyAttributes,
            [Attributes.BLOCK_FULL]: analysis.analysis.blockBlobsFull ? 'true' : 'false',
          };

          if (strategyResult.wouldBeIncluded) {
            this.fishermanWouldBeIncluded.add(1, { ...inclusionAttributes, [Attributes.OK]: true });
          } else {
            this.fishermanWouldBeIncluded.add(1, {
              ...inclusionAttributes,
              [Attributes.OK]: false,
              ...(strategyResult.exclusionReason && { [Attributes.ERROR_TYPE]: strategyResult.exclusionReason }),
            });
          }
        }

        // Record strategy-specific priority fee delta
        if (strategyResult.priorityFeeDelta !== undefined) {
          const priorityFeeDeltaGwei = Number(strategyResult.priorityFeeDelta) / 1e9;
          const deltaAttributes = {
            ...strategyAttributes,
            [Attributes.BLOCK_FULL]: analysis.analysis.blockBlobsFull ? 'true' : 'false',
          };
          this.fishermanPriorityFeeDelta.record(priorityFeeDeltaGwei, deltaAttributes);
        }

        // Record estimated cost if available
        if (strategyResult.estimatedCostEth !== undefined) {
          const costAttributes = {
            ...strategyAttributes,
            [Attributes.BLOCK_FULL]: analysis.analysis.blockBlobsFull ? 'true' : 'false',
          };
          this.fishermanEstimatedCost.record(strategyResult.estimatedCostEth, costAttributes);
        }

        // Record estimated overpayment if available
        if (strategyResult.estimatedOverpaymentEth !== undefined) {
          const overpaymentAttributes = {
            ...strategyAttributes,
            [Attributes.BLOCK_FULL]: analysis.analysis.blockBlobsFull ? 'true' : 'false',
          };
          this.fishermanEstimatedOverpayment.record(strategyResult.estimatedOverpaymentEth, overpaymentAttributes);
        }
      }
    }
  }
}
