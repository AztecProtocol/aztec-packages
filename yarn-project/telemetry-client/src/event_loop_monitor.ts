import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';

import { EVENT_LOOP_LAG } from './metrics.js';
import { type Meter, type ObservableGauge, type ObservableResult, ValueType } from './telemetry.js';

/**
 * Detector for custom Aztec attributes
 */
export class EventLoopMonitor {
  private eventLoopLag: ObservableGauge;
  private started = false;

  constructor(meter: Meter) {
    this.eventLoopLag = meter.createObservableGauge(EVENT_LOOP_LAG, {
      unit: 'us',
      valueType: ValueType.INT,
      description: 'How busy is the event loop',
    });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.eventLoopLag.addCallback(this.measureLag);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.eventLoopLag.removeCallback(this.measureLag);
  }

  private measureLag = async (obs: ObservableResult): Promise<void> => {
    const timer = new Timer();
    const { promise, resolve } = promiseWithResolvers<number>();
    // how long does it take to schedule the next macro task?
    // if this number spikes then we're (1) either blocking the event loop with long running sync code
    // or (2) spamming the event loop with micro tasks
    setImmediate(() => {
      resolve(timer.us());
    });

    const lag = await promise;
    obs.observe(Math.floor(lag));
  };
}
