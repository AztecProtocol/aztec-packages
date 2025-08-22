import { makeParityBasePrivateInputs } from '../tests/factories.js';
import { ParityBasePrivateInputs } from './parity_base_private_inputs.js';

describe('ParityBasePrivateInputs', () => {
  it(`serializes a ParityBasePrivateInputs to buffer and deserializes it back`, () => {
    const expected = makeParityBasePrivateInputs();
    const buffer = expected.toBuffer();
    const res = ParityBasePrivateInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it(`serializes a ParityBasePrivateInputs to hex string and deserializes it back`, () => {
    const expected = makeParityBasePrivateInputs();
    const str = expected.toString();
    const res = ParityBasePrivateInputs.fromString(str);
    expect(res).toEqual(expected);
  });
});
