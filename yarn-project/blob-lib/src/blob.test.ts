import { FIELDS_PER_BLOB } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { toInlineStrArray } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { Blob } from './blob.js';
import { commitmentToFields } from './hash.js';
import { BYTES_PER_BLOB, kzg } from './kzg_context.js';
import { makeRandomBlob } from './testing.js';

describe('blob', () => {
  it('c-kzg lib should verify a batch of blobs', () => {
    // This test is taken from the blob-lib repo
    const BATCH_SIZE = 3;
    const blobs: Uint8Array[] = [];
    const commitments: Uint8Array[] = [];
    const kzgProofs: Uint8Array[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      blobs.push(Buffer.alloc(BYTES_PER_BLOB));
      (blobs[i] as Buffer).write('potato', 0, 'utf8');
      (blobs[i] as Buffer).write('potato', BYTES_PER_BLOB - 50, 'utf8');
      commitments.push(kzg.blobToKzgCommitment(blobs[i]));
      kzgProofs.push(kzg.computeBlobKzgProof(blobs[i], commitments[i]));
    }
    const isValid = kzg.verifyBlobKzgProofBatch(blobs, commitments, kzgProofs);

    expect(isValid).toBe(true);
  });

  it('should verify a kzg precise proof', () => {
    // This test is taken from the blob-lib repo
    const zBytes = Buffer.alloc(32);

    // blobs[0][31] = x, and z = 0x01 results in y = x.
    // So the first blob field is evaluated at 0x01.
    (zBytes as Buffer).write('01', 31, 'hex');

    // This is the 2nd root of unity, after 1, because we actually get the bit_reversal_permutation of the root of unity. And although `7` is the primitive root of unity, the roots of unity are derived as 7 ^ ((BLS_MODULUS - 1) / FIELDS_PER_BLOB) mod BLS_MODULUS.
    (zBytes as Buffer).write('73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000000', 0, 'hex'); // equiv to 52435875175126190479447740508185965837690552500527637822603658699938581184512 which is actually -1 in the scalar field!

    const blob = Buffer.alloc(BYTES_PER_BLOB);
    (blob as Buffer).write('09', 31, 'hex');
    (blob as Buffer).write('07', 31 + 32, 'hex');

    const proofResult = kzg.computeKzgProof(blob, zBytes);
    const commitment = kzg.blobToKzgCommitment(blob);

    const isValid = kzg.verifyKzgProof(commitment, zBytes, proofResult[1], proofResult[0]);

    expect(isValid).toBe(true);
  });

  it('should evaluate a blob of 400 items', async () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib
    const blobFields = Array(400).fill(new Fr(3));
    const blobFieldsHash = await poseidon2Hash(blobFields);
    const blob = Blob.fromFields(blobFields);
    const challengeZ = await blob.computeChallengeZ(blobFieldsHash);

    const { y } = blob.evaluate(challengeZ, true /* verifyProof */);

    expect(blob.commitment.toString('hex')).toMatchInlineSnapshot(
      `"b2803d5fe972914ba3616033e2748bbaa6dbcddefc3721a54895a7a45e77504dd1a971c7e8d8292be943d05bccebcfea"`,
    );
    const blobCommitmentFields = commitmentToFields(blob.commitment);

    // If the snapshot has changed, update the noir test data as well.
    expect(y.toString()).toMatchInlineSnapshot(`"0x212c4f0c0ee5e7dd037110686a4639d191dde7b57ab99b51e4b06e7d827b6c4c"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr',
      'kzg_commitment_blob_400_from_ts',
      toInlineStrArray(blobCommitmentFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr',
      'y_limbs_blob_400_from_ts',
      toInlineStrArray(y.toNoirBigNum().limbs),
    );
  });

  it('should evaluate full blob', async () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib
    const blobFields = Array.from({ length: FIELDS_PER_BLOB }).map((_, i) => new Fr(i + 2));
    const blobFieldsHash = await poseidon2Hash(blobFields);
    const blob = Blob.fromFields(blobFields);
    const challengeZ = await blob.computeChallengeZ(blobFieldsHash);

    const { y } = blob.evaluate(challengeZ, true /* verifyProof */);

    expect(blob.commitment.toString('hex')).toMatchInlineSnapshot(
      `"ac771dea41e29fc2b7016c32731602c0812548ba0f491864a4e03fdb94b8d3d195faad1967cdf005acf73088b0e8474a"`,
    );
    const blobCommitmentFields = commitmentToFields(blob.commitment);

    // If the snapshot has changed, update the noir test data as well.
    expect(y.toString()).toMatchInlineSnapshot(`"0x0365494e66a289c4509ecf97af4ff92aa7ecc38f478ced014b6ae860502a1b1c"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr',
      'kzg_commitment_blob_full_from_ts',
      toInlineStrArray(blobCommitmentFields),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr',
      'y_limbs_blob_full_from_ts',
      toInlineStrArray(y.toNoirBigNum().limbs),
    );
  });

  it('should serialize and deserialize a blob', () => {
    const blob = makeRandomBlob(5);
    const blobBuffer = blob.toBuffer();
    expect(Blob.fromBuffer(blobBuffer)).toEqual(blob);
  });

  it('should create a blob from a JSON object', () => {
    const blob = makeRandomBlob(7);
    const blobIndex = 1;
    const blobJson = blob.toJson(blobIndex);
    expect(Blob.fromJson(blobJson)).toEqual(blob);
  });
});
