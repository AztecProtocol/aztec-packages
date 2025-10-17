import type { ContractArtifact } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';

import type { ProtocolContract } from './protocol_contract.js';
import { ProtocolContractAddress, type ProtocolContractName, ProtocolContractSalt } from './protocol_contract_data.js';

/**
 * Constructs a canonical ProtocolContract object from a contract name and artifact.
 *
 * This internal utility function creates a fully-initialized protocol contract by:
 * 1. Looking up the predetermined deployment address for the given protocol contract
 * 2. Deriving the contract class from the artifact
 * 3. Computing the contract instance using the canonical salt
 * 4. Combining all information into a ProtocolContract object
 *
 * @param name - The name of the protocol contract (e.g., 'FeeJuice', 'ContractClassRegistry')
 * @param artifact - The compiled contract artifact containing ABI and bytecode
 * @returns A Promise resolving to the complete ProtocolContract with all metadata
 *
 * @remarks
 * This function is primarily intended for internal use within the protocol-contracts package.
 * Each protocol contract module (fee-juice, class-registry, etc.) uses this to construct
 * its canonical contract instance.
 *
 * The salt used for instantiation is deterministic and defined in the protocol specification,
 * ensuring that all nodes derive the same contract addresses.
 *
 * @internal
 *
 * @example
 * ```typescript
 * // Internal usage within a protocol contract module
 * const artifact = loadContractArtifact(FeeJuiceJson);
 * const feeJuice = await makeProtocolContract('FeeJuice', artifact);
 * ```
 */
export async function makeProtocolContract(
  name: ProtocolContractName,
  artifact: ContractArtifact,
): Promise<ProtocolContract> {
  const address = ProtocolContractAddress[name];
  const salt = ProtocolContractSalt[name];
  // TODO(@spalladino): This computes the contract class from the artifact twice.
  const contractClass = await getContractClassFromArtifact(artifact);
  const instance = await getContractInstanceFromInstantiationParams(artifact, { salt });
  return {
    instance: { ...instance, address },
    contractClass,
    artifact,
    address,
  };
}
