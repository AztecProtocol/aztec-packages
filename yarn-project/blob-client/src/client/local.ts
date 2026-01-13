import type { Blob } from '@aztec/blob-lib';

import type { BlobStore } from '../blobstore/index.js';
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
    await this.blobStore.addBlobs(blobs);
    return true;
  }

  public getBlobSidecar(_blockId: string, blobHashes: Buffer[], _opts?: GetBlobSidecarOptions): Promise<Blob[]> {
    return this.blobStore.getBlobsByHashes(blobHashes);
  }

  /** Returns true if this client can upload blobs. Always true for local client. */
  public canUpload(): boolean {
    return true;
  }
}
