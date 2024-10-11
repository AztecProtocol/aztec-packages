import {
  type AztecAddress,
  type ContractClassIdPreimage,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';

import {
  ProtocolContractAddress,
  ProtocolContractArtifact,
  type ProtocolContractName,
  ProtocolContractSalt,
} from './protocol_contract_data.js';

/** Represents a canonical contract in the protocol. */
export interface ProtocolContract {
  /** Canonical deployed instance. */
  instance: ContractInstanceWithAddress;
  /** Contract class of this contract. */
  contractClass: ContractClassWithId & ContractClassIdPreimage;
  /** Complete contract artifact. */
  artifact: ContractArtifact;
  /** Deployment address for the canonical instance.  */
  address: AztecAddress;
}

/** Returns the canonical deployment a given artifact. */
export function getCanonicalProtocolContract(name: ProtocolContractName): ProtocolContract {
  const artifact = ProtocolContractArtifact[name];
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

export function isProtocolContract(address: AztecAddress) {
  return Object.values(ProtocolContractAddress).some(a => a.equals(address));
}
