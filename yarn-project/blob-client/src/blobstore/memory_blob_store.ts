import { Blob } from '@aztec/blob-lib';
import { bufferToHex } from '@aztec/foundation/string';

import type { BlobStore } from './interface.js';

export class MemoryBlobStore implements BlobStore {
  private blobs: Map<string, Buffer> = new Map();

  public getBlobsByHashes(blobHashes: Buffer[]): Promise<Blob[]> {
    const results: Blob[] = [];

    for (const blobHash of blobHashes) {
      const key = bufferToHex(blobHash);
      const blobBuffer = this.blobs.get(key);
      if (blobBuffer) {
        results.push(Blob.fromBuffer(blobBuffer));
      }
    }

    return Promise.resolve(results);
  }

  public addBlobs(blobs: Blob[]): Promise<void> {
    for (const blob of blobs) {
      const blobHash = blob.getEthVersionedBlobHash();
      const key = bufferToHex(blobHash);
      this.blobs.set(key, blob.toBuffer());
    }
    return Promise.resolve();
  }
}
