import type { Blob } from '@aztec/blob-lib';

import type { BlobStore } from '../blobstore/index.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import type { BlobSinkClientInterface } from './interface.js';

export class LocalBlobSinkClient implements BlobSinkClientInterface {
  private readonly blobStore: BlobStore;

  constructor(blobStore: BlobStore) {
    this.blobStore = blobStore;
  }

  public testSources(): Promise<void> {
    return Promise.resolve();
  }

  public async sendBlobsToBlobSink(blockId: string, blobs: Blob[]): Promise<boolean> {
    await this.blobStore.addBlobSidecars(
      blockId,
      blobs.map((blob, index) => new BlobWithIndex(blob, index)),
    );
    return true;
  }

  public async getBlobSidecar(blockId: string, blobHashes: Buffer[], indices?: number[]): Promise<BlobWithIndex[]> {
    const blobSidecars = await this.blobStore.getBlobSidecars(blockId, indices);
    if (!blobSidecars) {
      return [];
    }
    return blobSidecars.filter(blob => {
      const blobHash = blob.blob.getEthVersionedBlobHash();
      return blobHashes.some(hash => hash.equals(blobHash));
    });
  }
}
