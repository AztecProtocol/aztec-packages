import { bufferAsFields } from '@aztec/foundation/abi';
import { poseidon2HashAccumulate, poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { strict as assert } from 'assert';

import { GeneratorIndex, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS } from '../constants.gen.js';
import { type ContractClass } from './interfaces/contract_class.js';
import { computePrivateFunctionsRoot } from './private_function.js';

/**
 * Returns the id of a contract class computed as its hash.
 *
 * ```
 * version = 1
 * private_function_leaves = private_functions.map(fn => pedersen([fn.function_selector as Field, fn.vk_hash], GENERATOR__FUNCTION_LEAF))
 * private_functions_root = merkleize(private_function_leaves)
 * bytecode_commitment = calculate_commitment(packed_bytecode)
 * contract_class_id = pedersen([version, artifact_hash, private_functions_root, bytecode_commitment], GENERATOR__CLASS_IDENTIFIER)
 * ```
 * @param contractClass - Contract class.
 * @returns The identifier.
 */
export async function computeContractClassId(contractClass: ContractClass | ContractClassIdPreimage): Promise<Fr> {
  return (await computeContractClassIdWithPreimage(contractClass)).id;
}

/** Computes a contract class id and returns it along with its preimage. */
export async function computeContractClassIdWithPreimage(
  contractClass: ContractClass | ContractClassIdPreimage,
): Promise<ContractClassIdPreimage & { id: Fr }> {
  const artifactHash = contractClass.artifactHash;
  const privateFunctionsRoot =
    'privateFunctionsRoot' in contractClass
      ? contractClass.privateFunctionsRoot
      : await computePrivateFunctionsRoot(contractClass.privateFunctions);
  const publicBytecodeCommitment =
    'publicBytecodeCommitment' in contractClass
      ? contractClass.publicBytecodeCommitment
      : await computePublicBytecodeCommitment(contractClass.packedBytecode);
  const id = await poseidon2HashWithSeparator(
    [artifactHash, privateFunctionsRoot, publicBytecodeCommitment],
    GeneratorIndex.CONTRACT_LEAF, // TODO(@spalladino): Review all generator indices in this file
  );
  return { id, artifactHash, privateFunctionsRoot, publicBytecodeCommitment };
}

/** Returns the preimage of a contract class id given a contract class. */
export async function computeContractClassIdPreimage(contractClass: ContractClass): Promise<ContractClassIdPreimage> {
  const privateFunctionsRoot = await computePrivateFunctionsRoot(contractClass.privateFunctions);
  const publicBytecodeCommitment = await computePublicBytecodeCommitment(contractClass.packedBytecode);
  return { artifactHash: contractClass.artifactHash, privateFunctionsRoot, publicBytecodeCommitment };
}

/** Preimage of a contract class id. */
export type ContractClassIdPreimage = {
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  publicBytecodeCommitment: Fr;
};

export async function computePublicBytecodeCommitment(packedBytecode: Buffer) {
  // Encode the buffer into field elements (chunked into 32 bytes each)
  const encodedBytecode: Fr[] = bufferAsFields(packedBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  // The first element is the length of the bytecode (in bytes)
  const bytecodeLength = Math.ceil(encodedBytecode[0].toNumber() / (Fr.SIZE_IN_BYTES - 1));
  assert(bytecodeLength < MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, 'Bytecode exceeds maximum deployable size');

  return bytecodeLength == 0 ? new Fr(0) : poseidon2HashAccumulate(encodedBytecode.slice(1, bytecodeLength + 1));
}
