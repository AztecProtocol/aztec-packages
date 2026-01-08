import { Attributes, Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

export class BlobArchiveClientInstrumentation {
  private blockRequestCounter: UpDownCounter;
  private blobRequestCounter: UpDownCounter;
  private retrievedBlobs: UpDownCounter;

  constructor(
    client: TelemetryClient,
    private httpHost: string,
    name: string,
  ) {
    const meter = client.getMeter(name);
    this.blockRequestCounter = meter.createUpDownCounter(Metrics.BLOB_SINK_ARCHIVE_BLOCK_REQUEST_COUNT);

    this.blobRequestCounter = meter.createUpDownCounter(Metrics.BLOB_SINK_ARCHIVE_BLOB_REQUEST_COUNT);

    this.retrievedBlobs = meter.createUpDownCounter(Metrics.BLOB_SINK_ARCHIVE_BLOB_COUNT);
  }

  incRequest(type: 'blocks' | 'blobs', status: number) {
    const counter = type === 'blocks' ? this.blockRequestCounter : this.blobRequestCounter;
    counter.add(1, {
      [Attributes.HTTP_RESPONSE_STATUS_CODE]: status,
      [Attributes.HTTP_REQUEST_HOST]: this.httpHost,
    });
  }

  incRetrievedBlobs(count: number) {
    this.retrievedBlobs.add(count);
  }
}
