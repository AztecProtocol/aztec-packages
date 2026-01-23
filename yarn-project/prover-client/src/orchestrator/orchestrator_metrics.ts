import { type Histogram, Metrics, type TelemetryClient, type Tracer } from '@aztec/telemetry-client';

export class ProvingOrchestratorMetrics {
  public readonly tracer: Tracer;

  private baseRollupInputsDuration: Histogram;

  constructor(client: TelemetryClient, name = 'ProvingOrchestrator') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.baseRollupInputsDuration = meter.createHistogram(Metrics.PROVING_ORCHESTRATOR_BASE_ROLLUP_INPUTS_DURATION);
  }

  recordBaseRollupInputs(durationMs: number) {
    this.baseRollupInputsDuration.record(Math.ceil(durationMs));
  }
}
