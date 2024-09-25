import {
  BYTES_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT,
  blobToKzgCommitment,
  computeBlobKzgProof,
  computeKzgProof,
  loadTrustedSetup,
  verifyBlobKzgProofBatch,
  verifyKzgProof,
} from 'c-kzg';
import type { Blob, Bytes48, KZGProof } from 'c-kzg';

import { poseidon2Hash } from '../crypto/index.js';
import { Fr } from '../fields/index.js';

loadTrustedSetup();

// NB: These tests are adapted from blob-lib
// TODO(Miranda): Before merging, make this dir into a small ts blob lib + add more tests

test('Test kzg functions', () => {
  const BATCH_SIZE = 3;
  const blobs: Blob[] = [];
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

test('Test nr vs ts', () => {
  // This test just ensures that nr's barycentric_evaluate_blob_at_z works for a given blob and z
  const blobItemsHash = poseidon2Hash(Array(400).fill(new Fr(3)));
  // const blobItemsHash = Fr.fromString('0x0c645197dab812dddc165004e81bd0e8331fd851f7b0696c281a434a43b5bf22');
  const dummyCommitment = [1, 2];
  // nr res: 0x2a7580c48610e687affa1023560499bfcacf9a130910fc08c8c16dfae0e20cbb
  const zBytes = poseidon2Hash([blobItemsHash, ...dummyCommitment]).toBuffer();
  // const zBytes = Buffer.from('2f79d3283f3107fabbf2615f46d8fc6274b09136efa3dff5d517ac0ee9cf2526', 'hex');

  const blob = Buffer.alloc(BYTES_PER_BLOB);
  for (let i = 0; i < 400; i++) {
    (blob as Buffer).write('03', i * BYTES_PER_FIELD_ELEMENT + 31, 'hex');
  }

  const proofRes = computeKzgProof(blob, zBytes);
  // nr res:  BigNum { limbs: [0x71e8f131379a8f7c6be441d9493bda, 0xcd6cade565b9a5b5ddd6e7a1796a79, 0x5373] }, kzg_commitment: [0x01, 0x02] }
  const expectedYBytes = Buffer.concat([
    Buffer.from('5373', 'hex'),
    Buffer.from('cd6cade565b9a5b5ddd6e7a1796a79', 'hex'),
    Buffer.from('71e8f131379a8f7c6be441d9493bda', 'hex'),
  ]);
  expect(proofRes[1]).toEqual(expectedYBytes);
});

test('Test kzg precise proof', () => {
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
