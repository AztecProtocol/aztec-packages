import {
  type BatchObservableCallback,
  type Context,
  type MetricOptions,
  type Observable,
  type ValueType,
} from '@opentelemetry/api';

import { NoopTracer } from './noop.js';
import {
  type Attributes,
  type Gauge,
  type Histogram,
  type Meter,
  type Metrics,
  type ObservableGauge,
  type ObservableUpDownCounter,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
} from './telemetry.js';

export type BenchmarkMetrics = {
  name: string;
  metrics: {
    name: string;
    type: 'gauge' | 'counter' | 'histogram';
    description?: string;
    unit?: string;
    valueType?: ValueType;
    points: BenchmarkDataPoint[];
  }[];
}[];

export class BenchmarkTelemetryClient implements TelemetryClient {
  private meters: InMemoryPlainMeter[] = [];

  getMeter(name: string): Meter {
    const meter = new InMemoryPlainMeter(name);
    this.meters.push(meter);
    return meter;
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
    return true;
  }

  getMeters(): BenchmarkMetrics {
    return this.meters;
  }

  clear() {
    this.meters.forEach(meter => meter.clear());
  }
}

class InMemoryPlainMeter implements Meter {
  public readonly metrics: InMemoryPlainMetric[] = [];

  constructor(public readonly name: string) {}

  clear() {
    this.metrics.forEach(metric => metric.clear());
  }

  createGauge(name: Metrics, options?: MetricOptions | undefined): Gauge {
    return this.createMetric('gauge', name, options);
  }

  createObservableGauge(name: Metrics, options?: MetricOptions | undefined): ObservableGauge {
    return this.createMetric('gauge', name, options);
  }

  createHistogram(name: Metrics, options?: MetricOptions | undefined): Histogram {
    return this.createMetric('histogram', name, options);
  }

  createUpDownCounter(name: Metrics, options?: MetricOptions | undefined): UpDownCounter {
    return this.createMetric('counter', name, options);
  }

  createObservableUpDownCounter(name: Metrics, options?: MetricOptions | undefined): ObservableUpDownCounter {
    return this.createMetric('counter', name, options);
  }

  private createMetric(type: 'gauge' | 'counter' | 'histogram', name: string, options?: MetricOptions) {
    const metric = new InMemoryPlainMetric(type, name, options);
    this.metrics.push(metric);
    return metric;
  }

  addBatchObservableCallback(
    _callback: BatchObservableCallback<Attributes>,
    _observables: Observable<Attributes>[],
  ): void {}

  removeBatchObservableCallback(
    _callback: BatchObservableCallback<Attributes>,
    _observables: Observable<Attributes>[],
  ): void {}
}

export type BenchmarkDataPoint = { value: number; attributes?: Attributes; context?: Context };

class InMemoryPlainMetric {
  public readonly points: BenchmarkDataPoint[] = [];

  public readonly description?: string;
  public readonly unit?: string;
  public readonly valueType?: ValueType;

  constructor(
    public readonly type: 'gauge' | 'counter' | 'histogram',
    public readonly name: string,
    options?: MetricOptions,
  ) {
    this.description = options?.description;
    this.unit = options?.unit;
    this.valueType = options?.valueType;
  }

  add(value: number, attributes?: Attributes, context?: Context): void {
    this.points.push({ value, attributes, context });
  }

  record(value: number, attributes?: Attributes, context?: Context): void {
    this.points.push({ value, attributes, context });
  }

  addCallback() {}

  removeCallback() {}

  getPoints(): BenchmarkDataPoint[] {
    return this.points;
  }

  clear() {
    this.points.splice(0, this.points.length);
  }
}
