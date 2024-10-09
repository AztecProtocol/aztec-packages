import { type TelemetryClient, type Tracer } from '@aztec/telemetry-client';

export class ValidatorMetrics {
  public readonly tracer: Tracer;
  constructor(client: TelemetryClient, name = 'Validator') {
    this.tracer = client.getTracer(name);
  }
}
