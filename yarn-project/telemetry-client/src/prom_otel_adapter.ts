import { Meter, Metrics, TelemetryClient, ObservableGauge, Attributes, Gauge } from "./telemetry.js";

import { Registry, Counter as PromCounter, Gauge as PromGauge, Histogram as PromHistogram } from 'prom-client';

type TopicStr = string;
export type TopicLabel = string
export type TopicStrToLabel = Map<TopicStr, TopicLabel>

export enum MessageSource {
  forward = 'forward',
  publish = 'publish'
}

type NoLabels = Record<string, never>
type LabelsGeneric = Record<string, string | number>
type LabelKeys<Labels extends LabelsGeneric> = Extract<keyof Labels, string>
interface CollectFn<Labels extends LabelsGeneric> { (metric: IGauge<Labels>): void }

interface IGauge<Labels extends LabelsGeneric = NoLabels> {
  inc: NoLabels extends Labels ? (value?: number) => void : (labels: Labels, value?: number) => void
  set: NoLabels extends Labels ? (value: number) => void : (labels: Labels, value: number) => void

  collect?(): void
  addCollect(collectFn: CollectFn<Labels>): void
}

interface IHistogram<Labels extends LabelsGeneric = NoLabels> {
  startTimer(): () => void

  observe: NoLabels extends Labels ? (value: number) => void : (labels: Labels, value: number) => void

  reset(): void
}

interface IAvgMinMax<Labels extends LabelsGeneric = NoLabels> {
  set: NoLabels extends Labels ? (values: number[]) => void : (labels: Labels, values: number[]) => void
}

export type GaugeConfig<Labels extends LabelsGeneric> = {
  name: string
  help: string
} & (NoLabels extends Labels ? { labelNames?: never } : { labelNames: [LabelKeys<Labels>, ...Array<LabelKeys<Labels>>] })

export type HistogramConfig<Labels extends LabelsGeneric> = GaugeConfig<Labels> & {
  buckets?: number[]
}

export type AvgMinMaxConfig<Labels extends LabelsGeneric> = GaugeConfig<Labels>

export interface MetricsRegister {
  gauge<Labels extends LabelsGeneric = NoLabels>(config: GaugeConfig<Labels>): IGauge<Labels>
  histogram<Labels extends LabelsGeneric = NoLabels>(config: HistogramConfig<Labels>): IHistogram<Labels>
  avgMinMax<Labels extends LabelsGeneric = NoLabels>(config: AvgMinMaxConfig<Labels>): IAvgMinMax<Labels>
}

/**Otel Metrics Adapter
 *
 * Some dependencies we use export metrics directly in a Prometheus format
 * This adapter is used to convert those metrics to a format that we can use with OpenTelemetry
 *
 * Affected services include:
 * - chainsafe/gossipsub
 * - libp2p
 */

class OtelGauge<Labels extends LabelsGeneric = NoLabels> implements IGauge<Labels> {
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
    meter: Meter,
    name: string,
    help: string,
    private labelNames: Array<keyof Labels> = []
  ) {
    this.gauge = meter.createObservableGauge(name as Metrics, {
      description: help
    });

    // Only observe in the callback when collect() is called
    this.gauge.addCallback((result) => {
      // Execute the main collect function if assigned
      this._collect();

      // Execute any additional collect callbacks
      // this.collectFns.forEach(fn => fn());

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
    });
  }

  addCollect(collectFn: CollectFn<Labels>): void {
    this.collectFns.push(collectFn);
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
    console.error(`Failed to parse label string: ${labelStr}`);
    return null;
  }
}
}


class OtelHistogram<Labels extends LabelsGeneric = NoLabels> implements IHistogram<Labels> {
  private histogram;

  constructor(
    meter: Meter,
    name: Metrics, // Metrics must be registered in the aztec labels registry
    help: string,
    private buckets: number[] = [],
    labelNames: Array<keyof Labels> = []
  ) {
    // TODO: deal with buckets
    this.histogram = meter.createHistogram(name, {
      description: help,
    });
  }

  // Overload signatures
  observe(value: number): void;
  observe(labels: Labels, value: number): void;
  // Implementation
  observe(valueOrLabels: number | Labels, value?: number): void {
    const { labels, value: actualValue } = getLabelAndValue(valueOrLabels, value);
    const typedValue = actualValue as number;

    this.histogram.record(typedValue, labels);
  }

  startTimer(labels?: Labels): (labels?: Labels) => number {
    const start = performance.now();
    return (endLabels?: Labels) => {
      const duration = performance.now() - start;
      this.observe(endLabels || labels || {} as Labels, duration);
      return duration;
    };
  }

  reset(): void {
    // OpenTelemetry histograms cannot be reset, but we implement the interface
    console.warn('OpenTelemetry histograms cannot be reset');
  }
}


class OtelAvgMinMax<Labels extends LabelsGeneric = NoLabels> implements IAvgMinMax<Labels> {
  private minGauge;
  private maxGauge;
  private avgGauge;
  private count: number = 0;
  private sum: number = 0;
  private min: number = Infinity;
  private max: number = -Infinity;

  constructor(
    meter: Meter,
    // TODO: be more strict on metrics name types
    name: string, // Metrics must be registered in the aztec labels registry
    help: string,
    labelNames: Array<keyof Labels> = []
  ) {
    this.minGauge = meter.createObservableGauge(`${name}_min` as Metrics, {
      description: `${help} (minimum)`,
    });

    this.maxGauge = meter.createObservableGauge(`${name}_max` as Metrics, {
      description: `${help} (maximum)`,
    });

    this.avgGauge = meter.createObservableGauge(`${name}_avg` as Metrics, {
      description: `${help} (average)`,
    });

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.minGauge.addCallback((result) => {
      result.observe(this.min, {});
    });

    this.maxGauge.addCallback((result) => {
      result.observe(this.max, {});
    });

    this.avgGauge.addCallback((result) => {
      const avg = this.getAverage();
      if (avg !== undefined) {
        result.observe(avg, {});
      }
    });
  }

  private getLabelKey(labels?: Labels): string {
    return JSON.stringify(labels || {});
  }

  private getAverage(): number | undefined {
    if (this.count > 0) {
      return this.sum / this.count;
    }
    return undefined;
  }

  // TODO(md): just set up two different classes, one with labels and one without that can inherit from each other


  set(values: number[]): void;
  set(labels: Labels, values: number[]): void;
  set(valueOrLabels: number[] | Labels, values?: number[]): void {
    const { labels, value: actualValue } = getLabelAndValue(valueOrLabels, values);
    const actualValues = actualValue as number[];

    this.count += actualValues.length;

    const sorted = actualValues.sort((a, b) => a - b);
    this.sum += sorted.reduce((acc, curr) => acc + curr, 0);
    this.min = sorted[0];
    this.max = sorted[sorted.length - 1];
  }

  reset(): void {
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }
}

export class OtelMetricsAdapter extends Registry implements MetricsRegister {
  private readonly meter: Meter;

  constructor(telemetryClient: TelemetryClient) {
    super();
    this.meter = telemetryClient.getMeter('metrics-adapter');
  }

  gauge<Labels extends LabelsGeneric = NoLabels>(
    configuration: GaugeConfig<Labels>
  ): IGauge<Labels> {
    return new OtelGauge<Labels>(
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.labelNames
    );
  }

  histogram<Labels extends LabelsGeneric = NoLabels>(
    configuration: HistogramConfig<Labels>
  ): IHistogram<Labels> {
    return new OtelHistogram<Labels>(
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.buckets,
      configuration.labelNames
    );
  }

  avgMinMax<Labels extends LabelsGeneric = NoLabels>(
    configuration: AvgMinMaxConfig<Labels>
  ): IAvgMinMax<Labels> {
    return new OtelAvgMinMax<Labels>(
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.labelNames
    );
  }

  // static<Labels extends LabelsGeneric = NoLabels>({
  //   name,
  //   help,
  //   value
  // }: StaticConfig<Labels>): void {
  //   const gauge = this.meter.createObservableGauge(name, {
  //     description: help,
  //     unit: '1',
  //   });

  //   gauge.addCallback((result) => {
  //     result.observe(1, value);
  //   });
  // }

  // counter<Labels extends LabelsGeneric = NoLabels>(
  //   configuration: CounterConfig<Labels>
  // ): ICounter<Labels> {
  //   return new OtelCounter<Labels>(
  //     this.meter,
  //     configuration.name,
  //     configuration.help,
  //     configuration.labelNames
  //   );
  // }
}

function getLabelAndValue<Labels extends LabelsGeneric>(
  valueOrLabels?: number | number[] | Labels,
  value?: number | number[]
): { labels: Labels | undefined, value: number | number[] } {
  // If it's a number, it's a direct value
  if (typeof valueOrLabels === 'number') {
    return { labels: undefined, value: valueOrLabels };
  }

  // If it's an array, it's a value array
  if (Array.isArray(valueOrLabels)) {
    return { labels: undefined, value: valueOrLabels };
  }

  // Otherwise it's a labels object
  return {
    labels: valueOrLabels as Labels,
    value: value ?? 1
  };
}

// class OtelCounter<Labels extends LabelsGeneric = NoLabels> implements Counter<Labels> {
//   private counter;

//   constructor(
//     meter: Meter,
//     name: string, // Metrics must be registered in the aztec labels registry
//     help: string,
//     labelNames: Array<keyof Labels> = []
//   ) {
//     // TODO: be more strict on metrics name types
//     this.counter = meter.createUpDownCounter(name as Metrics, {
//       description: help,
//       unit: '1',
//     });
//   }

//   inc(labels?: Labels, value: number = 1): void {
//     this.counter.add(value, labels);
//   }

//   reset(): void {
//     // OpenTelemetry counters cannot be reset, but we implement the interface
//     console.warn('OpenTelemetry counters cannot be reset');
//   }
// }