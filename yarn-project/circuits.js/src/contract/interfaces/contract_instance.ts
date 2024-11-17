import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';

import { type PublicKeys } from '../../types/public_keys.js';

const VERSION = 1 as const;

/** A contract instance is a concrete deployment of a contract class. A contract instance always references a contract class, which dictates what code it executes when called. A contract instance has state (both private and public), as well as an address that acts as its identifier. A contract instance can be called into. */
export interface ContractInstance {
  /** Version identifier. Initially one, bumped for any changes to the contract instance struct. */
  version: typeof VERSION;
  /** User-generated pseudorandom value for uniqueness. */
  salt: Fr;
  /** Optional deployer address or zero if this was a universal deploy. */
  deployer: AztecAddress;
  /** Identifier of the contract class for this instance. */
  contractClassId: Fr;
  /** Hash of the selector and arguments to the constructor. */
  initializationHash: Fr;
  publicKeys: PublicKeys;
}

export type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress };
