import { DomainSeparator, FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import { poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type MerkleTree, MerkleTreeCalculator } from '@aztec/foundation/trees';

import { computeMerkleHash } from '../hash/hash.js';
import type { PrivateFunction } from './interfaces/contract_class.js';

// Memoize the merkle tree calculators to avoid re-computing the zero-hash for each level in each call
let privateFunctionTreeCalculator: MerkleTreeCalculator | undefined;

const PRIVATE_FUNCTION_SIZE = 2;

export function assertNoDuplicatePrivateFunctionSelectors(
  fns: readonly PrivateFunction[],
  functionNames: readonly string[] = [],
) {
  const namesBySelector = new Map<string, string>();
  for (let i = 0; i < fns.length; i++) {
    const selector = fns[i].selector.toString();
    const functionName = functionNames[i] ?? `private function at index ${i}`;
    const previousName = namesBySelector.get(selector);
    if (previousName !== undefined) {
      throw new Error(`Duplicate private function selector ${selector} for ${previousName} and ${functionName}.`);
    }
    namesBySelector.set(selector, functionName);
  }
}

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
  assertNoDuplicatePrivateFunctionSelectors(fns);
  const leaves = [...fns].sort((a, b) => a.selector.value - b.selector.value);
  return Promise.all(leaves.map(computePrivateFunctionLeaf));
}

/** Returns the leaf for a given private function. */
export async function computePrivateFunctionLeaf(fn: PrivateFunction): Promise<Buffer> {
  return (await poseidon2HashWithSeparator([fn.selector, fn.vkHash], DomainSeparator.PRIVATE_FUNCTION_LEAF)).toBuffer();
}

async function getPrivateFunctionTreeCalculator(): Promise<MerkleTreeCalculator> {
  if (!privateFunctionTreeCalculator) {
    const functionTreeZeroLeaf = (
      await poseidon2Hash(new Array(PRIVATE_FUNCTION_SIZE).fill(0))
    ).toBuffer() as Buffer<ArrayBuffer>;
    privateFunctionTreeCalculator = await MerkleTreeCalculator.create(
      FUNCTION_TREE_HEIGHT,
      functionTreeZeroLeaf,
      async (left, right) =>
        (await computeMerkleHash(Fr.fromBuffer(left), Fr.fromBuffer(right))).toBuffer() as Buffer<ArrayBuffer>,
    );
  }
  return privateFunctionTreeCalculator;
}
