import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { type BlobWithIndex, BlobsWithIndexes } from '../types/index.js';
import { type BlobStore } from './interface.js';

export class DiskBlobStore implements BlobStore {
  blobs: AztecMap<string, Buffer>;

  constructor(store: AztecKVStore) {
    this.blobs = store.openMap('blobs');
  }

  public getBlobSidecars(blockId: string): Promise<BlobWithIndex[] | undefined> {
    const blobBuffer = this.blobs.get(`${blockId}`);
    if (!blobBuffer) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(BlobsWithIndexes.fromBuffer(blobBuffer).blobs);
  }

  public async addBlobSidecars(blockId: string, blobSidecars: BlobWithIndex[]): Promise<void> {
    await this.blobs.set(blockId, new BlobsWithIndexes(blobSidecars).toBuffer());
    return Promise.resolve();
  }
}
