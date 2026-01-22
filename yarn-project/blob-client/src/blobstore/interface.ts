import type { Blob } from '@aztec/blob-lib';

export interface BlobStore {
  /**
   * Get blobs by their hashes
   */
  getBlobsByHashes: (blobHashes: Buffer[]) => Promise<Blob[]>;
  /**
   * Add blobs to the store, indexed by their hashes
   */
  addBlobs: (blobs: Blob[]) => Promise<void>;
}
