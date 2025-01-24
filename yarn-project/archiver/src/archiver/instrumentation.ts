import { type L2Block } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
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
  ValueType,
} from '@aztec/telemetry-client';

export class ArchiverInstrumentation {
  public readonly tracer: Tracer;

  private blockHeight: Gauge;
  private txCount: UpDownCounter;
  private syncDuration: Histogram;
  private l1BlocksSynced: UpDownCounter;
  private proofsSubmittedDelay: Histogram;
  private proofsSubmittedCount: UpDownCounter;
  private dbMetrics: LmdbMetrics;
  private pruneCount: UpDownCounter;

  private log = createLogger('archiver:instrumentation');

  private constructor(private telemetry: TelemetryClient, lmdbStats?: LmdbStatsCallback) {
    this.tracer = telemetry.getTracer('Archiver');
    const meter = telemetry.getMeter('Archiver');
    this.blockHeight = meter.createGauge(Metrics.ARCHIVER_BLOCK_HEIGHT, {
      description: 'The height of the latest block processed by the archiver',
      valueType: ValueType.INT,
    });

    this.txCount = meter.createUpDownCounter(Metrics.ARCHIVER_TX_COUNT, {
      description: 'The total number of transactions',
      valueType: ValueType.INT,
    });

    this.syncDuration = meter.createHistogram(Metrics.ARCHIVER_SYNC_DURATION, {
      unit: 'ms',
      description: 'Duration to sync a block',
      valueType: ValueType.INT,
    });

    this.proofsSubmittedCount = meter.createUpDownCounter(Metrics.ARCHIVER_ROLLUP_PROOF_COUNT, {
      description: 'Number of proofs submitted',
      valueType: ValueType.INT,
    });

    this.proofsSubmittedDelay = meter.createHistogram(Metrics.ARCHIVER_ROLLUP_PROOF_DELAY, {
      unit: 'ms',
      description: 'Time after a block is submitted until its proof is published',
      valueType: ValueType.INT,
    });

    this.l1BlocksSynced = meter.createUpDownCounter(Metrics.ARCHIVER_L1_BLOCKS_SYNCED, {
      description: 'Number of blocks synced from L1',
      valueType: ValueType.INT,
    });

    this.dbMetrics = new LmdbMetrics(
      meter,
      {
        [Attributes.DB_DATA_TYPE]: 'archiver',
      },
      lmdbStats,
    );

    this.pruneCount = meter.createUpDownCounter(Metrics.ARCHIVER_PRUNE_COUNT, {
      description: 'Number of prunes detected',
      valueType: ValueType.INT,
    });
  }

  public static async new(telemetry: TelemetryClient, lmdbStats?: LmdbStatsCallback) {
    const instance = new ArchiverInstrumentation(telemetry, lmdbStats);

    instance.l1BlocksSynced.add(0);

    await instance.telemetry.flush();

    return instance;
  }

  public isEnabled(): boolean {
    return this.telemetry.isEnabled();
  }

  public processNewBlocks(syncTimePerBlock: number, blocks: L2Block[]) {
    this.syncDuration.record(Math.ceil(syncTimePerBlock));
    this.blockHeight.record(Math.max(...blocks.map(b => b.number)));
    this.l1BlocksSynced.add(blocks.length);
    for (const block of blocks) {
      this.txCount.add(block.body.txEffects.length);
    }
  }

  public processPrune() {
    this.pruneCount.add(1);
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
}
