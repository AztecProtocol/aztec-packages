import { CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import {
  type ContractArtifact,
  type FunctionAbi,
  type FunctionArtifact,
  FunctionSelector,
  getAllFunctionAbis,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  computeInitializationHash,
} from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import { deriveKeys } from '@aztec/stdlib/keys';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/stdlib/testing';
import type { UInt64 } from '@aztec/stdlib/types';

import { strict as assert } from 'assert';
import merge from 'lodash.merge';

export const PUBLIC_DISPATCH_FN_NAME = 'public_dispatch';
export const DEFAULT_TIMESTAMP: UInt64 = 99833n;
export const DEFAULT_BLOCK_NUMBER = BlockNumber(42);

/**
 * Create a new object with all the same properties as the original, except for the ones in the overrides object.
 */
export function allSameExcept(original: any, overrides: any): any {
  return merge({}, original, overrides);
}

export function getFunctionSelector(
  functionName: string,
  contractArtifact: ContractArtifact,
): Promise<FunctionSelector> {
  const fnArtifact = getAllFunctionAbis(contractArtifact).find(f => f.name === functionName)!;
  assert(!!fnArtifact, `Function ${functionName} not found in ${contractArtifact.name}`);
  const params = fnArtifact.parameters;
  return FunctionSelector.fromNameAndParameters(fnArtifact.name, params);
}

export function getContractFunctionArtifact(
  functionName: string,
  contractArtifact: ContractArtifact,
): FunctionArtifact | undefined {
  return contractArtifact.functions.find(f => f.name === functionName);
}

export function getContractFunctionAbi(
  functionName: string,
  contractArtifact: ContractArtifact,
): FunctionAbi | undefined {
  return (
    contractArtifact.functions.find(f => f.name === functionName) ??
    contractArtifact.nonDispatchPublicFunctions.find(f => f.name === functionName)
  );
}

/**
 * Create a contract class and instance given constructor args, artifact, etc.
 * NOTE: This is useful for testing real-ish contract class registration and instance deployment TXs (via logs)
 * @param constructorArgs - The constructor arguments for the contract.
 * @param deployer - The deployer of the contract.
 * @param contractArtifact - The contract artifact for the contract.
 * @param seed - The seed for the contract.
 * @param originalContractClassId - The original contract class ID (if upgraded)
 * @returns The contract class, instance, and contract address nullifier.
 */
export async function createContractClassAndInstance(
  constructorArgs: any[],
  deployer: AztecAddress,
  contractArtifact: ContractArtifact,
  seed = 0,
  contractClassSeed = seed,
  originalContractClassId?: Fr, // if previously upgraded
): Promise<{
  contractClass: ContractClassPublic;
  contractInstance: ContractInstanceWithAddress;
  contractAddressNullifier: Fr;
}> {
  const bytecode = (getContractFunctionArtifact(PUBLIC_DISPATCH_FN_NAME, contractArtifact) as FunctionArtifact)!
    .bytecode;
  const contractClass = await makeContractClassPublic(contractClassSeed, bytecode);

  const constructorAbi = getContractFunctionAbi('constructor', contractArtifact);
  const { publicKeys } = await deriveKeys(new Fr(seed));
  const initializationHash = await computeInitializationHash(constructorAbi, constructorArgs);
  const immutablesHash = new Fr(seed + 1);
  const contractInstance =
    originalContractClassId === undefined
      ? await makeContractInstanceFromClassId(contractClass.id, seed, {
          deployer,
          initializationHash,
          immutablesHash,
          publicKeys,
        })
      : await makeContractInstanceFromClassId(originalContractClassId, seed, {
          deployer,
          initializationHash,
          currentClassId: contractClass.id,
          immutablesHash,
          publicKeys,
        });

  const contractAddressNullifier = await siloNullifier(
    AztecAddress.fromNumberUnsafe(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
    contractInstance.address.toField(),
  );

  return { contractClass, contractInstance, contractAddressNullifier };
}
