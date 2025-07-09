import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
  MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type ContractArtifact, FunctionSelector, FunctionType, bufferAsFields } from '@aztec/stdlib/abi';
import {
  computeVerificationKeyHash,
  createPrivateFunctionMembershipProof,
  createUtilityFunctionMembershipProof,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { Capsule } from '@aztec/stdlib/tx';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { getClassRegistryContract } from '../contract/protocol_contracts.js';
import type { Wallet } from '../wallet/index.js';

/**
 * Sets up a call to broadcast a private function's bytecode via the ClassRegistry contract.
 * Note that this is not required for users to call the function, but is rather a convenience to make
 * this code publicly available so dapps or wallets do not need to redistribute it.
 * @param wallet - Wallet to send the transaction.
 * @param artifact - Contract artifact that contains the function to be broadcast.
 * @param selector - Selector of the function to be broadcast.
 * @returns A ContractFunctionInteraction object that can be used to send the transaction.
 */
export async function broadcastPrivateFunction(
  wallet: Wallet,
  artifact: ContractArtifact,
  selector: FunctionSelector,
): Promise<ContractFunctionInteraction> {
  const contractClass = await getContractClassFromArtifact(artifact);
  const privateFunctions = artifact.functions.filter(fn => fn.functionType === FunctionType.PRIVATE);
  const functionsAndSelectors = await Promise.all(
    privateFunctions.map(async fn => ({
      f: fn,
      selector: await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters),
    })),
  );
  const privateFunctionArtifact = functionsAndSelectors.find(fn => selector.equals(fn.selector))?.f;
  if (!privateFunctionArtifact) {
    throw new Error(`Private function with selector ${selector.toString()} not found`);
  }

  const {
    artifactTreeSiblingPath,
    artifactTreeLeafIndex,
    artifactMetadataHash,
    functionMetadataHash,
    utilityFunctionsTreeRoot,
    privateFunctionTreeSiblingPath,
    privateFunctionTreeLeafIndex,
  } = await createPrivateFunctionMembershipProof(selector, artifact);

  const vkHash = await computeVerificationKeyHash(privateFunctionArtifact);

  const classRegistry = await getClassRegistryContract(wallet);
  const bytecode = bufferAsFields(
    privateFunctionArtifact.bytecode,
    MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  );
  return classRegistry.methods
    .broadcast_private_function(
      contractClass.id,
      artifactMetadataHash,
      utilityFunctionsTreeRoot,
      privateFunctionTreeSiblingPath,
      privateFunctionTreeLeafIndex,
      padArrayEnd(artifactTreeSiblingPath, Fr.ZERO, ARTIFACT_FUNCTION_TREE_MAX_HEIGHT),
      artifactTreeLeafIndex,
      // eslint-disable-next-line camelcase
      { selector, metadata_hash: functionMetadataHash, vk_hash: vkHash },
    )
    .with({
      capsules: [
        new Capsule(
          ProtocolContractAddress.ContractClassRegistry,
          new Fr(CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT),
          bytecode,
        ),
      ],
    });
}

/**
 * Sets up a call to broadcast a utility function's bytecode via the ClassRegistry contract.
 * Note that this is not required for users to call the function, but is rather a convenience to make
 * this code publicly available so dapps or wallets do not need to redistribute it.
 * @param wallet - Wallet to send the transaction.
 * @param artifact - Contract artifact that contains the function to be broadcast.
 * @param selector - Selector of the function to be broadcast.
 * @returns A ContractFunctionInteraction object that can be used to send the transaction.
 */
export async function broadcastUtilityFunction(
  wallet: Wallet,
  artifact: ContractArtifact,
  selector: FunctionSelector,
): Promise<ContractFunctionInteraction> {
  const contractClass = await getContractClassFromArtifact(artifact);
  const utilityFunctions = artifact.functions.filter(fn => fn.functionType === FunctionType.UTILITY);
  const utilityFunctionsAndSelectors = await Promise.all(
    utilityFunctions.map(async fn => ({
      f: fn,
      selector: await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters),
    })),
  );
  const utilityFunctionArtifact = utilityFunctionsAndSelectors.find(fn => selector.equals(fn.selector))?.f;
  if (!utilityFunctionArtifact) {
    throw new Error(`Utility function with selector ${selector.toString()} not found`);
  }

  const {
    artifactMetadataHash,
    artifactTreeLeafIndex,
    artifactTreeSiblingPath,
    functionMetadataHash,
    privateFunctionsArtifactTreeRoot,
  } = await createUtilityFunctionMembershipProof(selector, artifact);

  const classRegistry = await getClassRegistryContract(wallet);
  const bytecode = bufferAsFields(
    utilityFunctionArtifact.bytecode,
    MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  );
  return classRegistry.methods
    .broadcast_utility_function(
      contractClass.id,
      artifactMetadataHash,
      privateFunctionsArtifactTreeRoot,
      padArrayEnd(artifactTreeSiblingPath, Fr.ZERO, ARTIFACT_FUNCTION_TREE_MAX_HEIGHT),
      artifactTreeLeafIndex,
      // eslint-disable-next-line camelcase
      { selector, metadata_hash: functionMetadataHash },
    )
    .with({
      capsules: [
        new Capsule(
          ProtocolContractAddress.ContractClassRegistry,
          new Fr(CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT),
          bytecode,
        ),
      ],
    });
}
