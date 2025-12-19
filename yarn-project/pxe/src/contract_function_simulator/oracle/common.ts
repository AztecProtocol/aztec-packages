import type { FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { ORACLE_VERSION } from '../../oracle_version.js';
import type { ContractDataProvider } from '../../storage/index.js';

// TODO: this might not be the final home for these functions,
// it's just a way of starting to dissolve PXEOracleInterface

export async function getFunctionArtifact(
  contractAddress: AztecAddress,
  selector: FunctionSelector,
  contractDataProvider: ContractDataProvider,
): Promise<FunctionArtifactWithContractName> {
  const artifact = await contractDataProvider.getFunctionArtifact(contractAddress, selector);
  if (!artifact) {
    throw new Error(`Function artifact not found for contract ${contractAddress} and selector ${selector}.`);
  }
  const debug = await contractDataProvider.getFunctionDebugMetadata(contractAddress, selector);
  return {
    ...artifact,
    debug,
  };
}

export function assertCompatibleOracleVersion(version: number): void {
  if (version !== ORACLE_VERSION) {
    throw new Error(`Incompatible oracle version. Expected version ${ORACLE_VERSION}, got ${version}.`);
  }
}
