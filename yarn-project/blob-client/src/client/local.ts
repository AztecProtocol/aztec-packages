import type { Blob } from '@aztec/blob-lib';

import type { BlobStore } from '../blobstore/index.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import type { BlobClientInterface, GetBlobSidecarOptions } from './interface.js';

export class LocalBlobClient implements BlobClientInterface {
  private readonly blobStore: BlobStore;

  constructor(blobStore: BlobStore) {
    this.blobStore = blobStore;
  }

  public testSources(): Promise<void> {
    return Promise.resolve();
  }

  public async sendBlobsToFilestore(blobs: Blob[]): Promise<boolean> {
    const blobsWithIndex = blobs.map((blob, index) => new BlobWithIndex(blob, index));
    await this.blobStore.addBlobs(blobsWithIndex);
    return true;
  }

  public getBlobSidecar(
    _blockId: string,
    blobHashes: Buffer[],
    _indices?: number[],
    _opts?: GetBlobSidecarOptions,
  ): Promise<BlobWithIndex[]> {
    return this.blobStore.getBlobsByHashes(blobHashes);
  }
}
