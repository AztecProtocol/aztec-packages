import { type BlobWithIndex } from '../types/index.js';

export interface BlobStore {
  /**
   * Get a blob by block id
   */
  getBlobSidecars: (blockId: string) => Promise<BlobWithIndex[] | undefined>;
  /**
   * Add a blob to the store
   */
  addBlobSidecars: (blockId: string, blobSidecars: BlobWithIndex[]) => Promise<void>;
}
