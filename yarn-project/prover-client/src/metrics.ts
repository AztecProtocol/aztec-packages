import { type Timer } from '@aztec/foundation/timer';
import {
  type Gauge,
  type Histogram,
  type Meter,
  type Metrics,
  type TelemetryClient,
  type UpDownCounter,
  millisecondBuckets,
} from '@aztec/telemetry-client';

export class ProverClientMetrics {
  private histograms = new Map<string, Histogram>();
  private gauges = new Map<string, Gauge>();
  private counters = new Map<string, UpDownCounter>();
  private meter: Meter;

  constructor(client: TelemetryClient, name: string) {
    this.meter = client.getMeter(name);
  }

  recordHistogram(name: string, timerOrMs: Timer | number) {
    const ms = Math.ceil(typeof timerOrMs === 'number' ? timerOrMs : timerOrMs.ms());
    this.getHistogram(name).record(ms);
  }

  recordGauge(name: string, value: number, attributes: Record<string, string | undefined | null> = {}) {
    this.getGauge(name).record(value, attributes as any);
  }

  recordCounter(name: string, delta: number, attributes: Record<string, string | undefined | null> = {}) {
    this.getCounter(name).add(delta, attributes as any);
  }

  private getCounter(name: string): UpDownCounter {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = this.meter.createUpDownCounter(name as unknown as Metrics);
      this.counters.set(name, counter);
    }

    return counter;
  }

  private getGauge(name: string): Gauge {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = this.meter.createGauge(name as unknown as Metrics);
      this.gauges.set(name, gauge);
    }

    return gauge;
  }

  private getHistogram(name: string): Histogram {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = this.meter.createHistogram(name as unknown as Metrics, {
        advice: {
          explicitBucketBoundaries: millisecondBuckets(1),
        },
      });
      this.histograms.set(name, histogram);
    }

    return histogram;
  }
}
