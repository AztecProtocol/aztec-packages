import { FIELDS_PER_BLOB } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toInlineStrArray } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { Blob } from './blob.js';
import { commitmentToFields } from './hash.js';
import { getBytesPerBlob, getKzg } from './kzg_context.js';
import { makeRandomBlob } from './testing.js';

describe('blob', () => {
  it('kzg lib should verify a batch of blobs', () => {
    // This test is taken from the blob-lib repo
    const kzg = getKzg();
    const BATCH_SIZE = 3;
    const blobs: Uint8Array[] = [];
    const commitments: Uint8Array[] = [];
    const kzgProofs: Uint8Array[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      blobs.push(Buffer.alloc(getBytesPerBlob()));
      (blobs[i] as Buffer).write('potato', 0, 'utf8');
      (blobs[i] as Buffer).write('potato', getBytesPerBlob() - 50, 'utf8');
      commitments.push(kzg.blobToKzgCommitment(blobs[i]));
      kzgProofs.push(kzg.computeBlobKzgProof(blobs[i], commitments[i]));
    }
    const isValid = kzg.verifyBlobKzgProofBatch(blobs, commitments, kzgProofs);

    expect(isValid).toBe(true);
  });

  it('should verify a kzg precise proof', () => {
    // This test is taken from the blob-lib repo
    const kzg = getKzg();
    const zBytes = Buffer.alloc(32);

    // blobs[0][31] = x, and z = 0x01 results in y = x.
    // So the first blob field is evaluated at 0x01.
    (zBytes as Buffer).write('01', 31, 'hex');

    // This is the 2nd root of unity, after 1, because we actually get the bit_reversal_permutation of the root of unity. And although `7` is the primitive root of unity, the roots of unity are derived as 7 ^ ((BLS_MODULUS - 1) / FIELDS_PER_BLOB) mod BLS_MODULUS.
    (zBytes as Buffer).write('73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000000', 0, 'hex'); // equiv to 52435875175126190479447740508185965837690552500527637822603658699938581184512 which is actually -1 in the scalar field!

    const blob = Buffer.alloc(getBytesPerBlob());
    (blob as Buffer).write('09', 31, 'hex');
    (blob as Buffer).write('07', 31 + 32, 'hex');

    const proofResult = kzg.computeKzgProof(blob, zBytes);
    const commitment = kzg.blobToKzgCommitment(blob);

    const isValid = kzg.verifyKzgProof(commitment, zBytes, proofResult[1], proofResult[0]);

    expect(isValid).toBe(true);
  });

  it('should evaluate a blob of 400 items', async () => {
    // This test ensures that the noir blob lib correctly matches the kzg lib
    const blobFields = Array(400).fill(new Fr(3));
    const blobFieldsHash = await poseidon2Hash(blobFields);
    const blob = await Blob.fromFields(blobFields);
    const challengeZ = await blob.computeChallengeZ(blobFieldsHash);

    const { y } = await blob.evaluate(challengeZ, true /* verifyProof */);

    expect(blob.commitment.toString('hex')).toMatchInlineSnapshot(
      `"b2803d5fe972914ba3616033e2748bbaa6dbcddefc3721a54895a7a45e77504dd1a971c7e8d8292be943d05bccebcfea"`,
    );
    const blobCommitmentFields = commitmentToFields(blob.commitment);

    // If the snapshot has changed, update the noir test data as well.
    expect(y.toString()).toMatchInlineSnapshot(`"0x2ed43e9899a71532fd9787ba8424169e82ac45e1ed214434c298758a8ecbb9b6"`);

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
    // This test ensures that the noir blob lib correctly matches the kzg lib
    const blobFields = Array.from({ length: FIELDS_PER_BLOB }).map((_, i) => new Fr(i + 2));
    const blobFieldsHash = await poseidon2Hash(blobFields);
    const blob = await Blob.fromFields(blobFields);
    const challengeZ = await blob.computeChallengeZ(blobFieldsHash);

    const { y } = await blob.evaluate(challengeZ, true /* verifyProof */);

    expect(blob.commitment.toString('hex')).toMatchInlineSnapshot(
      `"ac771dea41e29fc2b7016c32731602c0812548ba0f491864a4e03fdb94b8d3d195faad1967cdf005acf73088b0e8474a"`,
    );
    const blobCommitmentFields = commitmentToFields(blob.commitment);

    // If the snapshot has changed, update the noir test data as well.
    expect(y.toString()).toMatchInlineSnapshot(`"0x64d9451840b84faad4f5942121befd2b42c94c4fd96f6184b2cae95ae0510e92"`);

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

  it('should serialize and deserialize a blob', async () => {
    const blob = await makeRandomBlob(5);
    const blobBuffer = blob.toBuffer();
    expect(Blob.fromBuffer(blobBuffer)).toEqual(blob);
  });

  it('should create a blob from a JSON object', async () => {
    const blob = await makeRandomBlob(7);
    const blobJson = blob.toJSON();
    expect(await Blob.fromJson(blobJson)).toEqual(blob);
  });
});
