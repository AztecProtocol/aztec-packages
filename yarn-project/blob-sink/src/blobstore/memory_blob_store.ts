import { bufferToHex } from '@aztec/foundation/string';

import { BlobWithIndex } from '../types/index.js';
import type { BlobStore } from './interface.js';

export class MemoryBlobStore implements BlobStore {
  private blobs: Map<string, Buffer> = new Map();

  public getBlobsByHashes(blobHashes: Buffer[]): Promise<BlobWithIndex[]> {
    const results: BlobWithIndex[] = [];

    for (const blobHash of blobHashes) {
      const key = bufferToHex(blobHash);
      const blobBuffer = this.blobs.get(key);
      if (blobBuffer) {
        results.push(BlobWithIndex.fromBuffer(blobBuffer));
      }
    }

    return Promise.resolve(results);
  }

  public addBlobs(blobs: BlobWithIndex[]): Promise<void> {
    for (const blob of blobs) {
      const blobHash = blob.blob.getEthVersionedBlobHash();
      const key = bufferToHex(blobHash);
      this.blobs.set(key, blob.toBuffer());
    }
    return Promise.resolve();
  }
}
