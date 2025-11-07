import { BLOB_ACCUMULATOR_LENGTH } from '@aztec/constants';
import { randomInt } from '@aztec/foundation/crypto';

import { makeBatchedBlobAccumulator } from '../testing.js';
import { BlobAccumulator } from './blob_accumulator.js';

describe('BlobAccumulator', () => {
  let accumulator: BlobAccumulator;

  beforeEach(() => {
    accumulator = makeBatchedBlobAccumulator(randomInt(1000)).toBlobAccumulator();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = accumulator.toBuffer();
    const res = BlobAccumulator.fromBuffer(buffer);
    expect(res).toEqual(accumulator);
  });

  it('serializes to fields and deserializes it back', () => {
    const fields = accumulator.toFields();
    expect(fields.length).toEqual(BLOB_ACCUMULATOR_LENGTH);
    const res = BlobAccumulator.fromFields(fields);
    expect(res).toEqual(accumulator);
  });
});
