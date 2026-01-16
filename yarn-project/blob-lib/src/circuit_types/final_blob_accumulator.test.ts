import { FinalBlobAccumulator } from './final_blob_accumulator.js';

describe('FinalBlobAccumulator', () => {
  it('serializes to buffer and deserializes it back', () => {
    const accumulator = FinalBlobAccumulator.random();
    const buffer = accumulator.toBuffer();
    const res = FinalBlobAccumulator.fromBuffer(buffer);
    expect(res).toEqual(accumulator);
  });
});
