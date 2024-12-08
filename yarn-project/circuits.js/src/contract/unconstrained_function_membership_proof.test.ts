import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

import { getTestContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';
import { type ContractClassIdPreimage } from './contract_class_id.js';
import { type ContractClass } from './interfaces/contract_class.js';
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

  beforeEach(async () => {
    artifact = getTestContractArtifact();
    contractClass = await getContractClassFromArtifact(artifact);
    unconstrainedFunction = artifact.functions.findLast(fn => fn.functionType === FunctionType.UNCONSTRAINED)!;
    selector = await FunctionSelector.fromNameAndParameters(unconstrainedFunction);
  });

  const isUnconstrained = (fn: { functionType: FunctionType }) => fn.functionType === FunctionType.UNCONSTRAINED;

  it('computes and verifies a proof', async () => {
    expect(unconstrainedFunction).toBeDefined();
    const proof = await createUnconstrainedFunctionMembershipProof(selector, artifact);
    const fn = { ...unconstrainedFunction, ...proof, selector };
    expect(isValidUnconstrainedFunctionMembershipProof(fn, contractClass)).toBeTruthy();
  });

  it('handles a contract with a single function', async () => {
    // Remove all unconstrained functions from the contract but one
    const unconstrainedFns = artifact.functions.filter(isUnconstrained);
    artifact.functions = artifact.functions.filter(fn => !isUnconstrained(fn) || fn === unconstrainedFns[0]);
    expect(artifact.functions.filter(isUnconstrained).length).toBe(1);

    const unconstrainedFunction = unconstrainedFns[0];
    const selector = await FunctionSelector.fromNameAndParameters(unconstrainedFunction);

    const proof = await createUnconstrainedFunctionMembershipProof(selector, artifact);
    expect(proof.artifactTreeSiblingPath.length).toBe(0);

    const fn = { ...unconstrainedFunction, ...proof, selector };
    const contractClass = await getContractClassFromArtifact(artifact);
    expect(isValidUnconstrainedFunctionMembershipProof(fn, contractClass)).toBeTruthy();
  });

  test.each(['artifactTreeSiblingPath', 'artifactMetadataHash', 'functionMetadataHash'] as const)(
    'fails proof if %s is mangled',
    async field => {
      const proof = await createUnconstrainedFunctionMembershipProof(selector, artifact);
      const original = proof[field];
      const mangled = Array.isArray(original) ? [Fr.random(), ...original.slice(1)] : Fr.random();
      const wrong = { ...proof, [field]: mangled };
      const fn = { ...unconstrainedFunction, ...wrong, selector, vkHash };
      expect(isValidUnconstrainedFunctionMembershipProof(fn, contractClass)).toBeFalsy();
    },
  );
});
