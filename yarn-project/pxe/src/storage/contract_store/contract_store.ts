import type { FUNCTION_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import {
  type ContractArtifact,
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
  getFunctionReturnType,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassIdPreimage,
  type ContractClassWithId,
  type ContractInstancePreimageWithAddress,
  SerializableContractInstancePreimage,
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
   *
   * IMPORTANT: This method does not verify that the provided artifact matches the class data or that the class id
   * matches the artifact. It is the caller's responsibility to ensure the consistency and correctness of the provided
   * data. This is done to avoid redundant, expensive contract class computations.
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

  async addContractInstance(contract: ContractInstancePreimageWithAddress): Promise<void> {
    await this.#store.transactionAsync(async () => {
      await this.#contractInstances.set(
        contract.address.toString(),
        new SerializableContractInstancePreimage(contract).toBuffer(),
      );
    });
  }

  // Private getters

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

  // Public getters

  getContractsAddresses(): Promise<AztecAddress[]> {
    return this.#store.transactionAsync(async () => {
      const keys = await toArray(this.#contractInstances.keysAsync());
      return keys.map(AztecAddress.fromStringUnsafe);
    });
  }

  /** Returns the address preimage of a given address. */
  public getContractInstance(contractAddress: AztecAddress): Promise<ContractInstancePreimageWithAddress | undefined> {
    return this.#store.transactionAsync(async () => {
      const contract = await this.#contractInstances.getAsync(contractAddress.toString());
      return contract && SerializableContractInstancePreimage.fromBuffer(contract).withAddress(contractAddress);
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

  /**
   * Retrieves the artifact of a specified function within a given contract class.
   *
   * @param contractClassId - The id of the contract class containing the function.
   * @param selector - The function selector.
   * @returns The corresponding function's artifact as an object, or `undefined` if the class is not registered.
   */
  public async getFunctionArtifact(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
    if (!artifact) {
      return undefined;
    }
    const fn = assertSelectorInArtifact(artifact, await findFunctionArtifactBySelector(artifact, selector), {
      contractClassId,
      selector,
    });
    return { ...fn, contractName: artifact.name };
  }

  /**
   * Same as {@link getFunctionArtifact} but with debug metadata attached. Returns `undefined` when the class artifact
   * is not registered.
   */
  public async getFunctionArtifactWithDebugMetadata(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
    if (!artifact) {
      return undefined;
    }
    const fn = assertSelectorInArtifact(artifact, await findFunctionArtifactBySelector(artifact, selector), {
      contractClassId,
      selector,
    });
    return {
      ...fn,
      contractName: artifact.name,
      debug: getFunctionDebugMetadata(artifact, fn),
    };
  }

  public async getPublicFunctionArtifact(contractClassId: Fr): Promise<FunctionArtifactWithContractName | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
    const fn = artifact && artifact.functions.find(f => f.functionType === FunctionType.PUBLIC);
    return fn && { ...fn, contractName: artifact.name };
  }

  /**
   * Retrieves the debug metadata of a specified function within a given contract class.
   *
   * @param contractClassId - The id of the contract class containing the function.
   * @param selector - The function selector.
   * @returns The corresponding function's debug metadata, or undefined.
   */
  public async getFunctionDebugMetadata(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
    if (!artifact) {
      return undefined;
    }
    const fn = await findFunctionArtifactBySelector(artifact, selector);
    return fn && getFunctionDebugMetadata(artifact, fn);
  }

  public async getPublicFunctionDebugMetadata(contractClassId: Fr): Promise<FunctionDebugMetadata | undefined> {
    const artifact = await this.getContractArtifact(contractClassId);
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

  public async getDebugContractName(contractClassId: Fr) {
    const artifact = await this.getContractArtifact(contractClassId);
    return artifact?.name;
  }

  public async getDebugFunctionName(contractClassId: Fr, selector: FunctionSelector) {
    const artifact = await this.getContractArtifact(contractClassId);
    const fn = artifact && (await findFunctionAbiBySelector(artifact, selector));
    return `${artifact?.name ?? contractClassId}:${fn?.name ?? selector}`;
  }

  public async getFunctionCall(
    functionName: string,
    args: any[],
    to: AztecAddress,
    contractClassId: Fr,
  ): Promise<FunctionCall> {
    const artifact = await this.getContractArtifact(contractClassId);
    if (!artifact) {
      throw new Error(
        `No artifact registered for contract class ${contractClassId} (contract ${to}): register it by calling ` +
          `wallet.registerContract(...).\nSee docs for context: https://docs.aztec.network/errors/14`,
      );
    }

    const functionDao = artifact.functions.find(f => f.name === functionName);
    if (!functionDao) {
      throw new Error(`Unknown function ${functionName} in contract ${artifact.name}.`);
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
      returnType: getFunctionReturnType(functionDao),
    });
  }
}

/**
 * Narrows the result of a selector lookup against a registered artifact. A missing class artifact is reported as
 * `undefined` by the callers (an absence they can handle), but a selector that is absent from an artifact we *do* have
 * is exceptional and throws rather than returning undefined. We cannot tell from here why the selector is missing: it
 * may be that no such function exists in the contract (a wrong selector), or that the registered artifact does not
 * correspond to the resolved class id (registration performs no validation, so a mismatched artifact is possible). The
 * error names both possibilities.
 */
function assertSelectorInArtifact<T>(
  artifact: ContractArtifact,
  fn: T | undefined,
  context: { contractClassId: Fr; selector: FunctionSelector },
): T {
  if (!fn) {
    throw new Error(
      `Function with selector ${context.selector} not found in the registered artifact for contract class ` +
        `${context.contractClassId} (${artifact.name}). Either no function with this selector exists in the ` +
        `contract, or the registered artifact does not match the class id (re-register it via ` +
        `wallet.registerContract(...)).`,
    );
  }
  return fn;
}
