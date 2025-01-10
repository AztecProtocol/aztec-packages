import { Blob } from '@aztec/foundation/blob';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { type BlobSinkClientInterface } from './interface.js';

export class HttpBlobSinkClient implements BlobSinkClientInterface {
  private readonly log: Logger;

  constructor(private readonly blobSinkUrl: string) {
    this.log = createLogger('aztec:blob-sink-client');
  }

  public async sendBlobsToBlobSink(blockHash: string, blobs: Blob[]): Promise<boolean> {
    // TODO(md): for now we are assuming the indexes of the blobs will be 0, 1, 2
    // When in reality they will not, but for testing purposes this is fine
    if (!this.blobSinkUrl) {
      this.log.verbose('No blob sink url configured');
      return false;
    }

    this.log.verbose(`Sending ${blobs.length} blobs to blob sink`);
    try {
      const res = await fetch(`${this.blobSinkUrl}/blob_sidecar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // eslint-disable-next-line camelcase
          block_id: blockHash,
          blobs: blobs.map((b, i) => ({ blob: b.toBuffer(), index: i })),
        }),
      });

      if (res.ok) {
        return true;
      }

      this.log.error('Failed to send blobs to blob sink', res.status);
      return false;
    } catch (err) {
      this.log.error(`Error sending blobs to blob sink`, err);
      return false;
    }
  }

  public async getBlobSidecar(blockHash: string, indices?: number[]): Promise<Blob[]> {
    if (!this.blobSinkUrl) {
      this.log.verbose('No blob sink url configured');
      return [];
    }

    try {
      let url = `${this.blobSinkUrl}/eth/v1/beacon/blob_sidecars/${blockHash}`;
      if (indices && indices.length > 0) {
        url += `?indices=${indices.join(',')}`;
      }

      const res = await fetch(url);

      if (res.ok) {
        const body = await res.json();
        const blobs = body.data.map((b: { blob: string; index: number }) =>
          Blob.fromBuffer(Buffer.from(b.blob, 'hex')),
        );
        return blobs;
      }

      this.log.error('Failed to get blob sidecar', res.status);
      return [];
    } catch (err) {
      this.log.error(`Error getting blob sidecar`, err);
      return [];
    }
  }
}
