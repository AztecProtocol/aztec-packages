import { type TelemetryClient, type Tracer } from './telemetry.js';

/**
 * A minimal class that enables recording metrics with a telemetry client.
 * This base class enables tracing
 */
export class WithTracer {
  public readonly tracer: Tracer;
  constructor(client: TelemetryClient, name: string) {
    this.tracer = client.getTracer(name);
  }
}
