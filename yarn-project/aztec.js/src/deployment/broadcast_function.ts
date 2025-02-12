import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  AztecAddress,
  MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  REGISTERER_CONTRACT_ADDRESS,
  REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT,
  computeVerificationKeyHash,
  createPrivateFunctionMembershipProof,
  createUnconstrainedFunctionMembershipProof,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { type ContractArtifact, FunctionSelector, FunctionType, bufferAsFields } from '@aztec/foundation/abi';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';

import { type ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { type Wallet } from '../wallet/index.js';
import { getRegistererContract } from './protocol_contracts.js';

/**
 * Sets up a call to broadcast a private function's bytecode via the ClassRegisterer contract.
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
    unconstrainedFunctionsArtifactTreeRoot,
    privateFunctionTreeSiblingPath,
    privateFunctionTreeLeafIndex,
  } = await createPrivateFunctionMembershipProof(selector, artifact);

  const vkHash = await computeVerificationKeyHash(privateFunctionArtifact);
  const bytecode = bufferAsFields(
    privateFunctionArtifact.bytecode,
    MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  );

  await wallet.storeCapsule(
    AztecAddress.fromNumber(REGISTERER_CONTRACT_ADDRESS),
    new Fr(REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT),
    bytecode,
  );

  const registerer = await getRegistererContract(wallet);
  return Promise.resolve(
    registerer.methods.broadcast_private_function(
      contractClass.id,
      artifactMetadataHash,
      unconstrainedFunctionsArtifactTreeRoot,
      privateFunctionTreeSiblingPath,
      privateFunctionTreeLeafIndex,
      padArrayEnd(artifactTreeSiblingPath, Fr.ZERO, ARTIFACT_FUNCTION_TREE_MAX_HEIGHT),
      artifactTreeLeafIndex,
      // eslint-disable-next-line camelcase
      { selector, metadata_hash: functionMetadataHash, vk_hash: vkHash },
    ),
  );
}

/**
 * Sets up a call to broadcast an unconstrained function's bytecode via the ClassRegisterer contract.
 * Note that this is not required for users to call the function, but is rather a convenience to make
 * this code publicly available so dapps or wallets do not need to redistribute it.
 * @param wallet - Wallet to send the transaction.
 * @param artifact - Contract artifact that contains the function to be broadcast.
 * @param selector - Selector of the function to be broadcast.
 * @returns A ContractFunctionInteraction object that can be used to send the transaction.
 */
export async function broadcastUnconstrainedFunction(
  wallet: Wallet,
  artifact: ContractArtifact,
  selector: FunctionSelector,
): Promise<ContractFunctionInteraction> {
  const contractClass = await getContractClassFromArtifact(artifact);
  const unconstrainedFunctions = artifact.functions.filter(fn => fn.functionType === FunctionType.UNCONSTRAINED);
  const unconstrainedFunctionsAndSelectors = await Promise.all(
    unconstrainedFunctions.map(async fn => ({
      f: fn,
      selector: await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters),
    })),
  );
  const unconstrainedFunctionArtifact = unconstrainedFunctionsAndSelectors.find(fn => selector.equals(fn.selector))?.f;
  if (!unconstrainedFunctionArtifact) {
    throw new Error(`Unconstrained function with selector ${selector.toString()} not found`);
  }

  const {
    artifactMetadataHash,
    artifactTreeLeafIndex,
    artifactTreeSiblingPath,
    functionMetadataHash,
    privateFunctionsArtifactTreeRoot,
  } = await createUnconstrainedFunctionMembershipProof(selector, artifact);

  const bytecode = bufferAsFields(
    unconstrainedFunctionArtifact.bytecode,
    MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  );

  await wallet.storeCapsule(
    AztecAddress.fromNumber(REGISTERER_CONTRACT_ADDRESS),
    new Fr(REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT),
    bytecode,
  );

  const registerer = await getRegistererContract(wallet);
  return registerer.methods.broadcast_unconstrained_function(
    contractClass.id,
    artifactMetadataHash,
    privateFunctionsArtifactTreeRoot,
    padArrayEnd(artifactTreeSiblingPath, Fr.ZERO, ARTIFACT_FUNCTION_TREE_MAX_HEIGHT),
    artifactTreeLeafIndex,
    // eslint-disable-next-line camelcase
    { selector, metadata_hash: functionMetadataHash },
  );
}
