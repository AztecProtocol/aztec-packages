import type { BlobWithIndex } from '../types/index.js';

export interface BlobStore {
  /**
   * Get blobs by their hashes
   */
  getBlobsByHashes: (blobHashes: Buffer[]) => Promise<BlobWithIndex[]>;
  /**
   * Add blobs to the store, indexed by their hashes
   */
  addBlobs: (blobs: BlobWithIndex[]) => Promise<void>;
}
