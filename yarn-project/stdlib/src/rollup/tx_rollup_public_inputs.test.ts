import { makeTxRollupPublicInputs } from '../tests/factories.js';
import { TxRollupPublicInputs } from './tx_rollup_public_inputs.js';

describe('TxRollupPublicInputs', () => {
  it(`serializes to buffer and deserializes it back`, () => {
    const expected = makeTxRollupPublicInputs();
    const buffer = expected.toBuffer();
    const res = TxRollupPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it(`serializes to hex string and deserializes it back`, () => {
    const expected = makeTxRollupPublicInputs();
    const str = expected.toString();
    const res = TxRollupPublicInputs.fromString(str);
    expect(res).toEqual(expected);
  });
});
