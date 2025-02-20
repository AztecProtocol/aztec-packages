import type { ContractArtifact } from '@aztec/circuits.js/abi';
import type { AztecAddress } from '@aztec/circuits.js/aztec-address';
import type {
  ContractClassIdPreimage,
  ContractClassWithId,
  ContractInstanceWithAddress,
} from '@aztec/circuits.js/contract';

import { ProtocolContractAddress } from './protocol_contract_data.js';

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
