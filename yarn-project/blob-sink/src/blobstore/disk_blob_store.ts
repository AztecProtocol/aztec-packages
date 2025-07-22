import { bufferToHex } from '@aztec/foundation/string';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import { BlobWithIndex } from '../types/index.js';
import type { BlobStore } from './interface.js';

export class DiskBlobStore implements BlobStore {
  blobs: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.blobs = store.openMap('blobs');
  }

  public async getBlobsByHashes(blobHashes: Buffer[]): Promise<BlobWithIndex[]> {
    const results: BlobWithIndex[] = [];

    for (const blobHash of blobHashes) {
      const key = bufferToHex(blobHash);
      const blobBuffer = await this.blobs.getAsync(key);
      if (blobBuffer) {
        results.push(BlobWithIndex.fromBuffer(blobBuffer));
      }
    }

    return results;
  }

  public async addBlobs(blobs: BlobWithIndex[]): Promise<void> {
    for (const blob of blobs) {
      const blobHash = blob.blob.getEthVersionedBlobHash();
      const key = bufferToHex(blobHash);
      await this.blobs.set(key, blob.toBuffer());
    }
  }
}
