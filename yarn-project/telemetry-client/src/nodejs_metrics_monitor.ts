import type { Observable } from '@opentelemetry/api';
import { type EventLoopUtilization, type IntervalHistogram, monitorEventLoopDelay, performance } from 'node:perf_hooks';

import * as Attributes from './attributes.js';
import { createUpDownCounterWithDefault } from './metric-utils.js';
import * as Metrics from './metrics.js';
import type { BatchObservableResult, Meter, ObservableGauge, UpDownCounter } from './telemetry.js';

/** Monitors Node.js runtime metrics */
export class NodejsMetricsMonitor {
  private eventLoopDelayGauges: {
    min: ObservableGauge;
    max: ObservableGauge;
    mean: ObservableGauge;
    stddev: ObservableGauge;
    p50: ObservableGauge;
    p90: ObservableGauge;
    p99: ObservableGauge;
  };

  // skip `rss` because that's already tracked by @opentelemetry/host-metrics
  // description of each field here https://nodejs.org/api/process.html#processmemoryusage
  private memoryGauges: Record<Exclude<keyof NodeJS.MemoryUsage, 'rss'>, ObservableGauge>;

  private eventLoopUilization: ObservableGauge;
  private eventLoopTime: UpDownCounter;

  private started = false;

  private lastELU: EventLoopUtilization | undefined;
  private eventLoopDelay: IntervalHistogram;

  constructor(private meter: Meter) {
    this.eventLoopDelayGauges = {
      min: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_MIN),
      mean: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_MEAN),
      max: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_MAX),
      stddev: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_STDDEV),
      p50: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_P50),
      p90: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_P90),
      p99: meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_DELAY_P99),
    };

    this.eventLoopUilization = meter.createObservableGauge(Metrics.NODEJS_EVENT_LOOP_UTILIZATION);
    this.eventLoopTime = createUpDownCounterWithDefault(meter, Metrics.NODEJS_EVENT_LOOP_TIME, {
      [Attributes.NODEJS_EVENT_LOOP_STATE]: ['idle', 'active'],
    });
    this.eventLoopDelay = monitorEventLoopDelay();

    this.memoryGauges = {
      heapUsed: meter.createObservableGauge(Metrics.NODEJS_MEMORY_HEAP_USAGE),
      heapTotal: meter.createObservableGauge(Metrics.NODEJS_MEMORY_HEAP_TOTAL),
      arrayBuffers: meter.createObservableGauge(Metrics.NODEJS_MEMORY_BUFFER_USAGE),
      external: meter.createObservableGauge(Metrics.NODEJS_MEMORY_NATIVE_USAGE),
    };
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
      ...Object.values(this.memoryGauges),
    ]);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.meter.removeBatchObservableCallback(this.measure, [
      this.eventLoopUilization,
      ...Object.values(this.eventLoopDelayGauges),
      ...Object.values(this.memoryGauges),
    ]);
    this.eventLoopDelay.disable();
    this.eventLoopDelay.reset();
    this.lastELU = undefined;
  }

  private measure = (obs: BatchObservableResult): void => {
    this.measureMemoryUsage(obs);
    this.measureEventLoopDelay(obs);
  };

  private measureMemoryUsage = (observer: BatchObservableResult) => {
    const mem = process.memoryUsage();

    observer.observe(this.memoryGauges.heapUsed, mem.heapUsed);
    observer.observe(this.memoryGauges.heapTotal, mem.heapTotal);
    observer.observe(this.memoryGauges.arrayBuffers, mem.arrayBuffers);
    observer.observe(this.memoryGauges.external, mem.external);
  };

  private measureEventLoopDelay = (obs: BatchObservableResult): void => {
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

    this.eventLoopTime.add(Math.trunc(delta.idle), { [Attributes.NODEJS_EVENT_LOOP_STATE]: 'idle' });
    this.eventLoopTime.add(Math.trunc(delta.active), { [Attributes.NODEJS_EVENT_LOOP_STATE]: 'active' });

    safeObserveInt(obs, this.eventLoopDelayGauges.min, this.eventLoopDelay.min);
    safeObserveInt(obs, this.eventLoopDelayGauges.mean, this.eventLoopDelay.mean);
    safeObserveInt(obs, this.eventLoopDelayGauges.max, this.eventLoopDelay.max);
    safeObserveInt(obs, this.eventLoopDelayGauges.stddev, this.eventLoopDelay.stddev);
    safeObserveInt(obs, this.eventLoopDelayGauges.p50, this.eventLoopDelay.percentile(50));
    safeObserveInt(obs, this.eventLoopDelayGauges.p90, this.eventLoopDelay.percentile(90));
    safeObserveInt(obs, this.eventLoopDelayGauges.p99, this.eventLoopDelay.percentile(99));

    this.eventLoopDelay.reset();
  };
}

function safeObserveInt(observer: BatchObservableResult, metric: Observable, value: number, attrs?: object) {
  // discard NaN, Infinity, -Infinity
  if (!Number.isFinite(value)) {
    return;
  }

  observer.observe(metric, Math.trunc(value), attrs);
}
