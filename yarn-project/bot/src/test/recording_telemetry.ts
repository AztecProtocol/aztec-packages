import {
  type BatchObservableResult,
  type Context,
  type Gauge,
  type Histogram,
  type Meter,
  type MetricAttributesType,
  type MetricDefinition,
  type ObservableGauge,
  type ObservableUpDownCounter,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  getTelemetryClient,
} from '@aztec/telemetry-client';

/** Instrument options as the meter takes them; spelled through `Meter` so `@opentelemetry/api` stays indirect. */
type MetricOptions = NonNullable<Parameters<Meter['createHistogram']>[1]>;
type BatchObservableCallback = Parameters<Meter['addBatchObservableCallback']>[0];
type Observable = Parameters<Meter['addBatchObservableCallback']>[1][number];

/** Kind of instrument a metric definition was registered as. */
export type RecordedInstrumentKind = 'gauge' | 'histogram' | 'up_down_counter' | 'observable_gauge';

/** One value handed to an instrument, with the attributes it was labelled with. */
export interface RecordedMetricSample {
  metric: string;
  value: number;
  attributes: MetricAttributesType;
}

/** An instrument the code under test created, kept so a test can assert its type, unit and bucket boundaries. */
export interface RecordedInstrument {
  definition: MetricDefinition;
  kind: RecordedInstrumentKind;
  options?: MetricOptions;
}

/**
 * A `Meter` that keeps every sample in memory instead of exporting it.
 *
 * This is an implementation of the metrics API, not a mock of it: a test asserts on the values and labels that
 * would reach a collector, which is the behavior the instruments exist for, rather than on which methods were
 * called. Observable gauges are pulled explicitly with {@link collect}, standing in for the periodic reader.
 */
export class RecordingMeter implements Meter {
  public readonly samples: RecordedMetricSample[] = [];
  public readonly instruments = new Map<string, RecordedInstrument>();

  private readonly batchCallbacks: { callback: BatchObservableCallback; observables: Observable[] }[] = [];
  private readonly observableNames = new Map<Observable, string>();

  public createGauge(metric: MetricDefinition): Gauge {
    return this.recorder(metric, 'gauge') as Gauge;
  }

  public createHistogram(metric: MetricDefinition, extraOptions?: MetricOptions): Histogram {
    return this.recorder(metric, 'histogram', extraOptions) as Histogram;
  }

  public createUpDownCounter(metric: MetricDefinition): UpDownCounter {
    return this.recorder(metric, 'up_down_counter') as UpDownCounter;
  }

  public createObservableGauge(metric: MetricDefinition): ObservableGauge {
    this.register(metric, 'observable_gauge');
    const observable = { addCallback: () => {}, removeCallback: () => {} } as unknown as ObservableGauge;
    this.observableNames.set(observable as unknown as Observable, metric.name);
    return observable;
  }

  public createObservableUpDownCounter(metric: MetricDefinition): ObservableUpDownCounter {
    return this.createObservableGauge(metric) as unknown as ObservableUpDownCounter;
  }

  public addBatchObservableCallback(callback: BatchObservableCallback, observables: Observable[]): void {
    this.batchCallbacks.push({ callback, observables });
  }

  public removeBatchObservableCallback(callback: BatchObservableCallback, observables: Observable[]): void {
    const index = this.batchCallbacks.findIndex(
      registered =>
        registered.callback === callback &&
        registered.observables.length === observables.length &&
        registered.observables.every((observable, i) => observable === observables[i]),
    );
    if (index >= 0) {
      this.batchCallbacks.splice(index, 1);
    }
  }

  /** Number of batch observable callbacks currently armed. */
  public get armedCallbackCount(): number {
    return this.batchCallbacks.length;
  }

  /** Runs every armed batch observable callback, recording what they observe as samples. */
  public async collect(): Promise<void> {
    const observer: BatchObservableResult = {
      observe: (metric: Observable, value: number, attributes?: MetricAttributesType) => {
        this.samples.push({
          metric: this.observableNames.get(metric) ?? 'unknown',
          value,
          attributes: attributes ?? {},
        });
      },
    } as BatchObservableResult;
    for (const { callback } of [...this.batchCallbacks]) {
      await callback(observer as never);
    }
  }

  /** Sum of every value recorded for a metric whose attributes contain the given subset. */
  public sum(metric: MetricDefinition | string, attributes: MetricAttributesType = {}): number {
    return this.select(metric, attributes).reduce((total, sample) => total + sample.value, 0);
  }

  /** Every value recorded for a metric whose attributes contain the given subset, in order. */
  public values(metric: MetricDefinition | string, attributes: MetricAttributesType = {}): number[] {
    return this.select(metric, attributes).map(sample => sample.value);
  }

  /** Last value recorded for a metric whose attributes contain the given subset. */
  public last(metric: MetricDefinition | string, attributes: MetricAttributesType = {}): number | undefined {
    return this.values(metric, attributes).at(-1);
  }

  /** Every sample recorded for a metric whose attributes contain the given subset. */
  public select(metric: MetricDefinition | string, attributes: MetricAttributesType = {}): RecordedMetricSample[] {
    const name = typeof metric === 'string' ? metric : metric.name;
    const wanted = Object.entries(attributes);
    return this.samples.filter(
      sample =>
        sample.metric === name &&
        wanted.every(([key, value]) => sample.attributes[key as keyof MetricAttributesType] === value),
    );
  }

  /** Drops every sample recorded so far, keeping the instruments and the armed callbacks. */
  public clear(): void {
    this.samples.length = 0;
  }

  private register(metric: MetricDefinition, kind: RecordedInstrumentKind, options?: MetricOptions): void {
    this.instruments.set(metric.name, { definition: metric, kind, options });
  }

  private recorder(metric: MetricDefinition, kind: RecordedInstrumentKind, options?: MetricOptions) {
    this.register(metric, kind, options);
    const push = (value: number, attributes: MetricAttributesType = {}) =>
      this.samples.push({ metric: metric.name, value, attributes });
    return { add: push, record: push };
  }
}

/** A `TelemetryClient` whose meter records instead of exporting. Its tracer is whatever the process has. */
export class RecordingTelemetryClient implements TelemetryClient {
  public readonly meter = new RecordingMeter();

  // The default client is the no-op one unless telemetry was initialized, which is what a unit test wants.
  private readonly tracer = getTelemetryClient().getTracer('RecordingTelemetryClient');

  public isEnabled(): boolean {
    return true;
  }

  public getMeter(): Meter {
    return this.meter;
  }

  public getTracer(): Tracer {
    return this.tracer;
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }

  public flush(): Promise<void> {
    return Promise.resolve();
  }

  public setExportedPublicTelemetry(_prefixes: string[]): void {}

  public setPublicTelemetryCollectFrom(_roles: string[]): void {}

  public getTraceContext(): string | undefined {
    return undefined;
  }

  public extractPropagatedContext(_traceContext: string): Context | undefined {
    return undefined;
  }
}
