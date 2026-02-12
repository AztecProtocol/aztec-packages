import { type Gauge, type Histogram, Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

/** Instrumentation for the TxFileStore service. */
export class TxFileStoreInstrumentation {
  private uploadsSuccess: UpDownCounter;
  private uploadsFailed: UpDownCounter;
  private uploadsSkipped: UpDownCounter;
  private uploadDuration: Histogram;
  private queueSize: Gauge;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);
    this.uploadsSuccess = meter.createUpDownCounter(Metrics.TX_FILE_STORE_UPLOADS_SUCCESS);
    this.uploadsFailed = meter.createUpDownCounter(Metrics.TX_FILE_STORE_UPLOADS_FAILED);
    this.uploadsSkipped = meter.createUpDownCounter(Metrics.TX_FILE_STORE_UPLOADS_SKIPPED);
    this.uploadDuration = meter.createHistogram(Metrics.TX_FILE_STORE_UPLOAD_DURATION);
    this.queueSize = meter.createGauge(Metrics.TX_FILE_STORE_QUEUE_SIZE);
  }

  recordUploadSuccess(durationMs: number) {
    this.uploadsSuccess.add(1);
    this.uploadDuration.record(durationMs);
  }

  recordUploadFailed() {
    this.uploadsFailed.add(1);
  }

  recordUploadSkipped() {
    this.uploadsSkipped.add(1);
  }

  recordQueueSize(size: number) {
    this.queueSize.record(size);
  }
}
