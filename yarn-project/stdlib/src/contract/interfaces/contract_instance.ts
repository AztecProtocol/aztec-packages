import { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import { AztecAddress } from '../../aztec-address/index.js';
import { PublicKeys } from '../../keys/public_keys.js';
import { schemas, zodFor } from '../../schemas/index.js';

const VERSION = 1 as const;

/**
 * A contract instance is a concrete deployment of a contract class. It always references a contract class,
 * which dictates what code it executes when called. It has state (both private and public), as well as an
 * address that acts as its identifier. It can be called into. It may have encryption and nullifying public keys.
 */
export interface ContractInstance {
  /** Version identifier. Initially one, bumped for any changes to the contract instance struct. */
  version: typeof VERSION;
  /** User-generated pseudorandom value for uniqueness. */
  salt: Fr;
  /** Optional deployer address or zero if this was a universal deploy. */
  deployer: AztecAddress;
  /** Identifier of the contract class for this instance. */
  currentContractClassId: Fr;
  /** Identifier of the original (at deployment) contract class for this instance */
  originalContractClassId: Fr;
  /** Hash of the selector and arguments to the constructor. */
  initializationHash: Fr;
  /** Public keys associated with this instance. */
  publicKeys: PublicKeys;
}

export type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress };

export const ContractInstanceSchema = zodFor<ContractInstance>()(
  z.object({
    version: z.literal(VERSION),
    salt: schemas.Fr,
    deployer: schemas.AztecAddress,
    currentContractClassId: schemas.Fr,
    originalContractClassId: schemas.Fr,
    initializationHash: schemas.Fr,
    publicKeys: PublicKeys.schema,
  }),
);

export const ContractInstanceWithAddressSchema = zodFor<ContractInstanceWithAddress>()(
  ContractInstanceSchema.and(z.object({ address: schemas.AztecAddress })),
);

/**
 * Creates a ContractInstance from a plain object without Zod validation.
 * Suitable for deserializing trusted data (e.g., from C++ via MessagePack).
 */
export function contractInstanceFromPlainObject(obj: any): ContractInstance {
  return {
    version: 1,
    salt: Fr.fromPlainObject(obj.salt),
    deployer: AztecAddress.fromPlainObject(obj.deployer),
    currentContractClassId: Fr.fromPlainObject(obj.currentContractClassId),
    originalContractClassId: Fr.fromPlainObject(obj.originalContractClassId),
    initializationHash: Fr.fromPlainObject(obj.initializationHash),
    publicKeys: PublicKeys.fromPlainObject(obj.publicKeys),
  };
}

/**
 * Creates a ContractInstanceWithAddress from a plain object without Zod validation.
 * Suitable for deserializing trusted data (e.g., from C++ via MessagePack).
 */
export function contractInstanceWithAddressFromPlainObject(
  address: AztecAddress,
  obj: any,
): ContractInstanceWithAddress {
  return {
    ...contractInstanceFromPlainObject(obj),
    address,
  };
}
