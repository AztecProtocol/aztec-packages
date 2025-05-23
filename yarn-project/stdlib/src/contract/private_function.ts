import { FUNCTION_TREE_HEIGHT, GeneratorIndex } from '@aztec/constants';
import { pedersenHash, poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type MerkleTree, MerkleTreeCalculator } from '@aztec/foundation/trees';

import type { PrivateFunction } from './interfaces/contract_class.js';

// Memoize the merkle tree calculators to avoid re-computing the zero-hash for each level in each call
let privateFunctionTreeCalculator: MerkleTreeCalculator | undefined;

const PRIVATE_FUNCTION_SIZE = 2;

/** Returns a Merkle tree for the set of private functions in a contract. */
export async function computePrivateFunctionsTree(fns: PrivateFunction[]): Promise<MerkleTree> {
  const calculator = await getPrivateFunctionTreeCalculator();
  const leaves = await computePrivateFunctionLeaves(fns);
  return calculator.computeTree(leaves);
}

/** Returns the Merkle tree root for the set of private functions in a contract. */
export async function computePrivateFunctionsRoot(fns: PrivateFunction[]): Promise<Fr> {
  const calculator = await getPrivateFunctionTreeCalculator();
  const leaves = await computePrivateFunctionLeaves(fns);
  return Fr.fromBuffer(await calculator.computeTreeRoot(leaves));
}

function computePrivateFunctionLeaves(fns: PrivateFunction[]): Promise<Buffer[]> {
  const leaves = [...fns].sort((a, b) => a.selector.value - b.selector.value);
  return Promise.all(leaves.map(computePrivateFunctionLeaf));
}

/** Returns the leaf for a given private function. */
export async function computePrivateFunctionLeaf(fn: PrivateFunction): Promise<Buffer> {
  return (await poseidon2HashWithSeparator([fn.selector, fn.vkHash], GeneratorIndex.FUNCTION_LEAF)).toBuffer();
}

async function getPrivateFunctionTreeCalculator(): Promise<MerkleTreeCalculator> {
  if (!privateFunctionTreeCalculator) {
    const functionTreeZeroLeaf = (
      await pedersenHash(new Array(PRIVATE_FUNCTION_SIZE).fill(0))
    ).toBuffer() as Buffer<ArrayBuffer>;
    privateFunctionTreeCalculator = await MerkleTreeCalculator.create(
      FUNCTION_TREE_HEIGHT,
      functionTreeZeroLeaf,
      async (left, right) => (await poseidon2Hash([left, right])).toBuffer() as Buffer<ArrayBuffer>,
    );
  }
  return privateFunctionTreeCalculator;
}
