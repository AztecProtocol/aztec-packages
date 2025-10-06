import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { type ProtocolContractsProvider, protocolContractNames } from '@aztec/protocol-contracts';
import type { CircuitSimulator } from '@aztec/simulator/client';
import {
  type ContractArtifact,
  type EventMetadataDefinition,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  decodeFromAbi,
  decodeFunctionSignature,
  encodeArguments,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  type PartialAddress,
  computeContractAddressFromInstance,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode, PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import type {
  PrivateExecutionStep,
  PrivateKernelExecutionProofOutput,
  PrivateKernelTailCircuitPublicInputs,
} from '@aztec/stdlib/kernel';
import { type NotesFilter, UniqueNote } from '@aztec/stdlib/note';
import {
  type ContractOverrides,
  PrivateExecutionResult,
  PrivateSimulationResult,
  type ProvingTimings,
  PublicSimulationOutput,
  SimulationOverrides,
  type SimulationTimings,
  Tx,
  TxExecutionRequest,
  TxProfileResult,
  TxProvingResult,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import { inspect } from 'util';

import type { PXEConfig } from './config/index.js';
import {
  ContractFunctionSimulator,
  generateSimulatedProvingResult,
} from './contract_function_simulator/contract_function_simulator.js';
import { readCurrentClassId } from './contract_function_simulator/oracle/private_execution.js';
import { ProxiedContractDataProviderFactory } from './contract_function_simulator/proxied_contract_data_source.js';
import { ProxiedNodeFactory } from './contract_function_simulator/proxied_node.js';
import { PXEOracleInterface } from './contract_function_simulator/pxe_oracle_interface.js';
import { enrichPublicSimulationError, enrichSimulationError } from './error_enriching.js';
import {
  PrivateKernelExecutionProver,
  type PrivateKernelExecutionProverConfig,
} from './private_kernel/private_kernel_execution_prover.js';
import { PrivateKernelOracleImpl } from './private_kernel/private_kernel_oracle_impl.js';
import { AddressDataProvider } from './storage/address_data_provider/address_data_provider.js';
import { CapsuleDataProvider } from './storage/capsule_data_provider/capsule_data_provider.js';
import { ContractDataProvider } from './storage/contract_data_provider/contract_data_provider.js';
import { NoteDataProvider } from './storage/note_data_provider/note_data_provider.js';
import { PrivateEventDataProvider } from './storage/private_event_data_provider/private_event_data_provider.js';
import { SyncDataProvider } from './storage/sync_data_provider/sync_data_provider.js';
import { TaggingDataProvider } from './storage/tagging_data_provider/tagging_data_provider.js';
import { Synchronizer } from './synchronizer/index.js';

/**
 * Private eXecution Environment (PXE) is a library used by wallets to simulate private phase of transactions and to
 * manage private state of users.
 */
export class PXE {
  private constructor(
    private node: AztecNode,
    private synchronizer: Synchronizer,
    private keyStore: KeyStore,
    private contractDataProvider: ContractDataProvider,
    private noteDataProvider: NoteDataProvider,
    private capsuleDataProvider: CapsuleDataProvider,
    private syncDataProvider: SyncDataProvider,
    private taggingDataProvider: TaggingDataProvider,
    private addressDataProvider: AddressDataProvider,
    private privateEventDataProvider: PrivateEventDataProvider,
    private simulator: CircuitSimulator,
    private proverEnabled: boolean,
    private proofCreator: PrivateKernelProver,
    private protocolContractsProvider: ProtocolContractsProvider,
    private log: Logger,
    private jobQueue: SerialQueue,
  ) {}

  /**
   * Creates an instance of a PXE by instantiating all the necessary data providers and services.
   * Also triggers the registration of the protocol contracts and makes sure the provided node
   * can be contacted.
   *
   * @returns A promise that resolves PXE is ready to be used.
   */
  public static async create(
    node: AztecNode,
    store: AztecAsyncKVStore,
    proofCreator: PrivateKernelProver,
    simulator: CircuitSimulator,
    protocolContractsProvider: ProtocolContractsProvider,
    config: PXEConfig,
    loggerOrSuffix?: string | Logger,
  ) {
    const log =
      !loggerOrSuffix || typeof loggerOrSuffix === 'string'
        ? createLogger(loggerOrSuffix ? `pxe:service:${loggerOrSuffix}` : `pxe:service`)
        : loggerOrSuffix;

    const proverEnabled = !!config.proverEnabled;
    const addressDataProvider = new AddressDataProvider(store);
    const privateEventDataProvider = new PrivateEventDataProvider(store);
    const contractDataProvider = new ContractDataProvider(store);
    const noteDataProvider = await NoteDataProvider.create(store);
    const syncDataProvider = new SyncDataProvider(store);
    const taggingDataProvider = new TaggingDataProvider(store);
    const capsuleDataProvider = new CapsuleDataProvider(store);
    const keyStore = new KeyStore(store);
    const tipsStore = new L2TipsKVStore(store, 'pxe');
    const synchronizer = new Synchronizer(
      node,
      syncDataProvider,
      noteDataProvider,
      taggingDataProvider,
      tipsStore,
      config,
      loggerOrSuffix,
    );

    const jobQueue = new SerialQueue();

    const pxe = new PXE(
      node,
      synchronizer,
      keyStore,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      syncDataProvider,
      taggingDataProvider,
      addressDataProvider,
      privateEventDataProvider,
      simulator,
      proverEnabled,
      proofCreator,
      protocolContractsProvider,
      log,
      jobQueue,
    );

    pxe.jobQueue.start();

    await pxe.#registerProtocolContracts();
    const info = await node.getNodeInfo();
    log.info(`Started PXE connected to chain ${info.l1ChainId} version ${info.rollupVersion}`);
    return pxe;
  }

  // Internal methods

  #getSimulatorForTx(overrides?: { contracts?: ContractOverrides }) {
    const pxeOracleInterface = new PXEOracleInterface(
      ProxiedNodeFactory.create(this.node),
      this.keyStore,
      ProxiedContractDataProviderFactory.create(this.contractDataProvider, overrides?.contracts),
      this.noteDataProvider,
      this.capsuleDataProvider,
      this.syncDataProvider,
      this.taggingDataProvider,
      this.addressDataProvider,
      this.privateEventDataProvider,
      this.log,
    );
    return new ContractFunctionSimulator(pxeOracleInterface, this.simulator);
  }

  #contextualizeError(err: Error, ...context: string[]): Error {
    let contextStr = '';
    if (context.length > 0) {
      contextStr = `\nContext:\n${context.join('\n')}`;
    }
    if (err instanceof SimulationError) {
      err.setAztecContext(contextStr);
    } else {
      this.log.error(err.name, err);
      this.log.debug(contextStr);
    }
    return err;
  }

  /**
   * Enqueues a job for execution once no other jobs are running. Returns a promise that will resolve once the job is
   * complete.
   *
   * Useful for tasks that cannot run concurrently, such as contract function simulation.
   */
  #putInJobQueue<T>(fn: () => Promise<T>): Promise<T> {
    // TODO(#12636): relax the conditions under which we forbid concurrency.
    if (this.jobQueue.length() != 0) {
      this.log.warn(
        `PXE is already processing ${this.jobQueue.length()} jobs, concurrent execution is not supported. Will run once those are complete.`,
      );
    }

    return this.jobQueue.put(fn);
  }

  async #registerProtocolContracts() {
    const registered: Record<string, string> = {};
    for (const name of protocolContractNames) {
      const { address, contractClass, instance, artifact } =
        await this.protocolContractsProvider.getProtocolContractArtifact(name);
      await this.contractDataProvider.addContractArtifact(contractClass.id, artifact);
      await this.contractDataProvider.addContractInstance(instance);
      registered[name] = address.toString();
    }
    this.log.verbose(`Registered protocol contracts in pxe`, registered);
  }

  async #isContractClassPubliclyRegistered(id: Fr): Promise<boolean> {
    return !!(await this.node.getContractClass(id));
  }

  async #isContractPublished(address: AztecAddress): Promise<boolean> {
    return !!(await this.node.getContract(address));
  }

  async #isContractInitialized(address: AztecAddress): Promise<boolean> {
    const initNullifier = await siloNullifier(address, address.toField());
    return !!(await this.node.getNullifierMembershipWitness('latest', initNullifier));
  }

  async #getFunctionCall(functionName: string, args: any[], to: AztecAddress): Promise<FunctionCall> {
    const contract = await this.contractDataProvider.getContract(to);
    if (!contract) {
      throw new Error(
        `Unknown contract ${to}: add it to PXE by calling server.addContracts(...).\nSee docs for context: https://docs.aztec.network/developers/reference/debugging/aztecnr-errors#unknown-contract-0x0-add-it-to-pxe-by-calling-serveraddcontracts`,
      );
    }

    const functionDao = contract.functions.find(f => f.name === functionName);
    if (!functionDao) {
      throw new Error(`Unknown function ${functionName} in contract ${contract.name}.`);
    }

    return {
      name: functionDao.name,
      args: encodeArguments(functionDao, args),
      selector: await FunctionSelector.fromNameAndParameters(functionDao.name, functionDao.parameters),
      type: functionDao.functionType,
      to,
      isStatic: functionDao.isStatic,
      returnTypes: functionDao.returnTypes,
    };
  }

  // Executes the entrypoint private function, as well as all nested private
  // functions that might arise.
  async #executePrivate(
    contractFunctionSimulator: ContractFunctionSimulator,
    txRequest: TxExecutionRequest,
    scopes?: AztecAddress[],
  ): Promise<PrivateExecutionResult> {
    const { origin: contractAddress, functionSelector } = txRequest;

    try {
      const result = await contractFunctionSimulator.run(
        txRequest,
        contractAddress,
        functionSelector,
        undefined,
        // The sender for tags is set by contracts, typically by an account
        // contract entrypoint
        undefined, // senderForTags
        scopes,
      );
      this.log.debug(`Private simulation completed for ${contractAddress.toString()}:${functionSelector}`);
      return result;
    } catch (err) {
      if (err instanceof SimulationError) {
        await enrichSimulationError(err, this.contractDataProvider, this.log);
      }
      throw err;
    }
  }

  /**
   * Simulate a utility function call on the given contract.
   * @param contractFunctionSimulator - The simulator to use for the function call.
   * @param call - The function call to execute.
   * @param authWitnesses - Authentication witnesses required for the function call.
   * @param scopes - Optional array of account addresses whose notes can be accessed in this call. Defaults to all
   * accounts if not specified.
   * @returns The simulation result containing the outputs of the utility function.
   */
  async #simulateUtility(
    contractFunctionSimulator: ContractFunctionSimulator,
    call: FunctionCall,
    authWitnesses?: AuthWitness[],
    scopes?: AztecAddress[],
  ) {
    try {
      return contractFunctionSimulator.runUtility(call, authWitnesses ?? [], scopes);
    } catch (err) {
      if (err instanceof SimulationError) {
        await enrichSimulationError(err, this.contractDataProvider, this.log);
      }
      throw err;
    }
  }

  /**
   * Simulate the public part of a transaction.
   * This allows to catch public execution errors before submitting the transaction.
   * It can also be used for estimating gas in the future.
   * @param tx - The transaction to be simulated.
   */
  async #simulatePublicCalls(tx: Tx, skipFeeEnforcement: boolean) {
    // Simulating public calls can throw if the TX fails in a phase that doesn't allow reverts (setup)
    // Or return as reverted if it fails in a phase that allows reverts (app logic, teardown)
    try {
      const result = await this.node.simulatePublicCalls(tx, skipFeeEnforcement);
      if (result.revertReason) {
        throw result.revertReason;
      }
      return result;
    } catch (err) {
      if (err instanceof SimulationError) {
        try {
          await enrichPublicSimulationError(err, this.contractDataProvider, this.log);
        } catch (enrichErr) {
          this.log.error(`Failed to enrich public simulation error: ${enrichErr}`);
        }
      }
      throw err;
    }
  }

  /**
   * Generate a kernel proof, and create a private kernel output.
   * The function takes in a transaction execution request, and the result of private execution
   * and then generates a kernel proof.
   *
   * @param txExecutionRequest - The transaction request to be simulated and proved.
   * @param proofCreator - The proof creator to use for proving the execution.
   * @param privateExecutionResult - The result of the private execution
   * @param config - The configuration for the kernel execution prover.
   * @returns An object that contains the output of the kernel execution, including the ClientIvcProof if proving is enabled.
   */
  async #prove(
    txExecutionRequest: TxExecutionRequest,
    proofCreator: PrivateKernelProver,
    privateExecutionResult: PrivateExecutionResult,
    config: PrivateKernelExecutionProverConfig,
  ): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
    const simulationAnchorBlock = privateExecutionResult.getSimulationAnchorBlockNumber();
    const kernelOracle = new PrivateKernelOracleImpl(
      this.contractDataProvider,
      this.keyStore,
      this.node,
      simulationAnchorBlock,
    );
    const kernelTraceProver = new PrivateKernelExecutionProver(kernelOracle, proofCreator, !this.proverEnabled);
    this.log.debug(`Executing kernel trace prover (${JSON.stringify(config)})...`);
    return await kernelTraceProver.proveWithKernels(txExecutionRequest.toTxRequest(), privateExecutionResult, config);
  }

  // Public API

  public getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.contractDataProvider.getContractInstance(address);
  }

  /**
   * Returns the contract class metadata given a contract class id.
   * The metadata consists of its contract class, whether it has been publicly registered, and its artifact.
   * @remark - it queries the node to check whether the contract class with the given id has been publicly registered.
   * @param id - Identifier of the class.
   * @param includeArtifact - Identifier of the class.
   * @returns - It returns the contract class metadata, with the artifact field being optional, and will only be returned if true is passed in
   * for `includeArtifact`
   * TODO(@spalladino): The PXE actually holds artifacts and not classes, what should we return? Also,
   * should the pxe query the node for contract public info, and merge it with its own definitions?
   * TODO(@spalladino): This method is strictly needed to decide whether to publicly register a class or not
   * during a public deployment. We probably want a nicer and more general API for this, but it'll have to
   * do for the time being.
   */
  public async getContractClassMetadata(
    id: Fr,
    includeArtifact: boolean = false,
  ): Promise<{
    contractClass: ContractClassWithId | undefined;
    isContractClassPubliclyRegistered: boolean;
    artifact: ContractArtifact | undefined;
  }> {
    const artifact = await this.contractDataProvider.getContractArtifact(id);
    if (!artifact) {
      this.log.warn(`No artifact found for contract class ${id.toString()} when looking for its metadata`);
    }

    return {
      contractClass: artifact && (await getContractClassFromArtifact(artifact)),
      isContractClassPubliclyRegistered: await this.#isContractClassPubliclyRegistered(id),
      artifact: includeArtifact ? artifact : undefined,
    };
  }

  /**
   * Returns the contract metadata given an address.
   * The metadata consists of its contract instance, which includes the contract class identifier,
   * initialization hash, deployment salt, and public keys hash; whether the contract instance has been initialized;
   * and whether the contract instance with the given address has been publicly deployed.
   * @remark - it queries the node to check whether the contract instance has been initialized / publicly deployed through a node.
   * This query is not dependent on the PXE.
   * @param address - The address that the contract instance resides at.
   * @returns - It returns the contract metadata
   * TODO(@spalladino): Should we return the public keys in plain as well here?
   */
  public async getContractMetadata(address: AztecAddress): Promise<{
    contractInstance: ContractInstanceWithAddress | undefined;
    isContractInitialized: boolean;
    isContractPublished: boolean;
  }> {
    let instance;
    try {
      instance = await this.contractDataProvider.getContractInstance(address);
    } catch {
      this.log.warn(`No instance found for contract ${address.toString()} when looking for its metadata`);
    }
    return {
      contractInstance: instance,
      isContractInitialized: await this.#isContractInitialized(address),
      isContractPublished: await this.#isContractPublished(address),
    };
  }

  /**
   * Registers a user account in PXE given its master encryption private key.
   * Once a new account is registered, the PXE will trial-decrypt all published notes on
   * the chain and store those that correspond to the registered account. Will do nothing if the
   * account is already registered.
   *
   * @param secretKey - Secret key of the corresponding user master public key.
   * @param partialAddress - The partial address of the account contract corresponding to the account being registered.
   * @returns The complete address of the account.
   */
  public async registerAccount(secretKey: Fr, partialAddress: PartialAddress): Promise<CompleteAddress> {
    const accounts = await this.keyStore.getAccounts();
    const accountCompleteAddress = await this.keyStore.addAccount(secretKey, partialAddress);
    if (accounts.includes(accountCompleteAddress.address)) {
      this.log.info(`Account:\n "${accountCompleteAddress.address.toString()}"\n already registered.`);
      return accountCompleteAddress;
    } else {
      this.log.info(`Registered account ${accountCompleteAddress.address.toString()}`);
      this.log.debug(`Registered account\n ${accountCompleteAddress.toReadableString()}`);
    }

    await this.addressDataProvider.addCompleteAddress(accountCompleteAddress);
    await this.noteDataProvider.addScope(accountCompleteAddress.address);
    return accountCompleteAddress;
  }

  /**
   * Registers a user contact in PXE.
   *
   * Once a new contact is registered, the PXE will be able to receive notes tagged from this contact.
   * Will do nothing if the account is already registered.
   *
   * @param address - Address of the user to add to the address book
   * @returns The address address of the account.
   */
  public async registerSender(address: AztecAddress): Promise<AztecAddress> {
    const accounts = await this.keyStore.getAccounts();
    if (accounts.includes(address)) {
      this.log.info(`Sender:\n "${address.toString()}"\n already registered.`);
      return address;
    }

    const wasAdded = await this.taggingDataProvider.addSenderAddress(address);

    if (wasAdded) {
      this.log.info(`Added sender:\n ${address.toString()}`);
    } else {
      this.log.info(`Sender:\n "${address.toString()}"\n already registered.`);
    }

    return address;
  }

  /**
   * Retrieves the addresses stored as senders on this PXE.
   * @returns An array of the senders on this PXE.
   */
  public getSenders(): Promise<AztecAddress[]> {
    return this.taggingDataProvider.getSenderAddresses();
  }

  /**
   * Removes a sender in the address book.
   */
  public async removeSender(address: AztecAddress): Promise<void> {
    const wasRemoved = await this.taggingDataProvider.removeSenderAddress(address);

    if (wasRemoved) {
      this.log.info(`Removed sender:\n ${address.toString()}`);
    } else {
      this.log.info(`Sender:\n "${address.toString()}"\n not in address book.`);
    }
  }

  /**
   * Retrieves the user accounts registered on this PXE.
   * @returns An array of the accounts registered on this PXE.
   */
  public async getRegisteredAccounts(): Promise<CompleteAddress[]> {
    // Get complete addresses of both the recipients and the accounts
    const completeAddresses = await this.addressDataProvider.getCompleteAddresses();
    // Filter out the addresses not corresponding to accounts
    const accounts = await this.keyStore.getAccounts();
    return completeAddresses.filter(completeAddress =>
      accounts.find(address => address.equals(completeAddress.address)),
    );
  }

  /**
   * Registers a contract class in the PXE without registering any associated contract instance with it.
   *
   * @param artifact - The build artifact for the contract class.
   */
  public async registerContractClass(artifact: ContractArtifact): Promise<void> {
    const { id: contractClassId } = await getContractClassFromArtifact(artifact);
    await this.contractDataProvider.addContractArtifact(contractClassId, artifact);
    this.log.info(`Added contract class ${artifact.name} with id ${contractClassId}`);
  }

  /**
   * Adds deployed contracts to the PXE. Deployed contract information is used to access the
   * contract code when simulating local transactions. This is automatically called by aztec.js when
   * deploying a contract. Dapps that wish to interact with contracts already deployed should register
   * these contracts in their users' PXE through this method.
   *
   * @param contract - A contract instance to register, with an optional artifact which can be omitted if the contract class has already been registered.
   */
  public async registerContract(contract: { instance: ContractInstanceWithAddress; artifact?: ContractArtifact }) {
    const { instance } = contract;
    let { artifact } = contract;

    if (artifact) {
      // If the user provides an artifact, validate it against the expected class id and register it
      const contractClass = await getContractClassFromArtifact(artifact);
      const contractClassId = contractClass.id;
      if (!contractClassId.equals(instance.currentContractClassId)) {
        throw new Error(
          `Artifact does not match expected class id (computed ${contractClassId} but instance refers to ${instance.currentContractClassId})`,
        );
      }
      const computedAddress = await computeContractAddressFromInstance(instance);
      if (!computedAddress.equals(instance.address)) {
        throw new Error('Added a contract in which the address does not match the contract instance.');
      }
      await this.contractDataProvider.addContractArtifact(contractClass.id, artifact);

      const publicFunctionSignatures = artifact.functions
        .filter(fn => fn.functionType === FunctionType.PUBLIC)
        .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
      await this.node.registerContractFunctionSignatures(publicFunctionSignatures);
    } else {
      // Otherwise, make sure there is an artifact already registered for that class id
      artifact = await this.contractDataProvider.getContractArtifact(instance.currentContractClassId);
      if (!artifact) {
        throw new Error(
          `Artifact not found when registering an instance. Contract class: ${instance.currentContractClassId}.`,
        );
      }
    }

    await this.contractDataProvider.addContractInstance(instance);
    this.log.info(
      `Added contract ${artifact.name} at ${instance.address.toString()} with class ${instance.currentContractClassId}`,
    );
  }

  /**
   * Updates a deployed contract in the PXE. This is used to update the contract artifact when
   * an update has happened, so the new code can be used in the simulation of local transactions.
   * This is called by aztec.js when instantiating a contract in a given address with a mismatching artifact.
   * @param contractAddress - The address of the contract to update.
   * @param artifact - The updated artifact for the contract.
   * @throws If the artifact's contract class is not found in the PXE or if the contract class is different from
   * the current one (current one from the point of view of the node to which the PXE is connected).
   */
  public updateContract(contractAddress: AztecAddress, artifact: ContractArtifact): Promise<void> {
    // We disable concurrently updating contracts to avoid concurrently syncing with the node, or changing a contract's
    // class while we're simulating it.
    return this.#putInJobQueue(async () => {
      const currentInstance = await this.contractDataProvider.getContractInstance(contractAddress);
      if (!currentInstance) {
        throw new Error(`Instance not found when updating a contract. Contract address: ${contractAddress}.`);
      }
      const contractClass = await getContractClassFromArtifact(artifact);
      await this.synchronizer.sync();

      const header = await this.syncDataProvider.getBlockHeader();

      const currentClassId = await readCurrentClassId(
        contractAddress,
        currentInstance,
        this.node,
        header.globalVariables.blockNumber,
        header.globalVariables.timestamp,
      );
      if (!contractClass.id.equals(currentClassId)) {
        throw new Error('Could not update contract to a class different from the current one.');
      }

      await this.contractDataProvider.addContractArtifact(contractClass.id, artifact);

      const publicFunctionSignatures = artifact.functions
        .filter(fn => fn.functionType === FunctionType.PUBLIC)
        .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
      await this.node.registerContractFunctionSignatures(publicFunctionSignatures);

      currentInstance.currentContractClassId = contractClass.id;
      await this.contractDataProvider.addContractInstance(currentInstance);
      this.log.info(`Updated contract ${artifact.name} at ${contractAddress.toString()} to class ${contractClass.id}`);
    });
  }

  /**
   * Retrieves the addresses of contracts added to this PXE.
   * @returns An array of contracts addresses registered on this PXE.
   */
  public getContracts(): Promise<AztecAddress[]> {
    return this.contractDataProvider.getContractsAddresses();
  }

  /**
   * A debugging utility to get notes based on the provided filter.
   *
   * Note that this should not be used in production code because the structure of notes is considered to be
   * an implementation detail of contracts. This is only meant to be used for debugging purposes. If you need to obtain
   * note-related information in production code, please implement a custom utility function on your contract and call
   * that function instead (e.g. `get_balance(owner: AztecAddress) -> u128` utility function on a Token contract).
   *
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  public async getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    // We need to manually trigger private state sync to have a guarantee that all the notes are available.
    await this.simulateUtility('sync_private_state', [], filter.contractAddress);

    const noteDaos = await this.noteDataProvider.getNotes(filter);

    const extendedNotes = noteDaos.map(async dao => {
      let recipient = filter.recipient;
      if (recipient === undefined) {
        const completeAddresses = await this.addressDataProvider.getCompleteAddresses();
        const completeAddressIndex = completeAddresses.findIndex(completeAddress =>
          completeAddress.address.equals(dao.recipient),
        );
        const completeAddress = completeAddresses[completeAddressIndex];
        if (completeAddress === undefined) {
          throw new Error(`Cannot find complete address for recipient ${dao.recipient.toString()}`);
        }
        recipient = completeAddress.address;
      }
      return new UniqueNote(dao.note, recipient, dao.contractAddress, dao.storageSlot, dao.txHash, dao.noteNonce);
    });
    return Promise.all(extendedNotes);
  }

  /**
   * Proves the private portion of a simulated transaction, ready to send to the network
   * (where validators prove the public portion).
   *
   * @param txRequest - An authenticated tx request ready for proving
   * @returns A result containing the proof and public inputs of the tail circuit.
   * @throws If contract code not found, or public simulation reverts.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  public proveTx(txRequest: TxExecutionRequest): Promise<TxProvingResult> {
    let privateExecutionResult: PrivateExecutionResult;
    // We disable proving concurrently mostly out of caution, since it accesses some of our stores. Proving is so
    // computationally demanding that it'd be rare for someone to try to do it concurrently regardless.
    return this.#putInJobQueue(async () => {
      const totalTimer = new Timer();
      try {
        const syncTimer = new Timer();
        await this.synchronizer.sync();
        const syncTime = syncTimer.ms();
        const contractFunctionSimulator = this.#getSimulatorForTx();
        privateExecutionResult = await this.#executePrivate(contractFunctionSimulator, txRequest);

        const {
          publicInputs,
          clientIvcProof,
          executionSteps,
          timings: { proving } = {},
        } = await this.#prove(txRequest, this.proofCreator, privateExecutionResult, {
          simulate: false,
          skipFeeEnforcement: false,
          profileMode: 'none',
        });

        const totalTime = totalTimer.ms();

        const perFunction = executionSteps.map(({ functionName, timings: { witgen, oracles } }) => ({
          functionName,
          time: witgen,
          oracles,
        }));

        const timings: ProvingTimings = {
          total: totalTime,
          sync: syncTime,
          proving,
          perFunction,
          unaccounted:
            totalTime - ((syncTime ?? 0) + (proving ?? 0) + perFunction.reduce((acc, { time }) => acc + time, 0)),
        };

        this.log.debug(`Proving completed in ${totalTime}ms`, { timings });
        return new TxProvingResult(privateExecutionResult, publicInputs, clientIvcProof!, {
          timings,
          nodeRPCCalls: contractFunctionSimulator?.getStats().nodeRPCCalls,
        });
      } catch (err: any) {
        throw this.#contextualizeError(err, inspect(txRequest), inspect(privateExecutionResult));
      }
    });
  }

  /**
   * Profiles a transaction, reporting gate counts (unless disabled) and returns an execution trace.
   *
   * @param txRequest - An authenticated tx request ready for simulation
   * @param msgSender - (Optional) The message sender to use for the simulation.
   * @param skipTxValidation - (Optional) If false, this function throws if the transaction is unable to be included in a block at the current state.
   * @returns A trace of the program execution with gate counts.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   */
  public profileTx(
    txRequest: TxExecutionRequest,
    profileMode: 'full' | 'execution-steps' | 'gates',
    skipProofGeneration: boolean = true,
  ): Promise<TxProfileResult> {
    // We disable concurrent profiles for consistency with simulateTx.
    return this.#putInJobQueue(async () => {
      const totalTimer = new Timer();
      try {
        const txInfo = {
          origin: txRequest.origin,
          functionSelector: txRequest.functionSelector,
          simulatePublic: false,
          chainId: txRequest.txContext.chainId,
          version: txRequest.txContext.version,
          authWitnesses: txRequest.authWitnesses.map(w => w.requestHash),
        };
        this.log.info(
          `Profiling transaction execution request to ${txRequest.functionSelector} at ${txRequest.origin}`,
          txInfo,
        );
        const syncTimer = new Timer();
        await this.synchronizer.sync();
        const syncTime = syncTimer.ms();

        const contractFunctionSimulator = this.#getSimulatorForTx();
        const privateExecutionResult = await this.#executePrivate(contractFunctionSimulator, txRequest);

        const { executionSteps, timings: { proving } = {} } = await this.#prove(
          txRequest,
          this.proofCreator,
          privateExecutionResult,
          {
            simulate: skipProofGeneration,
            skipFeeEnforcement: false,
            profileMode,
          },
        );

        const totalTime = totalTimer.ms();

        const perFunction = executionSteps.map(({ functionName, timings: { witgen, oracles } }) => {
          return {
            functionName,
            time: witgen,
            oracles,
          };
        });

        // Gate computation is time is not relevant for profiling, so we subtract it from the total time.
        const gateCountComputationTime =
          executionSteps.reduce((acc, { timings }) => acc + (timings.gateCount ?? 0), 0) ?? 0;

        const total = totalTime - gateCountComputationTime;

        const timings: ProvingTimings = {
          total,
          sync: syncTime,
          proving,
          perFunction,
          unaccounted:
            total - ((syncTime ?? 0) + (proving ?? 0) + perFunction.reduce((acc, { time }) => acc + time, 0)),
        };

        const simulatorStats = contractFunctionSimulator.getStats();
        return new TxProfileResult(executionSteps, { timings, nodeRPCCalls: simulatorStats.nodeRPCCalls });
      } catch (err: any) {
        throw this.#contextualizeError(err, inspect(txRequest), `profileMode=${profileMode}`);
      }
    });
  }

  /**
   * Simulates a transaction based on the provided preauthenticated execution request.
   * This will run a local simulation of private execution (and optionally of public as well), run the
   * kernel circuits to ensure adherence to protocol rules (without generating a proof), and return the
   * simulation results .
   *
   *
   * Note that this is used with `ContractFunctionInteraction::simulateTx` to bypass certain checks.
   * In that case, the transaction returned is only potentially ready to be sent to the network for execution.
   *
   *
   * @param txRequest - An authenticated tx request ready for simulation
   * @param simulatePublic - Whether to simulate the public part of the transaction.
   * @param skipTxValidation - (Optional) If false, this function throws if the transaction is unable to be included in a block at the current state.
   * @param skipFeeEnforcement - (Optional) If false, fees are enforced.
   * @param overrides - (Optional) State overrides for the simulation, such as msgSender, contract instances and artifacts.
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns A simulated transaction result object that includes public and private return values.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   * Also throws if simulatePublic is true and public simulation reverts.
   *
   * TODO(#7456) Prevent msgSender being defined here for the first call
   */
  public simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    skipTxValidation: boolean = false,
    skipFeeEnforcement: boolean = false,
    overrides?: SimulationOverrides,
    scopes?: AztecAddress[],
  ): Promise<TxSimulationResult> {
    // We disable concurrent simulations since those might execute oracles which read and write to the PXE stores (e.g.
    // to the capsules), and we need to prevent concurrent runs from interfering with one another (e.g. attempting to
    // delete the same read value, or reading values that another simulation is currently modifying).
    return this.#putInJobQueue(async () => {
      try {
        const totalTimer = new Timer();
        const txInfo = {
          origin: txRequest.origin,
          functionSelector: txRequest.functionSelector,
          simulatePublic,
          chainId: txRequest.txContext.chainId,
          version: txRequest.txContext.version,
          authWitnesses: txRequest.authWitnesses.map(w => w.requestHash),
        };
        this.log.info(
          `Simulating transaction execution request to ${txRequest.functionSelector} at ${txRequest.origin}`,
          txInfo,
        );
        const syncTimer = new Timer();
        await this.synchronizer.sync();
        const syncTime = syncTimer.ms();

        const contractFunctionSimulator = this.#getSimulatorForTx(overrides);
        // Temporary: in case there are overrides, we have to skip the kernels or validations
        // will fail. Consider handing control to the user/wallet on whether they want to run them
        // or not.
        const skipKernels = overrides?.contracts !== undefined && Object.keys(overrides.contracts ?? {}).length > 0;

        // Execution of private functions only; no proving, and no kernel logic.
        const privateExecutionResult = await this.#executePrivate(contractFunctionSimulator, txRequest, scopes);

        let publicInputs: PrivateKernelTailCircuitPublicInputs | undefined;
        let executionSteps: PrivateExecutionStep[] = [];

        if (skipKernels) {
          // According to the protocol rules, the nonce generator for the note hashes
          // can either be the first nullifier in the tx or the hash of the initial tx request
          // if there are none.
          const nonceGenerator = privateExecutionResult.firstNullifier.equals(Fr.ZERO)
            ? await txRequest.toTxRequest().hash()
            : privateExecutionResult.firstNullifier;
          ({ publicInputs, executionSteps } = await generateSimulatedProvingResult(
            privateExecutionResult,
            nonceGenerator,
            this.contractDataProvider,
          ));
        } else {
          // Kernel logic, plus proving of all private functions and kernels.
          ({ publicInputs, executionSteps } = await this.#prove(txRequest, this.proofCreator, privateExecutionResult, {
            simulate: true,
            skipFeeEnforcement,
            profileMode: 'none',
          }));
        }

        const privateSimulationResult = new PrivateSimulationResult(privateExecutionResult, publicInputs);
        const simulatedTx = await privateSimulationResult.toSimulatedTx();
        let publicSimulationTime: number | undefined;
        let publicOutput: PublicSimulationOutput | undefined;
        if (simulatePublic && publicInputs.forPublic) {
          const publicSimulationTimer = new Timer();
          publicOutput = await this.#simulatePublicCalls(simulatedTx, skipFeeEnforcement);
          publicSimulationTime = publicSimulationTimer.ms();
        }

        let validationTime: number | undefined;
        if (!skipTxValidation) {
          const validationTimer = new Timer();
          const validationResult = await this.node.isValidTx(simulatedTx, { isSimulation: true, skipFeeEnforcement });
          validationTime = validationTimer.ms();
          if (validationResult.result === 'invalid') {
            throw new Error('The simulated transaction is unable to be added to state and is invalid.');
          }
        }

        const txHash = simulatedTx.getTxHash();

        const totalTime = totalTimer.ms();

        const perFunction = executionSteps.map(({ functionName, timings: { witgen, oracles } }) => ({
          functionName,
          time: witgen,
          oracles,
        }));

        const timings: SimulationTimings = {
          total: totalTime,
          sync: syncTime,
          publicSimulation: publicSimulationTime,
          validation: validationTime,
          perFunction,
          unaccounted:
            totalTime -
            (syncTime +
              (publicSimulationTime ?? 0) +
              (validationTime ?? 0) +
              perFunction.reduce((acc, { time }) => acc + time, 0)),
        };

        this.log.info(`Simulation completed for ${txHash.toString()} in ${totalTime}ms`, {
          txHash,
          ...txInfo,
          ...(publicOutput
            ? {
                gasUsed: publicOutput.gasUsed,
                revertCode: publicOutput.txEffect.revertCode.getCode(),
                revertReason: publicOutput.revertReason,
              }
            : {}),
        });

        const simulatorStats = contractFunctionSimulator.getStats();
        return TxSimulationResult.fromPrivateSimulationResultAndPublicOutput(privateSimulationResult, publicOutput, {
          timings,
          nodeRPCCalls: simulatorStats.nodeRPCCalls,
        });
      } catch (err: any) {
        throw this.#contextualizeError(
          err,
          inspect(txRequest),
          `simulatePublic=${simulatePublic}`,
          `skipTxValidation=${skipTxValidation}`,
          `scopes=${scopes?.map(s => s.toString()).join(', ') ?? 'undefined'}`,
        );
      }
    });
  }

  /**
   * Simulate the execution of a contract utility function.
   *
   * @param functionName - The name of the utility contract function to be called.
   * @param args - The arguments to be provided to the function.
   * @param to - The address of the contract to be called.
   * @param authwits - (Optional) The authentication witnesses required for the function call.
   * @param from - (Optional) The msg sender to set for the call.
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will
   * default to all.
   * @returns The result of the utility function call, structured based on the function ABI.
   */
  public simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    _from?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<UtilitySimulationResult> {
    // We disable concurrent simulations since those might execute oracles which read and write to the PXE stores (e.g.
    // to the capsules), and we need to prevent concurrent runs from interfering with one another (e.g. attempting to
    // delete the same read value, or reading values that another simulation is currently modifying).
    return this.#putInJobQueue(async () => {
      try {
        const totalTimer = new Timer();
        const syncTimer = new Timer();
        await this.synchronizer.sync();
        const syncTime = syncTimer.ms();
        // TODO - Should check if `from` has the permission to call the view function.
        const functionCall = await this.#getFunctionCall(functionName, args, to);
        const functionTimer = new Timer();
        const contractFunctionSimulator = this.#getSimulatorForTx();
        const executionResult = await this.#simulateUtility(
          contractFunctionSimulator,
          functionCall,
          authwits ?? [],
          scopes,
        );
        const functionTime = functionTimer.ms();

        const totalTime = totalTimer.ms();

        const perFunction = [{ functionName, time: functionTime }];

        const timings: SimulationTimings = {
          total: totalTime,
          sync: syncTime,
          perFunction,
          unaccounted: totalTime - (syncTime + perFunction.reduce((acc, { time }) => acc + time, 0)),
        };

        const simulationStats = contractFunctionSimulator.getStats();
        return { result: executionResult, stats: { timings, nodeRPCCalls: simulationStats.nodeRPCCalls } };
      } catch (err: any) {
        const stringifiedArgs = args.map(arg => arg.toString()).join(', ');
        throw this.#contextualizeError(
          err,
          `simulateUtility ${to}:${functionName}(${stringifiedArgs})`,
          `scopes=${scopes?.map(s => s.toString()).join(', ') ?? 'undefined'}`,
        );
      }
    });
  }

  /**
   * Returns the private events given search parameters.
   * @param contractAddress - The address of the contract to get events from.
   * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
   * @param from - The block number to search from.
   * @param numBlocks - The amount of blocks to search.
   * @param recipients - The addresses that decrypted the logs.
   * @returns - The deserialized events.
   */
  public async getPrivateEvents<T>(
    contractAddress: AztecAddress,
    eventMetadataDef: EventMetadataDefinition,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
  ): Promise<T[]> {
    if (recipients.length === 0) {
      throw new Error('Recipients are required to get private events');
    }

    this.log.verbose(`Getting private events for ${contractAddress.toString()} from ${from} to ${from + numBlocks}`);

    // We need to manually trigger private state sync to have a guarantee that all the events are available.
    await this.simulateUtility('sync_private_state', [], contractAddress);

    const events = await this.privateEventDataProvider.getPrivateEvents(
      contractAddress,
      from,
      numBlocks,
      recipients,
      eventMetadataDef.eventSelector,
    );

    const decodedEvents = events.map((event: Fr[]): T => decodeFromAbi([eventMetadataDef.abiType], event) as T);

    return decodedEvents;
  }

  /**
   * Stops the PXE's job queue.
   */
  public stop(): Promise<void> {
    return this.jobQueue.end();
  }
}
