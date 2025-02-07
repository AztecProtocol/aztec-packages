import { type Blob } from '@aztec/blob-lib';

export interface BlobSinkClientInterface {
  sendBlobsToBlobSink(blockId: string, blobs: Blob[]): Promise<boolean>;
  getBlobSidecar(blockId: string, blobHashes: Buffer[], indices?: number[]): Promise<Blob[]>;
}
