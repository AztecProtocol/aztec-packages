import {
  Attributes,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

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
    const requestAttrs = {
      [Attributes.HTTP_RESPONSE_STATUS_CODE]: [200, 404],
      [Attributes.HTTP_REQUEST_HOST]: [httpHost],
    };
    this.blockRequestCounter = createUpDownCounterWithDefault(
      meter,
      Metrics.BLOB_SINK_ARCHIVE_BLOCK_REQUEST_COUNT,
      requestAttrs,
    );

    this.blobRequestCounter = createUpDownCounterWithDefault(
      meter,
      Metrics.BLOB_SINK_ARCHIVE_BLOB_REQUEST_COUNT,
      requestAttrs,
    );

    this.retrievedBlobs = createUpDownCounterWithDefault(meter, Metrics.BLOB_SINK_ARCHIVE_BLOB_COUNT);
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
