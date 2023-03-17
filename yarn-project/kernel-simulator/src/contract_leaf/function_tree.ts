import { Hasher, MemoryMerkleTree } from '@aztec/barretenberg/merkle_tree';
import { computeSelector, ContractAbi, FunctionAbi } from '../contract_abi.js';

const MAX_FUNCTIONS = 32;
/**
 * A leaf in the function tree.
 */
class FunctionTreeLeaf {
  private constructor(
    private selector: Buffer,
    private isPrivate: boolean,
    private vkHash: Buffer,
    private acirHash: Buffer,
  ) {}

  /**
   * Constructor.
   * @param functionAbi - The function ABI entry. 
   * @param hasher - The hasher to use.
   * @returns A new FunctionTreeLeaf.
   */
  static new(functionAbi: FunctionAbi, hasher: Hasher) {
    const selector = computeSelector(functionAbi, hasher);
    const isPrivate = functionAbi.isSecret;
    const vkHash = hasher.hashToField(Buffer.from(functionAbi.verificationKey, 'hex'));
    const acirHash = hasher.hashToField(Buffer.from(functionAbi.bytecode, 'hex'));

    return new FunctionTreeLeaf(selector, isPrivate, vkHash, acirHash);
  }

  /**
   * Constructor for empty leaves.
   * @returns A new empty FunctionTreeLeaf.
   */
  static empty() {
    return new FunctionTreeLeaf(Buffer.alloc(4), false, Buffer.alloc(32), Buffer.alloc(32));
  }

  /**
   * The packed representation of the leaf.
   * @returns The leaf as a buffer.
   */
  toBuffer() {
    return Buffer.concat([
      this.selector,
      this.isPrivate ? Buffer.from([1]) : Buffer.from([0]),
      this.vkHash,
      this.acirHash,
    ]);
  }
}

/**
 * Creates a function merkle tree.
 * @param abi - The contract ABI.
 * @param hasher - The hasher to use.
 * @returns The function merkle tree.
 */
export function createFunctionsTree(abi: ContractAbi, hasher: Hasher) {
  if (abi.functions.length > MAX_FUNCTIONS) {
    throw new Error(`Too many functions in contract, max is ${MAX_FUNCTIONS}`);
  }

  const treeFunctions = abi.functions.filter(functionAbi => !functionAbi.isConstructor);

  const leaves = Array(MAX_FUNCTIONS)
    .fill(null)
    .map((_, index) => {
      if (index < treeFunctions.length) {
        return FunctionTreeLeaf.new(treeFunctions[index], hasher);
      } else {
        return FunctionTreeLeaf.empty();
      }
    });

  return MemoryMerkleTree.new(
    leaves.map(leaf => leaf.toBuffer()),
    hasher,
  );
}
