import { type Blob } from '@aztec/foundation/blob';

export interface BlobSinkClientInterface {
  sendBlobsToBlobSink(blockId: string, blobs: Blob[]): Promise<boolean>;
  getBlobSidecar(blockId: string, blobHashes: Buffer[], indices?: number[]): Promise<Blob[]>;
}
