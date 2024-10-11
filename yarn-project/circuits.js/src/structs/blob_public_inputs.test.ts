import { Blob } from '@aztec/foundation/blob';
import { randomInt } from '@aztec/foundation/crypto';

import { BLOB_PUBLIC_INPUTS } from '../constants.gen.js';
import { makeBlobPublicInputs } from '../tests/factories.js';
import { BlobPublicInputs } from './blob_public_inputs.js';
import { Fr } from './index.js';

describe('PartialStateReference', () => {
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
