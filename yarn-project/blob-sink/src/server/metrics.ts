import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import type { BlobWithIndex } from '../types/blob_with_index.js';

export class BlobSinkMetrics {
  private storeBlobRequests: UpDownCounter;
  private getBlobRequests: UpDownCounter;

  /** The number of blobs in the blob store */
  private objectsInBlobStore: UpDownCounter;

  /** Tracks blob size */
  private blobSize: Histogram;

  constructor(telemetry: TelemetryClient) {
    const name = 'BlobSink';
    const meter = telemetry.getMeter(name);
    this.objectsInBlobStore = meter.createUpDownCounter(Metrics.BLOB_SINK_OBJECTS_IN_BLOB_STORE, {
      description: 'The current number of blobs in the blob store',
      valueType: ValueType.INT,
    });

    this.blobSize = meter.createHistogram(Metrics.BLOB_SINK_BLOB_SIZE, {
      description: 'The non zero size of blobs in the blob store',
      valueType: ValueType.INT,
    });

    this.storeBlobRequests = meter.createUpDownCounter(Metrics.BLOB_SINK_STORE_REQUESTS, {
      description: 'The count of requests to store blobs',
      valueType: ValueType.INT,
    });

    this.getBlobRequests = meter.createUpDownCounter(Metrics.BLOB_SINK_RETRIEVE_REQUESTS, {
      description: 'The count of requests to retrieve blobs',
      valueType: ValueType.INT,
    });
  }

  public recordBlobReceipt(blobs: BlobWithIndex[]) {
    this.objectsInBlobStore.add(blobs.length);
    blobs.forEach(b => this.blobSize.record(b.blob.getSize()));
  }

  incStoreBlob(success: boolean) {
    this.storeBlobRequests.add(1, {
      [Attributes.OK]: success,
    });
  }

  incGetBlob(success: boolean) {
    this.getBlobRequests.add(1, {
      [Attributes.OK]: success,
    });
  }
}
