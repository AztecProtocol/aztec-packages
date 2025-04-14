import type { Blob } from '@aztec/blob-lib';

import type { BlobWithIndex } from '../types/blob_with_index.js';

export interface BlobSinkClientInterface {
  sendBlobsToBlobSink(blockId: string, blobs: Blob[]): Promise<boolean>;
  getBlobSidecar(blockId: string, blobHashes?: Buffer[], indices?: number[]): Promise<BlobWithIndex[]>;
}
