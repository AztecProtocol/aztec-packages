import { ProvingRequestType } from '@aztec/circuit-types';
import { Attributes, type Histogram, Metrics, type TelemetryClient } from '@aztec/telemetry-client';

export class ProvingQueueMetrics {
  private jobSize: Histogram;

  constructor(client: TelemetryClient, name = 'ProvingQueueMetrics') {
    const meter = client.getMeter(name);
    this.jobSize = meter.createHistogram(Metrics.PROVING_QUEUE_JOB_SIZE, {
      description: 'Size of proving job',
      unit: 'by',
    });
  }

  recordNewJob(type: ProvingRequestType, size: number) {
    this.jobSize.record(size, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[type],
    });
  }
}
