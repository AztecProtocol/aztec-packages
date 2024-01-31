import { pedersenHash, sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { ContractClass, PrivateFunction } from '@aztec/types/contracts';

import { MerkleTreeCalculator } from '../abis/merkle_tree_calculator.js';
import { FUNCTION_TREE_HEIGHT, GeneratorIndex } from '../constants.gen.js';

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
export function computeContractClassId(contractClass: ContractClass): Fr {
  const { privateFunctionsRoot, publicBytecodeCommitment } = computeContractClassIdPreimage(contractClass);
  return Fr.fromBuffer(
    pedersenHash(
      [contractClass.artifactHash.toBuffer(), privateFunctionsRoot.toBuffer(), publicBytecodeCommitment.toBuffer()],
      GeneratorIndex.CONTRACT_LEAF, // TODO(@spalladino): Review all generator indices in this file
    ),
  );
}

/** Returns the preimage of a contract class id given a contract class. */
export function computeContractClassIdPreimage(contractClass: ContractClass): ContractClassIdPreimage {
  const privateFunctionsRoot = getPrivateFunctionsRoot(contractClass.privateFunctions);
  const publicBytecodeCommitment = getBytecodeCommitment(contractClass.packedBytecode);
  return { artifactHash: contractClass.artifactHash, privateFunctionsRoot, publicBytecodeCommitment };
}

/** Preimage of a contract class id. */
export type ContractClassIdPreimage = {
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  publicBytecodeCommitment: Fr;
};

// TODO(@spalladino): Replace with actual implementation
function getBytecodeCommitment(bytecode: Buffer) {
  return Fr.fromBufferReduce(sha256(bytecode));
}

// Memoize the merkle tree calculators to avoid re-computing the zero-hash for each level in each call
let privateFunctionTreeCalculator: MerkleTreeCalculator | undefined;

const PRIVATE_FUNCTION_SIZE = 2;

function getPrivateFunctionsRoot(fns: PrivateFunction[]): Fr {
  const privateFunctionLeaves = fns.map(fn =>
    pedersenHash(
      [fn.selector, fn.vkHash].map(x => x.toBuffer()),
      GeneratorIndex.FUNCTION_LEAF,
    ),
  );
  if (!privateFunctionTreeCalculator) {
    const functionTreeZeroLeaf = pedersenHash(new Array(PRIVATE_FUNCTION_SIZE).fill(Buffer.alloc(32)));
    privateFunctionTreeCalculator = new MerkleTreeCalculator(FUNCTION_TREE_HEIGHT, functionTreeZeroLeaf);
  }
  return Fr.fromBuffer(privateFunctionTreeCalculator.computeTreeRoot(privateFunctionLeaves));
}
