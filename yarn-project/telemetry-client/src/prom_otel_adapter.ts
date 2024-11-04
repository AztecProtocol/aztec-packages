import { Meter, Metrics, TelemetryClient, ObservableGauge, Attributes } from "./telemetry.js";

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
interface CollectFn<Labels extends LabelsGeneric> { (metric: Gauge<Labels>): void }

interface Gauge<Labels extends LabelsGeneric = NoLabels> {
  inc: NoLabels extends Labels ? (value?: number) => void : (labels: Labels, value?: number) => void
  set: NoLabels extends Labels ? (value: number) => void : (labels: Labels, value: number) => void

  collect?(): void
  addCollect(collectFn: CollectFn<Labels>): void
}

interface Histogram<Labels extends LabelsGeneric = NoLabels> {
  startTimer(): () => void

  observe: NoLabels extends Labels ? (value: number) => void : (labels: Labels, value: number) => void

  reset(): void
}

interface AvgMinMax<Labels extends LabelsGeneric = NoLabels> {
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
  gauge<Labels extends LabelsGeneric = NoLabels>(config: GaugeConfig<Labels>): Gauge<Labels>
  histogram<Labels extends LabelsGeneric = NoLabels>(config: HistogramConfig<Labels>): Histogram<Labels>
  avgMinMax<Labels extends LabelsGeneric = NoLabels>(config: AvgMinMaxConfig<Labels>): AvgMinMax<Labels>
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

class OtelGauge<Labels extends LabelsGeneric = NoLabels> implements Gauge<Labels> {
  private gauge: ObservableGauge;
  private currentValue: number = 0;
  private collectCallback?: () => void;

  constructor(
    meter: Meter,
    // TODO: be more strict on metrics name types
    name: string,
    help: string,
    attributes: Array<keyof Labels> = []
  ) {
    this.gauge = meter.createObservableGauge(name as Metrics, {
      description: help
    });

    // Register callback for the observable gauge
    this.gauge.addCallback((result) => {
      if (this.collectCallback) {
        this.collectCallback();
      }
      // TODO: fix labels
      result.observe(this.currentValue);
    });
  }

  inc(value?: number): void;
  inc(labels: Labels, value?: number): void;
  inc(labelsOrValue?: Labels | number, value?: number): void {
    const { labels, value: actualValue } = getLabelAndValue(labelsOrValue, value);
    const typedValue = actualValue as number;

    this.currentValue += typedValue;
  }

  dec(labels?: Labels): void {
    this.currentValue -= 1;
  }

  // In prom, set is for an observable value??
  set(value: number): void;
  set(labels: Labels, value: number): void;
  // Implementation
  set(labelsOrValue: Labels | number, value?: number): void {
    if (typeof labelsOrValue === 'number') {
      // Case: set(value)
      this.currentValue = labelsOrValue;
    } else {
      // Case: set(labels, value)
      if (value === undefined) {
        throw new Error('Value must be provided when using labels');
      }
      this.currentValue = value;
    }
  }

  setToCurrentTime(labels?: Labels): void {
    this.set(labels || {} as Labels, Date.now());
  }

  startTimer(labels?: Labels): (labels?: Labels) => void {
    const start = Date.now();
    return (endLabels?: Labels) => {
      const duration = Date.now() - start;
      this.set(endLabels || labels || {} as Labels, duration);
    };
  }

  reset(): void {
    this.currentValue = 0;
  }

  set collect(callback: () => void) {
    this.collectCallback = callback;
  }

  // TODO: implement
  addCollect(): void {}
}


class OtelHistogram<Labels extends LabelsGeneric = NoLabels> implements Histogram<Labels> {
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


class OtelAvgMinMax<Labels extends LabelsGeneric = NoLabels> implements AvgMinMax<Labels> {
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
  ): Gauge<Labels> {
    return new OtelGauge<Labels>(
      this.meter,
      configuration.name as Metrics,
      configuration.help,
      configuration.labelNames
    );
  }

  histogram<Labels extends LabelsGeneric = NoLabels>(
    configuration: HistogramConfig<Labels>
  ): Histogram<Labels> {
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
  ): AvgMinMax<Labels> {
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

function getLabelAndValue<Labels extends LabelsGeneric>(valueOrLabels?: number | number[]| Labels, value?: number | number[]): { labels: Labels | undefined, value: number | number[] } {
  let labels: Labels | undefined;
  let actualValue: number | number[];
  if (typeof valueOrLabels === 'number') {
    actualValue = valueOrLabels;
    // it is an array
  } else if (typeof valueOrLabels === 'object') {
    actualValue = valueOrLabels as number[];
  } else if (valueOrLabels !== undefined) {
    labels = valueOrLabels;
    actualValue = value ?? 1;
  } else {
    actualValue = 1;
  }
  return { labels, value: actualValue };
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