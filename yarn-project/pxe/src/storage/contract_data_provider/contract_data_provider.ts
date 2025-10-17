import type { FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import {
  type ContractArtifact,
  type FunctionAbi,
  type FunctionArtifact,
  type FunctionArtifactWithContractName,
  type FunctionDebugMetadata,
  FunctionSelector,
  FunctionType,
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  getFunctionDebugMetadata,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClass,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';

import { PrivateFunctionsTree } from './private_functions_tree.js';

/**
 * Manages storage and retrieval of contract data for the PXE.
 *
 * @remarks
 * ContractDataProvider serves as the primary data manager for Aztec.nr contracts within the PXE.
 * It maintains a dual-layered storage system:
 * - Contract artifacts indexed by contract class ID (containing bytecode, ABI, function metadata)
 * - Contract instances indexed by deployment address (containing deployment-specific data)
 *
 * The provider maintains in-memory caches for performance:
 * - Private function trees for efficient membership witness generation
 * - Contract class ID mappings for fast lookups
 *
 * This separation allows multiple contract instances to share the same underlying class/artifact,
 * reducing storage overhead while maintaining fast access to contract metadata needed for
 * transaction execution and proof generation.
 */
export class ContractDataProvider {
  /**
   * Map from contract class id to private function tree.
   * @remarks
   * Used to generate membership witnesses proving that a function belongs to a contract class.
   * Trees are lazily constructed on first access and cached for performance.
   * TODO: Update to be LRU cache so that it doesn't keep all the data all the time.
   */
  #privateFunctionTrees: Map<string, PrivateFunctionsTree> = new Map();

  /**
   * Map from contract address to contract class id.
   * @remarks
   * Cached in memory for performance to avoid repeated async lookups of contract instances.
   * Contract instances contain the class ID, but this cache allows faster resolution.
   */
  #contractClassIdMap: Map<string, Fr> = new Map();

  /** Persistent storage for contract artifacts indexed by contract class ID. */
  #contractArtifacts: AztecAsyncMap<string, Buffer>;

  /** Persistent storage for contract instances indexed by deployment address. */
  #contractInstances: AztecAsyncMap<string, Buffer>;

  /**
   * Creates a new ContractDataProvider.
   *
   * @param store - The key-value store to use for persistent storage
   */
  constructor(store: AztecAsyncKVStore) {
    this.#contractArtifacts = store.openMap('contract_artifacts');
    this.#contractInstances = store.openMap('contracts_instances');
  }

  // Setters

  /**
   * Stores a contract artifact indexed by its contract class ID.
   *
   * @param id - The contract class ID to use as the storage key
   * @param contract - The complete contract artifact containing functions, events, and metadata
   * @throws If the artifact contains duplicate private function selectors
   * @remarks
   * This method validates that all private functions have unique selectors before storing.
   * Duplicate selectors would cause ambiguity when resolving function calls.
   * The artifact is stored in a serialized buffer format for efficient storage and retrieval.
   */
  public async addContractArtifact(id: Fr, contract: ContractArtifact): Promise<void> {
    const privateFunctions = contract.functions.filter(
      functionArtifact => functionArtifact.functionType === FunctionType.PRIVATE,
    );

    const privateSelectors = await Promise.all(
      privateFunctions.map(async privateFunctionArtifact =>
        (
          await FunctionSelector.fromNameAndParameters(privateFunctionArtifact.name, privateFunctionArtifact.parameters)
        ).toString(),
      ),
    );

    if (privateSelectors.length !== new Set(privateSelectors).size) {
      throw new Error('Repeated function selectors of private functions');
    }

    await this.#contractArtifacts.set(id.toString(), contractArtifactToBuffer(contract));
  }

  /**
   * Stores a deployed contract instance.
   *
   * @param contract - The contract instance with its deployment address and class ID
   * @remarks
   * Contract instances represent specific deployments of a contract class.
   * Multiple instances can share the same contract class ID (artifact), allowing
   * for efficient storage when the same contract is deployed multiple times.
   * The instance's class ID is also cached in memory for fast lookup.
   */
  async addContractInstance(contract: ContractInstanceWithAddress): Promise<void> {
    this.#contractClassIdMap.set(contract.address.toString(), contract.currentContractClassId);

    await this.#contractInstances.set(
      contract.address.toString(),
      new SerializableContractInstance(contract).toBuffer(),
    );
  }

  // Private getters

  /**
   * Retrieves the contract class ID for a given deployment address.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @returns The contract class ID, or undefined if the contract instance is not found
   * @remarks
   * This method first checks the in-memory cache, then falls back to loading
   * the contract instance from storage if needed. The result is cached for
   * subsequent calls to improve performance.
   */
  async #getContractClassId(contractAddress: AztecAddress): Promise<Fr | undefined> {
    if (!this.#contractClassIdMap.has(contractAddress.toString())) {
      const instance = await this.getContractInstance(contractAddress);
      if (!instance) {
        return;
      }
      this.#contractClassIdMap.set(contractAddress.toString(), instance.currentContractClassId);
    }
    return this.#contractClassIdMap.get(contractAddress.toString());
  }

  /**
   * Retrieves or creates a PrivateFunctionsTree instance for a given contract class.
   *
   * @param classId - The contract class ID for which to get the private function tree
   * @returns The private functions tree, or undefined if the contract artifact is not found
   * @remarks
   * The private function tree is a Merkle tree of all private function selectors in a contract.
   * This tree is used to generate membership witnesses proving that a specific function
   * belongs to the contract class. Trees are lazily constructed on first access and cached
   * in memory for performance. Once created, trees are immutable since contract classes
   * are immutable.
   */
  async #getPrivateFunctionTreeForClassId(classId: Fr): Promise<PrivateFunctionsTree | undefined> {
    if (!this.#privateFunctionTrees.has(classId.toString())) {
      const artifact = await this.getContractArtifact(classId);
      if (!artifact) {
        return;
      }
      const tree = await PrivateFunctionsTree.create(artifact);
      this.#privateFunctionTrees.set(classId.toString(), tree);
    }
    return this.#privateFunctionTrees.get(classId.toString())!;
  }

  /**
   * Retrieves the contract artifact for a given deployment address.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @returns The contract artifact, or undefined if not found
   * @remarks
   * This is a convenience method that resolves the contract class ID from the
   * instance address and then retrieves the corresponding artifact.
   */
  async #getContractArtifactByAddress(contractAddress: AztecAddress): Promise<ContractArtifact | undefined> {
    const contractClassId = await this.#getContractClassId(contractAddress);
    return contractClassId && this.getContractArtifact(contractClassId);
  }

  // Public getters

  /**
   * Retrieves all known contract deployment addresses.
   *
   * @returns Array of all contract instance addresses stored in the provider
   * @remarks
   * This returns addresses of contract instances, not contract class IDs.
   * Multiple addresses may correspond to the same underlying contract class.
   */
  async getContractsAddresses(): Promise<AztecAddress[]> {
    const keys = await toArray(this.#contractInstances.keysAsync());
    return keys.map(AztecAddress.fromString);
  }

  /**
   * Retrieves a contract instance for a given deployment address.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @returns The contract instance with its address, or undefined if not found
   * @remarks
   * A contract instance contains deployment-specific information including the contract
   * class ID, initialization hash, deployer address, and salt. The instance does not
   * include the contract's code or ABI - use getContract() for the complete contract data.
   */
  public async getContractInstance(contractAddress: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const contract = await this.#contractInstances.getAsync(contractAddress.toString());
    return contract && SerializableContractInstance.fromBuffer(contract).withAddress(contractAddress);
  }

  /**
   * Retrieves a contract artifact by its class ID.
   *
   * @param contractClassId - The unique identifier of the contract class
   * @returns The contract artifact, or undefined if not found
   * @remarks
   * The contract artifact contains the complete contract definition including:
   * - All function ABIs (private, public, unconstrained)
   * - Function bytecode and metadata
   * - Event definitions
   * - Contract name and version information
   */
  public async getContractArtifact(contractClassId: Fr): Promise<ContractArtifact | undefined> {
    const contract = await this.#contractArtifacts.getAsync(contractClassId.toString());
    // TODO(@spalladino): AztecAsyncMap lies and returns Uint8Arrays instead of Buffers, hence the extra Buffer.from.
    return contract && contractArtifactFromBuffer(Buffer.from(contract));
  }

  /**
   * Retrieves a contract class for a given class ID.
   *
   * @param contractClassId - The unique identifier of the contract class
   * @returns The contract class, or undefined if not found
   * @remarks
   * The contract class is derived from the contract artifact and contains the
   * contract's public bytecode, private functions tree, and packed bytecode hash.
   * It represents the on-chain representation of a contract that can be deployed
   * multiple times.
   */
  public async getContractClass(contractClassId: Fr): Promise<ContractClass | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
    return artifact && getContractClassFromArtifact(artifact);
  }

  /**
   * Retrieves complete contract data including both instance and artifact information.
   *
   * @param address - The address of the deployed contract instance
   * @returns An object combining the contract instance and artifact, or undefined if either is not found
   * @remarks
   * This is a convenience method that merges instance data (deployment info) with
   * artifact data (code, ABI, metadata) into a single object. Use this when you need
   * both the deployment details and the contract's code/interface.
   */
  public async getContract(
    address: AztecAddress,
  ): Promise<(ContractInstanceWithAddress & ContractArtifact) | undefined> {
    const instance = await this.getContractInstance(address);
    if (!instance) {
      return;
    }
    const artifact = await this.getContractArtifact(instance.currentContractClassId);
    if (!artifact) {
      return;
    }
    return { ...instance, ...artifact };
  }

  /**
   * Retrieves the artifact of a specific function within a deployed contract.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @param selector - The function selector identifying the specific function
   * @returns The function artifact with contract name, or undefined if not found
   * @remarks
   * The function selector is a unique identifier computed from the function's name and parameters.
   * The returned artifact includes the function's ABI, bytecode, parameters, return type, and
   * execution context (private/public/unconstrained). The contract name is included for debugging.
   */
  public async getFunctionArtifact(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && (await this.#findFunctionArtifactBySelector(artifact, selector));
    return fnArtifact && { ...fnArtifact, contractName: artifact.name };
  }

  /**
   * Retrieves the artifact of the public dispatch function for a contract.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @returns The public function artifact with contract name, or undefined if not found
   * @remarks
   * This retrieves the main public dispatch function that routes public calls to the
   * appropriate internal functions. Each contract typically has one public function
   * that serves as the entry point for all public execution.
   */
  public async getPublicFunctionArtifact(
    contractAddress: AztecAddress,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && artifact.functions.find(fn => fn.functionType === FunctionType.PUBLIC);
    return fnArtifact && { ...fnArtifact, contractName: artifact.name };
  }

  /**
   * Retrieves a function artifact by its name within a deployed contract.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @param functionName - The name of the function
   * @returns The function artifact, or undefined if not found
   * @remarks
   * This is a convenience method for retrieving functions by name instead of selector.
   * Function names are unique within a contract, making this safe for lookup.
   * For better performance when the selector is known, use getFunctionArtifact() instead.
   */
  public async getFunctionArtifactByName(
    contractAddress: AztecAddress,
    functionName: string,
  ): Promise<FunctionArtifact | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    return artifact?.functions.find(fn => fn.name === functionName);
  }

  /**
   * Retrieves the ABI of a specific function within a deployed contract.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @param selector - The function selector identifying the specific function
   * @returns The function ABI, or undefined if not found
   * @remarks
   * The function ABI contains the interface definition including parameters, return types,
   * and function type, but does not include the bytecode. This is useful when you only
   * need to understand the function's signature without executing it.
   */
  public async getFunctionAbi(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionAbi | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    return artifact && (await this.#findFunctionAbiBySelector(artifact, selector));
  }

  /**
   * Retrieves debug metadata for a specific function within a deployed contract.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @param selector - The function selector identifying the specific function
   * @returns The function's debug metadata, or undefined if not found
   * @remarks
   * Debug metadata includes source code location information, variable names, and other
   * debugging aids that help map compiled bytecode back to the original Aztec.nr source.
   * This is essential for stack traces, breakpoints, and error reporting during development.
   */
  public async getFunctionDebugMetadata(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && (await this.#findFunctionArtifactBySelector(artifact, selector));
    return fnArtifact && getFunctionDebugMetadata(artifact, fnArtifact);
  }

  /**
   * Retrieves debug metadata for the public dispatch function of a contract.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @returns The public function's debug metadata, or undefined if not found
   * @remarks
   * This retrieves debug metadata specifically for the public dispatch function.
   * Debug metadata helps trace execution and errors in the public execution environment.
   */
  public async getPublicFunctionDebugMetadata(
    contractAddress: AztecAddress,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && artifact.functions.find(fn => fn.functionType === FunctionType.PUBLIC);
    return fnArtifact && getFunctionDebugMetadata(artifact, fnArtifact);
  }

  /**
   * Generates a membership witness proving a function belongs to a contract class.
   *
   * @param contractClassId - The contract class ID
   * @param selector - The function selector to generate a witness for
   * @returns A Merkle tree membership witness, or undefined if the contract or function is not found
   * @remarks
   * The membership witness is a Merkle proof that demonstrates a specific function selector
   * is part of the contract class's private function tree. This proof is used during private
   * execution to verify that the called function is a legitimate part of the contract.
   * The witness includes the function's leaf in the tree and the sibling hashes needed
   * to compute the root.
   */
  public async getFunctionMembershipWitness(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT> | undefined> {
    const tree = await this.#getPrivateFunctionTreeForClassId(contractClassId);
    return tree?.getFunctionMembershipWitness(selector);
  }

  /**
   * Retrieves the contract name for debugging purposes.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @returns The contract name, or undefined if the contract is not found
   * @remarks
   * This is a convenience method for obtaining human-readable contract names
   * for logging, error messages, and debugging output.
   */
  public async getDebugContractName(contractAddress: AztecAddress) {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    return artifact?.name;
  }

  /**
   * Retrieves a human-readable function identifier for debugging purposes.
   *
   * @param contractAddress - The address of the deployed contract instance
   * @param selector - The function selector
   * @returns A formatted string in the form "ContractName:functionName" or fallback values if not found
   * @remarks
   * This method creates a readable identifier combining contract and function names.
   * If the contract or function cannot be resolved, it falls back to the address and
   * selector to ensure a useful debug string is always returned.
   */
  public async getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector) {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && (await this.#findFunctionAbiBySelector(artifact, selector));
    return `${artifact?.name ?? contractAddress}:${fnArtifact?.name ?? selector}`;
  }

  /**
   * Finds a function artifact by selector within a contract artifact.
   *
   * @param artifact - The contract artifact to search
   * @param selector - The function selector to find
   * @returns The matching function artifact, or undefined if not found
   * @remarks
   * This method performs a linear search through all functions in the artifact,
   * computing each function's selector and comparing it to the target.
   * The selector is computed from the function name and parameters.
   */
  async #findFunctionArtifactBySelector(
    artifact: ContractArtifact,
    selector: FunctionSelector,
  ): Promise<FunctionArtifact | undefined> {
    const functions = artifact.functions;
    for (let i = 0; i < functions.length; i++) {
      const fn = functions[i];
      const fnSelector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);
      if (fnSelector.equals(selector)) {
        return fn;
      }
    }
  }

  /**
   * Finds a function ABI by selector within a contract artifact.
   *
   * @param artifact - The contract artifact to search
   * @param selector - The function selector to find
   * @returns The matching function ABI, or undefined if not found
   * @remarks
   * This method searches both regular functions and non-dispatch public functions.
   * Non-dispatch public functions are internal public functions that are not exposed
   * through the main dispatch function but may still need to be resolved for certain
   * operations.
   */
  async #findFunctionAbiBySelector(
    artifact: ContractArtifact,
    selector: FunctionSelector,
  ): Promise<FunctionAbi | undefined> {
    const functions = [...artifact.functions, ...(artifact.nonDispatchPublicFunctions ?? [])];
    for (let i = 0; i < functions.length; i++) {
      const fn = functions[i];
      const fnSelector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);
      if (fnSelector.equals(selector)) {
        return fn;
      }
    }
  }
}
