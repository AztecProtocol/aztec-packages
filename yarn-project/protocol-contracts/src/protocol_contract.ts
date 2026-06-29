import type { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassIdPreimage, ContractClassWithId, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { ProtocolContractAddress, ProtocolContractClassId } from './protocol_contract_data.js';

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

export function isProtocolContract(address: AztecAddress) {
  return Object.values(ProtocolContractAddress).some(a => a.equals(address));
}

const protocolContractClassIds = new Set(Object.values(ProtocolContractClassId).map(id => id.toString()));

/** Returns whether the given contract class id belongs to a bundled protocol contract. */
export function isProtocolContractClass(classId: Fr): boolean {
  return protocolContractClassIds.has(classId.toString());
}

export { type ProtocolContractsProvider } from './provider/protocol_contracts_provider.js';
