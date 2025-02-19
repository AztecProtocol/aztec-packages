import {
  type AztecAddress,
  type ContractClassIdPreimage,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
} from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';

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
