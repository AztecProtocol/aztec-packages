import { type Logger, createLogger } from '@aztec/foundation/log';

import { Registry } from 'prom-client';

import { type Meter, type Metrics, type ObservableGauge, type TelemetryClient } from './telemetry.js';

/**
 * Types matching the gossipsub and libp2p services
 */
type TopicStr = string;
export type TopicLabel = string;
export type TopicStrToLabel = Map<TopicStr, TopicLabel>;

export enum MessageSource {
  forward = 'forward',
  publish = 'publish',
}

type NoLabels = Record<string, never>;
type LabelsGeneric = Record<string, string | number>;
type LabelKeys<Labels extends LabelsGeneric> = Extract<keyof Labels, string>;
interface CollectFn<Labels extends LabelsGeneric> {
  (metric: IGauge<Labels>): void;
}

interface IGauge<Labels extends LabelsGeneric = NoLabels> {
  inc: NoLabels extends Labels ? (value?: number) => void : (labels: Labels, value?: number) => void;
  set: NoLabels extends Labels ? (value: number) => void : (labels: Labels, value: number) => void;

  collect?(): void;
  addCollect(collectFn: CollectFn<Labels>): void;
}

interface IHistogram<Labels extends LabelsGeneric = NoLabels> {
  startTimer(): () => void;

  observe: NoLabels extends Labels ? (value: number) => void : (labels: Labels, value: number) => void;

  reset(): void;
}

interface IAvgMinMax<Labels extends LabelsGeneric = NoLabels> {
  set: NoLabels extends Labels ? (values: number[]) => void : (labels: Labels, values: number[]) => void;
}

export type GaugeConfig<Labels extends LabelsGeneric> = {
  name: string;
  help: string;
} & (NoLabels extends Labels
  ? { labelNames?: never }
  : { labelNames: [LabelKeys<Labels>, ...Array<LabelKeys<Labels>>] });

export type HistogramConfig<Labels extends LabelsGeneric> = GaugeConfig<Labels> & {
  buckets?: number[];
};

export type AvgMinMaxConfig<Labels extends LabelsGeneric> = GaugeConfig<Labels>;

export interface MetricsRegister {
  gauge<Labels extends LabelsGeneric = NoLabels>(config: GaugeConfig<Labels>): IGauge<Labels>;
  histogram<Labels extends LabelsGeneric = NoLabels>(config: HistogramConfig<Labels>): IHistogram<Labels>;
  avgMinMax<Labels extends LabelsGeneric = NoLabels>(config: AvgMinMaxConfig<Labels>): IAvgMinMax<Labels>;
}

/**Otel Metrics Adapters
 *
 * Some dependencies we use export metrics directly in a Prometheus format
 * This adapter is used to convert those metrics to a format that we can use with OpenTelemetry
 *
 * Affected services include:
 * - chainsafe/gossipsub
 * - libp2p
 */

export class OtelGauge<Labels extends LabelsGeneric = NoLabels> implements IGauge<Labels> {
  private gauge: ObservableGauge;
  private currentValue: number = 0;
  private labeledValues: Map<string, number> = new Map();
  private collectFns: CollectFn<Labels>[] = [];

  private _collect: () => void = () => {};
  get collect(): () => void {
    return this._collect;
  }
  set collect(fn: () => void) {
    this._collect = fn;
  }

  constructor(
    private logger: Logger,
    meter: Meter,
    name: string,
    help: string,
    private labelNames: Array<keyof Labels> = [],
  ) {
    this.gauge = meter.createObservableGauge(name as Metrics, {
      description: help,
    });

    // Only observe in the callback when collect() is called
    this.gauge.addCallback(this.handleObservation.bind(this));
  }

  /**
   * Add a collect callback
   * @param collectFn - Callback function
   */
  addCollect(collectFn: CollectFn<Labels>): void {
    this.collectFns.push(collectFn);
  }

  handleObservation(result: any): void {
    // Execute the main collect function if assigned
    this._collect();

    // Execute all the collect functions
    for (const fn of this.collectFns) {
      fn(this);
    }

    // Report the current values
    if (this.labelNames.length === 0) {
      result.observe(this.currentValue);
      return;
    }

    for (const [labelStr, value] of this.labeledValues.entries()) {
      const labels = this.parseLabelsSafely(labelStr);
      if (labels) {
        result.observe(value, labels);
      }
    }
  }

  /**
   * Increments the gauge value
   * @param labelsOrValue - Labels object or numeric value
   * @param value - Value to increment by (defaults to 1)
   */
  inc(value?: number): void;
  inc(labels: Labels, value?: number): void;
  inc(labelsOrValue?: Labels | number, value?: number): void {
    if (typeof labelsOrValue === 'number') {
      this.currentValue += labelsOrValue;
      return;
    }

    if (labelsOrValue) {
      this.validateLabels(labelsOrValue);
      const labelKey = JSON.stringify(labelsOrValue);
      const currentValue = this.labeledValues.get(labelKey) ?? 0;
      this.labeledValues.set(labelKey, currentValue + (value ?? 1));
      return;
    }

    this.currentValue += value ?? 1;
  }

  /**
   * Sets the gauge value
   * @param labelsOrValue - Labels object or numeric value
   * @param value - Value to set
   */
  set(value: number): void;
  set(labels: Labels, value: number): void;
  set(labelsOrValue: Labels | number, value?: number): void {
    if (typeof labelsOrValue === 'number') {
      this.currentValue = labelsOrValue;
      return;
    }

    this.validateLabels(labelsOrValue);
    const labelKey = JSON.stringify(labelsOrValue);
    this.labeledValues.set(labelKey, value!);
  }

  /**
   * Decrements the gauge value
   * @param labels - Optional labels object
   */
  dec(labels?: Labels): void {
    if (labels) {
      this.validateLabels(labels);
      const labelKey = JSON.stringify(labels);
      const currentValue = this.labeledValues.get(labelKey) ?? 0;
      this.labeledValues.set(labelKey, currentValue - 1);
      return;
    }

    this.currentValue -= 1;
  }

  /**
   * Resets the gauge to initial state
   */
  reset(): void {
    this.currentValue = 0;
    this.labeledValues.clear();
  }

  /**
   * Validates that provided labels match the expected schema
   * @param labels - Labels object to validate
   * @throws Error if invalid labels are provided
   */
  private validateLabels(labels: Labels): void {
    if (this.labelNames.length === 0) {
      throw new Error('Gauge was initialized without labels support');
    }

    for (const key of Object.keys(labels)) {
      if (!this.labelNames.includes(key as keyof Labels)) {
        throw new Error(`Invalid label key: ${key}`);
      }
    }
  }

  /**
   * Safely parses label string back to object
   * @param labelStr - Stringified labels object
   * @returns Labels object or null if parsing fails
   */
  private parseLabelsSafely(labelStr: string): Labels | null {
    try {
      return JSON.parse(labelStr) as Labels;
    } catch {
      this.logger.error(`Failed to parse label string: ${labelStr}`);
      return null;
    }
  }
}

/**
 * Noop implementation of a Historgram collec
 */
class NoopOtelHistogram<Labels extends LabelsGeneric = NoLabels> implements IHistogram<Labels> {
  constructor(
    private logger: Logger,
    _meter: Meter,
    _name: string, // Metrics must be registered in the aztec labels registry
    _help: string,
    _buckets: number[] = [],
    _labelNames: Array<keyof Labels> = [],
  ) {}

  // Overload signatures
  observe(_value: number): void;
  observe(_labels: Labels, _value: number): void;
  observe(_valueOrLabels: number | Labels, _value?: number): void {}

  startTimer(_labels?: Labels): (_labels?: Labels) => number {
    return () => 0;
  }

  reset(): void {
    // OpenTelemetry histograms cannot be reset, but we implement the interface
    this.logger.warn('OpenTelemetry histograms cannot be reset');
  }
}

/**
 * Noop implementation of an AvgMinMax collector
 */
class NoopOtelAvgMinMax<Labels extends LabelsGeneric = NoLabels> implements IAvgMinMax<Labels> {
  constructor(
    private _logger: Logger,
    _meter: Meter,
    _name: string, // Metrics must be registered in the aztec labels registry
    _help: string,
    _labelNames: Array<keyof Labels> = [],
  ) {}

  set(_values: number[]): void;
  set(_labels: Labels, _values: number[]): void;
  set(_valueOrLabels: number[] | Labels, _values?: number[]): void {}

  reset(): void {}
}

/**
 * Otel metrics Adapter
 *
 * Maps the PromClient based MetricsRegister from gossipsub and discv5 services to the Otel MetricsRegister
 */
export class OtelMetricsAdapter extends Registry implements MetricsRegister {
  private readonly meter: Meter;

  constructor(telemetryClient: TelemetryClient, private logger: Logger = createLogger('otel-metrics-adapter')) {
    super();
    this.meter = telemetryClient.getMeter('metrics-adapter');
  }

  gauge<Labels extends LabelsGeneric = NoLabels>(configuration: GaugeConfig<Labels>): IGauge<Labels> {
    return new OtelGauge<Labels>(
      this.logger,
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.labelNames,
    );
  }

  histogram<Labels extends LabelsGeneric = NoLabels>(configuration: HistogramConfig<Labels>): IHistogram<Labels> {
    return new NoopOtelHistogram<Labels>(
      this.logger,
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.buckets,
      configuration.labelNames,
    );
  }

  avgMinMax<Labels extends LabelsGeneric = NoLabels>(configuration: AvgMinMaxConfig<Labels>): IAvgMinMax<Labels> {
    return new NoopOtelAvgMinMax<Labels>(
      this.logger,
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.labelNames,
    );
  }
}
