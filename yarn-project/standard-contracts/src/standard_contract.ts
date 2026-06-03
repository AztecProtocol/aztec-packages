import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassIdPreimage, ContractClassWithId, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

/** A non-protocol contract deployed at a canonical artifact-derived address. */
export interface StandardContract {
  /** Canonical deployed instance. */
  instance: ContractInstanceWithAddress;
  /** Contract class of this contract. */
  contractClass: ContractClassWithId & ContractClassIdPreimage;
  /** Complete contract artifact. */
  artifact: ContractArtifact;
  /** Deployment address for the canonical instance. */
  address: AztecAddress;
}
