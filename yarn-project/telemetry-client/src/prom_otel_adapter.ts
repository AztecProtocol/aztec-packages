import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { Registry } from 'prom-client';

import type { Histogram, Meter, MetricsType, ObservableGauge, TelemetryClient } from './telemetry.js';

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

/**Otel MetricsType Adapters
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
    this.gauge = meter.createObservableGauge(name as MetricsType, {
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
      const labels = parseLabelsSafely(labelStr, this.logger);
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
      validateLabels(labelsOrValue, this.labelNames, 'Gauge');
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

    validateLabels(labelsOrValue, this.labelNames, 'Gauge');
    const labelKey = JSON.stringify(labelsOrValue);
    this.labeledValues.set(labelKey, value!);
  }

  /**
   * Decrements the gauge value
   * @param labels - Optional labels object
   */
  dec(labels?: Labels): void {
    if (labels) {
      validateLabels(labels, this.labelNames, 'Gauge');
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
}

/**
 * Implementation of a Histogram collector
 */
export class OtelHistogram<Labels extends LabelsGeneric = NoLabels> implements IHistogram<Labels> {
  private histogram: Histogram;

  constructor(
    private logger: Logger,
    meter: Meter,
    name: string,
    help: string,
    buckets: number[] = [],
    private labelNames: Array<keyof Labels> = [],
  ) {
    this.histogram = meter.createHistogram(name as MetricsType, {
      description: help,
      advice: buckets.length ? { explicitBucketBoundaries: buckets } : undefined,
    });
  }

  /**
   * Starts a timer and returns a function that when called will record the time elapsed
   * @param labels - Optional labels for the observation
   */
  startTimer(labels?: Labels): () => void {
    if (labels) {
      validateLabels(labels, this.labelNames, 'Histogram');
    }

    const timer = new Timer();
    return () => {
      // Use timer.s() here to get the duration in seconds since this is only currently used by gossipsub_heartbeat_duration_seconds
      const duration = timer.s();
      if (labels) {
        this.observe(labels, duration);
      } else {
        this.observe(duration);
      }
    };
  }

  /**
   * Observes a value
   * @param value - Value to observe
   */
  observe(value: number): void;
  /**
   * Observes a value with labels
   * @param labels - Labels object
   * @param value - Value to observe
   */
  observe(labels: Labels, value: number): void;
  observe(labelsOrValue: Labels | number, value?: number): void {
    if (typeof labelsOrValue === 'number') {
      this.histogram.record(labelsOrValue);
    } else {
      validateLabels(labelsOrValue, this.labelNames, 'Histogram');
      this.histogram.record(value!, labelsOrValue);
    }
  }

  reset(): void {
    // OpenTelemetry histograms cannot be reset, but we implement the interface
    this.logger.silent('OpenTelemetry histograms cannot be fully reset');
  }
}

/**
 * Implementation of an AvgMinMax collector
 */
export class OtelAvgMinMax<Labels extends LabelsGeneric = NoLabels> implements IAvgMinMax<Labels> {
  private gauges: {
    avg: ObservableGauge;
    min: ObservableGauge;
    max: ObservableGauge;
  };

  private currentValues: number[] = [];
  private labeledValues: Map<string, number[]> = new Map();

  constructor(
    private logger: Logger,
    meter: Meter,
    name: string,
    help: string,
    private labelNames: Array<keyof Labels> = [],
  ) {
    // Create three separate gauges for avg, min, and max
    this.gauges = {
      avg: meter.createObservableGauge(`${name}_avg` as MetricsType, {
        description: `${help} (average)`,
      }),
      min: meter.createObservableGauge(`${name}_min` as MetricsType, {
        description: `${help} (minimum)`,
      }),
      max: meter.createObservableGauge(`${name}_max` as MetricsType, {
        description: `${help} (maximum)`,
      }),
    };

    // Register callbacks for each gauge
    this.gauges.avg.addCallback(this.observeAvg.bind(this));
    this.gauges.min.addCallback(this.observeMin.bind(this));
    this.gauges.max.addCallback(this.observeMax.bind(this));
  }

  /**
   * Sets the values for calculating avg, min, max
   * @param values - Array of values
   */
  set(values: number[]): void;
  /**
   * Sets the values for calculating avg, min, max with labels
   * @param labels - Labels object
   * @param values - Array of values
   */
  set(labels: Labels, values: number[]): void;
  set(labelsOrValues: number[] | Labels, values?: number[]): void {
    if (Array.isArray(labelsOrValues)) {
      this.currentValues = labelsOrValues;
      return;
    } else {
      validateLabels(labelsOrValues, this.labelNames, 'AvgMinMax');
      const labelKey = JSON.stringify(labelsOrValues);
      this.labeledValues.set(labelKey, values || []);
    }
  }

  /**
   * Resets all stored values
   */
  reset(): void {
    this.currentValues = [];
    this.labeledValues.clear();
  }

  /**
   * General function to observe an aggregation
   * @param result - Observer result
   * @param aggregateFn - Function that calculates the aggregation
   */
  private observeAggregation(result: any, aggregateFn: (arr: number[]) => number): void {
    // Observe unlabeled values
    if (this.currentValues.length > 0) {
      result.observe(aggregateFn(this.currentValues));
    }

    // Observe labeled values
    for (const [labelStr, values] of this.labeledValues.entries()) {
      if (values.length > 0) {
        const labels = parseLabelsSafely(labelStr, this.logger);
        if (labels) {
          result.observe(aggregateFn(values), labels);
        }
      }
    }
  }

  private observeAvg(result: any): void {
    this.observeAggregation(result, arr => arr.reduce((sum, val) => sum + val, 0) / arr.length);
  }

  private observeMin(result: any): void {
    this.observeAggregation(result, arr => Math.min.apply(null, arr));
  }

  private observeMax(result: any): void {
    this.observeAggregation(result, arr => Math.max.apply(null, arr));
  }
}

/**
 * Validates that provided labels match the expected schema
 * @param labels - Labels object to validate
 * @param labelNames - Array of allowed label names
 * @param metricType - Type of metric for error message ('Gauge', 'Histogram', 'AvgMinMax')
 * @throws Error if invalid labels are provided
 */
function validateLabels<Labels extends LabelsGeneric>(
  labels: Labels,
  labelNames: Array<keyof Labels>,
  metricType: string,
): void {
  if (labelNames.length === 0) {
    throw new Error(`${metricType} was initialized without labels support`);
  }

  for (const key of Object.keys(labels)) {
    if (!labelNames.includes(key as keyof Labels)) {
      throw new Error(`Invalid label key: ${key}`);
    }
  }
}

/**
 * Safely parses label string back to object
 * @param labelStr - Stringified labels object
 * @param logger - Logger instance for error reporting
 * @returns Labels object or null if parsing fails
 */
function parseLabelsSafely<Labels extends LabelsGeneric>(labelStr: string, logger: Logger): Labels | null {
  try {
    return JSON.parse(labelStr) as Labels;
  } catch {
    logger.error(`Failed to parse label string: ${labelStr}`);
    return null;
  }
}

/**
 * Otel metrics Adapter
 *
 * Maps the PromClient based MetricsRegister from gossipsub and discv5 services to the Otel MetricsRegister
 */
export class OtelMetricsAdapter extends Registry implements MetricsRegister {
  private readonly meter: Meter;

  constructor(
    telemetryClient: TelemetryClient,
    private logger: Logger = createLogger('telemetry:otel-metrics-adapter'),
  ) {
    super();
    this.meter = telemetryClient.getMeter('metrics-adapter');
  }

  gauge<Labels extends LabelsGeneric = NoLabels>(configuration: GaugeConfig<Labels>): IGauge<Labels> {
    return new OtelGauge<Labels>(
      this.logger,
      this.meter,
      configuration.name as MetricsType,
      configuration.help,
      configuration.labelNames,
    );
  }

  histogram<Labels extends LabelsGeneric = NoLabels>(configuration: HistogramConfig<Labels>): IHistogram<Labels> {
    return new OtelHistogram<Labels>(
      this.logger,
      this.meter,
      configuration.name as MetricsType,
      configuration.help,
      configuration.buckets,
      configuration.labelNames,
    );
  }

  avgMinMax<Labels extends LabelsGeneric = NoLabels>(configuration: AvgMinMaxConfig<Labels>): IAvgMinMax<Labels> {
    return new OtelAvgMinMax<Labels>(
      this.logger,
      this.meter,
      configuration.name as MetricsType,
      configuration.help,
      configuration.labelNames,
    );
  }
}
