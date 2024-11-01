import { type TelemetryClient, type Tracer } from './telemetry.js';

/**
 * A minimal class that enables recording metrics with a telemetry client.
 * This base class enables tracing
 *
 * In other words:
 * Enables the ability to call `@trackSpan` on methods.
 *
 * Example:
 *
 * ```
 * import {Attributes, type TelemetryClient, WithTracer, trackSpan } from '@aztec/telemetry-client';
 *
 * class MyClass extends WithTracer {
 *   // Constructor is required to be passed the TelemetryClient implementation.
 *   constructor(client: TelemetryClient) {
 *     super(client, 'MyClass');
 *   }
 *
 *   @trackSpan('MyClass.myMethod', (arg: string) => ({
 *     [Attributes.ARG]: arg,
 *   }))
 *   public myMethod(arg: string) {
 *     // ...
 *   }
 * }
 * ```
 */
export class WithTracer {
  public readonly tracer: Tracer;
  constructor(client: TelemetryClient, name: string) {
    this.tracer = client.getTracer(name);
  }
}
