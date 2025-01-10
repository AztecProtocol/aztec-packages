import { type EventLoopUtilization, IntervalHistogram, monitorEventLoopDelay, performance } from 'node:perf_hooks';

import { EVENT_LOOP_LAG, EVENT_LOOP_LAG_MAX, EVENT_LOOP_UTILIZATION } from './metrics.js';
import { type BatchObservableResult, type Meter, type ObservableGauge, ValueType } from './telemetry.js';

/**
 * Detector for custom Aztec attributes
 */
export class EventLoopMonitor {
  private eventLoopLag: ObservableGauge;
  private eventLoopLagMax: ObservableGauge;
  private eventLoopUilization: ObservableGauge;
  private started = false;

  private lastELU: EventLoopUtilization | undefined;
  private eventLoopDelay: IntervalHistogram;

  constructor(private meter: Meter) {
    this.eventLoopLag = meter.createObservableGauge(EVENT_LOOP_LAG, {
      unit: 'ns',
      valueType: ValueType.INT,
      description: 'Mean event loop delay',
    });
    this.eventLoopLagMax = meter.createObservableGauge(EVENT_LOOP_LAG_MAX, {
      unit: 'ns',
      valueType: ValueType.INT,
      description: 'Max event loop delay',
    });
    this.eventLoopUilization = meter.createObservableGauge(EVENT_LOOP_UTILIZATION, {
      valueType: ValueType.DOUBLE,
      description: 'How busy is the event loop',
    });
    this.eventLoopDelay = monitorEventLoopDelay();
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.lastELU = performance.eventLoopUtilization();
    this.meter.addBatchObservableCallback(this.measure, [
      this.eventLoopUilization,
      this.eventLoopLag,
      this.eventLoopLagMax,
    ]);
    this.eventLoopDelay.enable();
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.meter.removeBatchObservableCallback(this.measure, [
      this.eventLoopUilization,
      this.eventLoopLag,
      this.eventLoopLagMax,
    ]);
    this.eventLoopDelay.disable();
    this.eventLoopDelay.reset();
  }

  private measure = async (obs: BatchObservableResult): Promise<void> => {
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

    obs.observe(this.eventLoopLag, Math.floor(this.eventLoopDelay.mean));
    obs.observe(this.eventLoopLagMax, Math.floor(this.eventLoopDelay.max));
    this.eventLoopDelay.reset();
  };
}
