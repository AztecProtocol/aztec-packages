import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import { type BlobWithIndex, BlobsWithIndexes } from '../types/index.js';
import { type BlobStore } from './interface.js';

export class DiskBlobStore implements BlobStore {
  blobs: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.blobs = store.openMap('blobs');
  }

  public async getBlobSidecars(blockId: string, indices?: number[]): Promise<BlobWithIndex[] | undefined> {
    const blobBuffer = await this.blobs.getAsync(`${blockId}`);
    if (!blobBuffer) {
      return undefined;
    }

    const blobsWithIndexes = BlobsWithIndexes.fromBuffer(blobBuffer);
    if (indices) {
      // If indices are provided, return the blobs at the specified indices
      return blobsWithIndexes.getBlobsFromIndices(indices);
    }
    // If no indices are provided, return all blobs
    return blobsWithIndexes.blobs;
  }

  public async addBlobSidecars(blockId: string, blobSidecars: BlobWithIndex[]): Promise<void> {
    await this.blobs.set(blockId, new BlobsWithIndexes(blobSidecars).toBuffer());
  }
}
