import {
  computeCompleteAddress,
  computeFunctionTreeRoot,
  computeVarArgsHash,
  hashConstructor,
} from '@aztec/circuits.js/abis';
import { ContractArtifact, FunctionSelector, encodeArguments } from '@aztec/foundation/abi';

import { CircuitsWasm, DeploymentInfo, Fr, FunctionData, PublicKey } from '../index.js';
import { generateFunctionLeaves, hashVKStr, isConstructor } from './contract_tree/contract_tree.js';

/**
 * Generates the deployment info for a contract
 * @param artifact - The account contract build artifact.
 * @param args - The args to the account contract constructor
 * @param contractAddressSalt - The salt to be used in the contract address derivation
 * @param publicKey - The account public key
 * @returns - The contract deployment info
 */
export async function getContractDeploymentInfo(
  artifact: ContractArtifact,
  args: any[],
  contractAddressSalt: Fr,
  publicKey: PublicKey,
): Promise<DeploymentInfo> {
  const constructorArtifact = artifact.functions.find(isConstructor);
  if (!constructorArtifact) {
    throw new Error('Cannot find constructor in the artifact.');
  }
  if (!constructorArtifact.verificationKey) {
    throw new Error('Missing verification key for the constructor.');
  }

  const wasm = await CircuitsWasm.get();
  const vkHash = hashVKStr(constructorArtifact.verificationKey, wasm);
  const constructorVkHash = Fr.fromBuffer(vkHash);
  const functions = artifact.functions.map(f => ({
    ...f,
    selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
  }));
  const leaves = generateFunctionLeaves(functions, wasm);
  const functionTreeRoot = computeFunctionTreeRoot(wasm, leaves);
  const functionData = FunctionData.fromAbi(constructorArtifact);
  const flatArgs = encodeArguments(constructorArtifact, args);
  const argsHash = await computeVarArgsHash(wasm, flatArgs);
  const constructorHash = hashConstructor(wasm, functionData, argsHash, constructorVkHash.toBuffer());

  const completeAddress = computeCompleteAddress(
    wasm,
    publicKey,
    contractAddressSalt,
    functionTreeRoot,
    constructorHash,
  );

  return {
    completeAddress,
    constructorHash: constructorVkHash,
    functionTreeRoot,
  };
}
