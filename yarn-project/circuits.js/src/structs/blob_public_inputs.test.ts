import { randomInt } from '@aztec/foundation/crypto';

// import { BLOB_PUBLIC_INPUTS } from '../constants.gen.js';
import { makeBlobPublicInputs } from '../tests/factories.js';
import { BlobPublicInputs } from './blob_public_inputs.js';

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

  // TODO(Miranda): reinstate if to/from fields is required

  // it('serializes to field array and deserializes it back', () => {
  //   const fieldArray = blobPI.toFields();
  //   const res = BlobPublicInputs.fromFields(fieldArray);
  //   expect(res).toEqual(blobPI);
  // });

  // it('number of fields matches constant', () => {
  //   const fields = blobPI.toFields();
  //   expect(fields.length).toBe(BLOB_PUBLIC_INPUTS);
  // });
});
