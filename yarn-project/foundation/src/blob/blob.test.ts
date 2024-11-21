import { trustedSetup } from '@paulmillr/trusted-setups/fast.js';
import { KZG } from 'micro-eth-signer/kzg';

import { poseidon2Hash } from '../crypto/index.js';
import { Fr } from '../fields/index.js';
import { hexToBuffer } from '../string/index.js';
import { BYTES_PER_BLOB, Blob, FIELD_ELEMENTS_PER_BLOB } from './index.js';

describe('blob', () => {
  const kzg = new KZG(trustedSetup);
  it('kzg lib should verify a batch of blobs', () => {
    // This test is taken from the blob-lib repo
    const BATCH_SIZE = 3;
    const blobs: Buffer[] = [];
    const commitments: string[] = [];
    const kzgProofs: string[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      blobs.push(Buffer.alloc(BYTES_PER_BLOB));
      (blobs[i] as Buffer).write('potato', 0, 'utf8');
      (blobs[i] as Buffer).write('potato', BYTES_PER_BLOB - 50, 'utf8');
      commitments.push(kzg.blobToKzgCommitment(blobs[i].toString('hex')));
      kzgProofs.push(kzg.computeBlobProof(blobs[i].toString('hex'), commitments[i]));
    }
    const isValid = kzg.verifyBlobProofBatch(
      blobs.map(b => b.toString('hex')),
      commitments,
      kzgProofs,
    );

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

    const proofResult = kzg.computeProof(blob.toString('hex'), zBytes.toString('hex'));
    const commitment = kzg.blobToKzgCommitment(blob.toString('hex'));

    const isValid = kzg.verifyProof(commitment, zBytes.toString('hex'), proofResult[1], proofResult[0]);

    expect(isValid).toBe(true);
  });

  it('should evaluate a blob of 400 items', () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr -> test_400
    const blobItems = Array(400).fill(new Fr(3));
    const ourBlob = new Blob(blobItems);
    const blobItemsHash = poseidon2Hash(Array(400).fill(new Fr(3)));
    expect(blobItemsHash).toEqual(ourBlob.fieldsHash);
    expect(hexToBuffer(kzg.blobToKzgCommitment(ourBlob.data.toString('hex')))).toEqual(ourBlob.commitment);

    const z = poseidon2Hash([blobItemsHash, ...ourBlob.commitmentToFields()]);
    expect(z).toEqual(ourBlob.challengeZ);

    const res = kzg.computeProof(ourBlob.data.toString('hex'), ourBlob.challengeZ.toString());
    expect(hexToBuffer(res[0])).toEqual(ourBlob.proof);
    expect(hexToBuffer(res[1])).toEqual(ourBlob.evaluationY);

    const isValid = kzg.verifyProof(
      ourBlob.commitment.toString('hex'),
      ourBlob.challengeZ.toString(),
      ourBlob.evaluationY.toString('hex'),
      ourBlob.proof.toString('hex'),
    );
    expect(isValid).toBe(true);
  });

  it('should evaluate full blobs', () => {
    // This test ensures that the Blob class correctly matches the c-kzg lib
    // The values here are used to test Noir's blob evaluation in noir-projects/noir-protocol-circuits/crates/blob/src/blob.nr -> test_full_blobs

    const blobItems = [];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        blobItems[j * FIELD_ELEMENTS_PER_BLOB + i] = new Fr(i + 2);
      }
    }
    const blobItemsHash = poseidon2Hash(blobItems);
    const blobs = Blob.getBlobs(blobItems);
    blobs.forEach(ourBlob => {
      // const ourBlob = new Blob(blobItems.slice(j * FIELD_ELEMENTS_PER_BLOB, (j + 1) * FIELD_ELEMENTS_PER_BLOB), blobItemsHash);
      expect(blobItemsHash).toEqual(ourBlob.fieldsHash);
      expect(hexToBuffer(kzg.blobToKzgCommitment(ourBlob.data.toString('hex')))).toEqual(ourBlob.commitment);

      const z = poseidon2Hash([blobItemsHash, ...ourBlob.commitmentToFields()]);
      expect(z).toEqual(ourBlob.challengeZ);

      const res = kzg.computeProof(ourBlob.data.toString('hex'), ourBlob.challengeZ.toString());
      expect(hexToBuffer(res[0])).toEqual(ourBlob.proof);
      expect(hexToBuffer(res[1])).toEqual(ourBlob.evaluationY);

      const isValid = kzg.verifyProof(
        ourBlob.commitment.toString('hex'),
        ourBlob.challengeZ.toString(),
        ourBlob.evaluationY.toString('hex'),
        ourBlob.proof.toString('hex'),
      );
      expect(isValid).toBe(true);
    });
  });
});
