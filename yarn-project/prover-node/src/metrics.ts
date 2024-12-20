import { type Timer } from '@aztec/foundation/timer';
import { type Histogram, Metrics, type TelemetryClient, ValueType } from '@aztec/telemetry-client';

export class ProverNodeMetrics {
  provingJobDuration: Histogram;
  provingJobBlocks: Histogram;
  provingJobTransactions: Histogram;

  constructor(public readonly client: TelemetryClient, name = 'ProverNode') {
    const meter = client.getMeter(name);
    this.provingJobDuration = meter.createHistogram(Metrics.PROVER_NODE_JOB_DURATION, {
      description: 'Duration of proving job',
      unit: 'ms',
      valueType: ValueType.INT,
    });
    this.provingJobBlocks = meter.createHistogram(Metrics.PROVER_NODE_JOB_BLOCKS, {
      description: 'Number of blocks in a proven epoch',
      valueType: ValueType.INT,
    });
    this.provingJobTransactions = meter.createHistogram(Metrics.PROVER_NODE_JOB_TRANSACTIONS, {
      description: 'Number of transactions in a proven epoch',
      valueType: ValueType.INT,
    });
  }

  public recordProvingJob(timerOrMs: Timer | number, numBlocks: number, numTxs: number) {
    const ms = Math.ceil(typeof timerOrMs === 'number' ? timerOrMs : timerOrMs.ms());
    this.provingJobDuration.record(ms);
    this.provingJobBlocks.record(Math.floor(numBlocks));
    this.provingJobTransactions.record(Math.floor(numTxs));
  }
}
