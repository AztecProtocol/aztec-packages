import { BLOB_ACCUMULATOR_LENGTH } from '@aztec/constants';

import { BlobAccumulator } from './blob_accumulator.js';

describe('BlobAccumulator', () => {
  it('serializes to buffer and deserializes it back', () => {
    const accumulator = BlobAccumulator.random();
    const buffer = accumulator.toBuffer();
    const res = BlobAccumulator.fromBuffer(buffer);
    expect(res).toEqual(accumulator);
  });

  it('serializes to fields and deserializes it back', () => {
    const accumulator = BlobAccumulator.random();
    const fields = accumulator.toFields();
    expect(fields.length).toEqual(BLOB_ACCUMULATOR_LENGTH);
    const res = BlobAccumulator.fromFields(fields);
    expect(res).toEqual(accumulator);
  });
});
