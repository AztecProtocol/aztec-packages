import { FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '@aztec/foundation/serialize';
import { MembershipWitness, type MerkleTree } from '@aztec/foundation/trees';
import { type ContractArtifact, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import {
  type PrivateFunction,
  computePrivateFunctionLeaf,
  computePrivateFunctionsTree,
  getContractClassPrivateFunctionFromArtifact,
} from '@aztec/stdlib/contract';

/**
 * Represents a Merkle tree of functions for a particular Contract Class.
 * It manages the construction of the function tree, computes its root, and generates membership witnesses
 * for constrained functions. This class also enables lookup of specific function artifact using selectors.
 * It is used in combination with the AztecNode to compute various data for executing private transactions.
 */
export class PrivateFunctionsTree {
  private tree?: MerkleTree;

  private constructor(private readonly privateFunctions: PrivateFunction[]) {}

  static async create(artifact: ContractArtifact) {
    const privateFunctions = await Promise.all(
      artifact.functions
        .filter(fn => fn.functionType === FunctionType.PRIVATE)
        .map(getContractClassPrivateFunctionFromArtifact),
    );
    return new PrivateFunctionsTree(privateFunctions);
  }

  /**
   * Retrieve the membership witness of a function within a contract's function tree.
   * A membership witness represents the position and authentication path of a target function
   * in the Merkle tree of constrained functions. It is required to prove the existence of the
   * function within the contract during execution. Throws if fn does not exist or is not private.
   *
   * @param selector - The function selector.
   * @returns A MembershipWitness instance representing the position and authentication path of the function in the function tree.
   */
  public async getFunctionMembershipWitness(
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>> {
    const fn = this.privateFunctions.find(f => f.selector.equals(selector));
    if (!fn) {
      throw new Error(`Private function with selector ${selector.toString()} not found in contract class.`);
    }

    const leaf = await computePrivateFunctionLeaf(fn);
    const tree = await this.getTree();
    const index = tree.getIndex(leaf);
    const path = tree.getSiblingPath(index);
    return new MembershipWitness<typeof FUNCTION_TREE_HEIGHT>(
      FUNCTION_TREE_HEIGHT,
      BigInt(index),
      assertLength(path.map(Fr.fromBuffer), FUNCTION_TREE_HEIGHT),
    );
  }

  private async getTree() {
    if (!this.tree) {
      this.tree = await computePrivateFunctionsTree(this.privateFunctions);
    }
    return this.tree;
  }
}
