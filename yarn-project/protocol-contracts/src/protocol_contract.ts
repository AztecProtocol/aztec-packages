import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassIdPreimage, ContractClassWithId, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

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

/** Returns true if the address is one of the ACTUAL protocol contracts (ContractInstanceRegistry,
 * ContractClassRegistry or FeeJuice).
 *
 * TODO(F-416): Drop this function when protocol contracts are redeployed.
 */
export function isActualProtocolContract(address: AztecAddress) {
  return (
    address.equals(ProtocolContractAddress.ContractInstanceRegistry) ||
    address.equals(ProtocolContractAddress.ContractClassRegistry) ||
    address.equals(ProtocolContractAddress.FeeJuice)
  );
}

export { type ProtocolContractsProvider } from './provider/protocol_contracts_provider.js';
