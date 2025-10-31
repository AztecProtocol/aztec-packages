import { poseidon2Hash, sha256, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Fr, Fr } from '@aztec/foundation/fields';

import { BYTES_PER_BLOB, BYTES_PER_COMMITMENT, kzg } from './kzg_context.js';

const VERSIONED_HASH_VERSION_KZG = 0x01;

/**
 * Returns ethereum's versioned blob hash, following kzg_to_versioned_hash: https://eips.ethereum.org/EIPS/eip-4844#helpers
 */
export function computeEthVersionedBlobHash(commitment: Buffer): Buffer {
  const hash = sha256(commitment);
  hash[0] = VERSIONED_HASH_VERSION_KZG;
  return hash;
}

// TODO(#13430): The blobsHash is confusingly similar to blobCommitmentsHash, calculated from below blobCommitments:
// - blobsHash := sha256([blobhash_0, ..., blobhash_m]) = a hash of all blob hashes in a block with m+1 blobs inserted into the header, exists so a user can cross check blobs.
// - blobCommitmentsHash := sha256( ...sha256(sha256(C_0), C_1) ... C_n) = iteratively calculated hash of all blob commitments in an epoch with n+1 blobs (see calculateBlobCommitmentsHash()),
//   exists so we can validate injected commitments to the rollup circuits correspond to the correct real blobs.
// We may be able to combine these values e.g. blobCommitmentsHash := sha256( ...sha256(sha256(blobshash_0), blobshash_1) ... blobshash_l) for an epoch with l+1 blocks.
export function computeBlobsHash(evmVersionedBlobHashes: Buffer[]): Fr {
  return sha256ToField(evmVersionedBlobHashes);
}

/**
 * The hash of the fields added throughout the checkpoint. The exact number of fields is specified by the checkpoint
 * prefix (the first field). It's verified in the circuit against the fields absorbed into the sponge blob.
 * This hash is used in generating the challenge z for all blobs in the same checkpoint.
 */
export async function computeBlobFieldsHash(fields: Fr[]): Promise<Fr> {
  return await poseidon2Hash(fields);
}

export function computeBlobCommitment(data: Uint8Array): Buffer {
  if (data.length !== BYTES_PER_BLOB) {
    throw new Error(`Expected ${BYTES_PER_BLOB} bytes per blob. Got ${data.length}.`);
  }

  return Buffer.from(kzg.blobToKzgCommitment(data));
}

/**
 * Get the commitment fields of the blob, to compute the challenge z.
 *
 * The 48-byte commitment is encoded into two field elements:
 * +-------------------+------------------------+
 * |      31 bytes     |         17 bytes       |
 * +-------------------+------------------------+
 * |  Field Element 1  |     Field Element 2    |
 * |  [0][bytes 0-30]  |  [0...0][bytes 31-47]  |
 * +-------------------+------------------------+
 *
 * @param commitment - The commitment to convert to fields. Computed from `computeBlobCommitment`.
 * @returns The fields representing the commitment buffer.
 */
export function commitmentToFields(commitment: Buffer): [Fr, Fr] {
  if (commitment.length !== BYTES_PER_COMMITMENT) {
    throw new Error(`Expected ${BYTES_PER_COMMITMENT} bytes for blob commitment. Got ${commitment.length}.`);
  }

  return [new Fr(commitment.subarray(0, 31)), new Fr(commitment.subarray(31, BYTES_PER_COMMITMENT))];
}

export async function computeChallengeZ(blobFieldsHash: Fr, commitment: Buffer): Promise<Fr> {
  const commitmentFields = commitmentToFields(commitment);
  return await poseidon2Hash([blobFieldsHash, commitmentFields[0], commitmentFields[1]]);
}

/**
 * Hash each u128 limb of the noir bignum struct representing the BLS field, to mimic the hash accumulation in the
 * rollup circuits.
 */
export async function hashNoirBigNumLimbs(field: BLS12Fr): Promise<Fr> {
  const num = field.toNoirBigNum();
  return await poseidon2Hash(num.limbs.map(Fr.fromHexString));
}
