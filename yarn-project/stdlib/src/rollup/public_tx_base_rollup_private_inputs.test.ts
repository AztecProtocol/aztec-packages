import { makePublicTxBaseRollupPrivateInputs } from '../tests/factories.js';
import { PublicTxBaseRollupPrivateInputs } from './public_tx_base_rollup_private_inputs.js';

describe('PublicTxBaseRollupPrivateInputs', () => {
  it('serializes to buffer and deserializes it back', () => {
    const expected = makePublicTxBaseRollupPrivateInputs();
    const buffer = expected.toBuffer();
    const res = PublicTxBaseRollupPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });
});
