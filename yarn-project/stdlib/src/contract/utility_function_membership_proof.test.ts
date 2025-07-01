import { Fr } from '@aztec/foundation/fields';

import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '../abi/index.js';
import { getTestContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';
import type { ContractClassIdPreimage } from './contract_class_id.js';
import type { ContractClass } from './interfaces/contract_class.js';
import {
  createUtilityFunctionMembershipProof,
  isValidUtilityFunctionMembershipProof,
} from './utility_function_membership_proof.js';

describe('utility_function_membership_proof', () => {
  let artifact: ContractArtifact;
  let contractClass: ContractClass & ContractClassIdPreimage;
  let utilityFunction: FunctionArtifact;
  const vkHash: Fr = Fr.random();
  let selector: FunctionSelector;

  beforeEach(async () => {
    artifact = getTestContractArtifact();
    contractClass = await getContractClassFromArtifact(artifact);
    utilityFunction = artifact.functions.findLast(fn => fn.functionType === FunctionType.UTILITY)!;
    selector = await FunctionSelector.fromNameAndParameters(utilityFunction);
  });

  const isUtility = (fn: { functionType: FunctionType }) => fn.functionType === FunctionType.UTILITY;

  it('computes and verifies a proof', async () => {
    expect(utilityFunction).toBeDefined();
    const proof = await createUtilityFunctionMembershipProof(selector, artifact);
    const fn = { ...utilityFunction, ...proof, selector };
    await expect(isValidUtilityFunctionMembershipProof(fn, contractClass)).resolves.toBeTruthy();
  });

  it('handles a contract with a single function', async () => {
    // Remove all utility functions from the contract but one
    const utilityFns = artifact.functions.filter(isUtility);
    artifact.functions = artifact.functions.filter(fn => !isUtility(fn) || fn === utilityFns[0]);
    expect(artifact.functions.filter(isUtility).length).toBe(1);

    const utilityFunction = utilityFns[0];
    const selector = await FunctionSelector.fromNameAndParameters(utilityFunction);

    const proof = await createUtilityFunctionMembershipProof(selector, artifact);
    expect(proof.artifactTreeSiblingPath.length).toBe(0);

    const fn = { ...utilityFunction, ...proof, selector };
    const contractClass = await getContractClassFromArtifact(artifact);
    await expect(isValidUtilityFunctionMembershipProof(fn, contractClass)).resolves.toBeTruthy();
  });

  test.each(['artifactTreeSiblingPath', 'artifactMetadataHash', 'functionMetadataHash'] as const)(
    'fails proof if %s is mangled',
    async field => {
      const proof = await createUtilityFunctionMembershipProof(selector, artifact);
      const original = proof[field];
      const mangled = Array.isArray(original) ? [Fr.random(), ...original.slice(1)] : Fr.random();
      const wrong = { ...proof, [field]: mangled };
      const fn = { ...utilityFunction, ...wrong, selector, vkHash };
      await expect(isValidUtilityFunctionMembershipProof(fn, contractClass)).resolves.toBeFalsy();
    },
  );
});
