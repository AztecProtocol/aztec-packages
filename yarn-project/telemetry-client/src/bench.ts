import { createLogger } from '@aztec/foundation/log';

import type { BatchObservableCallback, Context, MetricOptions, Observable, ValueType } from '@opentelemetry/api';

import type { MetricDefinition } from './metrics.js';
import { NoopTracer } from './noop.js';
import type {
  AttributesType,
  Gauge,
  Histogram,
  Meter,
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
  setPublicTelemetryCollectFrom(_roles: string[]): void {}

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

  getTraceContext(): string | undefined {
    return undefined;
  }

  extractPropagatedContext() {
    return undefined;
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

  createGauge(metric: MetricDefinition): Gauge {
    return this.createMetric('gauge', metric);
  }

  createObservableGauge(metric: MetricDefinition): ObservableGauge {
    return this.createMetric('gauge', metric);
  }

  createHistogram(metric: MetricDefinition, _extraOptions?: Partial<MetricOptions>): Histogram {
    return this.createMetric('histogram', metric);
  }

  createUpDownCounter(metric: MetricDefinition): UpDownCounter {
    return this.createMetric('counter', metric);
  }

  createObservableUpDownCounter(metric: MetricDefinition): ObservableUpDownCounter {
    return this.createMetric('counter', metric);
  }

  private createMetric(type: 'gauge' | 'counter' | 'histogram', metric: MetricDefinition) {
    const m = new InMemoryPlainMetric(type, metric.name, {
      description: metric.description,
      unit: metric.unit,
      valueType: metric.valueType,
    });
    this.metrics.push(m);
    return m;
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
