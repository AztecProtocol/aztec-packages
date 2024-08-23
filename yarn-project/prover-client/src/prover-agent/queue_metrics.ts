import { ProvingRequestType } from '@aztec/circuit-types';
import { type Timer } from '@aztec/foundation/timer';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  millisecondBuckets,
} from '@aztec/telemetry-client';

export class ProvingQueueMetrics {
  private jobSize: Histogram;
  private queueSize: Gauge;
  private queueAccess: Histogram;

  constructor(client: TelemetryClient, name = 'ProvingQueueMetrics') {
    const meter = client.getMeter(name);
    this.jobSize = meter.createHistogram(Metrics.PROVING_QUEUE_JOB_SIZE, {
      description: 'Size of proving job',
      unit: 'by',
    });

    this.queueSize = meter.createGauge(Metrics.PROVING_QUEUE_SIZE, {
      description: 'Size of proving queue',
    });

    this.queueAccess = meter.createHistogram('aztec.proving_queue.access_duration' as any, {
      description: 'Access time of proving queue',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: millisecondBuckets(1),
      },
    });
  }

  recordNewJob(type: ProvingRequestType, size: number) {
    this.jobSize.record(size, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[type],
    });
  }

  recordQueueSize(size: number) {
    this.queueSize.record(size);
  }

  recordQueueAccess(timerOrMs: Timer | number) {
    const ms = Math.ceil(typeof timerOrMs === 'number' ? timerOrMs : timerOrMs.ms());
    this.queueAccess.record(ms);
  }
}
