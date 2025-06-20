import { createLogger } from '@aztec/foundation/log';

import type { BatchObservableCallback, Context, MetricOptions, Observable, ValueType } from '@opentelemetry/api';

import { NoopTracer } from './noop.js';
import type {
  AttributesType,
  Gauge,
  Histogram,
  Meter,
  MetricsType,
  ObservableGauge,
  ObservableUpDownCounter,
  TelemetryClient,
  Tracer,
  UpDownCounter,
} from './telemetry.js';

export type BenchmarkMetricsType = {
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

  constructor() {
    const log = createLogger('telemetry:client');
    log.info(`Using benchmark telemetry client`);
  }

  setExportedPublicTelemetry(_prefixes: string[]): void {}

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

  getMeters(): BenchmarkMetricsType {
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

  createGauge(name: MetricsType, options?: MetricOptions): Gauge {
    return this.createMetric('gauge', name, options);
  }

  createObservableGauge(name: MetricsType, options?: MetricOptions): ObservableGauge {
    return this.createMetric('gauge', name, options);
  }

  createHistogram(name: MetricsType, options?: MetricOptions): Histogram {
    return this.createMetric('histogram', name, options);
  }

  createUpDownCounter(name: MetricsType, options?: MetricOptions): UpDownCounter {
    return this.createMetric('counter', name, options);
  }

  createObservableUpDownCounter(name: MetricsType, options?: MetricOptions): ObservableUpDownCounter {
    return this.createMetric('counter', name, options);
  }

  private createMetric(type: 'gauge' | 'counter' | 'histogram', name: string, options?: MetricOptions) {
    const metric = new InMemoryPlainMetric(type, name, options);
    this.metrics.push(metric);
    return metric;
  }

  addBatchObservableCallback(
    _callback: BatchObservableCallback<AttributesType>,
    _observables: Observable<AttributesType>[],
  ): void {}

  removeBatchObservableCallback(
    _callback: BatchObservableCallback<AttributesType>,
    _observables: Observable<AttributesType>[],
  ): void {}
}

export type BenchmarkDataPoint = { value: number; attributes?: AttributesType; context?: Context };

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

  add(value: number, attributes?: AttributesType, context?: Context): void {
    this.points.push({ value, attributes, context });
  }

  record(value: number, attributes?: AttributesType, context?: Context): void {
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
