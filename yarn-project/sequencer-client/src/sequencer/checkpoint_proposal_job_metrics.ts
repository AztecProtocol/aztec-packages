import {
  Attributes,
  type Gauge,
  type Histogram,
  type Meter,
  Metrics,
  type TelemetryClient,
} from '@aztec/telemetry-client';

type CheckpointProposalJobInstruments = {
  checkpointAttestationDelay: Histogram;
  checkpointBuildDuration: Histogram;
  checkpointStartToFirstBlockDuration: Histogram;
  checkpointLastBlockToBroadcastDuration: Histogram;
  pipelinedCheckpointBuildStartOffsetFromSlotBoundary: Histogram;
  checkpointBlockCount: Gauge;
  checkpointTxCount: Gauge;
  checkpointTotalMana: Gauge;
};

/**
 * Per-job recording surface used by {@link CheckpointProposalJob}.
 *
 * Ownership split:
 * - {@link CheckpointProposalJobMetrics} owns the OpenTelemetry meter and instruments and should live for the
 *   lifetime of the sequencer process.
 * - A recorder owns only mutable timing state for one checkpoint proposal job so overlapping jobs cannot
 *   overwrite each other's timing markers.
 */
export interface CheckpointProposalJobMetricsRecorder {
  recordCheckpointAttestationDelay(durationMs: number): void;
  recordCheckpointBuild(durationMs: number, blockCount: number, txCount: number, totalMana: number): void;
  recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary(offsetMs: number): void;
  startCheckpointTiming(nowMs: number): void;
  noteCheckpointBlockBuilt(nowMs: number, opts: { isFirstBlock: boolean; isLastBlock: boolean }): void;
  noteCheckpointBroadcast(nowMs: number): void;
}

/**
 * Concrete per-job recorder.
 *
 * This class should be short-lived: create one recorder per checkpoint proposal job and discard it when the job
 * completes. It intentionally does not create instruments; it only holds the job-local timestamps needed to derive
 * timing metrics safely.
 */
class CheckpointProposalJobMetricsRecorderImpl implements CheckpointProposalJobMetricsRecorder {
  private checkpointStartedAt?: number;
  private checkpointLastBlockBuiltAt?: number;

  constructor(private readonly instruments: CheckpointProposalJobInstruments) {}

  public recordCheckpointAttestationDelay(durationMs: number) {
    this.instruments.checkpointAttestationDelay.record(Math.ceil(durationMs));
  }

  public recordCheckpointBuild(durationMs: number, blockCount: number, txCount: number, totalMana: number) {
    this.instruments.checkpointBuildDuration.record(Math.ceil(durationMs));
    this.instruments.checkpointBlockCount.record(blockCount);
    this.instruments.checkpointTxCount.record(txCount);
    this.instruments.checkpointTotalMana.record(totalMana);
  }

  public recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary(offsetMs: number) {
    this.instruments.pipelinedCheckpointBuildStartOffsetFromSlotBoundary.record(Math.ceil(Math.abs(offsetMs)), {
      [Attributes.SLOT_BOUNDARY_SIDE]: offsetMs < 0 ? 'before' : 'after',
    });
  }

  public startCheckpointTiming(nowMs: number) {
    this.checkpointStartedAt = nowMs;
    this.checkpointLastBlockBuiltAt = undefined;
  }

  public noteCheckpointBlockBuilt(nowMs: number, opts: { isFirstBlock: boolean; isLastBlock: boolean }) {
    if (opts.isFirstBlock && this.checkpointStartedAt !== undefined) {
      this.instruments.checkpointStartToFirstBlockDuration.record(Math.ceil(nowMs - this.checkpointStartedAt));
    }

    if (opts.isLastBlock) {
      this.checkpointLastBlockBuiltAt = nowMs;
    }
  }

  public noteCheckpointBroadcast(nowMs: number) {
    if (this.checkpointLastBlockBuiltAt !== undefined) {
      this.instruments.checkpointLastBlockToBroadcastDuration.record(
        Math.ceil(nowMs - this.checkpointLastBlockBuiltAt),
      );
    }

    this.checkpointLastBlockBuiltAt = undefined;
  }
}

/**
 * Long-lived owner of checkpoint proposal job telemetry instruments.
 *
 * The sequencer should construct this once and reuse it across jobs. Each call to {@link createRecorder} returns a
 * lightweight recorder with isolated mutable state for a single checkpoint proposal job.
 */
export class CheckpointProposalJobMetrics {
  private readonly meter: Meter;
  private readonly instruments: CheckpointProposalJobInstruments;

  constructor(client: TelemetryClient, name = 'CheckpointProposalJob') {
    this.meter = client.getMeter(name);
    this.instruments = {
      checkpointAttestationDelay: this.meter.createHistogram(Metrics.SEQUENCER_CHECKPOINT_ATTESTATION_DELAY),
      checkpointBuildDuration: this.meter.createHistogram(Metrics.SEQUENCER_CHECKPOINT_BUILD_DURATION),
      checkpointStartToFirstBlockDuration: this.meter.createHistogram(
        Metrics.SEQUENCER_CHECKPOINT_START_TO_FIRST_BLOCK_DURATION,
      ),
      checkpointLastBlockToBroadcastDuration: this.meter.createHistogram(
        Metrics.SEQUENCER_CHECKPOINT_LAST_BLOCK_TO_BROADCAST_DURATION,
      ),
      pipelinedCheckpointBuildStartOffsetFromSlotBoundary: this.meter.createHistogram(
        Metrics.SEQUENCER_PIPELINED_CHECKPOINT_BUILD_START_OFFSET_FROM_SLOT_BOUNDARY,
      ),
      checkpointBlockCount: this.meter.createGauge(Metrics.SEQUENCER_CHECKPOINT_BLOCK_COUNT),
      checkpointTxCount: this.meter.createGauge(Metrics.SEQUENCER_CHECKPOINT_TX_COUNT),
      checkpointTotalMana: this.meter.createGauge(Metrics.SEQUENCER_CHECKPOINT_TOTAL_MANA),
    };
  }

  public createRecorder(): CheckpointProposalJobMetricsRecorder {
    return new CheckpointProposalJobMetricsRecorderImpl(this.instruments);
  }
}
