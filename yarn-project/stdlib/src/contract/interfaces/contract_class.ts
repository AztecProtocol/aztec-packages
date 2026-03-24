import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas, zodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { FunctionSelector } from '../../abi/index.js';

const VERSION = 1 as const;

/**
 * A Contract Class in the protocol. Aztec differentiates contracts classes and instances, where a
 * contract class represents the code of the contract, but holds no state. Classes are identified by
 * an id that is a commitment to all its data.
 */
export interface ContractClass {
  /** Version of the contract class. */
  version: typeof VERSION;
  /**
   * Hash of the contract artifact. The specification of this hash is not enforced by the protocol. Should include
   * commitments to code of utility functions and compilation metadata. Intended to be used by clients to verify that
   * an offchain fetched artifact matches a registered class.
   */
  artifactHash: Fr;
  /** List of individual private functions, constructors included. */
  privateFunctions: PrivateFunction[];
  /** Bytecode for the public_dispatch function, or empty. */
  packedBytecode: Buffer;
}

/** Private function definition within a contract class. */
export interface PrivateFunction {
  /** Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol. */
  selector: FunctionSelector;
  /** Hash of the verification key associated to this private function. */
  vkHash: Fr;
}

const PrivateFunctionSchema = zodFor<PrivateFunction>()(
  z.object({
    selector: FunctionSelector.schema,
    vkHash: schemas.Fr,
  }),
);

export const ContractClassSchema = zodFor<ContractClass>()(
  z.object({
    version: z.literal(VERSION),
    artifactHash: schemas.Fr,
    privateFunctions: z.array(PrivateFunctionSchema),
    packedBytecode: schemas.Buffer,
  }),
);

/** Commitments to fields of a contract class. */
interface ContractClassCommitments {
  /** Identifier of the contract class. */
  id: Fr;
  /** Commitment to the public bytecode. */
  publicBytecodeCommitment: Fr;
  /** Root of the private functions tree  */
  privateFunctionsRoot: Fr;
}

/** A contract class with its precomputed id. */
export type ContractClassWithId = ContractClass & Pick<ContractClassCommitments, 'id'>;

export const ContractClassWithIdSchema = zodFor<ContractClassWithId>()(
  ContractClassSchema.extend({
    id: schemas.Fr,
  }),
);

/** A contract class with public bytecode information. */
export type ContractClassPublic = Pick<ContractClassCommitments, 'id' | 'privateFunctionsRoot'> &
  Omit<ContractClass, 'privateFunctions'>;

export type ContractClassPublicWithCommitment = ContractClassPublic &
  Pick<ContractClassCommitments, 'publicBytecodeCommitment'>;

export const ContractClassPublicSchema = zodFor<ContractClassPublic>()(
  z
    .object({
      id: schemas.Fr,
      privateFunctionsRoot: schemas.Fr,
    })
    .and(ContractClassSchema.omit({ privateFunctions: true })),
);

/** The contract class with the block it was initially deployed at */
export type ContractClassPublicWithBlockNumber = { l2BlockNumber: number } & ContractClassPublic;

/**
 * Creates a ContractClassPublic from a plain object without Zod validation.
 * Suitable for deserializing trusted data (e.g., from C++ via MessagePack).
 * Note: privateFunctions and utilityFunctions are set to empty arrays since
 * C++ does not provide them.
 */
export function contractClassPublicFromPlainObject(obj: any): ContractClassPublic {
  return {
    id: Fr.fromPlainObject(obj.id),
    version: 1,
    artifactHash: Fr.fromPlainObject(obj.artifactHash),
    privateFunctionsRoot: Fr.fromPlainObject(obj.privateFunctionsRoot),
    packedBytecode: obj.packedBytecode instanceof Buffer ? obj.packedBytecode : Buffer.from(obj.packedBytecode),
  };
}
