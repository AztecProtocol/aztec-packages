import { FIELDS_PER_BLOB } from '@aztec/constants';
import { BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';

import type { BatchedBlob } from './batched_blob.js';
import { Blob } from './blob.js';
import { type CheckpointBlobData, decodeCheckpointBlobDataFromBuffer } from './encoding/index.js';
import { computeBlobsHash, computeEthVersionedBlobHash } from './hash.js';

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
export async function getBlobsPerL1Block(fields: Fr[]): Promise<Blob[]> {
  if (!fields.length) {
    throw new Error('Cannot create blobs from empty fields.');
  }

  const numBlobs = Math.ceil(fields.length / FIELDS_PER_BLOB);
  return await Promise.all(
    Array.from({ length: numBlobs }, (_, i) =>
      Blob.fromFields(fields.slice(i * FIELDS_PER_BLOB, (i + 1) * FIELDS_PER_BLOB)),
    ),
  );
}

/**
 * Get the encoded data from all blobs in the checkpoint.
 * @param blobs - The blobs to read data from. Should be all the blobs for the L1 block proposing the checkpoint.
 * @returns The encoded data of the checkpoint.
 */
export function decodeCheckpointBlobDataFromBlobs(blobs: Blob[]): CheckpointBlobData {
  const buf = Buffer.concat(blobs.map(b => b.data));
  return decodeCheckpointBlobDataFromBuffer(buf);
}

export function computeBlobsHashFromBlobs(blobs: Blob[]): Fr {
  return computeBlobsHash(blobs.map(b => b.getEthVersionedBlobHash()));
}

export function getBlobCommitmentsFromBlobs(blobs: Blob[]): BLS12Point[] {
  return blobs.map(b => BLS12Point.decompress(b.commitment));
}

/**
 * Returns a proof of opening of the blobs to verify on L1 using the point evaluation precompile:
 *
 * input[:32]     - versioned_hash
 * input[32:64]   - z
 * input[64:96]   - y
 * input[96:144]  - commitment C
 * input[144:192] - commitment Q (a 'proof' committing to the quotient polynomial q(X))
 *
 * See https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile
 */
export function getEthBlobEvaluationInputs(batchedBlob: BatchedBlob): `0x${string}` {
  const buf = Buffer.concat([
    computeEthVersionedBlobHash(batchedBlob.commitment.compress()),
    batchedBlob.z.toBuffer(),
    batchedBlob.y.toBuffer(),
    batchedBlob.commitment.compress(),
    batchedBlob.q.compress(),
  ]);
  return `0x${buf.toString('hex')}`;
}
