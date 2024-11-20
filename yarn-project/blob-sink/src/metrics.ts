import { type Histogram, Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

import { type BlobWithIndex } from './types/blob_with_index.js';

export class BlobSinkMetrics {
  /** The number of blobs in the blob store */
  private objectsInBlobStore: UpDownCounter;

  /** Tracks blob size */
  private blobSize: Histogram;

  constructor(telemetry: TelemetryClient) {
    const name = 'BlobSink';
    this.objectsInBlobStore = telemetry.getMeter(name).createUpDownCounter(Metrics.BLOB_SINK_OBJECTS_IN_BLOB_STORE, {
      description: 'The current number of blobs in the blob store',
    });

    this.blobSize = telemetry.getMeter(name).createHistogram(Metrics.BLOB_SINK_BLOB_SIZE, {
      description: 'The size of blobs in the blob store',
    });
  }

  public recordBlobReciept(blobs: BlobWithIndex[]) {
    this.objectsInBlobStore.add(blobs.length);
    blobs.forEach(b => this.blobSize.record(b.blob.getSize()));
  }
}
