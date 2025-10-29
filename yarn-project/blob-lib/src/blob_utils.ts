import { FIELDS_PER_BLOB } from '@aztec/constants';
import { BLS12Point, Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { deserializeEncodedBlobToFields } from './encoding.js';
import { computeBlobFieldsHash, computeBlobsHash } from './hash.js';

/**
 * @param blobs - The blobs to emit.
 * @returns The blobs' compressed commitments in hex prefixed by the number of blobs. 1 byte for the prefix, 48 bytes
 * per blob commitment.
 * @dev Used for proposing blocks to validate injected blob commitments match real broadcast blobs.
 */
export function getPrefixedEthBlobCommitments(blobs: Blob[]): `0x${string}` {
  // Prefix the number of blobs.
  const lenBuf = Buffer.alloc(1);
  lenBuf.writeUint8(blobs.length);

  const blobBuf = Buffer.concat(blobs.map(blob => blob.commitment));

  const buf = Buffer.concat([lenBuf, blobBuf]);
  return `0x${buf.toString('hex')}`;
}

/**
 * @param fields - Fields to broadcast in the blob(s)
 * @returns As many blobs as required to broadcast the given fields to an L1 block. If no fields are provided, returns a
 * single empty blob (data is all zeros).
 */
export function getBlobsPerL1Block(fields: Fr[]): Blob[] {
  if (!fields.length) {
    return [Blob.fromFields([])];
  }

  const numBlobs = Math.ceil(fields.length / FIELDS_PER_BLOB);
  return Array.from({ length: numBlobs }, (_, i) =>
    Blob.fromFields(fields.slice(i * FIELDS_PER_BLOB, (i + 1) * FIELDS_PER_BLOB)),
  );
}

/**
 * Get the fields from all blobs in a block.
 *
 * @param blobs - The blobs to read fields from. Should be all the blobs in the L1 block proposing the L2 block.
 * @returns The fields added throughout the L2 block.
 */
export function getBlobFieldsInL2Block(blobs: Blob[]): Fr[] {
  return deserializeEncodedBlobToFields(Buffer.concat(blobs.map(b => b.data)));
}

export async function computeBlobFieldsHashFromBlobs(blobs: Blob[]): Promise<Fr> {
  const blobFields = getBlobFieldsInL2Block(blobs);
  return await computeBlobFieldsHash(blobFields);
}

export function computeBlobsHashFromBlobs(blobs: Blob[]): Fr {
  return computeBlobsHash(blobs.map(b => b.getEthVersionedBlobHash()));
}

export function getBlobCommitmentsFromBlobs(blobs: Blob[]): BLS12Point[] {
  return blobs.map(b => BLS12Point.decompress(b.commitment));
}
