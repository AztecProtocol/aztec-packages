import { BarretenbergSync } from '@aztec/bb.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import {
  BYTES_PER_BLOB,
  Blob,
  type BlobBuffer,
  type Bytes48,
  FIELD_ELEMENTS_PER_BLOB,
  type KZGProof,
} from './index.js';
import { ensureKzgInitialized } from './kzg_init.js';
import { makeEncodedBlob } from './testing.js';

describe('blob', () => {
  beforeAll(async () => {
    await ensureKzgInitialized();
  });

  it('bb.js KZG should verify a batch of blobs', () => {
    // This test is taken from the blob-lib repo
    const api = BarretenbergSync.getSingleton();
    const BATCH_SIZE = 3;
    const blobs: BlobBuffer[] = [];
    const commitments: Bytes48[] = [];
    const kzgProofs: KZGProof[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      blobs.push(Buffer.alloc(BYTES_PER_BLOB));
      (blobs[i] as Buffer).write('potato', 0, 'utf8');
      (blobs[i] as Buffer).write('potato', BYTES_PER_BLOB - 50, 'utf8');
      const commitmentRes = api.kzgBlobToCommitment({ blobData: blobs[i] });
      commitments.push(commitmentRes.commitment);
      const proofRes = api.kzgComputeBlobProof({ blobData: blobs[i], commitment: commitmentRes.commitment });
      kzgProofs.push(proofRes.proof);
    }
    const blobsFlat = Buffer.concat(blobs);
    const commitmentsFlat = Buffer.concat(commitments);
    const proofsFlat = Buffer.concat(kzgProofs);
    const verifyRes = api.kzgVerifyBlobProofBatch({
      blobs: blobsFlat,
      commitments: commitmentsFlat,
      proofs: proofsFlat,
      count: BATCH_SIZE,
    });

    expect(verifyRes.valid).toBe(true);
  });

  it('should verify a kzg precise proof', () => {
    // This test is taken from the blob-lib repo
    const api = BarretenbergSync.getSingleton();
    const zBytes = Buffer.alloc(32);

    // blobs[0][31] = x, and z = 0x01 results in y = x.
    // So the first blob field is evaluated at 0x01.
    (zBytes as Buffer).write('01', 31, 'hex');

    // This is the 2nd root of unity, after 1, because we actually get the bit_reversal_permutation of the root of unity. And although `7` is the primitive root of unity, the roots of unity are derived as 7 ^ ((BLS_MODULUS - 1) / FIELD_ELEMENTS_PER_BLOB) mod BLS_MODULUS.
    (zBytes as Buffer).write('73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000000', 0, 'hex'); // equiv to 52435875175126190479447740508185965837690552500527637822603658699938581184512 which is actually -1 in the scalar field!

    const blob = Buffer.alloc(BYTES_PER_BLOB);
    (blob as Buffer).write('09', 31, 'hex');
    (blob as Buffer).write('07', 31 + 32, 'hex');

    const proofResult = api.kzgComputeProof({ blobData: blob, z: zBytes });
    const commitmentRes = api.kzgBlobToCommitment({ blobData: blob });

    const verifyRes = api.kzgVerifyProof({
      commitment: commitmentRes.commitment,
      z: zBytes,
      y: proofResult.y,
      proof: proofResult.proof,
    });

    expect(verifyRes.valid).toBe(true);
  });

  it('should evaluate a blob of 400 items', async () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib in bb.js
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr -> test_400
    const api = BarretenbergSync.getSingleton();
    const blobItems = Array(400).fill(new Fr(3));
    const ourBlob = await Blob.fromFields(blobItems);
    const blobItemsHash = await poseidon2Hash(Array(400).fill(new Fr(3)));
    expect(blobItemsHash).toEqual(ourBlob.fieldsHash);

    // We add zeros before getting commitment as we do not store the blob along with
    // all of the zeros
    const dataWithZeros = Buffer.concat([ourBlob.data], BYTES_PER_BLOB);
    const commitmentRes = api.kzgBlobToCommitment({ blobData: dataWithZeros });
    expect(Buffer.from(commitmentRes.commitment)).toEqual(ourBlob.commitment);

    const z = await poseidon2Hash([blobItemsHash, ...ourBlob.commitmentToFields()]);
    expect(z).toEqual(ourBlob.challengeZ);

    const res = api.kzgComputeProof({ blobData: dataWithZeros, z: ourBlob.challengeZ.toBuffer() });
    const { y, proof } = ourBlob.evaluate();
    expect(Buffer.from(res.proof)).toEqual(proof.buffer);
    expect(Buffer.from(res.y)).toEqual(y.buffer);

    const verifyRes = api.kzgVerifyProof({
      commitment: ourBlob.commitment,
      z: ourBlob.challengeZ.toBuffer(),
      y: y.buffer,
      proof: proof.buffer,
    });
    expect(verifyRes.valid).toBe(true);
  });

  it('should evaluate full blob', async () => {
    // This test ensures that the Blob class correctly matches the bb.js KZG implementation
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr -> test_full_blob
    const api = BarretenbergSync.getSingleton();
    const blobItems = [];
    for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
      blobItems[i] = new Fr(i + 2);
    }
    const blobItemsHash = await poseidon2Hash(blobItems);
    const blobs = await Blob.getBlobsPerBlock(blobItems);
    expect(blobs.length).toEqual(1);
    const ourBlob = blobs[0];
    expect(blobItemsHash).toEqual(ourBlob.fieldsHash);

    const commitmentRes = api.kzgBlobToCommitment({ blobData: ourBlob.data });
    expect(Buffer.from(commitmentRes.commitment)).toEqual(ourBlob.commitment);

    const z = await poseidon2Hash([blobItemsHash, ...ourBlob.commitmentToFields()]);
    expect(z).toEqual(ourBlob.challengeZ);

    const res = api.kzgComputeProof({ blobData: ourBlob.data, z: ourBlob.challengeZ.toBuffer() });
    const { y, proof } = ourBlob.evaluate();
    expect(Buffer.from(res.proof)).toEqual(proof.buffer);
    expect(Buffer.from(res.y)).toEqual(y.buffer);

    const verifyRes = api.kzgVerifyProof({
      commitment: ourBlob.commitment,
      z: ourBlob.challengeZ.toBuffer(),
      y: y.buffer,
      proof: proof.buffer,
    });
    expect(verifyRes.valid).toBe(true);
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
