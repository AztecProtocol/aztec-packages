import type { FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import {
  type ContractArtifact,
  type FunctionAbi,
  type FunctionArtifactWithContractName,
  FunctionCall,
  type FunctionDebugMetadata,
  FunctionSelector,
  FunctionType,
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  encodeArguments,
  findFunctionAbiBySelector,
  findFunctionArtifactBySelector,
  getFunctionDebugMetadata,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassIdPreimage,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';

import { PrivateFunctionsTree } from './private_functions_tree.js';

const VERSION = 1 as const;

/**
 * All contract class data except the large packedBytecode.
 * The expensive data from the ContractClass is precomputed and stored in this format to avoid redundant hashing.
 * Since we have to store the artifacts anyway, the final ContractClass is reconstructed by combining this data
 * with the packedBytecode obtained from the former. That way we can have quick class lookups without wasted storage.
 */
export class SerializableContractClassData {
  public readonly version = VERSION;
  public readonly id: Fr;
  public readonly artifactHash: Fr;
  public readonly privateFunctionsRoot: Fr;
  public readonly publicBytecodeCommitment: Fr;
  public readonly privateFunctions: { selector: FunctionSelector; vkHash: Fr }[];

  constructor(
    data: ContractClassIdPreimage & {
      id: Fr;
      privateFunctions: { selector: FunctionSelector; vkHash: Fr }[];
    },
  ) {
    this.id = data.id;
    this.artifactHash = data.artifactHash;
    this.privateFunctionsRoot = data.privateFunctionsRoot;
    this.publicBytecodeCommitment = data.publicBytecodeCommitment;
    this.privateFunctions = data.privateFunctions;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(
      numToUInt8(this.version),
      this.id,
      this.artifactHash,
      this.privateFunctionsRoot,
      this.publicBytecodeCommitment,
      this.privateFunctions.length,
      ...this.privateFunctions.map(fn => serializeToBuffer(fn.selector, fn.vkHash)),
    );
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader): SerializableContractClassData {
    const reader = BufferReader.asReader(bufferOrReader);
    const version = reader.readUInt8();
    if (version !== VERSION) {
      throw new Error(`Unexpected contract class data version ${version}`);
    }
    return new SerializableContractClassData({
      id: reader.readObject(Fr),
      artifactHash: reader.readObject(Fr),
      privateFunctionsRoot: reader.readObject(Fr),
      publicBytecodeCommitment: reader.readObject(Fr),
      privateFunctions: reader.readVector({
        fromBuffer: (r: BufferReader) => ({
          selector: r.readObject(FunctionSelector),
          vkHash: r.readObject(Fr),
        }),
      }),
    });
  }
}

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

  /**
   * In-memory cache of deserialized ContractArtifact objects, keyed by class id string.
   * Avoids repeated LMDB reads + JSON.parse + Zod validation on every oracle call.
   * Artifacts are large but immutable after registration — safe to cache for the lifetime of the store.
   */
  // TODO: Update it to be LRU cache so that it doesn't keep all the data all the time.
  #contractArtifactCache: Map<string, ContractArtifact> = new Map();

  /** Map from contract address to contract class id (avoids KV round-trip on hot path). */
  #contractClassIdMap: Map<string, Fr> = new Map();

  #store: AztecAsyncKVStore;
  #contractArtifacts: AztecAsyncMap<string, Buffer>;
  #contractClassData: AztecAsyncMap<string, Buffer>;
  #contractInstances: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#contractArtifacts = store.openMap('contract_artifacts');
    this.#contractClassData = store.openMap('contract_classes');
    this.#contractInstances = store.openMap('contracts_instances');
  }

  // Setters

  /**
   * Registers a new contract artifact and its corresponding class data.
   * IMPORTANT: This method does not verify that the provided artifact matches the class data or that the class id matches the artifact.
   * It is the caller's responsibility to ensure the consistency and correctness of the provided data.
   * This is done to avoid redundant, expensive contract class computations
   */
  public async addContractArtifact(
    contract: ContractArtifact,
    contractClassWithIdAndPreimage?: ContractClassWithId & ContractClassIdPreimage,
  ): Promise<Fr> {
    const contractClass = contractClassWithIdAndPreimage ?? (await getContractClassFromArtifact(contract));
    const key = contractClass.id.toString();

    if (this.#contractArtifactCache.has(key)) {
      return contractClass.id;
    }

    const privateFunctions = contract.functions.filter(
      functionArtifact => functionArtifact.functionType === FunctionType.PRIVATE,
    );
    const privateSelectors = await Promise.all(
      privateFunctions.map(async fn =>
        (await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)).toString(),
      ),
    );
    if (privateSelectors.length !== new Set(privateSelectors).size) {
      throw new Error('Repeated function selectors of private functions');
    }

    this.#contractArtifactCache.set(key, contract);

    await this.#store.transactionAsync(async () => {
      await this.#contractArtifacts.set(key, contractArtifactToBuffer(contract));
      await this.#contractClassData.set(key, new SerializableContractClassData(contractClass).toBuffer());
    });

    return contractClass.id;
  }

  async addContractInstance(contract: ContractInstanceWithAddress): Promise<void> {
    await this.#store.transactionAsync(async () => {
      await this.#contractInstances.set(
        contract.address.toString(),
        new SerializableContractInstance(contract).toBuffer(),
      );
    });

    this.#contractClassIdMap.set(contract.address.toString(), contract.currentContractClassId);
  }

  // Private getters

  async #getContractClassId(contractAddress: AztecAddress): Promise<Fr | undefined> {
    const key = contractAddress.toString();
    if (!this.#contractClassIdMap.has(key)) {
      const instance = await this.getContractInstance(contractAddress);
      if (!instance) {
        return;
      }
      this.#contractClassIdMap.set(key, instance.currentContractClassId);
    }
    return this.#contractClassIdMap.get(key);
  }

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

  async #getArtifactByAddress(contractAddress: AztecAddress): Promise<ContractArtifact | undefined> {
    const classId = await this.#getContractClassId(contractAddress);
    return classId && this.getContractArtifact(classId);
  }

  // Public getters

  getContractsAddresses(): Promise<AztecAddress[]> {
    return this.#store.transactionAsync(async () => {
      const keys = await toArray(this.#contractInstances.keysAsync());
      return keys.map(AztecAddress.fromStringUnsafe);
    });
  }

  /** Returns a contract instance for a given address. */
  public getContractInstance(contractAddress: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.#store.transactionAsync(async () => {
      const contract = await this.#contractInstances.getAsync(contractAddress.toString());
      return contract && SerializableContractInstance.fromBuffer(contract).withAddress(contractAddress);
    });
  }

  /** Returns the raw contract artifact for a given class id. */
  public async getContractArtifact(contractClassId: Fr): Promise<ContractArtifact | undefined> {
    const key = contractClassId.toString();
    const cached = this.#contractArtifactCache.get(key);
    if (cached) {
      return cached;
    }
    const artifact = await this.#store.transactionAsync(async () => {
      const buf = await this.#contractArtifacts.getAsync(key);
      return buf && contractArtifactFromBuffer(buf);
    });
    if (artifact) {
      this.#contractArtifactCache.set(key, artifact);
    }
    return artifact;
  }

  /** Returns a contract class for a given class id. */
  public async getContractClassWithPreimage(
    contractClassId: Fr,
  ): Promise<(ContractClassWithId & ContractClassIdPreimage) | undefined> {
    const key = contractClassId.toString();
    const buf = await this.#store.transactionAsync(() => this.#contractClassData.getAsync(key));
    if (!buf) {
      return undefined;
    }
    const classData = SerializableContractClassData.fromBuffer(buf);
    const artifact = await this.getContractArtifact(contractClassId);
    if (!artifact) {
      return undefined;
    }
    const packedBytecode = artifact.functions.find(f => f.name === 'public_dispatch')?.bytecode ?? Buffer.alloc(0);
    return { ...classData, packedBytecode };
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
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param selector - The function selector.
   * @returns The corresponding function's artifact as an object.
   */
  public async getFunctionArtifact(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.#getArtifactByAddress(contractAddress);
    if (!artifact) {
      return undefined;
    }
    const fn = await findFunctionArtifactBySelector(artifact, selector);
    return fn && { ...fn, contractName: artifact.name };
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
    const artifact = await this.#getArtifactByAddress(contractAddress);
    const fn = artifact && artifact.functions.find(f => f.functionType === FunctionType.PUBLIC);
    return fn && { ...fn, contractName: artifact.name };
  }

  public async getFunctionAbi(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionAbi | undefined> {
    const artifact = await this.#getArtifactByAddress(contractAddress);
    return artifact && (await findFunctionAbiBySelector(artifact, selector));
  }

  /**
   * Retrieves the debug metadata of a specified function within a given contract.
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param selector - The function selector.
   * @returns The corresponding function's debug metadata, or undefined.
   */
  public async getFunctionDebugMetadata(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.#getArtifactByAddress(contractAddress);
    if (!artifact) {
      return undefined;
    }
    const fn = await findFunctionArtifactBySelector(artifact, selector);
    return fn && getFunctionDebugMetadata(artifact, fn);
  }

  public async getPublicFunctionDebugMetadata(
    contractAddress: AztecAddress,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.#getArtifactByAddress(contractAddress);
    const fn = artifact && artifact.functions.find(f => f.functionType === FunctionType.PUBLIC);
    return fn && getFunctionDebugMetadata(artifact, fn);
  }

  /**
   * Retrieve the function membership witness for the given contract class and function selector.
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
    const artifact = await this.#getArtifactByAddress(contractAddress);
    return artifact?.name;
  }

  public async getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector) {
    const artifact = await this.#getArtifactByAddress(contractAddress);
    const fn = artifact && (await findFunctionAbiBySelector(artifact, selector));
    return `${artifact?.name ?? contractAddress}:${fn?.name ?? selector}`;
  }

  public async getFunctionCall(functionName: string, args: any[], to: AztecAddress): Promise<FunctionCall> {
    const contract = await this.getContract(to);
    if (!contract) {
      throw new Error(
        `Unknown contract ${to}: register it by calling wallet.registerContract(...).\nSee docs for context: https://docs.aztec.network/errors/14`,
      );
    }

    const functionDao = contract.functions.find(f => f.name === functionName);
    if (!functionDao) {
      throw new Error(`Unknown function ${functionName} in contract ${contract.name}.`);
    }

    const selector = await FunctionSelector.fromNameAndParameters(functionDao.name, functionDao.parameters);

    return FunctionCall.from({
      name: functionDao.name,
      to,
      selector,
      type: functionDao.functionType,
      hideMsgSender: false,
      isStatic: functionDao.isStatic,
      args: encodeArguments(functionDao, args),
      returnTypes: functionDao.returnTypes,
    });
  }
}
