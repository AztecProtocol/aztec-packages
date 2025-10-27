import { FIELDS_PER_BLOB } from '@aztec/constants';
import { BLS12Point, Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { deserializeEncodedBlobToFields } from './deserialize.js';
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
 * @returns As many blobs as required to broadcast the given fields to an L1 block.
 *
 * @throws If the number of fields does not match what's indicated by the checkpoint prefix.
 */
export function getBlobsPerL1Block(fields: Fr[]): Blob[] {
  if (!fields.length) {
    throw new Error('Cannot create blobs from empty fields.');
  }

  const numBlobs = Math.ceil(fields.length / FIELDS_PER_BLOB);
  return Array.from({ length: numBlobs }, (_, i) =>
    Blob.fromFields(fields.slice(i * FIELDS_PER_BLOB, (i + 1) * FIELDS_PER_BLOB)),
  );
}

/**
 * Get the fields from all blobs in the checkpoint. Ignoring the fields beyond the length specified by the
 * checkpoint prefix (the first field).
 *
 * @param blobs - The blobs to read fields from. Should be all the blobs in the L1 block proposing the checkpoint.
 * @param checkEncoding - Whether to check if the entire encoded blob fields are valid. If false, it will still check
 * the checkpoint prefix and throw if there's not enough fields.
 * @returns The fields added throughout the checkpoint.
 */
export function getBlobFieldsInCheckpoint(blobs: Blob[], checkEncoding = false): Fr[] {
  return deserializeEncodedBlobToFields(Buffer.concat(blobs.map(b => b.data)), checkEncoding);
}

export async function computeBlobFieldsHashFromBlobs(blobs: Blob[]): Promise<Fr> {
  const fields = blobs.map(b => b.toFields()).flat();
  const numBlobFields = fields[0].toNumber();
  if (numBlobFields > fields.length) {
    throw new Error(`The prefix indicates ${numBlobFields} fields. Got ${fields.length}.`);
  }

  return await computeBlobFieldsHash(fields.slice(0, numBlobFields));
}

export function computeBlobsHashFromBlobs(blobs: Blob[]): Fr {
  return computeBlobsHash(blobs.map(b => b.getEthVersionedBlobHash()));
}

export function getBlobCommitmentsFromBlobs(blobs: Blob[]): BLS12Point[] {
  return blobs.map(b => BLS12Point.decompress(b.commitment));
}
