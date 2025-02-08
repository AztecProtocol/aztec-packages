import { type EventLoopUtilization, type IntervalHistogram, monitorEventLoopDelay, performance } from 'node:perf_hooks';

import { NODEJS_EVENT_LOOP_STATE } from './attributes.js';
import * as Metrics from './metrics.js';
import {
  type BatchObservableResult,
  type Meter,
  type ObservableGauge,
  type UpDownCounter,
  ValueType,
} from './telemetry.js';

/**
 * Detector for custom Aztec attributes
 */
export class EventLoopMonitor {
  private eventLoopDelayGauges: {
    min: ObservableGauge;
    max: ObservableGauge;
    mean: ObservableGauge;
    stddev: ObservableGauge;
    p50: ObservableGauge;
    p90: ObservableGauge;
    p99: ObservableGauge;
  };

  private eventLoopUilization: ObservableGauge;
  private eventLoopTime: UpDownCounter;

  private started = false;

  private lastELU: EventLoopUtilization | undefined;
  private eventLoopDelay: IntervalHistogram;

  constructor(private meter: Meter) {
    const nsObsGauge = (name: (typeof Metrics)[keyof typeof Metrics], description: string) =>
      meter.createObservableGauge(name, {
        unit: 'ns',
        valueType: ValueType.INT,
        description,
      });

    this.eventLoopDelayGauges = {
      min: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_MIN, 'Minimum delay of the event loop'),
      mean: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_MEAN, 'Mean delay of the event loop'),
      max: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_MAX, 'Max delay of the event loop'),
      stddev: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_STDDEV, 'Stddev delay of the event loop'),
      p50: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_P50, 'P50 delay of the event loop'),
      p90: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_P90, 'P90 delay of the event loop'),
      p99: nsObsGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_P99, 'P99 delay of the event loop'),
    };

    this.eventLoopUilization = meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_UTILIZATION, {
      valueType: ValueType.DOUBLE,
      description: 'How busy is the event loop',
    });

    this.eventLoopTime = meter.createUpDownCounter(Metrics.NODEJS_EVENT_LOOP_TIME, {
      unit: 'ms',
      valueType: ValueType.INT,
      description: 'How much time the event loop has spent in a given state',
    });

    this.eventLoopDelay = monitorEventLoopDelay();
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.lastELU = performance.eventLoopUtilization();
    this.eventLoopDelay.enable();
    this.meter.addBatchObservableCallback(this.measure, [
      this.eventLoopUilization,
      ...Object.values(this.eventLoopDelayGauges),
    ]);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.meter.removeBatchObservableCallback(this.measure, [
      this.eventLoopUilization,
      ...Object.values(this.eventLoopDelayGauges),
    ]);
    this.eventLoopDelay.disable();
    this.eventLoopDelay.reset();
    this.lastELU = undefined;
  }

  private measure = (obs: BatchObservableResult): void => {
    const newELU = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(newELU, this.lastELU);
    this.lastELU = newELU;

    // `utilization` [0,1] represents how much the event loop is busy vs waiting for new events to come in
    // This should be corelated with CPU usage to gauge the performance characteristics of services
    // 100% utilization leads to high latency because the event loop is _always_ busy, there's no breathing room for events to be processed quickly.
    // Docs and examples:
    // - https://nodesource.com/blog/event-loop-utilization-nodejs
    // - https://youtu.be/WetXnEPraYM
    obs.observe(this.eventLoopUilization, delta.utilization);

    this.eventLoopTime.add(Math.floor(delta.idle), { [NODEJS_EVENT_LOOP_STATE]: 'idle' });
    this.eventLoopTime.add(Math.floor(delta.active), { [NODEJS_EVENT_LOOP_STATE]: 'active' });

    obs.observe(this.eventLoopDelayGauges.min, Math.floor(this.eventLoopDelay.min));
    obs.observe(this.eventLoopDelayGauges.mean, Math.floor(this.eventLoopDelay.mean));
    obs.observe(this.eventLoopDelayGauges.max, Math.floor(this.eventLoopDelay.max));
    obs.observe(this.eventLoopDelayGauges.stddev, Math.floor(this.eventLoopDelay.stddev));
    obs.observe(this.eventLoopDelayGauges.p50, Math.floor(this.eventLoopDelay.percentile(50)));
    obs.observe(this.eventLoopDelayGauges.p90, Math.floor(this.eventLoopDelay.percentile(90)));
    obs.observe(this.eventLoopDelayGauges.p99, Math.floor(this.eventLoopDelay.percentile(99)));

    this.eventLoopDelay.reset();
  };
}
