import {
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class ProvingOrchestratorMetrics {
  public readonly tracer: Tracer;

  private baseRollupInputsDuration: Histogram;
  private avmFallbackCount: UpDownCounter;

  constructor(client: TelemetryClient, name = 'ProvingOrchestrator') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.baseRollupInputsDuration = meter.createHistogram(Metrics.PROVING_ORCHESTRATOR_BASE_ROLLUP_INPUTS_DURATION, {
      unit: 'ms',
      description: 'Duration to build base rollup inputs',
      valueType: ValueType.INT,
    });

    this.avmFallbackCount = meter.createUpDownCounter(Metrics.PROVING_ORCHESTRATOR_AVM_FALLBACK_COUNT, {
      description: 'How many times the AVM fallback was used',
      valueType: ValueType.INT,
    });

    this.avmFallbackCount.add(0);
  }

  recordBaseRollupInputs(durationMs: number) {
    this.baseRollupInputsDuration.record(Math.ceil(durationMs));
  }

  incAvmFallback() {
    this.avmFallbackCount.add(1);
  }
}
