import type { Blob } from '@aztec/blob-lib';

import type { BlobWithIndex } from '../types/blob_with_index.js';

/**
 * Options for getBlobSidecar method.
 */
export interface GetBlobSidecarOptions {
  /**
   * True if the archiver is catching up (historical sync), false if near tip.
   * This affects source ordering:
   * - Historical: FileStore first (data should exist), then L1 consensus, then archive (eg. blobscan)
   * - Near tip: FileStore first with no retries (data should exist), L1 consensus second (freshest data), then FileStore with retries, then archive (eg. blobscan)
   */
  isHistoricalSync?: boolean;
}

export interface BlobClientInterface {
  /** Sends the given blobs to the filestore, to be indexed by blob hash. */
  sendBlobsToFilestore(blobs: Blob[]): Promise<boolean>;
  /** Fetches the given blob sidecars by block, hash, and indices. */
  getBlobSidecar(
    blockId: string,
    blobHashes?: Buffer[],
    indices?: number[],
    opts?: GetBlobSidecarOptions,
  ): Promise<BlobWithIndex[]>;
  /** Tests all configured blob sources and logs whether they are reachable or not. */
  testSources(): Promise<void>;
}
