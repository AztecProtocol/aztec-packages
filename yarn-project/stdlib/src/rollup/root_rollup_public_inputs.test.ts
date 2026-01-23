import { ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH } from '@aztec/constants';

import { makeRootRollupPublicInputs } from '../tests/factories.js';
import { RootRollupPublicInputs } from './root_rollup_public_inputs.js';

describe('root_rollup_public_inputs', () => {
  it(`serializes a RootRollupPublicInputs to buffer and deserializes it back`, () => {
    const expected = makeRootRollupPublicInputs();
    const buffer = expected.toBuffer();
    const res = RootRollupPublicInputs.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });

  it(`serializes a RootRollupPublicInputs to hex string and deserializes it back`, () => {
    const expected = makeRootRollupPublicInputs();
    const str = expected.toString();
    const res = RootRollupPublicInputs.fromString(str);
    expect(res).toEqual(expected);
  });

  it(`serializes a RootRollupPublicInputs to fields and matches constant`, () => {
    const expected = makeRootRollupPublicInputs();
    const fields = expected.toFields();
    expect(fields.length).toBe(ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH);
  });
});
