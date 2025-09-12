import type { ContractArtifact } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';

import type { ProtocolContract } from './protocol_contract.js';
import { ProtocolContractAddress, type ProtocolContractName, ProtocolContractSalt } from './protocol_contract_data.js';

/**
 * Returns the canonical deployment given its name and artifact.
 * To be used internally within the protocol-contracts package.
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
