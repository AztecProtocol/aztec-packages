import { makeRootParityInput } from '../../tests/factories.js';
import { NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS, RECURSIVE_PROOF_LENGTH_IN_FIELDS } from '../recursive_proof.js';
import { RootParityInput } from './root_parity_input.js';

describe('RootParityInput', () => {
  it(`serializes a recursive proof RootParityInput to buffer and deserializes it back`, () => {
    const expected = makeRootParityInput<typeof RECURSIVE_PROOF_LENGTH_IN_FIELDS>(RECURSIVE_PROOF_LENGTH_IN_FIELDS);
    const buffer = expected.toBuffer();
    const res = RootParityInput.fromBuffer(buffer, RECURSIVE_PROOF_LENGTH_IN_FIELDS);
    expect(res).toEqual(expected);
  });

  it(`serializes a nested recursive proof RootParityInput to buffer and deserializes it back`, () => {
    const expected = makeRootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS>(
      NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS,
    );
    const buffer = expected.toBuffer();
    const res = RootParityInput.fromBuffer(buffer, NESTED_RECURSIVE_PROOF_LENGTH_IN_FIELDS);
    expect(res).toEqual(expected);
  });
});
