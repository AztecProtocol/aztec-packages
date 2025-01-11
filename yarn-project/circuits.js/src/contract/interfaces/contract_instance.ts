import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { PublicKeys } from '../../types/public_keys.js';

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
  contractClassId: Fr;
  /** Hash of the selector and arguments to the constructor. */
  initializationHash: Fr;
  /** Public keys associated with this instance. */
  publicKeys: PublicKeys;
}

export type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress };

export const ContractInstanceSchema = z.object({
  version: z.literal(VERSION),
  salt: schemas.Fr,
  deployer: schemas.AztecAddress,
  contractClassId: schemas.Fr,
  initializationHash: schemas.Fr,
  publicKeys: PublicKeys.schema,
}) satisfies ZodFor<ContractInstance>;

export const ContractInstanceWithAddressSchema = ContractInstanceSchema.and(
  z.object({ address: schemas.AztecAddress }),
) satisfies ZodFor<ContractInstanceWithAddress>;
