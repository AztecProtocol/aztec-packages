import { makePublicBaseRollupInputs } from '../../tests/factories.js';
import { PublicBaseRollupInputs } from './public_base_rollup_inputs.js';

describe('PublicBaseRollupInputs', () => {
  it('serializes to buffer and deserializes it back', () => {
    const expected = makePublicBaseRollupInputs();
    const buffer = expected.toBuffer();
    const res = PublicBaseRollupInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });
});
