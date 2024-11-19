import { Blob } from '@aztec/foundation/blob';
import { randomInt } from '@aztec/foundation/crypto';

import { BLOBS_PER_BLOCK, BLOB_PUBLIC_INPUTS } from '../constants.gen.js';
import { makeBlobPublicInputs, makeBlockBlobPublicInputs } from '../tests/factories.js';
import { BlobPublicInputs, BlockBlobPublicInputs } from './blob_public_inputs.js';
import { Fr } from './index.js';

describe('BlobPublicInputs', () => {
  let blobPI: BlobPublicInputs;

  beforeAll(() => {
    blobPI = makeBlobPublicInputs(randomInt(1000));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = BlobPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });

  it('converts correctly from Blob class', () => {
    const blob = new Blob(Array(400).fill(new Fr(3)));
    const converted = BlobPublicInputs.fromBlob(blob);
    expect(converted.z).toEqual(blob.challengeZ);
    expect(Buffer.from(converted.y.toString(16), 'hex')).toEqual(blob.evaluationY);
    expect(converted.kzgCommitment).toEqual(blob.commitmentToFields());
    expect(converted.commitmentToBuffer()).toEqual(blob.commitment);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = blobPI.toFields();
    const res = BlobPublicInputs.fromFields(fieldArray);
    expect(res).toEqual(blobPI);
  });

  // NB: In noir, blob.y is represented as a BigNum = 3x Fr fields. In ts, we use bigint for ease of calcs.
  it('number of fields matches constant', () => {
    const fields = blobPI.toFields();
    expect(fields.length).toBe(BLOB_PUBLIC_INPUTS);
  });
});

describe('BlockBlobPublicInputs', () => {
  let blobPI: BlockBlobPublicInputs;

  beforeAll(() => {
    blobPI = makeBlockBlobPublicInputs(randomInt(1000));
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blobPI.toBuffer();
    const res = BlockBlobPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(blobPI);
  });

  it('converts correctly from Blob class', () => {
    const blobs = Array.from({ length: BLOBS_PER_BLOCK }, (_, i) => new Blob(Array(400).fill(new Fr(i + 1))));
    const converted = BlockBlobPublicInputs.fromBlobs(blobs);
    converted.inner.forEach((blobPI, i) => {
      expect(blobPI.z).toEqual(blobs[i].challengeZ);
      expect(Buffer.from(blobPI.y.toString(16), 'hex')).toEqual(blobs[i].evaluationY);
      expect(blobPI.kzgCommitment).toEqual(blobs[i].commitmentToFields());
      expect(blobPI.commitmentToBuffer()).toEqual(blobs[i].commitment);
    });
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = blobPI.toFields();
    const res = BlockBlobPublicInputs.fromFields(fieldArray);
    expect(res).toEqual(blobPI);
  });

  // NB: In noir, blob.y is represented as a BigNum = 3x Fr fields. In ts, we use bigint for ease of calcs.
  it('number of fields matches constant', () => {
    const fields = blobPI.toFields();
    expect(fields.length).toBe(BLOB_PUBLIC_INPUTS * BLOBS_PER_BLOCK);
  });
});
