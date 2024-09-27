import { makeEmptyBlockRootRollupInputs } from '../../tests/factories.js';
import { EmptyBlockRootRollupInputs } from './empty_block_root_rollup_inputs.js';

describe('EmptyBlockRootRollupInputs', () => {
  it(`serializes a EmptyBlockRootRollupInputs to buffer and deserializes it back`, () => {
    const expected = makeEmptyBlockRootRollupInputs();
    const buffer = expected.toBuffer();
    const res = EmptyBlockRootRollupInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it(`serializes a EmptyBlockRootRollupInputs to hex string and deserializes it back`, () => {
    const expected = makeEmptyBlockRootRollupInputs();
    const str = expected.toString();
    const res = EmptyBlockRootRollupInputs.fromString(str);
    expect(res).toEqual(expected);
  });
});
