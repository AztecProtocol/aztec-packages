import type { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import type { L2Block } from '@aztec/stdlib/block';
import type { CheckpointData } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import {
  Attributes,
  type Gauge,
  type Histogram,
  LmdbMetrics,
  type LmdbStatsCallback,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

export class ArchiverInstrumentation {
  public readonly tracer: Tracer;

  private blockHeight: Gauge;
  private checkpointHeight: Gauge;
  private txCount: UpDownCounter;
  private l1BlockHeight: Gauge;
  private proofsSubmittedDelay: Histogram;
  private proofsSubmittedCount: UpDownCounter;
  private dbMetrics: LmdbMetrics;

  private pruneDuration: Histogram;
  private pruneCount: UpDownCounter;

  private syncDurationPerBlock: Histogram;
  private syncDurationPerCheckpoint: Histogram;
  private syncBlockCount: UpDownCounter;
  private manaPerBlock: Histogram;
  private txsPerBlock: Histogram;

  private syncDurationPerMessage: Histogram;
  private syncMessageCount: UpDownCounter;

  private blockProposalTxTargetCount: UpDownCounter;

  private checkpointL1InclusionDelay: Histogram;
  private checkpointPromotedCount: UpDownCounter;

  private log = createLogger('archiver:instrumentation');

  private constructor(
    private telemetry: TelemetryClient,
    lmdbStats?: LmdbStatsCallback,
  ) {
    this.tracer = telemetry.getTracer('Archiver');
    const meter = telemetry.getMeter('Archiver');

    this.blockHeight = meter.createGauge(Metrics.ARCHIVER_BLOCK_HEIGHT);

    this.checkpointHeight = meter.createGauge(Metrics.ARCHIVER_CHECKPOINT_HEIGHT);

    this.l1BlockHeight = meter.createGauge(Metrics.ARCHIVER_L1_BLOCK_HEIGHT);

    this.txCount = createUpDownCounterWithDefault(meter, Metrics.ARCHIVER_TOTAL_TXS);

    this.proofsSubmittedCount = createUpDownCounterWithDefault(meter, Metrics.ARCHIVER_ROLLUP_PROOF_COUNT, {
      [Attributes.PROOF_TIMED_OUT]: [true, false],
    });

    this.proofsSubmittedDelay = meter.createHistogram(Metrics.ARCHIVER_ROLLUP_PROOF_DELAY);

    this.syncDurationPerBlock = meter.createHistogram(Metrics.ARCHIVER_SYNC_PER_BLOCK);

    this.syncDurationPerCheckpoint = meter.createHistogram(Metrics.ARCHIVER_SYNC_PER_CHECKPOINT);

    this.syncBlockCount = createUpDownCounterWithDefault(meter, Metrics.ARCHIVER_SYNC_BLOCK_COUNT);

    this.manaPerBlock = meter.createHistogram(Metrics.ARCHIVER_MANA_PER_BLOCK);

    this.txsPerBlock = meter.createHistogram(Metrics.ARCHIVER_TXS_PER_BLOCK);

    this.syncDurationPerMessage = meter.createHistogram(Metrics.ARCHIVER_SYNC_PER_MESSAGE);

    this.syncMessageCount = createUpDownCounterWithDefault(meter, Metrics.ARCHIVER_SYNC_MESSAGE_COUNT);

    this.pruneDuration = meter.createHistogram(Metrics.ARCHIVER_PRUNE_DURATION);

    this.pruneCount = createUpDownCounterWithDefault(meter, Metrics.ARCHIVER_PRUNE_COUNT, {
      [Attributes.STATUS]: ['unproven'],
    });

    this.blockProposalTxTargetCount = createUpDownCounterWithDefault(
      meter,
      Metrics.ARCHIVER_BLOCK_PROPOSAL_TX_TARGET_COUNT,
      {
        [Attributes.L1_BLOCK_PROPOSAL_USED_TRACE]: [true, false],
      },
    );

    this.checkpointL1InclusionDelay = meter.createHistogram(Metrics.ARCHIVER_CHECKPOINT_L1_INCLUSION_DELAY);

    this.checkpointPromotedCount = createUpDownCounterWithDefault(meter, Metrics.ARCHIVER_CHECKPOINT_PROMOTED_COUNT);

    this.dbMetrics = new LmdbMetrics(
      meter,
      {
        [Attributes.DB_DATA_TYPE]: 'archiver',
      },
      lmdbStats,
    );
  }

  public static async new(telemetry: TelemetryClient, lmdbStats?: LmdbStatsCallback) {
    const instance = new ArchiverInstrumentation(telemetry, lmdbStats);

    await instance.telemetry.flush();

    return instance;
  }

  public isEnabled(): boolean {
    return this.telemetry.isEnabled();
  }

  public processNewProposedBlock(syncTimePerBlock: number, block: L2Block) {
    const attrs = { [Attributes.STATUS]: 'proposed' };
    this.blockHeight.record(block.number, attrs);
    this.syncDurationPerBlock.record(Math.ceil(syncTimePerBlock));

    // Per block metrics
    this.txCount.add(block.body.txEffects.length);
    this.txsPerBlock.record(block.body.txEffects.length);
    this.manaPerBlock.record(block.header.totalManaUsed.toNumber() / 1e6);
  }

  public processNewCheckpointedBlocks(syncTimePerCheckpoint: number, blocks: L2Block[]) {
    if (blocks.length === 0) {
      return;
    }

    this.syncDurationPerCheckpoint.record(Math.ceil(syncTimePerCheckpoint));
    this.blockHeight.record(Math.max(...blocks.map(b => b.number)), { [Attributes.STATUS]: 'checkpointed' });
    this.checkpointHeight.record(Math.max(...blocks.map(b => b.checkpointNumber)));
    this.syncBlockCount.add(blocks.length);
  }

  public processNewMessages(count: number, syncPerMessageMs: number) {
    if (count === 0) {
      return;
    }
    this.syncMessageCount.add(count);
    this.syncDurationPerMessage.record(Math.ceil(syncPerMessageMs));
  }

  public processPrune(duration: number) {
    // Only the unproven-epoch prune (L2PruneUnproven) is counted here; routine uncheckpointed
    // pruning is deliberately excluded so this metric tracks real pending-chain reorgs.
    this.pruneCount.add(1, { [Attributes.STATUS]: 'unproven' });
    this.pruneDuration.record(Math.ceil(duration));
  }

  public updateLastProvenCheckpoint(checkpoint: CheckpointData) {
    const lastBlockNumberInCheckpoint = checkpoint.startBlock + checkpoint.blockCount - 1;
    this.blockHeight.record(lastBlockNumberInCheckpoint, { [Attributes.STATUS]: 'proven' });
    this.checkpointHeight.record(checkpoint.checkpointNumber, { [Attributes.STATUS]: 'proven' });
  }

  public processProofsVerified(logs: { proverId: string; l2BlockNumber: bigint; delay: bigint }[]) {
    for (const log of logs) {
      this.log.debug('Recording proof verified event', log);
      this.proofsSubmittedCount.add(1, {
        [Attributes.ROLLUP_PROVER_ID]: log.proverId,
        [Attributes.PROOF_TIMED_OUT]: log.delay > 20n * 60n * 1000n,
      });
      this.proofsSubmittedDelay.record(Math.ceil(Number(log.delay)), {
        [Attributes.ROLLUP_PROVER_ID]: log.proverId,
      });
    }
  }

  public updateL1BlockHeight(blockNumber: bigint) {
    this.l1BlockHeight.record(Number(blockNumber));
  }

  public recordBlockProposalTxTarget(target: string, usedTrace: boolean) {
    this.blockProposalTxTargetCount.add(1, {
      [Attributes.L1_BLOCK_PROPOSAL_TX_TARGET]: target.toLowerCase(),
      [Attributes.L1_BLOCK_PROPOSAL_USED_TRACE]: usedTrace,
    });
  }

  /** Records a checkpoint promoted from proposed (blob fetch skipped). */
  public processCheckpointPromoted() {
    this.checkpointPromotedCount.add(1);
  }

  /**
   * Records L1 inclusion timing for a checkpoint observed on L1 (seconds into the L2 slot).
   */
  public processCheckpointL1Timing(data: {
    slotNumber: SlotNumber;
    l1Timestamp: bigint;
    l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>;
  }): void {
    const slotStartTs = getTimestampForSlot(data.slotNumber, data.l1Constants);
    const inclusionDelaySeconds = Number(data.l1Timestamp - slotStartTs);
    this.checkpointL1InclusionDelay.record(inclusionDelaySeconds);
  }
}
