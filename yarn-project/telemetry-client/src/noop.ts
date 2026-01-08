import { type Context, type Span, type SpanContext, type Tracer, createNoopMeter } from '@opentelemetry/api';

import type { MetricDefinition } from './metrics.js';
import type {
  Gauge,
  Histogram,
  Meter,
  ObservableGauge,
  ObservableUpDownCounter,
  TelemetryClient,
  UpDownCounter,
} from './telemetry.js';

/** A no-op meter that implements our custom Meter interface */
class NoopMeter implements Meter {
  private otelMeter = createNoopMeter();

  createGauge(_metric: MetricDefinition): Gauge {
    return this.otelMeter.createGauge('');
  }

  createObservableGauge(_metric: MetricDefinition): ObservableGauge {
    return this.otelMeter.createObservableGauge('');
  }

  createHistogram(_metric: MetricDefinition, _extraOptions?: Parameters<Meter['createHistogram']>[1]): Histogram {
    return this.otelMeter.createHistogram('');
  }

  createUpDownCounter(_metric: MetricDefinition): UpDownCounter {
    return this.otelMeter.createUpDownCounter('');
  }

  createObservableUpDownCounter(_metric: MetricDefinition): ObservableUpDownCounter {
    return this.otelMeter.createObservableUpDownCounter('');
  }

  addBatchObservableCallback(
    callback: Parameters<Meter['addBatchObservableCallback']>[0],
    observables: Parameters<Meter['addBatchObservableCallback']>[1],
  ): void {
    this.otelMeter.addBatchObservableCallback(callback, observables);
  }

  removeBatchObservableCallback(
    callback: Parameters<Meter['removeBatchObservableCallback']>[0],
    observables: Parameters<Meter['removeBatchObservableCallback']>[1],
  ): void {
    this.otelMeter.removeBatchObservableCallback(callback, observables);
  }
}

export class NoopTelemetryClient implements TelemetryClient {
  private meter = new NoopMeter();

  setExportedPublicTelemetry(_prefixes: string[]): void {}
  setPublicTelemetryCollectFrom(_roles: string[]): void {}

  getMeter(): Meter {
    return this.meter;
  }

  getTracer(): Tracer {
    return new NoopTracer();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  isEnabled() {
    return false;
  }

  getTraceContext(): string | undefined {
    return undefined;
  }

  extractPropagatedContext(_traceContext: string): Context | undefined {
    return undefined;
  }
}

// @opentelemetry/api internally uses NoopTracer and NoopSpan but they're not exported
// make our own versions
// https://github.com/open-telemetry/opentelemetry-js/issues/4518#issuecomment-2179405444
export class NoopTracer implements Tracer {
  startSpan(): Span {
    return new NoopSpan();
  }

  startActiveSpan<F extends (...args: any[]) => any>(_name: string, ...args: unknown[]): ReturnType<F> {
    // there are three different signatures for startActiveSpan, grab the function, we don't care about the rest
    const fn = args.find(arg => typeof arg === 'function') as F;
    return fn(new NoopSpan());
  }
}

class NoopSpan implements Span {
  private recording: boolean = true;
  addEvent(): this {
    return this;
  }

  addLink(): this {
    return this;
  }

  addLinks(): this {
    return this;
  }

  end(): void {
    this.recording = false;
  }

  isRecording(): boolean {
    return this.recording;
  }

  recordException(): void {
    return;
  }

  setAttribute(): this {
    return this;
  }

  setAttributes(): this {
    return this;
  }

  setStatus(): this {
    return this;
  }

  spanContext(): SpanContext {
    return {
      spanId: '',
      traceId: '',
      traceFlags: 0,
    };
  }

  updateName(): this {
    return this;
  }
}
