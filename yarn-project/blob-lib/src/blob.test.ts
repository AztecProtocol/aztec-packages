import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import cKzg from 'c-kzg';
import type { Blob as BlobBuffer, Bytes48, KZGProof } from 'c-kzg';

import { Blob } from './index.js';
import { makeEncodedBlob } from './testing.js';

// Importing directly from 'c-kzg' does not work:

const {
  BYTES_PER_BLOB,
  FIELD_ELEMENTS_PER_BLOB,
  blobToKzgCommitment,
  computeBlobKzgProof,
  computeKzgProof,
  loadTrustedSetup,
  verifyBlobKzgProofBatch,
  verifyKzgProof,
} = cKzg;

try {
  loadTrustedSetup();
} catch (error: any) {
  if (error.message.includes('trusted setup is already loaded')) {
    // NB: The c-kzg lib has no way of checking whether the setup is loaded or not,
    // and it throws an error if it's already loaded, even though nothing is wrong.
    // This is a rudimentary way of ensuring we load the trusted setup if we need it.
  } else {
    throw new Error(error);
  }
}

describe('blob', () => {
  it('c-kzg lib should verify a batch of blobs', () => {
    // This test is taken from the blob-lib repo
    const BATCH_SIZE = 3;
    const blobs: BlobBuffer[] = [];
    const commitments: Bytes48[] = [];
    const kzgProofs: KZGProof[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      blobs.push(Buffer.alloc(BYTES_PER_BLOB));
      (blobs[i] as Buffer).write('potato', 0, 'utf8');
      (blobs[i] as Buffer).write('potato', BYTES_PER_BLOB - 50, 'utf8');
      commitments.push(blobToKzgCommitment(blobs[i]));
      kzgProofs.push(computeBlobKzgProof(blobs[i], commitments[i]));
    }
    const isValid = verifyBlobKzgProofBatch(blobs, commitments, kzgProofs);

    expect(isValid).toBe(true);
  });

  it('should verify a kzg precise proof', () => {
    // This test is taken from the blob-lib repo
    const zBytes = Buffer.alloc(32);

    // blobs[0][31] = x, and z = 0x01 results in y = x.
    // So the first blob field is evaluated at 0x01.
    (zBytes as Buffer).write('01', 31, 'hex');

    // This is the 2nd root of unity, after 1, because we actually get the bit_reversal_permutation of the root of unity. And although `7` is the primitive root of unity, the roots of unity are derived as 7 ^ ((BLS_MODULUS - 1) / FIELD_ELEMENTS_PER_BLOB) mod BLS_MODULUS.
    (zBytes as Buffer).write('73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000000', 0, 'hex'); // equiv to 52435875175126190479447740508185965837690552500527637822603658699938581184512 which is actually -1 in the scalar field!

    const blob = Buffer.alloc(BYTES_PER_BLOB);
    (blob as Buffer).write('09', 31, 'hex');
    (blob as Buffer).write('07', 31 + 32, 'hex');

    const proofResult = computeKzgProof(blob, zBytes);
    const commitment = blobToKzgCommitment(blob);

    const isValid = verifyKzgProof(commitment, zBytes, proofResult[1], proofResult[0]);

    expect(isValid).toBe(true);
  });

  it('should evaluate a blob of 400 items', async () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr -> test_400
    const blobItems = Array(400).fill(new Fr(3));
    const ourBlob = await Blob.fromFields(blobItems);
    const blobItemsHash = await poseidon2Hash(Array(400).fill(new Fr(3)));
    expect(blobItemsHash).toEqual(ourBlob.fieldsHash);

    // We add zeros before getting commitment as we do not store the blob along with
    // all of the zeros
    const dataWithZeros = Buffer.concat([ourBlob.data], BYTES_PER_BLOB);
    expect(blobToKzgCommitment(dataWithZeros)).toEqual(ourBlob.commitment);

    const z = await poseidon2Hash([blobItemsHash, ...ourBlob.commitmentToFields()]);
    expect(z).toEqual(ourBlob.challengeZ);

    const res = computeKzgProof(dataWithZeros, ourBlob.challengeZ.toBuffer());
    const { y, proof } = ourBlob.evaluate();
    expect(res[0]).toEqual(proof);
    expect(res[1]).toEqual(y);

    const isValid = verifyKzgProof(ourBlob.commitment, ourBlob.challengeZ.toBuffer(), y, proof);
    expect(isValid).toBe(true);
  });

  it('should evaluate full blob', async () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr -> test_full_blob

    const blobItems = [];
    for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
      blobItems[i] = new Fr(i + 2);
    }
    const blobItemsHash = await poseidon2Hash(blobItems);
    const blobs = await Blob.getBlobsPerBlock(blobItems);
    expect(blobs.length).toEqual(1);
    const ourBlob = blobs[0];
    expect(blobItemsHash).toEqual(ourBlob.fieldsHash);

    expect(blobToKzgCommitment(ourBlob.data)).toEqual(ourBlob.commitment);

    const z = await poseidon2Hash([blobItemsHash, ...ourBlob.commitmentToFields()]);
    expect(z).toEqual(ourBlob.challengeZ);

    const res = computeKzgProof(ourBlob.data, ourBlob.challengeZ.toBuffer());
    const { y, proof } = ourBlob.evaluate();
    expect(res[0]).toEqual(proof);
    expect(res[1]).toEqual(y);

    const isValid = verifyKzgProof(ourBlob.commitment, ourBlob.challengeZ.toBuffer(), y, proof);
    expect(isValid).toBe(true);
  });

  it('should serialise and deserialise a blob', async () => {
    const blob = await Blob.fromFields([Fr.random(), Fr.random(), Fr.random()]);
    const blobBuffer = blob.toBuffer();
    const deserialisedBlob = Blob.fromBuffer(blobBuffer);
    expect(blob.fieldsHash.equals(deserialisedBlob.fieldsHash)).toBe(true);
  });

  it('should create a blob from a JSON object', async () => {
    const blob = await makeEncodedBlob(3);
    const blobJson = blob.toJson(1);
    const deserialisedBlob = await Blob.fromJson(blobJson);
    expect(blob.fieldsHash.equals(deserialisedBlob.fieldsHash)).toBe(true);
  });
});
