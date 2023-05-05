import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress, CircuitsWasm, MembershipWitness, VK_TREE_HEIGHT } from '@aztec/circuits.js';
import { ContractDatabase } from '../contract_database/index.js';
import { ContractTree } from '../contract_tree/index.js';

/**
 * ContractDataOracle serves as a data manager and retriever for noir contracts.
 * It provides methods to obtain contract addresses, function ABI, bytecode, and membership witnesses
 * from a given contract address and function selector. The class maintains a cache of ContractTree instances
 * to efficiently serve the requested data. It interacts with the ContractDatabase and AztecNode to fetch
 * the required information and facilitate cryptographic proof generation.
 */
export class ContractDataOracle {
  private trees: ContractTree[] = [];

  constructor(private db: ContractDatabase, private node: AztecNode) {}

  /**
   * Retrieve the portal contract address associated with the given contract address.
   * This function searches for the corresponding contract tree in the local cache and returns the portal contract address.
   * If the contract tree is not found in the cache, it fetches the contract data from the database and creates a new ContractTree instance.
   * Throws an error if the contract address is not found in the database.
   *
   * @param contractAddress - The AztecAddress of the contract whose portal contract address needs to be retrieved.
   * @returns A Promise that resolves to the portal contract address.
   */
  public async getPortalContractAddress(contractAddress: AztecAddress) {
    const tree = await this.getTree(contractAddress);
    return tree.contract.portalContract;
  }

  /**
   * Retrieves the ABI of a specified function within a given contract.
   * The function is identified by its selector, which is a unique code generated from the function's signature.
   * Throws an error if the contract address or function selector are invalid or not found.
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param functionSelector - A Buffer containing the unique selector code for the desired function.
   * @returns The corresponding function's ABI as an object.
   */
  public async getFunctionAbi(contractAddress: AztecAddress, functionSelector: Buffer) {
    const tree = await this.getTree(contractAddress);
    return tree.getFunctionAbi(functionSelector);
  }

  /**
   * Retrieve the bytecode of a specific function in a contract at the given address.
   * The returned bytecode is required for executing and verifying the function's behavior
   * in the Aztec network. Throws an error if the contract or function cannot be found.
   *
   * @param contractAddress - The contract's address.
   * @param functionSelector - A Buffer containing the function selector (first 4 bytes of the keccak256 hash of the function signature).
   * @returns A Promise that resolves to a Buffer containing the bytecode of the specified function.
   */
  public async getBytecode(contractAddress: AztecAddress, functionSelector: Buffer) {
    const tree = await this.getTree(contractAddress);
    return tree.getBytecode(functionSelector);
  }

  /**
   * Retrieves the contract membership witness for a given contract address.
   * A contract membership witness is a cryptographic proof that the contract exists in the Aztec network.
   * This function will search for an existing contract tree associated with the contract address and obtain its
   * membership witness. If no such contract tree exists, it will throw an error.
   *
   * @param contractAddress - The contract address.
   * @returns A promise that resolves to a MembershipWitness instance representing the contract membership witness.
   * @throws Error if the contract address is unknown or not found.
   */
  public async getContractMembershipWitness(contractAddress: AztecAddress) {
    const tree = await this.getTree(contractAddress);
    return tree.getContractMembershipWitness();
  }

  /**
   * Retrieve the function membership witness for the given contract address and function selector.
   * The function membership witness represents a proof that the function belongs to the specified contract.
   * Throws an error if the contract address or function selector is unknown.
   *
   * @param contractAddress - The contract address.
   * @param functionSelector - The buffer containing the function selector.
   * @returns A promise that resolves with the MembershipWitness instance for the specified contract's function.
   */
  public async getFunctionMembershipWitness(contractAddress: AztecAddress, functionSelector: Buffer) {
    const tree = await this.getTree(contractAddress);
    return tree.getFunctionMembershipWitness(functionSelector);
  }

  /**
   * Retrieve the membership witness corresponding to a verification key.
   * This function currently returns a random membership witness of the specified height,
   * which is a placeholder implementation until a concrete membership witness calculation
   * is implemented.
   *
   * @param vk - The VerificationKey for which the membership witness is needed.
   * @returns A Promise that resolves to the MembershipWitness instance.
   */
  public async getVkMembershipWitness() {
    // TODO
    return await Promise.resolve(MembershipWitness.random(VK_TREE_HEIGHT));
  }

  /**
   * Retrieve or create a ContractTree instance based on the provided AztecAddress.
   * If an existing tree with the same contract address is found in the cache, it will be returned.
   * Otherwise, a new ContractTree instance will be created using the contract data from the database
   * and added to the cache before returning.
   *
   * @param contractAddress - The AztecAddress of the contract for which the ContractTree is required.
   * @returns A ContractTree instance associated with the specified contract address.
   * @throws An Error if the contract is not found in the ContractDatabase.
   */
  private async getTree(contractAddress: AztecAddress) {
    let tree = this.trees.find(t => t.contract.address.equals(contractAddress));
    if (!tree) {
      const contract = await this.db.getContract(contractAddress);
      if (!contract) {
        throw new Error(`Unknown contract: ${contractAddress}`);
      }

      const wasm = await CircuitsWasm.get();
      tree = new ContractTree(contract, this.node, wasm);
      this.trees.push(tree);
    }
    return tree;
  }
}
