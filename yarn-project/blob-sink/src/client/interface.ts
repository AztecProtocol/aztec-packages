import type { Blob } from '@aztec/blob-lib';

import type { BlobWithIndex } from '../types/blob_with_index.js';

export interface BlobSinkClientInterface {
  /** Sends the given blobs to a sink, to be indexed by blob hash. */
  sendBlobsToBlobSink(blobs: Blob[]): Promise<boolean>;
  /** Fetches the given blob sidecars by block, hash, and indices. */
  getBlobSidecar(blockId: string, blobHashes?: Buffer[], indices?: number[]): Promise<BlobWithIndex[]>;
  /** Tests all configured blob sources and logs whether they are reachable or not. */
  testSources(): Promise<void>;
}
