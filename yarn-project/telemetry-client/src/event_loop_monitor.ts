import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';

import { type EventLoopUtilization, performance } from 'node:perf_hooks';

import { EVENT_LOOP_LAG, EVENT_LOOP_UTILIZATION } from './metrics.js';
import { type BatchObservableResult, type Meter, type ObservableGauge, ValueType } from './telemetry.js';

/**
 * Detector for custom Aztec attributes
 */
export class EventLoopMonitor {
  private eventLoopLag: ObservableGauge;
  private eventLoopUilization: ObservableGauge;
  private started = false;

  private lastELU: EventLoopUtilization | undefined;

  constructor(private meter: Meter) {
    this.eventLoopLag = meter.createObservableGauge(EVENT_LOOP_LAG, {
      unit: 'us',
      valueType: ValueType.INT,
      description: 'Latency to execute a macro task',
    });
    this.eventLoopUilization = meter.createObservableGauge(EVENT_LOOP_UTILIZATION, {
      valueType: ValueType.DOUBLE,
      description: 'How busy is the event loop',
    });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.lastELU = performance.eventLoopUtilization();
    this.meter.addBatchObservableCallback(this.measureLag, [this.eventLoopUilization, this.eventLoopLag]);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.meter.removeBatchObservableCallback(this.measureLag, [this.eventLoopUilization, this.eventLoopLag]);
  }

  private measureLag = async (obs: BatchObservableResult): Promise<void> => {
    const newELU = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(newELU, this.lastELU);
    this.lastELU = newELU;

    const timer = new Timer();
    const { promise, resolve } = promiseWithResolvers<number>();
    // how long does it take to schedule the next macro task?
    // if this number spikes then we're (1) either blocking the event loop with long running sync code
    // or (2) spamming the event loop with micro tasks
    setImmediate(() => {
      resolve(timer.us());
    });

    const lag = await promise;
    obs.observe(this.eventLoopLag, Math.floor(lag));
    obs.observe(this.eventLoopUilization, delta.utilization);
  };
}
