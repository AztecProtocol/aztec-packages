import { AztecNode } from '@aztec/aztec-node';
import {
  CONTRACT_TREE_HEIGHT,
  CircuitsWasm,
  EthAddress,
  FUNCTION_TREE_HEIGHT,
  Fr,
  FunctionData,
  MembershipWitness,
  NewContractData,
  computeFunctionTree,
  NewContractConstructor,
  computeFunctionTreeData,
  generateFunctionLeaves,
  hashVKStr,
  isConstrained,
  isConstructor,
} from '@aztec/circuits.js';
import {
  computeContractAddress,
  computeContractLeaf,
  computeFunctionTreeRoot,
  computeVarArgsHash,
  hashConstructor,
} from '@aztec/circuits.js/abis';
import { ContractAbi, generateFunctionSelector } from '@aztec/foundation/abi';
import { assertLength } from '@aztec/foundation/serialize';
import { ContractDao, PublicKey } from '@aztec/types';

/**
 * The ContractTree class represents a Merkle tree of functions for a particular contract.
 * It manages the construction of the function tree, computes its root, and generates membership witnesses
 * for constrained functions. This class also enables lookup of specific function ABI and bytecode using selectors.
 * It is used in combination with the AztecNode to compute various data for executing private transactions.
 */
export class ContractTree {
  private functionLeaves?: Fr[];
  private functionTree?: Fr[];
  private functionTreeRoot?: Fr;
  private contractMembershipWitness?: MembershipWitness<typeof CONTRACT_TREE_HEIGHT>;

  constructor(
    /**
     * The contract data object containing the ABI and contract address.
     */
    public readonly contract: ContractDao,
    private node: AztecNode,
    private wasm: CircuitsWasm,
    /**
     * Data associated with the contract constructor for a new contract.
     */
    public readonly newContractConstructor?: NewContractConstructor,
  ) {}

  /**
   * Create a new ContractTree instance from the provided contract ABI, constructor arguments, and related data.
   * The function generates function leaves for constrained functions, computes the function tree root,
   * and hashes the constructor's verification key. It then computes the contract address using the contract
   * and portal contract addresses, contract address salt, and generated data. Finally, it returns a new
   * ContractTree instance containing the contract data and computed values.
   *
   * @param abi - The contract's ABI containing the functions and their metadata.
   * @param args - An array of Fr elements representing the constructor's arguments.
   * @param portalContract - The Ethereum address of the portal smart contract.
   * @param contractAddressSalt - An Fr element representing the salt used to compute the contract address.
   * @param from - The public key of the contract deployer.
   * @param node - An instance of the AztecNode class representing the current node.
   * @returns A new ContractTree instance containing the contract data and computed values.
   */
  public static async new(
    abi: ContractAbi,
    args: Fr[],
    portalContract: EthAddress,
    contractAddressSalt: Fr,
    from: PublicKey,
    node: AztecNode,
  ) {
    const wasm = await CircuitsWasm.get();
    const constructorAbi = abi.functions.find(isConstructor);
    if (!constructorAbi) {
      throw new Error('Constructor not found.');
    }
    if (!constructorAbi.verificationKey) {
      throw new Error('Missing verification key for the constructor.');
    }

    const functions = abi.functions.map(f => ({
      ...f,
      selector: generateFunctionSelector(f.name, f.parameters),
    }));
    const leaves = generateFunctionLeaves(functions, wasm);
    const root = computeFunctionTreeRoot(wasm, leaves);
    const constructorSelector = generateFunctionSelector(constructorAbi.name, constructorAbi.parameters);
    const functionData = new FunctionData(constructorSelector, true, true);
    const vkHash = hashVKStr(constructorAbi.verificationKey, wasm);
    const argsHash = await computeVarArgsHash(wasm, args);
    const constructorHash = hashConstructor(wasm, functionData, argsHash, vkHash);
    const address = computeContractAddress(wasm, from, contractAddressSalt, root, constructorHash);
    const contractDao: ContractDao = {
      ...abi,
      address,
      functions,
      portalContract,
    };
    const NewContractConstructor = {
      functionData,
      vkHash,
    };
    return new ContractTree(contractDao, node, wasm, NewContractConstructor);
  }

  /**
   * Retrieve the ABI of a given function.
   * The function is identified by its selector, which represents a unique identifier for the function's signature.
   * Throws an error if the function with the provided selector is not found in the contract.
   *
   * @param functionSelector - The Buffer containing the unique identifier for the function's signature.
   * @returns The ABI object containing relevant information about the targeted function.
   */
  public getFunctionAbi(functionSelector: Buffer) {
    const abi = this.contract.functions.find(f => f.selector.equals(functionSelector));
    if (!abi) {
      throw new Error(`Unknown function: ${functionSelector.toString('hex')}.`);
    }
    return abi;
  }

  /**
   * Retrieve the bytecode of a function in the contract by its function selector.
   * The function selector is a unique identifier for each function in a contract.
   * Throws an error if the function with the given selector is not found in the contract.
   *
   * @param functionSelector - The Buffer representing the function selector.
   * @returns The bytecode of the function as a string.
   */
  public getBytecode(functionSelector: Buffer) {
    return this.getFunctionAbi(functionSelector).bytecode;
  }

  /**
   * Retrieves the contract membership witness for the current contract tree instance.
   * The contract membership witness is a proof that demonstrates the existence of the contract
   * in the global contract merkle tree. This proof contains the index of the contract's leaf
   * in the tree and the sibling path needed to construct the root of the merkle tree.
   * If the witness hasn't been previously computed, this function will request the contract node
   * to find the contract's index and path in order to create the membership witness.
   *
   * @returns A Promise that resolves to the MembershipWitness object for the given contract tree.
   */
  public async getContractMembershipWitness() {
    if (!this.contractMembershipWitness) {
      const { address, portalContract } = this.contract;
      const root = await this.getFunctionTreeRoot();
      const newContractData = new NewContractData(address, portalContract, root);
      const committment = computeContractLeaf(this.wasm, newContractData);
      const index = await this.node.findContractIndex(committment.toBuffer());
      if (index === undefined) {
        throw new Error(
          `Failed to find contract at ${address} with portal ${portalContract} resulting in commitment ${committment}.`,
        );
      }

      const siblingPath = await this.node.getContractPath(index);
      this.contractMembershipWitness = new MembershipWitness<typeof CONTRACT_TREE_HEIGHT>(
        CONTRACT_TREE_HEIGHT,
        index,
        assertLength(siblingPath.toFieldArray(), CONTRACT_TREE_HEIGHT),
      );
    }
    return this.contractMembershipWitness;
  }

  /**
   * Calculate and return the root of the function tree for the current contract.
   * This root is a cryptographic commitment to the set of constrained functions within the contract,
   * which is used in the Aztec node's proof system. The root will be cached after the first call.
   *
   * @returns A promise that resolves to the Fr (finite field element) representation of the function tree root.
   */
  public getFunctionTreeRoot() {
    if (!this.functionTreeRoot) {
      const leaves = this.getFunctionLeaves();
      this.functionTreeRoot = computeFunctionTreeRoot(this.wasm, leaves);
    }
    return Promise.resolve(this.functionTreeRoot);
  }

  /**
   * Retrieve the membership witness of a function within a contract's function tree.
   * A membership witness represents the position and authentication path of a target function
   * in the Merkle tree of constrained functions. It is required to prove the existence of the
   * function within the contract during execution.
   *
   * @param functionSelector - The Buffer containing the function selector (signature).
   * @returns A MembershipWitness instance representing the position and authentication path of the function in the function tree.
   */
  public getFunctionMembershipWitness(
    functionSelector: Buffer,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>> {
    const targetFunctions = this.contract.functions.filter(isConstrained);
    const functionIndex = targetFunctions.findIndex(f => f.selector.equals(functionSelector));
    if (functionIndex < 0) {
      return Promise.resolve(MembershipWitness.empty(FUNCTION_TREE_HEIGHT, 0n));
    }

    if (!this.functionTree) {
      const leaves = this.getFunctionLeaves();
      this.functionTree = computeFunctionTree(this.wasm, leaves);
    }
    const functionTreeData = computeFunctionTreeData(this.functionTree, functionIndex);
    return Promise.resolve(
      new MembershipWitness<typeof FUNCTION_TREE_HEIGHT>(
        FUNCTION_TREE_HEIGHT,
        BigInt(functionIndex),
        assertLength(functionTreeData.siblingPath, FUNCTION_TREE_HEIGHT),
      ),
    );
  }

  /**
   * Retrieve the function leaves for the contract tree.
   * Function leaves are computed based on constrained functions present in the contract.
   * It caches the computed function leaves and returns them if already calculated.
   *
   * @returns An array of Fr representing the function leaves.
   */
  private getFunctionLeaves() {
    if (!this.functionLeaves) {
      this.functionLeaves = generateFunctionLeaves(this.contract.functions, this.wasm);
    }
    return this.functionLeaves;
  }
}
