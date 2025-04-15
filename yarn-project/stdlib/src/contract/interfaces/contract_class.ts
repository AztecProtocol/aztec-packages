import type { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

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
   * an off-chain fetched artifact matches a registered class.
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

const PrivateFunctionSchema = z.object({
  selector: FunctionSelector.schema,
  vkHash: schemas.Fr,
}) satisfies ZodFor<PrivateFunction>;

/** Private function definition with executable bytecode. */
export interface ExecutablePrivateFunction extends PrivateFunction {
  /** ACIR and Brillig bytecode */
  bytecode: Buffer;
}

const ExecutablePrivateFunctionSchema = PrivateFunctionSchema.and(
  z.object({ bytecode: schemas.Buffer }),
) satisfies ZodFor<ExecutablePrivateFunction>;

/** Utility function definition. */
export interface UtilityFunction {
  /** Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol. */
  selector: FunctionSelector;
  /** Brillig. */
  bytecode: Buffer;
}

const UtilityFunctionSchema = z.object({
  /** lala */
  selector: FunctionSelector.schema,
  bytecode: schemas.Buffer,
}) satisfies ZodFor<UtilityFunction>;

/** Sibling paths and sibling commitments for proving membership of a private function within a contract class. */
export type PrivateFunctionMembershipProof = {
  artifactMetadataHash: Fr;
  functionMetadataHash: Fr;
  utilityFunctionsTreeRoot: Fr;
  privateFunctionTreeSiblingPath: Fr[];
  privateFunctionTreeLeafIndex: number;
  artifactTreeSiblingPath: Fr[];
  artifactTreeLeafIndex: number;
};

const PrivateFunctionMembershipProofSchema = z.object({
  artifactMetadataHash: schemas.Fr,
  functionMetadataHash: schemas.Fr,
  utilityFunctionsTreeRoot: schemas.Fr,
  privateFunctionTreeSiblingPath: z.array(schemas.Fr),
  privateFunctionTreeLeafIndex: schemas.Integer,
  artifactTreeSiblingPath: z.array(schemas.Fr),
  artifactTreeLeafIndex: schemas.Integer,
}) satisfies ZodFor<PrivateFunctionMembershipProof>;

/** A private function with a membership proof. */
export type ExecutablePrivateFunctionWithMembershipProof = ExecutablePrivateFunction & PrivateFunctionMembershipProof;

/** Sibling paths and commitments for proving membership of a utility  function within a contract class. */
export type UtilityFunctionMembershipProof = {
  artifactMetadataHash: Fr;
  functionMetadataHash: Fr;
  privateFunctionsArtifactTreeRoot: Fr;
  artifactTreeSiblingPath: Fr[];
  artifactTreeLeafIndex: number;
};

const UtilityFunctionMembershipProofSchema = z.object({
  artifactMetadataHash: schemas.Fr,
  functionMetadataHash: schemas.Fr,
  privateFunctionsArtifactTreeRoot: schemas.Fr,
  artifactTreeSiblingPath: z.array(schemas.Fr),
  artifactTreeLeafIndex: schemas.Integer,
}) satisfies ZodFor<UtilityFunctionMembershipProof>;

/** A utility function with a membership proof. */
export type UtilityFunctionWithMembershipProof = UtilityFunction & UtilityFunctionMembershipProof;

export const ContractClassSchema = z.object({
  version: z.literal(VERSION),
  artifactHash: schemas.Fr,
  privateFunctions: z.array(PrivateFunctionSchema),
  packedBytecode: schemas.Buffer,
}) satisfies ZodFor<ContractClass>;

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

export const ContractClassWithIdSchema = ContractClassSchema.extend({
  id: schemas.Fr,
}) satisfies ZodFor<ContractClassWithId>;

/** A contract class with public bytecode information, and optional private and utility functions. */
export type ContractClassPublic = {
  privateFunctions: ExecutablePrivateFunctionWithMembershipProof[];
  utilityFunctions: UtilityFunctionWithMembershipProof[];
} & Pick<ContractClassCommitments, 'id' | 'privateFunctionsRoot'> &
  Omit<ContractClass, 'privateFunctions'>;

export type ContractClassPublicWithCommitment = ContractClassPublic &
  Pick<ContractClassCommitments, 'publicBytecodeCommitment'>;

export const ContractClassPublicSchema = z
  .object({
    id: schemas.Fr,
    privateFunctionsRoot: schemas.Fr,
    privateFunctions: z.array(ExecutablePrivateFunctionSchema.and(PrivateFunctionMembershipProofSchema)),
    utilityFunctions: z.array(UtilityFunctionSchema.and(UtilityFunctionMembershipProofSchema)),
  })
  .and(ContractClassSchema.omit({ privateFunctions: true })) satisfies ZodFor<ContractClassPublic>;

/** The contract class with the block it was initially deployed at */
export type ContractClassPublicWithBlockNumber = { l2BlockNumber: number } & ContractClassPublic;
