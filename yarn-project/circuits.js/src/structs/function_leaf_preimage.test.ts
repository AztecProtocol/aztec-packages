import { FunctionSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

import { FunctionLeafPreimage } from './function_leaf_preimage.js';

describe('FunctionLeafPreimage', () => {
  let leaf: FunctionLeafPreimage;

  beforeAll(() => {
    leaf = new FunctionLeafPreimage(new FunctionSelector(8972), false, true, Fr.ZERO, Fr.ZERO);
  });

  it(`serializes to buffer and deserializes it back`, () => {
    const buffer = leaf.toBuffer();
    const res = FunctionLeafPreimage.fromBuffer(buffer);
    expect(res).toEqual(leaf);
  });

  it('computes a function leaf', () => {
    const res = leaf.hash();
    expect(res).toMatchSnapshot();
  });
});
