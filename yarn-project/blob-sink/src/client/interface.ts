import { Blob } from '@aztec/foundation/blob';

export interface BlobSinkClientInterface {
  sendBlobsToBlobSink(blockHash: string, blobs: Blob[]): Promise<boolean>;
  getBlobSidecar(blockHash: string): Promise<Blob[]>;
}
