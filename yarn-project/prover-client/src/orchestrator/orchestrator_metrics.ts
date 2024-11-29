import {
  Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  ValueType,
  millisecondBuckets,
} from '@aztec/telemetry-client';

export class ProvingOrchestratorMetrics {
  public readonly tracer: Tracer;

  private baseRollupInputsDuration: Histogram;
  private epochProofCount: Gauge;

  constructor(client: TelemetryClient, name = 'ProvingOrchestrator') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.baseRollupInputsDuration = meter.createHistogram(Metrics.PROVING_ORCHESTRATOR_BASE_ROLLUP_INPUTS_DURATION, {
      unit: 'ms',
      description: 'Duration to build base rollup inputs',
      valueType: ValueType.INT,
      advice: {
        explicitBucketBoundaries: millisecondBuckets(1), // 10ms -> ~327s
      },
    });

    this.epochProofCount = meter.createGauge(Metrics.PROVING_ORCHESTRATOR_EPOCH_PROOF_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of total proofs that were required for an epoch',
    });
  }

  recordBaseRollupInputs(durationMs: number) {
    this.baseRollupInputsDuration.record(Math.ceil(durationMs));
  }

  recordEpochProofCount(count: number) {
    this.epochProofCount.record(count);
  }
}
