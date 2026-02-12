import type { FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import {
  type ContractArtifact,
  type FunctionAbi,
  type FunctionArtifact,
  type FunctionArtifactWithContractName,
  FunctionCall,
  type FunctionDebugMetadata,
  FunctionSelector,
  FunctionType,
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  encodeArguments,
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
 * ContractStore serves as a data manager and retriever for Aztec.nr contracts.
 * It provides methods to obtain contract addresses, function ABI, bytecode, and membership witnesses
 * from a given contract address and function selector. The class maintains a cache of ContractTree instances
 * to efficiently serve the requested data. It interacts with the ContractDatabase and AztecNode to fetch
 * the required information and facilitate cryptographic proof generation.
 */
export class ContractStore {
  /** Map from contract class id to private function tree. */
  // TODO: Update it to be LRU cache so that it doesn't keep all the data all the time.
  #privateFunctionTrees: Map<string, PrivateFunctionsTree> = new Map();

  /** Map from contract address to contract class id */
  #contractClassIdMap: Map<string, Fr> = new Map();

  #store: AztecAsyncKVStore;
  #contractArtifacts: AztecAsyncMap<string, Buffer>;
  #contractInstances: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#contractArtifacts = store.openMap('contract_artifacts');
    this.#contractInstances = store.openMap('contracts_instances');
  }

  // Setters

  public async addContractArtifact(id: Fr, contract: ContractArtifact): Promise<void> {
    // Validation outside transactionAsync - these are not DB operations
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

    await this.#store.transactionAsync(() =>
      this.#contractArtifacts.set(id.toString(), contractArtifactToBuffer(contract)),
    );
  }

  async addContractInstance(contract: ContractInstanceWithAddress): Promise<void> {
    this.#contractClassIdMap.set(contract.address.toString(), contract.currentContractClassId);

    await this.#contractInstances.set(
      contract.address.toString(),
      new SerializableContractInstance(contract).toBuffer(),
    );
  }

  // Private getters

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
   * Retrieve or create a ContractTree instance based on the provided class id.
   * If an existing tree with the same class id is found in the cache, it will be returned.
   * Otherwise, a new ContractTree instance will be created using the contract data from the database
   * and added to the cache before returning.
   *
   * @param classId - The class id of the contract for which the ContractTree is required.
   * @returns A ContractTree instance associated with the specified contract address.
   * @throws An Error if the contract is not found in the ContractDatabase.
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

  async #getContractArtifactByAddress(contractAddress: AztecAddress): Promise<ContractArtifact | undefined> {
    const contractClassId = await this.#getContractClassId(contractAddress);
    return contractClassId && this.getContractArtifact(contractClassId);
  }

  // Public getters

  getContractsAddresses(): Promise<AztecAddress[]> {
    return this.#store.transactionAsync(async () => {
      const keys = await toArray(this.#contractInstances.keysAsync());
      return keys.map(AztecAddress.fromString);
    });
  }

  /** Returns a contract instance for a given address. Throws if not found. */
  public getContractInstance(contractAddress: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.#store.transactionAsync(async () => {
      const contract = await this.#contractInstances.getAsync(contractAddress.toString());
      return contract && SerializableContractInstance.fromBuffer(contract).withAddress(contractAddress);
    });
  }

  public getContractArtifact(contractClassId: Fr): Promise<ContractArtifact | undefined> {
    return this.#store.transactionAsync(async () => {
      const contract = await this.#contractArtifacts.getAsync(contractClassId.toString());
      // TODO(@spalladino): AztecAsyncMap lies and returns Uint8Arrays instead of Buffers, hence the extra Buffer.from.
      return contract && contractArtifactFromBuffer(Buffer.from(contract));
    });
  }

  /** Returns a contract class for a given class id. Throws if not found. */
  public async getContractClass(contractClassId: Fr): Promise<ContractClass | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
    return artifact && getContractClassFromArtifact(artifact);
  }

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
   * Retrieves the artifact of a specified function within a given contract.
   * The function is identified by its selector, which is a unique code generated from the function's signature.
   * Throws an error if the contract address or function selector are invalid or not found.
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param selector - The function selector.
   * @returns The corresponding function's artifact as an object.
   */
  public async getFunctionArtifact(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && (await this.#findFunctionArtifactBySelector(artifact, selector));
    return fnArtifact && { ...fnArtifact, contractName: artifact.name };
  }

  public async getFunctionArtifactWithDebugMetadata(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName> {
    const artifact = await this.getFunctionArtifact(contractAddress, selector);
    if (!artifact) {
      throw new Error(`Function artifact not found for contract ${contractAddress} and selector ${selector}.`);
    }
    const debug = await this.getFunctionDebugMetadata(contractAddress, selector);
    return {
      ...artifact,
      debug,
    };
  }

  public async getPublicFunctionArtifact(
    contractAddress: AztecAddress,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && artifact.functions.find(fn => fn.functionType === FunctionType.PUBLIC);
    return fnArtifact && { ...fnArtifact, contractName: artifact.name };
  }

  public async getFunctionAbi(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionAbi | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    return artifact && (await this.#findFunctionAbiBySelector(artifact, selector));
  }

  /**
   * Retrieves the debug metadata of a specified function within a given contract.
   * The function is identified by its selector, which is a unique code generated from the function's signature.
   * Returns undefined if the debug metadata for the given function is not found.
   * Throws if the contract has not been added to the database.
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param selector - The function selector.
   * @returns The corresponding function's artifact as an object.
   */
  public async getFunctionDebugMetadata(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && (await this.#findFunctionArtifactBySelector(artifact, selector));
    return fnArtifact && getFunctionDebugMetadata(artifact, fnArtifact);
  }

  public async getPublicFunctionDebugMetadata(
    contractAddress: AztecAddress,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && artifact.functions.find(fn => fn.functionType === FunctionType.PUBLIC);
    return fnArtifact && getFunctionDebugMetadata(artifact, fnArtifact);
  }

  /**
   * Retrieve the function membership witness for the given contract class and function selector.
   * The function membership witness represents a proof that the function belongs to the specified contract.
   * Throws an error if the contract address or function selector is unknown.
   *
   * @param contractClassId - The id of the class.
   * @param selector - The function selector.
   * @returns A promise that resolves with the MembershipWitness instance for the specified contract's function.
   */
  public async getFunctionMembershipWitness(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT> | undefined> {
    const tree = await this.#getPrivateFunctionTreeForClassId(contractClassId);
    return tree?.getFunctionMembershipWitness(selector);
  }

  public async getDebugContractName(contractAddress: AztecAddress) {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    return artifact?.name;
  }

  public async getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector) {
    const artifact = await this.#getContractArtifactByAddress(contractAddress);
    const fnArtifact = artifact && (await this.#findFunctionAbiBySelector(artifact, selector));
    return `${artifact?.name ?? contractAddress}:${fnArtifact?.name ?? selector}`;
  }

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

  public async getFunctionCall(functionName: string, args: any[], to: AztecAddress): Promise<FunctionCall> {
    const contract = await this.getContract(to);
    if (!contract) {
      throw new Error(
        `Unknown contract ${to}: add it to PXE by calling server.addContracts(...).\nSee docs for context: https://docs.aztec.network/developers/resources/debugging/aztecnr-errors#unknown-contract-0x0-add-it-to-pxe-by-calling-serveraddcontracts`,
      );
    }

    const functionDao = contract.functions.find(f => f.name === functionName);
    if (!functionDao) {
      throw new Error(`Unknown function ${functionName} in contract ${contract.name}.`);
    }

    return FunctionCall.from({
      name: functionDao.name,
      to,
      selector: await FunctionSelector.fromNameAndParameters(functionDao.name, functionDao.parameters),
      type: functionDao.functionType,
      hideMsgSender: false,
      isStatic: functionDao.isStatic,
      args: encodeArguments(functionDao, args),
      returnTypes: functionDao.returnTypes,
    });
  }
}
