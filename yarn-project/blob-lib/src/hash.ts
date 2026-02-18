import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { sha256, sha256ToField } from '@aztec/foundation/crypto/sha256';
import { BLS12Fr } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BYTES_PER_BLOB, BYTES_PER_COMMITMENT, getKzg } from './kzg_context.js';
import { SpongeBlob } from './sponge_blob.js';

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
 * Computes a non-standard Poseidon2 hash over the provided fields.
 *
 * This function is used to compute:
 * - `blobFieldsHash` of a checkpoint:
 *   Verified in the circuit against all fields absorbed into the blob sponge over the entire checkpoint.
 *   The exact number of fields is encoded in the checkpoint end marker (the last field).
 *   This hash is used when generating the challenge `z` for all blobs in the checkpoint.
 * - `spongeBlobHash` of a block:
 *   Computed from the block's tx effects, its end-state, and the blob fields of all prior blocks in the same checkpoint.
 *   This hash is included in the block header.
 */
export async function computeBlobFieldsHash(fields: Fr[]): Promise<Fr> {
  const sponge = SpongeBlob.init();
  await sponge.absorb(fields);
  return sponge.squeeze();
}

export async function computeBlobCommitment(data: Uint8Array): Promise<Buffer> {
  if (data.length !== BYTES_PER_BLOB) {
    throw new Error(`Expected ${BYTES_PER_BLOB} bytes per blob. Got ${data.length}.`);
  }

  return Buffer.from(await getKzg().asyncBlobToKzgCommitment(data));
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
