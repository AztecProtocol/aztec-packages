import { type Blob } from '@aztec/foundation/blob';

import { type BlobStore } from '../blobstore/index.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import { type BlobSinkClientInterface } from './interface.js';

export class LocalBlobSinkClient implements BlobSinkClientInterface {
  private readonly blobStore: BlobStore;

  constructor(blobStore: BlobStore) {
    this.blobStore = blobStore;
  }

  public async sendBlobsToBlobSink(blockId: string, blobs: Blob[]): Promise<boolean> {
    await this.blobStore.addBlobSidecars(
      blockId,
      blobs.map((blob, index) => new BlobWithIndex(blob, index)),
    );
    return true;
  }

  public async getBlobSidecar(blockId: string, indices?: number[]): Promise<Blob[]> {
    const blobSidecars = await this.blobStore.getBlobSidecars(blockId, indices);
    if (!blobSidecars) {
      return [];
    }
    return blobSidecars.map(blob => blob.blob);
  }
}
