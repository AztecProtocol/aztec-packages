import { Fr } from '@aztec/foundation/fields';

import { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '../../constants.gen.js';
import { makeHeader } from '../../tests/factories.js';
import { makeRecursiveProof } from '../recursive_proof.js';
import { VerificationKeyAsFields } from '../verification_key.js';
import {
  EmptyNestedData,
  PrivateKernelEmptyInputData,
  PrivateKernelEmptyInputs,
} from './private_kernel_empty_inputs.js';

describe('PrivateKernelEmptyInputData', () => {
  it('serializes and deserializes', () => {
    const obj = new PrivateKernelEmptyInputData(makeHeader(), Fr.random(), Fr.random(), Fr.random(), Fr.random());
    expect(PrivateKernelEmptyInputData.fromString(obj.toString())).toEqual(obj);
  });
});

describe('PrivateKernelEmptyInputs', () => {
  it('serializes and deserializes', () => {
    const obj = new PrivateKernelEmptyInputs(
      new EmptyNestedData(
        makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        VerificationKeyAsFields.makeFakeRollupHonk(),
      ),
      makeHeader(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
      Fr.random(),
    );

    expect(PrivateKernelEmptyInputs.fromBuffer(obj.toBuffer())).toEqual(obj);
  });
});

describe('EmptyNestedData', () => {
  it('serializes and deserializes', () => {
    const obj = new EmptyNestedData(
      makeRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      VerificationKeyAsFields.makeFakeRollupHonk(),
    );
    expect(EmptyNestedData.fromBuffer(obj.toBuffer())).toEqual(obj);
  });
});
