import { randomInt } from '@aztec/foundation/crypto';

import { makeBatchedBlobAccumulator } from '../testing.js';
import { FinalBlobAccumulator } from './final_blob_accumulator.js';

describe('FinalBlobAccumulator', () => {
  let accumulator: FinalBlobAccumulator;

  beforeEach(() => {
    accumulator = makeBatchedBlobAccumulator(randomInt(1000)).toFinalBlobAccumulator();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = accumulator.toBuffer();
    const res = FinalBlobAccumulator.fromBuffer(buffer);
    expect(res).toEqual(accumulator);
  });
});
