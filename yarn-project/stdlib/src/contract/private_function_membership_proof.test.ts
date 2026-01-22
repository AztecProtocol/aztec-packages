import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';

import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '../abi/index.js';
import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { computeVerificationKeyHash, getContractClassFromArtifact } from './contract_class.js';
import type { ContractClassIdPreimage } from './contract_class_id.js';
import type { ContractClass } from './interfaces/contract_class.js';
import {
  createPrivateFunctionMembershipProof,
  isValidPrivateFunctionMembershipProof,
} from './private_function_membership_proof.js';

const log = createLogger('test:private_function_membership_proof');

describe('private_function_membership_proof', () => {
  let artifact: ContractArtifact;
  let contractClass: ContractClass & ContractClassIdPreimage;
  let privateFunction: FunctionArtifact;
  let vkHash: Fr;
  let selector: FunctionSelector;

  beforeAll(async () => {
    artifact = getBenchmarkContractArtifact();
    contractClass = await getContractClassFromArtifact(artifact);
    privateFunction = artifact.functions.findLast(fn => fn.functionType === FunctionType.PRIVATE)!;
    vkHash = await computeVerificationKeyHash(privateFunction);
    selector = await FunctionSelector.fromNameAndParameters(privateFunction);
  });

  it('computes and verifies a proof', async () => {
    const proof = await createPrivateFunctionMembershipProof(selector, artifact, log);
    const fn = { ...privateFunction, ...proof, selector, vkHash };
    await expect(isValidPrivateFunctionMembershipProof(fn, contractClass, log)).resolves.toBeTruthy();
  });

  test.each([
    'artifactTreeSiblingPath',
    'artifactMetadataHash',
    'functionMetadataHash',
    'utilityFunctionsTreeRoot',
    'privateFunctionTreeSiblingPath',
  ] as const)('fails proof if %s is mangled', async field => {
    const proof = await createPrivateFunctionMembershipProof(selector, artifact, log);
    const original = proof[field];
    const mangled = Array.isArray(original) ? [Fr.random(), ...original.slice(1)] : Fr.random();
    const wrong = { ...proof, [field]: mangled };
    const fn = { ...privateFunction, ...wrong, selector, vkHash };
    await expect(isValidPrivateFunctionMembershipProof(fn, contractClass, log)).resolves.toBeFalsy();
  });
});
