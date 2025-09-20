import { makeTxMergeRollupPrivateInputs } from '../tests/factories.js';
import { TxMergeRollupPrivateInputs } from './tx_merge_rollup_private_inputs.js';

describe('TxMergeRollupPrivateInputs', () => {
  it('serializes to buffer and deserializes it back', () => {
    const expected = makeTxMergeRollupPrivateInputs();
    const buffer = expected.toBuffer();
    const res = TxMergeRollupPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it('serializes to hex string and deserializes it back', () => {
    const expected = makeTxMergeRollupPrivateInputs();
    const str = expected.toString();
    const res = TxMergeRollupPrivateInputs.fromString(str);
    expect(res).toEqual(expected);
  });
});
