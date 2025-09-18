import { makeParityRootPrivateInputs } from '../tests/factories.js';
import { ParityRootPrivateInputs } from './parity_root_private_inputs.js';

describe('ParityRootPrivateInputs', () => {
  it(`serializes a ParityRootPrivateInputs to buffer and deserializes it back`, () => {
    const expected = makeParityRootPrivateInputs();
    const buffer = expected.toBuffer();
    const res = ParityRootPrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it(`serializes a ParityRootPrivateInputs to hex string and deserializes it back`, () => {
    const expected = makeParityRootPrivateInputs();
    const str = expected.toString();
    const res = ParityRootPrivateInputs.fromString(str);
    expect(res).toEqual(expected);
  });
});
