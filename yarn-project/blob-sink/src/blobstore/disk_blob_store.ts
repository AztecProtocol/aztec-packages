import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { type BlobWithIndex, BlobsWithIndexes } from '../types/index.js';
import { type BlobStore } from './interface.js';

export class DiskBlobStore implements BlobStore {
  blobs: AztecMap<string, Buffer>;

  constructor(store: AztecKVStore) {
    this.blobs = store.openMap('blobs');
  }

  public getBlobSidecars(blockId: string, indices?: number[]): Promise<BlobWithIndex[] | undefined> {
    const blobBuffer = this.blobs.get(`${blockId}`);
    if (!blobBuffer) {
      return Promise.resolve(undefined);
    }

    const blobsWithIndexes = BlobsWithIndexes.fromBuffer(blobBuffer);
    if (indices) {
      // If indices are provided, return the blobs at the specified indices
      return Promise.resolve(blobsWithIndexes.getBlobsFromIndices(indices));
    }
    // If no indices are provided, return all blobs
    return Promise.resolve(blobsWithIndexes.blobs);
  }

  public async addBlobSidecars(blockId: string, blobSidecars: BlobWithIndex[]): Promise<void> {
    await this.blobs.set(blockId, new BlobsWithIndexes(blobSidecars).toBuffer());
    return Promise.resolve();
  }
}
