import { createLogger } from '@aztec/foundation/log';
import type { L2BlockNew } from '@aztec/stdlib/block';
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
} from '@aztec/telemetry-client';

export class ArchiverInstrumentation {
  public readonly tracer: Tracer;

  private blockHeight: Gauge;
  private txCount: UpDownCounter;
  private l1BlockHeight: Gauge;
  private proofsSubmittedDelay: Histogram;
  private proofsSubmittedCount: UpDownCounter;
  private dbMetrics: LmdbMetrics;

  private pruneDuration: Histogram;
  private pruneCount: UpDownCounter;

  private syncDurationPerBlock: Histogram;
  private syncBlockCount: UpDownCounter;
  private manaPerBlock: Histogram;
  private txsPerBlock: Histogram;

  private syncDurationPerMessage: Histogram;
  private syncMessageCount: UpDownCounter;

  private blockProposalTxTargetCount: UpDownCounter;

  private log = createLogger('archiver:instrumentation');

  private constructor(
    private telemetry: TelemetryClient,
    lmdbStats?: LmdbStatsCallback,
  ) {
    this.tracer = telemetry.getTracer('Archiver');
    const meter = telemetry.getMeter('Archiver');

    this.blockHeight = meter.createGauge(Metrics.ARCHIVER_BLOCK_HEIGHT);

    this.l1BlockHeight = meter.createGauge(Metrics.ARCHIVER_L1_BLOCK_HEIGHT);

    this.txCount = meter.createUpDownCounter(Metrics.ARCHIVER_TOTAL_TXS);

    this.proofsSubmittedCount = meter.createUpDownCounter(Metrics.ARCHIVER_ROLLUP_PROOF_COUNT);

    this.proofsSubmittedDelay = meter.createHistogram(Metrics.ARCHIVER_ROLLUP_PROOF_DELAY);

    this.syncDurationPerBlock = meter.createHistogram(Metrics.ARCHIVER_SYNC_PER_BLOCK);

    this.syncBlockCount = meter.createUpDownCounter(Metrics.ARCHIVER_SYNC_BLOCK_COUNT);

    this.manaPerBlock = meter.createHistogram(Metrics.ARCHIVER_MANA_PER_BLOCK);

    this.txsPerBlock = meter.createHistogram(Metrics.ARCHIVER_TXS_PER_BLOCK);

    this.syncDurationPerMessage = meter.createHistogram(Metrics.ARCHIVER_SYNC_PER_MESSAGE);

    this.syncMessageCount = meter.createUpDownCounter(Metrics.ARCHIVER_SYNC_MESSAGE_COUNT);

    this.pruneDuration = meter.createHistogram(Metrics.ARCHIVER_PRUNE_DURATION);

    this.pruneCount = meter.createUpDownCounter(Metrics.ARCHIVER_PRUNE_COUNT);

    this.blockProposalTxTargetCount = meter.createUpDownCounter(Metrics.ARCHIVER_BLOCK_PROPOSAL_TX_TARGET_COUNT);

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

    instance.syncBlockCount.add(0);
    instance.syncMessageCount.add(0);
    instance.pruneCount.add(0);

    await instance.telemetry.flush();

    return instance;
  }

  public isEnabled(): boolean {
    return this.telemetry.isEnabled();
  }

  public processNewBlocks(syncTimePerBlock: number, blocks: L2BlockNew[]) {
    this.syncDurationPerBlock.record(Math.ceil(syncTimePerBlock));
    this.blockHeight.record(Math.max(...blocks.map(b => b.number)));
    this.syncBlockCount.add(blocks.length);

    for (const block of blocks) {
      this.txCount.add(block.body.txEffects.length);
      this.txsPerBlock.record(block.body.txEffects.length);
      this.manaPerBlock.record(block.header.totalManaUsed.toNumber() / 1e6);
    }
  }

  public processNewMessages(count: number, syncPerMessageMs: number) {
    if (count === 0) {
      return;
    }
    this.syncMessageCount.add(count);
    this.syncDurationPerMessage.record(Math.ceil(syncPerMessageMs));
  }

  public processPrune(duration: number) {
    this.pruneCount.add(1);
    this.pruneDuration.record(Math.ceil(duration));
  }

  public updateLastProvenBlock(blockNumber: number) {
    this.blockHeight.record(blockNumber, { [Attributes.STATUS]: 'proven' });
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
}
