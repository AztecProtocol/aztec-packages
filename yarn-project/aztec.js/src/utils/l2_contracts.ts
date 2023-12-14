import { Fr, generateFunctionLeaves } from '@aztec/circuits.js';
import { computeFunctionTreeRoot } from '@aztec/circuits.js/abis';
import { ContractArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { PXE } from '@aztec/types';

/**
 * Checks whether a give contract is deployed on the network.
 * @param pxe - The PXE to use to obtain the information.
 * @param contractAddress - The address of the contract to check.
 * @returns A flag indicating whether the contract is deployed.
 */
export async function isContractDeployed(pxe: PXE, contractAddress: AztecAddress): Promise<boolean> {
  return !!(await pxe.getContractData(contractAddress));
}

/**
 * Computes the root of a function tree for a given smart contract artifact.
 * @param artifact - The smart contract artifact.
 * @returns The computed function tree root based on the functions in the given contract artifact.
 */
export function computeContractFunctionTreeRoot(artifact: ContractArtifact): Fr {
  const functions = artifact.functions.map(f => ({
    ...f,
    selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
  }));
  const functionLeaves = generateFunctionLeaves(functions);
  return computeFunctionTreeRoot(functionLeaves);
}
