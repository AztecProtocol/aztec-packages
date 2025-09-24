import { makeBlockMergeRollupPrivateInputs } from '../tests/factories.js';
import { BlockMergeRollupPrivateInputs } from './block_merge_rollup_private_inputs.js';

describe('BlockMergeRollupPrivateInputs', () => {
  it('serializes to buffer and deserializes it back', () => {
    const expected = makeBlockMergeRollupPrivateInputs();
    const buffer = expected.toBuffer();
    const res = BlockMergeRollupPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it('serializes to hex string and deserializes it back', () => {
    const expected = makeBlockMergeRollupPrivateInputs();
    const str = expected.toString();
    const res = BlockMergeRollupPrivateInputs.fromString(str);
    expect(res).toEqual(expected);
  });
});
