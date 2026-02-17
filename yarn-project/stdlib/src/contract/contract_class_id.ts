import { DomainSeparator, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';

import { strict as assert } from 'assert';

import { bufferAsFields } from '../abi/index.js';
import type { ContractClass } from './interfaces/contract_class.js';
import { computePrivateFunctionsRoot } from './private_function.js';

/**
 * Returns the id of a contract class computed as its hash.
 *
 * ```
 * version = 1
 * private_function_leaves = private_functions.map(fn => pedersen([fn.function_selector as Field, fn.vk_hash], GENERATOR__PRIVATE_FUNCTION_LEAF))
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
    DomainSeparator.CONTRACT_CLASS_ID,
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
  // Encode the buffer into field elements (chunked into 31 bytes each)
  // The first element is the length of the bytecode (in bytes)
  const [bytecodeLengthAsField, ...bytecodeAsFields] = bufferAsFields(
    packedBytecode,
    MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
  );

  const bytecodeLength = Math.ceil(bytecodeLengthAsField.toNumber() / (Fr.SIZE_IN_BYTES - 1));
  assert(bytecodeLength < MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, 'Bytecode exceeds maximum deployable size');

  // NOTE: hash the bytecode here only up to the actual length of the bytecode.
  // We do not hash the entire max bytecode length!
  const sep = BigInt(DomainSeparator.PUBLIC_BYTECODE) + (bytecodeLengthAsField.toBigInt() << 32n);
  return await poseidon2HashWithSeparator(bytecodeAsFields.slice(0, bytecodeLength), new Fr(sep).toNumber());
}
