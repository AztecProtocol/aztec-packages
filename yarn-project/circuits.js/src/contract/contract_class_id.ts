import { bufferAsFields } from '@aztec/foundation/abi';
import { poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

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
export function computeContractClassId(contractClass: ContractClass | ContractClassIdPreimage): Fr {
  return computeContractClassIdWithPreimage(contractClass).id;
}

/** Computes a contract class id and returns it along with its preimage. */
export function computeContractClassIdWithPreimage(
  contractClass: ContractClass | ContractClassIdPreimage,
): ContractClassIdPreimage & { id: Fr } {
  const artifactHash = contractClass.artifactHash;
  const privateFunctionsRoot =
    'privateFunctionsRoot' in contractClass
      ? contractClass.privateFunctionsRoot
      : computePrivateFunctionsRoot(contractClass.privateFunctions);
  const publicBytecodeCommitment =
    'publicBytecodeCommitment' in contractClass
      ? contractClass.publicBytecodeCommitment
      : computePublicBytecodeCommitment(contractClass.packedBytecode);
  console.log('PUBLIC BYTECODE COMMITMENT: ', publicBytecodeCommitment.toString());
  const id = poseidon2HashWithSeparator(
    [artifactHash, privateFunctionsRoot, publicBytecodeCommitment],
    GeneratorIndex.CONTRACT_LEAF, // TODO(@spalladino): Review all generator indices in this file
  );
  return { id, artifactHash, privateFunctionsRoot, publicBytecodeCommitment };
}

/** Returns the preimage of a contract class id given a contract class. */
export function computeContractClassIdPreimage(contractClass: ContractClass): ContractClassIdPreimage {
  const privateFunctionsRoot = computePrivateFunctionsRoot(contractClass.privateFunctions);
  const publicBytecodeCommitment = computePublicBytecodeCommitment(contractClass.packedBytecode);
  return { artifactHash: contractClass.artifactHash, privateFunctionsRoot, publicBytecodeCommitment };
}

/** Preimage of a contract class id. */
export type ContractClassIdPreimage = {
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  publicBytecodeCommitment: Fr;
};

// TODO(#5860): Replace with actual implementation
// Changed to work with canonical contracts that may have non-deterministic noir compiles and we want to keep the address constant
export function computePublicBytecodeCommitment(packedBytecode: Buffer) {
  // Convert Buffer into chunks of field elements
  const encodedBytecode: Fr[] = bufferAsFields(packedBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  // Hash it
  let bytecodeCommitment = poseidon2Hash([encodedBytecode[0]]);
  for (let i = 1; i < encodedBytecode.length; i++) {
    bytecodeCommitment = poseidon2Hash([bytecodeCommitment, encodedBytecode[i]]);
  }
  return bytecodeCommitment;
  // return new Fr(5);
}
