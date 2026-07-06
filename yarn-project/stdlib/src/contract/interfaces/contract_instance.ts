import { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import { AztecAddress } from '../../aztec-address/index.js';
import { PublicKeys } from '../../keys/public_keys.js';
import { schemas, zodFor } from '../../schemas/index.js';

const VERSION = 2 as const;

/**
 * The address preimage of a contract instance: the immutable data that hashes to its address, i.e. everything a
 * contract deployment commits to.
 *
 * Note that `originaContractClassId` is not necessarily the instance's _current_ class id, in case of upgrades: that
 * one is not part of the preimage and is instead derived from chain state.
 */
export interface ContractInstancePreimage {
  /** Version identifier. Initially one, bumped for any changes to the contract instance struct. */
  version: typeof VERSION;
  /** User-generated pseudorandom value for uniqueness. */
  salt: Fr;
  /** Optional deployer address or zero if this was a universal deploy. */
  deployer: AztecAddress;
  /** Identifier of the original (at deployment) contract class for this instance */
  originalContractClassId: Fr;
  /** Hash of the selector and arguments to the constructor. */
  initializationHash: Fr;
  /** Hash of Immutables Values the contract is deployed with. */
  immutablesHash: Fr;
  /** Public keys associated with this instance. */
  publicKeys: PublicKeys;
}

/**
 * The address preimage plus the current contract class id, which is chain-tracked state derived from the
 * ContractInstanceRegistry (it equals the original class id unless the contract has been upgraded).
 */
export interface ContractInstance extends ContractInstancePreimage {
  /** Identifier of the contract class this instance currently runs (as of some block). */
  currentContractClassId: Fr;
}

export type ContractInstancePreimageWithAddress = ContractInstancePreimage & { address: AztecAddress };

export type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress };

export const ContractInstancePreimageSchema = zodFor<ContractInstancePreimage>()(
  z.object({
    version: z.literal(VERSION),
    salt: schemas.Fr,
    deployer: schemas.AztecAddress,
    originalContractClassId: schemas.Fr,
    initializationHash: schemas.Fr,
    immutablesHash: schemas.Fr,
    publicKeys: PublicKeys.schema,
  }),
);

export const ContractInstanceSchema = zodFor<ContractInstance>()(
  ContractInstancePreimageSchema.and(z.object({ currentContractClassId: schemas.Fr })),
);

export const ContractInstancePreimageWithAddressSchema = zodFor<ContractInstancePreimageWithAddress>()(
  ContractInstancePreimageSchema.and(z.object({ address: schemas.AztecAddress })),
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
    version: 2,
    salt: Fr.fromPlainObject(obj.salt),
    deployer: AztecAddress.fromPlainObject(obj.deployer),
    currentContractClassId: Fr.fromPlainObject(obj.currentContractClassId),
    originalContractClassId: Fr.fromPlainObject(obj.originalContractClassId),
    initializationHash: Fr.fromPlainObject(obj.initializationHash),
    immutablesHash: Fr.fromPlainObject(obj.immutablesHash),
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
