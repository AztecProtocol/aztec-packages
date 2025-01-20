import { type Histogram, Metrics, type TelemetryClient, ValueType } from '@aztec/telemetry-client';

export class ProverNodeMetrics {
  proverEpochExecutionDuration: Histogram;
  provingJobDuration: Histogram;
  provingJobBlocks: Histogram;
  provingJobTransactions: Histogram;

  constructor(public readonly client: TelemetryClient, name = 'ProverNode') {
    const meter = client.getMeter(name);
    this.proverEpochExecutionDuration = meter.createHistogram(Metrics.PROVER_NODE_EXECUTION_DURATION, {
      description: 'Duration of execution of an epoch by the prover',
      unit: 'ms',
      valueType: ValueType.INT,
    });
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

  public recordProvingJob(executionTimeMs: number, totalTimeMs: number, numBlocks: number, numTxs: number) {
    this.proverEpochExecutionDuration.record(Math.ceil(executionTimeMs));
    this.provingJobDuration.record(Math.ceil(totalTimeMs));
    this.provingJobBlocks.record(Math.floor(numBlocks));
    this.provingJobTransactions.record(Math.floor(numTxs));
  }
}
