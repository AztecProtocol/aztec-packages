import { type MeterProvider } from "@opentelemetry/sdk-metrics";
import { TelemetryClient } from "./telemetry.js";

import { Registry } from "prom-client";


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
export class OtelMetricsAdapter extends Registry implements MetricsRegister {
    private readonly meter: any;

    constructor(telemetryClient: TelemetryClient) {
        super();
        this.meter = telemetryClient.getMeter('gossipsub');
    }

    gauge<Labels extends LabelsGeneric = NoLabels>(config: GaugeConfig<Labels>): Gauge<Labels> {
        const otelGauge = this.meter.createGauge(config.name, config.help);

        return {
            inc: ((labels?: Labels, value = 1) => {
              if (labels) {
                otelGauge.add(value, labels);
              } else {
                otelGauge.add(value);
              }
            }) as any,

            set: ((labels: Labels, value: number) => {
              if (labels) {
                otelGauge.set(value, labels);
              } else {
                otelGauge.set(value);
              }
            }) as any,


            // TOOD: deal with this part
            addCollect: (_collectFn: (metric: Gauge<Labels>) => void) => {
                // OpenTelemetry handles collection internally
            },
        }
    }

    histogram<Labels extends LabelsGeneric = NoLabels>(config: HistogramConfig<Labels>): Histogram<Labels> {
        const otelHistogram = this.meter.createHistogram(config.name, {
          description: config.help,
          unit: '1',
          boundaries: config.buckets,
        });

        return {
          observe: ((labels: Labels, value: number) => {
            if (labels) {
              otelHistogram.record(value, labels);
            } else {
              otelHistogram.record(value);
            }
          }) as any,

          startTimer: () => {
            const startTime = performance.now();
            return () => {
              const duration = performance.now() - startTime;
              otelHistogram.record(duration);
            };
          },

          reset: () => {
            // OpenTelemetry histograms are immutable, reset not needed
          },
        };
      }

      avgMinMax<Labels extends LabelsGeneric = NoLabels>(config: AvgMinMaxConfig<Labels>): AvgMinMax<Labels> {
        // Create a single gauge with additional attributes for min/max/avg
        const otelGauge = this.meter.createGauge(config.name, {
          description: config.help,
          unit: '1',
        });

        return {
          set: ((labels: Labels, values: number[]) => {
            if (values.length > 0) {
              const avg = values.reduce((a, b) => a + b) / values.length;
              const min = Math.min(...values);
              const max = Math.max(...values);

              const attributes = {
                ...(labels as object),
                type: 'avg',
              };

              if (labels) {
                otelGauge.set(avg, { ...attributes, type: 'avg' });
                otelGauge.set(min, { ...attributes, type: 'min' });
                otelGauge.set(max, { ...attributes, type: 'max' });
              } else {
                otelGauge.set(avg, { type: 'avg' });
                otelGauge.set(min, { type: 'min' });
                otelGauge.set(max, { type: 'max' });
              }
            }
          }) as any,
        };
      }

    //   static<Labels extends LabelsGeneric = NoLabels>(meter: Meter, config: GaugeConfig<Labels>): void {

}