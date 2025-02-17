import {
  type ContractClassWithId,
  MembershipWitness,
  computePrivateFunctionLeaf,
  computePrivateFunctionsTree,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import { type ContractArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '@aztec/foundation/serialize';
import { type MerkleTree } from '@aztec/foundation/trees';

/**
 * Represents a Merkle tree of functions for a particular Contract Class.
 * It manages the construction of the function tree, computes its root, and generates membership witnesses
 * for constrained functions. This class also enables lookup of specific function artifact using selectors.
 * It is used in combination with the AztecNode to compute various data for executing private transactions.
 */
export class PrivateFunctionsTree {
  private tree?: MerkleTree;

  private constructor(private readonly artifact: ContractArtifact, private contractClass: ContractClassWithId) {}

  static async create(artifact: ContractArtifact) {
    const contractClass = await getContractClassFromArtifact(artifact);
    return new PrivateFunctionsTree(artifact, contractClass);
  }

  /**
   * Retrieve the artifact of a given function.
   * The function is identified by its selector, which represents a unique identifier for the function's signature.
   * Throws an error if the function with the provided selector is not found in the contract.
   *
   * @param selector - The function selector.
   * @returns The artifact object containing relevant information about the targeted function.
   */
  public async getFunctionArtifact(selector: FunctionSelector) {
    const functionsAndSelectors = await Promise.all(
      this.artifact.functions.map(async f => ({
        f,
        selector: await FunctionSelector.fromNameAndParameters(f.name, f.parameters),
      })),
    );
    const artifact = functionsAndSelectors.find(f => selector.equals(f.selector))?.f;
    if (!artifact) {
      throw new Error(
        `Unknown function. Selector ${selector.toString()} not found in the artifact ${
          this.artifact.name
        } with class ${this.getContractClassId().toString()}.`,
      );
    }
    return artifact;
  }

  /**
   * Retrieve the bytecode of a function in the contract by its function selector.
   * The function selector is a unique identifier for each function in a contract.
   * Throws an error if the function with the given selector is not found in the contract.
   *
   * @param selector - The selector of a function to get bytecode for.
   * @returns The bytecode of the function as a string.
   */
  public async getBytecode(selector: FunctionSelector) {
    const artifact = await this.getFunctionArtifact(selector);
    return artifact.bytecode;
  }

  /**
   * Calculate and return the root of the function tree for the current contract.
   * This root is a cryptographic commitment to the set of constrained functions within the contract,
   * which is used in the Aztec node's proof system. The root will be cached after the first call.
   *
   * @returns A promise that resolves to the Fr (finite field element) representation of the function tree root.
   */
  public getFunctionTreeRoot() {
    return this.getTree();
  }

  /** Returns the contract class object. */
  public getContractClass() {
    return this.contractClass;
  }

  /** Returns the contract artifact. */
  public getArtifact() {
    return this.artifact;
  }

  /**
   * Returns the contract class identifier for the given artifact.
   */
  public getContractClassId() {
    return this.getContractClass().id;
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
    const fn = this.getContractClass().privateFunctions.find(f => f.selector.equals(selector));
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
      const fns = this.getContractClass().privateFunctions;
      this.tree = await computePrivateFunctionsTree(fns);
    }
    return this.tree;
  }
}
