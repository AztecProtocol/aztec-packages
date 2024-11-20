import { type BlobWithIndex, BlobsWithIndexes } from '../types/index.js';
import { type BlobStore } from './interface.js';

export class MemoryBlobStore implements BlobStore {
  private blobs: Map<string, Buffer> = new Map();

  public getBlobSidecars(blockId: string): Promise<BlobWithIndex[] | undefined> {
    const blobBuffer = this.blobs.get(blockId);
    if (!blobBuffer) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(BlobsWithIndexes.fromBuffer(blobBuffer).blobs);
  }

  public addBlobSidecars(blockId: string, blobSidecars: BlobWithIndex[]): Promise<void> {
    this.blobs.set(blockId, new BlobsWithIndexes(blobSidecars).toBuffer());
    return Promise.resolve();
  }
}
