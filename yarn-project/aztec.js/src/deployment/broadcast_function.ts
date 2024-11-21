import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
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
  const privateFunctionArtifact = (
    await Promise.all(
      artifact.functions.map(async fn =>
        selector.equals(await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)) ? fn : undefined,
      ),
    )
  ).find(fn => !!fn);
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

  const vkHash = computeVerificationKeyHash(privateFunctionArtifact);
  const bytecode = bufferAsFields(
    privateFunctionArtifact.bytecode,
    MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  );

  await wallet.addCapsule(bytecode);

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
  const functionArtifactIndex = (
    await Promise.all(
      artifact.functions.map(async fn => {
        return (
          fn.functionType === FunctionType.UNCONSTRAINED &&
          selector.equals(await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters))
        );
      }),
    )
  ).findIndex(fn => !!fn);
  if (functionArtifactIndex < 0) {
    throw new Error(`Unconstrained function with selector ${selector.toString()} not found`);
  }
  const functionArtifact = artifact.functions[functionArtifactIndex];

  const {
    artifactMetadataHash,
    artifactTreeLeafIndex,
    artifactTreeSiblingPath,
    functionMetadataHash,
    privateFunctionsArtifactTreeRoot,
  } = await createUnconstrainedFunctionMembershipProof(selector, artifact);

  const bytecode = bufferAsFields(functionArtifact.bytecode, MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS);

  await wallet.addCapsule(bytecode);

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
