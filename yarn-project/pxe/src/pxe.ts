import type { PrivateEventFilter } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { type ProtocolContractsProvider, protocolContractNames } from '@aztec/protocol-contracts';
import type { CircuitSimulator } from '@aztec/simulator/client';
import {
  type ContractArtifact,
  EventSelector,
  FunctionCall,
  FunctionType,
  decodeFunctionSignature,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  type PartialAddress,
  computeContractAddressFromInstance,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import type { AztecNode, PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import type {
  PrivateExecutionStep,
  PrivateKernelExecutionProofOutput,
  PrivateKernelTailCircuitPublicInputs,
} from '@aztec/stdlib/kernel';
import {
  BlockHeader,
  type ContractOverrides,
  type InTx,
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

import type { AccessScopes } from './access_scopes.js';
import { BlockSynchronizer } from './block_synchronizer/index.js';
import type { PXEConfig } from './config/index.js';
import { BenchmarkedNodeFactory } from './contract_function_simulator/benchmarked_node.js';
import {
  ContractFunctionSimulator,
  generateSimulatedProvingResult,
} from './contract_function_simulator/contract_function_simulator.js';
import { ProxiedContractStoreFactory } from './contract_function_simulator/proxied_contract_data_source.js';
import { ContractSyncService } from './contract_sync/contract_sync_service.js';
import { readCurrentClassId } from './contract_sync/helpers.js';
import { PXEDebugUtils } from './debug/pxe_debug_utils.js';
import { enrichPublicSimulationError, enrichSimulationError } from './error_enriching.js';
import { PrivateEventFilterValidator } from './events/private_event_filter_validator.js';
import { JobCoordinator } from './job_coordinator/job_coordinator.js';
import {
  PrivateKernelExecutionProver,
  type PrivateKernelExecutionProverConfig,
} from './private_kernel/private_kernel_execution_prover.js';
import { PrivateKernelOracle } from './private_kernel/private_kernel_oracle.js';
import { AddressStore } from './storage/address_store/address_store.js';
import { AnchorBlockStore } from './storage/anchor_block_store/anchor_block_store.js';
import { CapsuleStore } from './storage/capsule_store/capsule_store.js';
import { ContractStore } from './storage/contract_store/contract_store.js';
import { NoteStore } from './storage/note_store/note_store.js';
import { PrivateEventStore } from './storage/private_event_store/private_event_store.js';
import { RecipientTaggingStore } from './storage/tagging_store/recipient_tagging_store.js';
import { SenderAddressBookStore } from './storage/tagging_store/sender_address_book_store.js';
import { SenderTaggingStore } from './storage/tagging_store/sender_tagging_store.js';

export type PackedPrivateEvent = InTx & {
  packedEvent: Fr[];
  eventSelector: EventSelector;
};

/** Options for PXE.profileTx. */
export type ProfileTxOpts = {
  /** The profiling mode to use. */
  profileMode: 'full' | 'execution-steps' | 'gates';
  /** If true, proof generation is skipped during profiling. Defaults to true. */
  skipProofGeneration?: boolean;
  /** Addresses whose private state and keys are accessible during private execution. */
  scopes: AccessScopes;
};

/** Options for PXE.simulateTx. */
export type SimulateTxOpts = {
  /** Whether to simulate the public part of the transaction. */
  simulatePublic: boolean;
  /** If false, this function throws if the transaction is unable to be included in a block at the current state. */
  skipTxValidation?: boolean;
  /** If false, fees are enforced. */
  skipFeeEnforcement?: boolean;
  /** State overrides for the simulation, such as contract instances and artifacts. */
  overrides?: SimulationOverrides;
  /** Addresses whose private state and keys are accessible during private execution */
  scopes: AccessScopes;
};

/** Options for PXE.simulateUtility. */
export type SimulateUtilityOpts = {
  /** The authentication witnesses required for the function call. */
  authwits?: AuthWitness[];
  /** The accounts whose notes we can access in this call */
  scopes: AccessScopes;
};

/** Args for PXE.create. */
export type PXECreateArgs = {
  /** The Aztec node to connect to. */
  node: AztecNode;
  /** The key-value store for persisting PXE state. */
  store: AztecAsyncKVStore;
  /** The prover for generating private kernel proofs. */
  proofCreator: PrivateKernelProver;
  /** The circuit simulator for executing ACIR circuits. */
  simulator: CircuitSimulator;
  /** Provider for protocol contract artifacts and instances. */
  protocolContractsProvider: ProtocolContractsProvider;
  /** PXE configuration options. */
  config: PXEConfig;
  /** Optional logger instance or string suffix for the logger name. */
  loggerOrSuffix?: string | Logger;
};

/**
 * Private eXecution Environment (PXE) is a library used by wallets to simulate private phase of transactions and to
 * manage private state of users.
 */
export class PXE {
  private constructor(
    private node: AztecNode,
    private blockStateSynchronizer: BlockSynchronizer,
    private keyStore: KeyStore,
    private contractStore: ContractStore,
    private noteStore: NoteStore,
    private capsuleStore: CapsuleStore,
    private anchorBlockStore: AnchorBlockStore,
    private senderTaggingStore: SenderTaggingStore,
    private senderAddressBookStore: SenderAddressBookStore,
    private recipientTaggingStore: RecipientTaggingStore,
    private addressStore: AddressStore,
    private privateEventStore: PrivateEventStore,
    private contractSyncService: ContractSyncService,
    private simulator: CircuitSimulator,
    private proverEnabled: boolean,
    private proofCreator: PrivateKernelProver,
    private protocolContractsProvider: ProtocolContractsProvider,
    private log: Logger,
    private jobQueue: SerialQueue,
    private jobCoordinator: JobCoordinator,
    public debug: PXEDebugUtils,
  ) {}

  /**
   * Creates an instance of a PXE by instantiating all the necessary data providers and services.
   * Also triggers the registration of the protocol contracts and makes sure the provided node
   * can be contacted.
   *
   * @returns A promise that resolves PXE is ready to be used.
   */
  public static async create({
    node,
    store,
    proofCreator,
    simulator,
    protocolContractsProvider,
    config,
    loggerOrSuffix,
  }: PXECreateArgs) {
    // Extract bindings from the logger, or use empty bindings if a string suffix is provided.
    const bindings: LoggerBindings | undefined =
      loggerOrSuffix && typeof loggerOrSuffix !== 'string' ? loggerOrSuffix.getBindings() : undefined;

    const log =
      !loggerOrSuffix || typeof loggerOrSuffix === 'string'
        ? createLogger(loggerOrSuffix ? `pxe:service:${loggerOrSuffix}` : `pxe:service`)
        : loggerOrSuffix;

    const info = await node.getNodeInfo();

    const proverEnabled = config.proverEnabled !== undefined ? config.proverEnabled : info.realProofs;
    const addressStore = new AddressStore(store);
    const privateEventStore = new PrivateEventStore(store);
    const contractStore = new ContractStore(store);
    const noteStore = new NoteStore(store);
    const anchorBlockStore = new AnchorBlockStore(store);
    const senderTaggingStore = new SenderTaggingStore(store);
    const senderAddressBookStore = new SenderAddressBookStore(store);
    const recipientTaggingStore = new RecipientTaggingStore(store);
    const capsuleStore = new CapsuleStore(store);
    const keyStore = new KeyStore(store);
    const tipsStore = new L2TipsKVStore(store, 'pxe');
    const contractSyncService = new ContractSyncService(
      node,
      contractStore,
      noteStore,
      createLogger('pxe:contract_sync', bindings),
    );
    const synchronizer = new BlockSynchronizer(
      node,
      store,
      anchorBlockStore,
      noteStore,
      privateEventStore,
      tipsStore,
      contractSyncService,
      config,
      bindings,
    );

    const jobCoordinator = new JobCoordinator(store, bindings);
    jobCoordinator.registerStores([
      capsuleStore,
      senderTaggingStore,
      recipientTaggingStore,
      privateEventStore,
      noteStore,
      contractSyncService,
    ]);

    const debugUtils = new PXEDebugUtils(contractSyncService, noteStore, synchronizer, anchorBlockStore);

    const jobQueue = new SerialQueue();

    const pxe = new PXE(
      node,
      synchronizer,
      keyStore,
      contractStore,
      noteStore,
      capsuleStore,
      anchorBlockStore,
      senderTaggingStore,
      senderAddressBookStore,
      recipientTaggingStore,
      addressStore,
      privateEventStore,
      contractSyncService,
      simulator,
      proverEnabled,
      proofCreator,
      protocolContractsProvider,
      log,
      jobQueue,
      jobCoordinator,
      debugUtils,
    );

    debugUtils.setPXEHelpers(
      pxe.#putInJobQueue.bind(pxe),
      pxe.#getSimulatorForTx.bind(pxe),
      pxe.#simulateUtility.bind(pxe),
    );

    pxe.jobQueue.start();

    await pxe.#registerProtocolContracts();
    log.info(`Started PXE connected to chain ${info.l1ChainId} version ${info.rollupVersion}`);
    return pxe;
  }

  // Internal methods

  #getSimulatorForTx(overrides?: { contracts?: ContractOverrides }) {
    const proxyContractStore = ProxiedContractStoreFactory.create(this.contractStore, overrides?.contracts);

    return new ContractFunctionSimulator({
      contractStore: proxyContractStore,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: BenchmarkedNodeFactory.create(this.node),
      senderTaggingStore: this.senderTaggingStore,
      recipientTaggingStore: this.recipientTaggingStore,
      senderAddressBookStore: this.senderAddressBookStore,
      capsuleStore: this.capsuleStore,
      privateEventStore: this.privateEventStore,
      simulator: this.simulator,
      contractSyncService: this.contractSyncService,
    });
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
  #putInJobQueue<T>(fn: (jobId: string) => Promise<T>): Promise<T> {
    // TODO(#12636): relax the conditions under which we forbid concurrency.
    if (this.jobQueue.length() != 0) {
      this.log.warn(
        `PXE is already processing ${this.jobQueue.length()} jobs, concurrent execution is not supported. Will run once those are complete.`,
      );
    }

    return this.jobQueue.put(async () => {
      const jobId = this.jobCoordinator.beginJob();
      this.log.verbose(`Beginning job ${jobId}`);

      try {
        const result = await fn(jobId);
        this.log.verbose(`Committing job ${jobId}`);

        await this.jobCoordinator.commitJob(jobId);
        return result;
      } catch (err) {
        this.log.verbose(`Aborting job ${jobId}`);
        await this.jobCoordinator.abortJob(jobId);
        throw err;
      }
    });
  }

  async #registerProtocolContracts() {
    const registered: Record<string, string> = {};
    for (const name of protocolContractNames) {
      const { address, contractClass, instance, artifact } =
        await this.protocolContractsProvider.getProtocolContractArtifact(name);
      await this.contractStore.addContractArtifact(contractClass.id, artifact);
      await this.contractStore.addContractInstance(instance);
      registered[name] = address.toString();
    }
    this.log.verbose(`Registered protocol contracts in pxe`, registered);
  }

  // Executes the entrypoint private function, as well as all nested private
  // functions that might arise.
  async #executePrivate(
    contractFunctionSimulator: ContractFunctionSimulator,
    txRequest: TxExecutionRequest,
    scopes: AccessScopes,
    jobId: string,
  ): Promise<PrivateExecutionResult> {
    const { origin: contractAddress, functionSelector } = txRequest;

    try {
      const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();

      await this.contractSyncService.ensureContractSynced(
        contractAddress,
        functionSelector,
        (privateSyncCall, execScopes) =>
          this.#simulateUtility(contractFunctionSimulator, privateSyncCall, [], execScopes, jobId),
        anchorBlockHeader,
        jobId,
        scopes,
      );

      const result = await contractFunctionSimulator.run(txRequest, {
        contractAddress,
        selector: functionSelector,
        anchorBlockHeader,
        scopes,
        jobId,
      });
      this.log.debug(`Private simulation completed for ${contractAddress.toString()}:${functionSelector}`);
      return result;
    } catch (err) {
      if (err instanceof SimulationError) {
        await enrichSimulationError(err, this.contractStore, this.log);
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
   * @param jobId - The job ID for staged writes.
   * @returns The simulation result containing the outputs of the utility function.
   */
  async #simulateUtility(
    contractFunctionSimulator: ContractFunctionSimulator,
    call: FunctionCall,
    authWitnesses: AuthWitness[] | undefined,
    scopes: AccessScopes,
    jobId: string,
  ) {
    try {
      const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();
      return contractFunctionSimulator.runUtility(call, authWitnesses ?? [], anchorBlockHeader, scopes, jobId);
    } catch (err) {
      if (err instanceof SimulationError) {
        await enrichSimulationError(err, this.contractStore, this.log);
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
          await enrichPublicSimulationError(err, this.contractStore, this.log);
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
   * @returns An object that contains the output of the kernel execution, including the ChonkProof if proving is enabled.
   */
  async #prove(
    txExecutionRequest: TxExecutionRequest,
    proofCreator: PrivateKernelProver,
    privateExecutionResult: PrivateExecutionResult,
    config: PrivateKernelExecutionProverConfig,
  ): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
    const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();
    const anchorBlockHash = await anchorBlockHeader.hash();
    const kernelOracle = new PrivateKernelOracle(this.contractStore, this.keyStore, this.node, anchorBlockHash);
    const kernelTraceProver = new PrivateKernelExecutionProver(
      kernelOracle,
      proofCreator,
      !this.proverEnabled,
      this.log.getBindings(),
    );
    this.log.debug(`Executing kernel trace prover (${JSON.stringify(config)})...`);
    return await kernelTraceProver.proveWithKernels(txExecutionRequest.toTxRequest(), privateExecutionResult, config);
  }

  // Public API

  /**
   * Returns the block header up to which the PXE has synced.
   * @returns The synced block header
   */
  public getSyncedBlockHeader(): Promise<BlockHeader> {
    return this.anchorBlockStore.getBlockHeader();
  }

  /**
   * Returns the contract instance for a given address, if it's registered in the PXE.
   * @param address - The contract address.
   * @returns The contract instance if found, undefined otherwise.
   */
  public getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.contractStore.getContractInstance(address);
  }

  /**
   * Returns the contract artifact for a given contract class id, if it's registered in the PXE.
   * @param id - Identifier of the contract class.
   * @returns The contract artifact if found, undefined otherwise.
   */
  public async getContractArtifact(id: Fr): Promise<ContractArtifact | undefined> {
    return await this.contractStore.getContractArtifact(id);
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

    await this.addressStore.addCompleteAddress(accountCompleteAddress);
    return accountCompleteAddress;
  }

  /**
   * Registers a sender in this PXE.
   *
   * After registering a new sender, the PXE will sync private logs that are tagged with this sender's address.
   * Will do nothing if the address is already registered.
   *
   * @param sender - Address of the sender to register.
   * @returns The address of the sender.
   * TODO: It's strange that we return the address here and I (benesjan) think we should drop the return value.
   */
  public async registerSender(sender: AztecAddress): Promise<AztecAddress> {
    const accounts = await this.keyStore.getAccounts();
    if (accounts.includes(sender)) {
      this.log.info(`Sender:\n "${sender.toString()}"\n already registered.`);
      return sender;
    }

    const wasAdded = await this.senderAddressBookStore.addSender(sender);

    if (wasAdded) {
      this.log.info(`Added sender:\n ${sender.toString()}`);
    } else {
      this.log.info(`Sender:\n "${sender.toString()}"\n already registered.`);
    }

    return sender;
  }

  /**
   * Retrieves senders registered in this PXE.
   * @returns Senders registered in this PXE.
   */
  public getSenders(): Promise<AztecAddress[]> {
    return this.senderAddressBookStore.getSenders();
  }

  /**
   * Removes a sender registered in this PXE.
   * @param sender - The address of the sender to remove.
   */
  public async removeSender(sender: AztecAddress): Promise<void> {
    const wasRemoved = await this.senderAddressBookStore.removeSender(sender);

    if (wasRemoved) {
      this.log.info(`Removed sender:\n ${sender.toString()}`);
    } else {
      this.log.info(`Sender:\n "${sender.toString()}"\n not registered in PXE.`);
    }
  }

  /**
   * Retrieves the user accounts registered on this PXE.
   * @returns An array of the accounts registered on this PXE.
   */
  public async getRegisteredAccounts(): Promise<CompleteAddress[]> {
    // Get complete addresses of both the recipients and the accounts
    const completeAddresses = await this.addressStore.getCompleteAddresses();
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
    await this.contractStore.addContractArtifact(contractClassId, artifact);
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
      await this.contractStore.addContractArtifact(contractClass.id, artifact);

      const publicFunctionSignatures = artifact.functions
        .filter(fn => fn.functionType === FunctionType.PUBLIC)
        .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
      await this.node.registerContractFunctionSignatures(publicFunctionSignatures);
    } else {
      // Otherwise, make sure there is an artifact already registered for that class id
      artifact = await this.contractStore.getContractArtifact(instance.currentContractClassId);
      if (!artifact) {
        throw new Error(
          `Artifact not found when registering an instance. Contract class: ${instance.currentContractClassId}.`,
        );
      }
    }

    await this.contractStore.addContractInstance(instance);
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
      const currentInstance = await this.contractStore.getContractInstance(contractAddress);
      if (!currentInstance) {
        throw new Error(`Instance not found when updating a contract. Contract address: ${contractAddress}.`);
      }
      const contractClass = await getContractClassFromArtifact(artifact);
      await this.blockStateSynchronizer.sync();

      const header = await this.anchorBlockStore.getBlockHeader();

      const currentClassId = await readCurrentClassId(contractAddress, currentInstance, this.node, header);
      if (!contractClass.id.equals(currentClassId)) {
        throw new Error('Could not update contract to a class different from the current one.');
      }

      await this.contractStore.addContractArtifact(contractClass.id, artifact);

      const publicFunctionSignatures = artifact.functions
        .filter(fn => fn.functionType === FunctionType.PUBLIC)
        .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
      await this.node.registerContractFunctionSignatures(publicFunctionSignatures);

      currentInstance.currentContractClassId = contractClass.id;
      await this.contractStore.addContractInstance(currentInstance);
      this.log.info(`Updated contract ${artifact.name} at ${contractAddress.toString()} to class ${contractClass.id}`);
    });
  }

  /**
   * Retrieves the addresses of contracts added to this PXE.
   * @returns An array of contracts addresses registered on this PXE.
   */
  public getContracts(): Promise<AztecAddress[]> {
    return this.contractStore.getContractsAddresses();
  }

  /**
   * Proves the private portion of a simulated transaction, ready to send to the network
   * (where validators prove the public portion).
   *
   * @param txRequest - An authenticated tx request ready for proving
   * @param scopes - Addresses whose private state and keys are accessible during private execution.
   * @returns A result containing the proof and public inputs of the tail circuit.
   * @throws If contract code not found, or public simulation reverts.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  public proveTx(txRequest: TxExecutionRequest, scopes: AztecAddress[]): Promise<TxProvingResult> {
    let privateExecutionResult: PrivateExecutionResult;
    // We disable proving concurrently mostly out of caution, since it accesses some of our stores. Proving is so
    // computationally demanding that it'd be rare for someone to try to do it concurrently regardless.
    return this.#putInJobQueue(async jobId => {
      const totalTimer = new Timer();
      try {
        const syncTimer = new Timer();
        await this.blockStateSynchronizer.sync();
        const syncTime = syncTimer.ms();
        const contractFunctionSimulator = this.#getSimulatorForTx();
        privateExecutionResult = await this.#executePrivate(contractFunctionSimulator, txRequest, scopes, jobId);

        const {
          publicInputs,
          chonkProof,
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

        const txProvingResult = new TxProvingResult(privateExecutionResult, publicInputs, chonkProof!, {
          timings,
          nodeRPCCalls: contractFunctionSimulator?.getStats().nodeRPCCalls,
        });

        // While not strictly necessary to store tagging cache contents in the DB since we sync tagging indexes from
        // chain before sending new logs, the sync can only see logs already included in blocks. If we send another
        // transaction before this one is included in a block from this PXE, and that transaction contains a log with
        // a tag derived from the same secret, we would reuse the tag and the transactions would be linked. Hence
        // storing the tags here prevents linkage of txs sent from the same PXE.
        const preTagsUsedInTheTx = privateExecutionResult.entrypoint.preTags;
        if (preTagsUsedInTheTx.length > 0) {
          // TODO(benesjan): The following is an expensive operation. Figure out a way to avoid it.
          const txHash = (await txProvingResult.toTx()).txHash;

          await this.senderTaggingStore.storePendingIndexes(preTagsUsedInTheTx, txHash, jobId);
          this.log.debug(`Stored used pre-tags as sender for the tx`, {
            preTagsUsedInTheTx,
          });
        } else {
          this.log.debug(`No pre-tags used in the tx`);
        }

        return txProvingResult;
      } catch (err: any) {
        throw this.#contextualizeError(err, inspect(txRequest), inspect(privateExecutionResult));
      }
    });
  }

  /**
   * Profiles a transaction, reporting gate counts (unless disabled) and returns an execution trace.
   * @param txRequest - An authenticated tx request ready for simulation.
   * @returns A trace of the program execution with gate counts.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   */
  public profileTx(
    txRequest: TxExecutionRequest,
    { profileMode, skipProofGeneration = true, scopes }: ProfileTxOpts,
  ): Promise<TxProfileResult> {
    // We disable concurrent profiles for consistency with simulateTx.
    return this.#putInJobQueue(async jobId => {
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
        await this.blockStateSynchronizer.sync();
        const syncTime = syncTimer.ms();

        const contractFunctionSimulator = this.#getSimulatorForTx();
        const privateExecutionResult = await this.#executePrivate(contractFunctionSimulator, txRequest, scopes, jobId);

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
   * @param txRequest - An authenticated tx request ready for simulation.
   * @returns A simulated transaction result object that includes public and private return values.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   * Also throws if simulatePublic is true and public simulation reverts.
   *
   * TODO(#7456) Prevent msgSender being defined here for the first call
   */
  public simulateTx(
    txRequest: TxExecutionRequest,
    { simulatePublic, skipTxValidation = false, skipFeeEnforcement = false, overrides, scopes }: SimulateTxOpts,
  ): Promise<TxSimulationResult> {
    // We disable concurrent simulations since those might execute oracles which read and write to the PXE stores (e.g.
    // to the capsules), and we need to prevent concurrent runs from interfering with one another (e.g. attempting to
    // delete the same read value, or reading values that another simulation is currently modifying).
    return this.#putInJobQueue(async jobId => {
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
        await this.blockStateSynchronizer.sync();
        const syncTime = syncTimer.ms();

        const contractFunctionSimulator = this.#getSimulatorForTx(overrides);
        // Temporary: in case there are overrides, we have to skip the kernels or validations
        // will fail. Consider handing control to the user/wallet on whether they want to run them
        // or not.
        const overriddenContracts = overrides?.contracts ? new Set(Object.keys(overrides.contracts)) : undefined;
        const hasOverriddenContracts = overriddenContracts !== undefined && overriddenContracts.size > 0;
        const skipKernels = hasOverriddenContracts;

        // Set overridden contracts on the sync service so it knows to skip syncing them
        if (hasOverriddenContracts) {
          this.contractSyncService.setOverriddenContracts(jobId, overriddenContracts);
        }

        // Execution of private functions only; no proving, and no kernel logic.
        const privateExecutionResult = await this.#executePrivate(contractFunctionSimulator, txRequest, scopes, jobId);

        let publicInputs: PrivateKernelTailCircuitPublicInputs | undefined;
        let executionSteps: PrivateExecutionStep[] = [];

        if (skipKernels) {
          ({ publicInputs, executionSteps } = await generateSimulatedProvingResult(
            privateExecutionResult,
            (addr, sel) => this.contractStore.getDebugFunctionName(addr, sel),
            this.node,
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
          `scopes=${scopes === 'ALL_SCOPES' ? scopes : scopes.map(s => s.toString()).join(', ')}`,
        );
      }
    });
  }

  /**
   * Simulates the execution of a contract utility function.
   * @param call - The function call containing the function details, arguments, and target contract address.
   */
  public simulateUtility(
    call: FunctionCall,
    { authwits, scopes }: SimulateUtilityOpts = { scopes: 'ALL_SCOPES' },
  ): Promise<UtilitySimulationResult> {
    // We disable concurrent simulations since those might execute oracles which read and write to the PXE stores (e.g.
    // to the capsules), and we need to prevent concurrent runs from interfering with one another (e.g. attempting to
    // delete the same read value, or reading values that another simulation is currently modifying).
    return this.#putInJobQueue(async jobId => {
      try {
        const totalTimer = new Timer();
        const syncTimer = new Timer();
        await this.blockStateSynchronizer.sync();
        const syncTime = syncTimer.ms();
        const functionTimer = new Timer();
        const contractFunctionSimulator = this.#getSimulatorForTx();

        const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();
        await this.contractSyncService.ensureContractSynced(
          call.to,
          call.selector,
          (privateSyncCall, execScopes) =>
            this.#simulateUtility(contractFunctionSimulator, privateSyncCall, [], execScopes, jobId),
          anchorBlockHeader,
          jobId,
          scopes,
        );

        const executionResult = await this.#simulateUtility(
          contractFunctionSimulator,
          call,
          authwits ?? [],
          scopes,
          jobId,
        );
        const functionTime = functionTimer.ms();

        const totalTime = totalTimer.ms();

        const perFunction = [{ functionName: call.name, time: functionTime }];

        const timings: SimulationTimings = {
          total: totalTime,
          sync: syncTime,
          perFunction,
          unaccounted: totalTime - (syncTime + perFunction.reduce((acc, { time }) => acc + time, 0)),
        };

        const simulationStats = contractFunctionSimulator.getStats();
        return { result: executionResult, stats: { timings, nodeRPCCalls: simulationStats.nodeRPCCalls } };
      } catch (err: any) {
        const { to, name, args } = call;
        const stringifiedArgs = args.map(arg => arg.toString()).join(', ');
        throw this.#contextualizeError(
          err,
          `simulateUtility ${to}:${name}(${stringifiedArgs})`,
          `scopes=${scopes === 'ALL_SCOPES' ? scopes : scopes.map(s => s.toString()).join(', ')}`,
        );
      }
    });
  }

  /**
   * Returns the private events given search parameters.
   * @param eventSelector - Event selector to search for.
   * @param filter
   *  contractAddress - The address of the contract to get events from. Required.
   *  scopes - One or more event scope addresses to filter by. Required.
   *  fromBlock - The block number to search from (inclusive). Optional. If provided, it must be >= 0.
   *    Defaults to 0.
   *    If toBlock is defined but fromBlock is not, fromBlock defaults to toBlock - 1.
   *  toBlock - The block number to search up to (exclusive). Optional. If provided, it must be > 0.
   *    Defaults to the latest known block to PXE + 1.
   * @returns - The packed events with block and tx metadata.
   */
  public async getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventFilter,
  ): Promise<PackedPrivateEvent[]> {
    let anchorBlockNumber: BlockNumber;

    await this.#putInJobQueue(async jobId => {
      await this.blockStateSynchronizer.sync();

      const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();
      anchorBlockNumber = anchorBlockHeader.getBlockNumber();

      const contractFunctionSimulator = this.#getSimulatorForTx();

      await this.contractSyncService.ensureContractSynced(
        filter.contractAddress,
        null,
        async (privateSyncCall, execScopes) =>
          await this.#simulateUtility(contractFunctionSimulator, privateSyncCall, [], execScopes, jobId),
        anchorBlockHeader,
        jobId,
        filter.scopes,
      );
    });

    // anchorBlockNumber is set during the job and fixed to whatever it is after a block sync
    const sanitizedFilter = new PrivateEventFilterValidator(anchorBlockNumber!).validate(filter);

    this.log.debug(
      `Getting private events for ${sanitizedFilter.contractAddress.toString()} from ${sanitizedFilter.fromBlock} to ${sanitizedFilter.toBlock}`,
    );

    return this.privateEventStore.getPrivateEvents(eventSelector, sanitizedFilter);
  }

  /**
   * Stops the PXE's job queue.
   */
  public stop(): Promise<void> {
    return this.jobQueue.end();
  }
}
