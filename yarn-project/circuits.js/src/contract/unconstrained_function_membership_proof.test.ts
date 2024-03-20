import { ContractArtifact, FunctionArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { ContractClass } from '@aztec/types/contracts';

import { getSampleContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';
import { ContractClassIdPreimage } from './contract_class_id.js';
import {
  createUnconstrainedFunctionMembershipProof,
  isValidUnconstrainedFunctionMembershipProof,
} from './unconstrained_function_membership_proof.js';

describe('unconstrained_function_membership_proof', () => {
  let artifact: ContractArtifact;
  let contractClass: ContractClass & ContractClassIdPreimage;
  let unconstrainedFunction: FunctionArtifact;
  let vkHash: Fr;
  let selector: FunctionSelector;

  beforeAll(() => {
    artifact = getSampleContractArtifact();
    contractClass = getContractClassFromArtifact(artifact);
    unconstrainedFunction = artifact.functions.findLast(fn => fn.functionType === FunctionType.UNCONSTRAINED)!;
    selector = FunctionSelector.fromNameAndParameters(unconstrainedFunction);
  });

  it('computes and verifies a proof', () => {
    const proof = createUnconstrainedFunctionMembershipProof(selector, artifact);
    const bytecode = Buffer.from(unconstrainedFunction.bytecode, 'base64');
    const fn = { ...unconstrainedFunction, ...proof, bytecode, selector };
    expect(isValidUnconstrainedFunctionMembershipProof(fn, contractClass)).toBeTruthy();
  });

  test.each(['artifactTreeSiblingPath', 'artifactMetadataHash', 'functionMetadataHash'] as const)(
    'fails proof if %s is mangled',
    field => {
      const proof = createUnconstrainedFunctionMembershipProof(selector, artifact);
      const original = proof[field];
      const mangled = Array.isArray(original) ? [Fr.random(), ...original.slice(1)] : Fr.random();
      const wrong = { ...proof, [field]: mangled };
      const bytecode = Buffer.from(unconstrainedFunction.bytecode, 'base64');
      const fn = { ...unconstrainedFunction, ...wrong, bytecode, selector, vkHash };
      expect(isValidUnconstrainedFunctionMembershipProof(fn, contractClass)).toBeFalsy();
    },
  );
});
