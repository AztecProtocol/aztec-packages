import type { RollupContract } from '@aztec/ethereum/contracts';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { L1PublishProofStats, L1PublishStats } from '@aztec/stdlib/stats';
import {
  Attributes,
  type BatchObservableResult,
  type Gauge,
  type Histogram,
  type Meter,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

import { formatEther, formatUnits } from 'viem';

import type { CheckpointStore } from './checkpoint-store.js';
import type { SessionManager } from './session-manager.js';

export class ProverNodeJobMetrics {
  provingJobDuration: Histogram;
  provingJobCheckpoints: Gauge;
  provingJobBlocks: Gauge;
  provingJobTransactions: Gauge;

  private blobProcessingDuration: Gauge;
  private blockProcessingDuration: Histogram;
  private checkpointProcessingDuration: Histogram;
  private checkpointProvingDuration: Histogram;
  private checkpointBlocks: Histogram;
  private checkpointTransactions: Histogram;

  /** Observable gauges for live state. Registered via `observeState(...)` once the
   *  CheckpointStore and SessionManager are available. */
  private activeCheckpoints: ObservableGauge | undefined;
  private activeEpochSessions: ObservableGauge | undefined;
  private stateObserver: ((observer: BatchObservableResult) => void) | undefined;
  private stateObservedMetrics: ObservableGauge[] = [];

  constructor(
    private meter: Meter,
    public readonly tracer: Tracer,
    private logger = createLogger('prover-node:publisher:metrics'),
  ) {
    this.provingJobDuration = this.meter.createHistogram(Metrics.PROVER_NODE_JOB_DURATION);
    this.provingJobCheckpoints = this.meter.createGauge(Metrics.PROVER_NODE_JOB_CHECKPOINTS);
    this.provingJobBlocks = this.meter.createGauge(Metrics.PROVER_NODE_JOB_BLOCKS);
    this.provingJobTransactions = this.meter.createGauge(Metrics.PROVER_NODE_JOB_TRANSACTIONS);

    this.blobProcessingDuration = this.meter.createGauge(Metrics.PROVER_NODE_BLOB_PROCESSING_LAST_DURATION);
    this.blockProcessingDuration = this.meter.createHistogram(Metrics.PROVER_NODE_BLOCK_PROCESSING_DURATION);
    this.checkpointProcessingDuration = this.meter.createHistogram(Metrics.PROVER_NODE_CHECKPOINT_PROCESSING_DURATION);
    this.checkpointProvingDuration = this.meter.createHistogram(Metrics.PROVER_NODE_CHECKPOINT_PROVING_DURATION);
    this.checkpointBlocks = this.meter.createHistogram(Metrics.PROVER_NODE_CHECKPOINT_BLOCKS);
    this.checkpointTransactions = this.meter.createHistogram(Metrics.PROVER_NODE_CHECKPOINT_TRANSACTIONS);
  }

  public recordProvingJob(totalTimeMs: number, numCheckpoints: number, numBlocks: number, numTxs: number) {
    this.provingJobDuration.record(totalTimeMs / 1000);
    this.provingJobCheckpoints.record(Math.floor(numCheckpoints));
    this.provingJobBlocks.record(Math.floor(numBlocks));
    this.provingJobTransactions.record(Math.floor(numTxs));
  }

  public recordBlobProcessing(durationMs: number) {
    this.blobProcessingDuration.record(Math.ceil(durationMs));
  }

  public recordBlockProcessing(durationMs: number) {
    this.blockProcessingDuration.record(Math.ceil(durationMs));
  }

  public recordCheckpointProcessing(durationMs: number, numBlocks: number, numTxs: number) {
    this.checkpointProcessingDuration.record(Math.ceil(durationMs));
    this.checkpointBlocks.record(Math.floor(numBlocks));
    this.checkpointTransactions.record(Math.floor(numTxs));
  }

  public recordCheckpointProving(durationMs: number) {
    this.checkpointProvingDuration.record(Math.ceil(durationMs));
  }

  /**
   * Registers observable gauges for the prover-node's live state: how many canonical
   * checkpoint provers are in the store, and how many epoch sessions are live (broken
   * down by kind). Idempotent — repeated calls re-arm with the latest references.
   *
   * Call this once the `SessionManager` has been constructed (i.e. inside `ProverNode.start()`).
   */
  public observeState(checkpointStore: CheckpointStore, sessionManager: SessionManager): void {
    this.stopObservingState();
    this.activeCheckpoints = this.meter.createObservableGauge(Metrics.PROVER_NODE_ACTIVE_CHECKPOINTS);
    this.activeEpochSessions = this.meter.createObservableGauge(Metrics.PROVER_NODE_ACTIVE_EPOCH_SESSIONS);
    this.stateObserver = (observer: BatchObservableResult) => {
<<<<<<< HEAD
      observer.observe(this.activeCheckpoints!, checkpointStore.listCanonical().length);
=======
      observer.observe(this.activeCheckpoints!, checkpointStore.listAll().length);
>>>>>>> origin/v5-next
      let full = 0;
      let partial = 0;
      for (const session of sessionManager.allSessions()) {
        if (session.isTerminal()) {
          continue;
        }
        if (session.getKind() === 'full') {
          full++;
        } else {
          partial++;
        }
      }
      observer.observe(this.activeEpochSessions!, full, { [Attributes.EPOCH_SESSION_KIND]: 'full' });
      observer.observe(this.activeEpochSessions!, partial, { [Attributes.EPOCH_SESSION_KIND]: 'partial' });
    };
    this.stateObservedMetrics = [this.activeCheckpoints, this.activeEpochSessions];
    this.meter.addBatchObservableCallback(this.stateObserver, this.stateObservedMetrics);
  }

  /** Tears down the observable callback registered by `observeState`. Idempotent. */
  public stopObservingState(): void {
    if (this.stateObserver) {
      this.meter.removeBatchObservableCallback(this.stateObserver, this.stateObservedMetrics);
      this.stateObserver = undefined;
      this.stateObservedMetrics = [];
      this.activeCheckpoints = undefined;
      this.activeEpochSessions = undefined;
    }
  }
}

export class ProverNodeRewardsMetrics {
  private rewards: ObservableGauge;
  private accumulatedRewards: UpDownCounter;
  private prevEpoch = -1n;
  private proofSubmissionEpochs = 0;

  constructor(
    private meter: Meter,
    private coinbase: EthAddress,
    private rollup: RollupContract,
    private logger = createLogger('prover-node:publisher:metrics'),
  ) {
    this.rewards = this.meter.createObservableGauge(Metrics.PROVER_NODE_REWARDS_PER_EPOCH);

    this.accumulatedRewards = createUpDownCounterWithDefault(this.meter, Metrics.PROVER_NODE_REWARDS_TOTAL);
  }

  public async start() {
    const proofSubmissionEpochs = await this.rollup.getProofSubmissionEpochs();
    this.proofSubmissionEpochs = Number(proofSubmissionEpochs);
    this.meter.addBatchObservableCallback(this.observe, [this.rewards]);
  }

  public stop() {
    this.meter.removeBatchObservableCallback(this.observe, [this.rewards]);
  }

  private observe = async (observer: BatchObservableResult): Promise<void> => {
    const epoch = await this.rollup.getCurrentEpochNumber();

    if (epoch > this.proofSubmissionEpochs) {
      // look at the prev epoch so that we get an accurate value, after proof submission window has closed
      // For example, if proof submission window is 1 epoch, and we are in epoch 2, we should be looking at epoch 0.
      // Similarly, if the proof submission window is 0, and we are in epoch 1, we should be looking at epoch 0.
      const closedEpoch = BigInt(epoch) - BigInt(this.proofSubmissionEpochs) - 1n;
      const rewards = await this.rollup.getSpecificProverRewardsForEpoch(closedEpoch, this.coinbase);

      const fmt = parseFloat(formatUnits(rewards, 18));

      observer.observe(this.rewards, fmt, {
        [Attributes.COINBASE]: this.coinbase.toString(),
      });

      // only accumulate once per epoch
      if (closedEpoch > this.prevEpoch) {
        this.prevEpoch = closedEpoch;
        this.accumulatedRewards.add(fmt, {
          [Attributes.COINBASE]: this.coinbase.toString(),
        });
      }
    }
  };
}

export type EstimatedSubmitProofStats = {
  gasLimit: bigint;
  baseFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedTotalFee: bigint;
};

export class ProverNodePublisherMetrics {
  gasPrice: Histogram;
  txCount: UpDownCounter;
  txDuration: Histogram;
  txGas: Histogram;
  txCalldataSize: Histogram;
  txCalldataGas: Histogram;
  txBlobDataGasUsed: Histogram;
  txBlobDataGasCost: Histogram;
  txTotalFee: Histogram;

  private txGasEstimated: Histogram;
  private gasPriceEstimated: Histogram;
  private txTotalFeeEstimated: Histogram;

  private senderBalance: Gauge;
  private meter: Meter;

  constructor(
    public readonly client: TelemetryClient,
    name = 'ProverNode',
    private logger = createLogger('prover-node:publisher:metrics'),
  ) {
    this.meter = client.getMeter(name);

    this.gasPrice = this.meter.createHistogram(Metrics.L1_PUBLISHER_GAS_PRICE);

    this.txCount = createUpDownCounterWithDefault(this.meter, Metrics.L1_PUBLISHER_TX_COUNT, {
      [Attributes.L1_TX_TYPE]: ['submitProof'],
      [Attributes.OK]: [true, false],
    });

    this.txDuration = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_DURATION);

    this.txGas = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_GAS);

    this.txCalldataSize = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_CALLDATA_SIZE);

    this.txCalldataGas = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_CALLDATA_GAS);

    this.txBlobDataGasUsed = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_BLOBDATA_GAS_USED);

    this.txBlobDataGasCost = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_BLOBDATA_GAS_COST);

    this.txTotalFee = this.meter.createHistogram(Metrics.L1_PUBLISHER_TX_TOTAL_FEE);

    this.txGasEstimated = this.meter.createHistogram(Metrics.PROVER_NODE_ESTIMATED_SUBMISSION_GAS);

    this.gasPriceEstimated = this.meter.createHistogram(Metrics.PROVER_NODE_ESTIMATED_SUBMISSION_GAS_PRICE);

    this.txTotalFeeEstimated = this.meter.createHistogram(Metrics.PROVER_NODE_ESTIMATED_SUBMISSION_TOTAL_FEE);

    this.senderBalance = this.meter.createGauge(Metrics.L1_PUBLISHER_BALANCE);
  }

  recordFailedTx() {
    this.txCount.add(1, {
      [Attributes.L1_TX_TYPE]: 'submitProof',
      [Attributes.OK]: false,
    });
  }

  recordSubmitProof(durationMs: number, stats: L1PublishProofStats) {
    this.recordTx(durationMs, stats);
  }

  public recordEstimatedSubmitProof(stats: EstimatedSubmitProofStats) {
    const attributes = { [Attributes.L1_TX_TYPE]: 'submitProof' } as const;

    this.txGasEstimated.record(Number(stats.gasLimit), attributes);

    try {
      this.gasPriceEstimated.record(
        parseInt(formatEther(stats.baseFeePerGas + stats.maxPriorityFeePerGas, 'gwei'), 10),
      );
    } catch {
      // ignore
    }

    try {
      this.txTotalFeeEstimated.record(parseFloat(formatEther(stats.estimatedTotalFee)));
    } catch {
      // ignore
    }
  }

  public recordSenderBalance(wei: bigint, senderAddress: string) {
    const eth = parseFloat(formatEther(wei, 'wei'));
    this.senderBalance.record(eth, {
      [Attributes.SENDER_ADDRESS]: senderAddress,
    });
  }

  private recordTx(durationMs: number, stats: L1PublishStats) {
    const attributes = {
      [Attributes.L1_TX_TYPE]: 'submitProof',
      [Attributes.L1_SENDER]: stats.sender,
    } as const;

    this.txCount.add(1, {
      ...attributes,
      [Attributes.OK]: true,
    });

    this.txDuration.record(Math.ceil(durationMs), attributes);
    this.txGas.record(
      // safe to downcast - total block limit is 30M gas which fits in a JS number
      Number(stats.gasUsed),
      attributes,
    );
    this.txCalldataGas.record(stats.calldataGas, attributes);
    this.txCalldataSize.record(stats.calldataSize, attributes);

    this.txBlobDataGasCost.record(Number(stats.blobDataGas), attributes);
    this.txBlobDataGasUsed.record(Number(stats.blobGasUsed), attributes);

    try {
      this.gasPrice.record(parseInt(formatEther(stats.gasPrice, 'gwei'), 10));
    } catch {
      // ignore
    }

    const executionFee = stats.gasUsed * stats.gasPrice;
    const blobFee = stats.blobGasUsed * stats.blobDataGas;
    const totalFee = executionFee + blobFee;

    try {
      this.txTotalFee.record(parseFloat(formatEther(totalFee)));
    } catch {
      // ignore
    }
  }
}
