import { getContractClassFromArtifact, getContractInstanceFromDeployParams } from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';

import { type ProtocolContract } from './protocol_contract.js';
import { ProtocolContractAddress, type ProtocolContractName, ProtocolContractSalt } from './protocol_contract_data.js';

/**
 * Returns the canonical deployment given its name and artifact.
 * To be used internally within the protocol-contracts package.
 */
export function makeProtocolContract(name: ProtocolContractName, artifact: ContractArtifact): ProtocolContract {
  const address = ProtocolContractAddress[name];
  const salt = ProtocolContractSalt[name];
  // TODO(@spalladino): This computes the contract class from the artifact twice.
  const contractClass = getContractClassFromArtifact(artifact);
  const instance = getContractInstanceFromDeployParams(artifact, { salt });
  return {
    instance: { ...instance, address },
    contractClass,
    artifact,
    address,
  };
}
