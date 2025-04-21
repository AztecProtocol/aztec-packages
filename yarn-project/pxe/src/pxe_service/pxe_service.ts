import { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import type { SiblingPath } from '@aztec/foundation/trees';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import {
  ProtocolContractAddress,
  type ProtocolContractsProvider,
  protocolContractNames,
} from '@aztec/protocol-contracts';
import { AcirSimulator, type SimulationProvider, readCurrentClassId } from '@aztec/simulator/client';
import {
  type AbiDecoded,
  type ContractArtifact,
  EventSelector,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  decodeFromAbi,
  decodeFunctionSignature,
  encodeArguments,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock, L2Block } from '@aztec/stdlib/block';
import {
  CompleteAddress,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  type NodeInfo,
  type PartialAddress,
  computeContractAddressFromInstance,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import type { GasFees } from '@aztec/stdlib/gas';
import { siloNullifier } from '@aztec/stdlib/hash';
import type {
  AztecNode,
  EventMetadataDefinition,
  GetContractClassLogsResponse,
  GetPublicLogsResponse,
  PXE,
  PXEInfo,
  PrivateKernelProver,
} from '@aztec/stdlib/interfaces/client';
import type { PrivateKernelExecutionProofOutput, PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import type { LogFilter } from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import { type NotesFilter, UniqueNote } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  PrivateExecutionResult,
  PrivateSimulationResult,
  PublicSimulationOutput,
  Tx,
  type TxEffect,
  TxExecutionRequest,
  type TxHash,
  TxProfileResult,
  TxProvingResult,
  type TxReceipt,
  TxSimulationResult,
} from '@aztec/stdlib/tx';

import { inspect } from 'util';

import type { PXEServiceConfig } from '../config/index.js';
import { getPackageInfo } from '../config/package_info.js';
import {
  PrivateKernelExecutionProver,
  type PrivateKernelExecutionProverConfig,
} from '../private_kernel/private_kernel_execution_prover.js';
import { PrivateKernelOracleImpl } from '../private_kernel/private_kernel_oracle_impl.js';
import { PXEOracleInterface } from '../pxe_oracle_interface/pxe_oracle_interface.js';
import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { PrivateEventDataProvider } from '../storage/private_event_data_provider/private_event_data_provider.js';
import { SyncDataProvider } from '../storage/sync_data_provider/sync_data_provider.js';
import { TaggingDataProvider } from '../storage/tagging_data_provider/tagging_data_provider.js';
import { Synchronizer } from '../synchronizer/index.js';
import { enrichPublicSimulationError, enrichSimulationError } from './error_enriching.js';

/**
 * A Private eXecution Environment (PXE) implementation.
 */
export class PXEService implements PXE {
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
    private simulator: AcirSimulator,
    private packageVersion: string,
    private proverEnabled: boolean,
    private proofCreator: PrivateKernelProver,
    private protocolContractsProvider: ProtocolContractsProvider,
    private log: Logger,
    private jobQueue: SerialQueue,
  ) {}

  /**
   * Creates an instance of a PXE Service by instantiating all the necessary data providers and services.
   * Also triggers the registration of the protocol contracts and makes sure the provided node
   * can be contacted.
   *
   * @returns A promise that resolves PXE service is ready to be used.
   */
  public static async create(
    node: AztecNode,
    store: AztecAsyncKVStore,
    proofCreator: PrivateKernelProver,
    simulationProvider: SimulationProvider,
    protocolContractsProvider: ProtocolContractsProvider,
    config: PXEServiceConfig,
    loggerOrSuffix?: string | Logger,
  ) {
    const log =
      !loggerOrSuffix || typeof loggerOrSuffix === 'string'
        ? createLogger(loggerOrSuffix ? `pxe:service:${loggerOrSuffix}` : `pxe:service`)
        : loggerOrSuffix;

    const packageVersion = getPackageInfo().version;
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
    const pxeOracleInterface = new PXEOracleInterface(
      node,
      keyStore,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      syncDataProvider,
      taggingDataProvider,
      addressDataProvider,
      privateEventDataProvider,
      log,
    );
    const simulator = new AcirSimulator(pxeOracleInterface, simulationProvider);
    const jobQueue = new SerialQueue();

    const pxeService = new PXEService(
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
      packageVersion,
      proverEnabled,
      proofCreator,
      protocolContractsProvider,
      log,
      jobQueue,
    );

    pxeService.jobQueue.start();

    await pxeService.#registerProtocolContracts();
    const info = await pxeService.getNodeInfo();
    log.info(`Started PXE connected to chain ${info.l1ChainId} version ${info.rollupVersion}`);
    return pxeService;
  }

  // Aztec node proxy methods

  public isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean> {
    return this.node.isL1ToL2MessageSynced(l1ToL2Message);
  }

  public getL2ToL1MembershipWitness(blockNumber: number, l2Tol1Message: Fr): Promise<[bigint, SiblingPath<number>]> {
    return this.node.getL2ToL1MessageMembershipWitness(blockNumber, l2Tol1Message);
  }

  public getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.node.getTxReceipt(txHash);
  }

  public getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    return this.node.getTxEffect(txHash);
  }

  public getBlockNumber(): Promise<number> {
    return this.node.getBlockNumber();
  }

  public getProvenBlockNumber(): Promise<number> {
    return this.node.getProvenBlockNumber();
  }

  public getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.node.getPublicLogs(filter);
  }

  public getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.node.getContractClassLogs(filter);
  }

  public getPublicStorageAt(contract: AztecAddress, slot: Fr) {
    return this.node.getPublicStorageAt('latest', contract, slot);
  }

  public async getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
    return await getNonNullifiedL1ToL2MessageWitness(this.node, contractAddress, messageHash, secret);
  }

  // Internal methods

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

  async #isContractPubliclyDeployed(address: AztecAddress): Promise<boolean> {
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
        `Unknown contract ${to}: add it to PXE Service by calling server.addContracts(...).\nSee docs for context: https://docs.aztec.network/developers/reference/debugging/aztecnr-errors#unknown-contract-0x0-add-it-to-pxe-by-calling-serveraddcontracts`,
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

  async #executePrivate(
    txRequest: TxExecutionRequest,
    msgSender?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<PrivateExecutionResult> {
    const { origin: contractAddress, functionSelector } = txRequest;

    try {
      const result = await this.simulator.run(txRequest, contractAddress, functionSelector, msgSender, scopes);
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
   * @param call - The function call to execute.
   * @param authWitnesses - Authentication witnesses required for the function call.
   * @param scopes - Optional array of account addresses whose notes can be accessed in this call. Defaults to all
   * accounts if not specified.
   * @returns The simulation result containing the outputs of the utility function.
   */
  async #simulateUtility(call: FunctionCall, authWitnesses?: AuthWitness[], scopes?: AztecAddress[]) {
    try {
      return this.simulator.runUtility(call, authWitnesses ?? [], scopes);
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
    const block = privateExecutionResult.getSimulationBlockNumber();
    const kernelOracle = new PrivateKernelOracleImpl(this.contractDataProvider, this.keyStore, this.node, block);
    const kernelTraceProver = new PrivateKernelExecutionProver(kernelOracle, proofCreator, !this.proverEnabled);
    this.log.debug(`Executing kernel trace prover (${JSON.stringify(config)})...`);
    return await kernelTraceProver.proveWithKernels(txExecutionRequest.toTxRequest(), privateExecutionResult, config);
  }

  // Public API

  /** Returns an estimate of the db size in bytes. */
  public async estimateDbSize() {
    const treeRootsSize = Object.keys(MerkleTreeId).length * Fr.SIZE_IN_BYTES;
    const dbSizes = await Promise.all([
      this.addressDataProvider.getSize(),
      this.capsuleDataProvider.getSize(),
      this.contractDataProvider.getSize(),
      this.noteDataProvider.getSize(),
      this.syncDataProvider.getSize(),
      this.taggingDataProvider.getSize(),
    ]);
    return [...dbSizes, treeRootsSize].reduce((sum, size) => sum + size, 0);
  }

  public getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.contractDataProvider.getContractInstance(address);
  }

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

  public async getContractMetadata(address: AztecAddress): Promise<{
    contractInstance: ContractInstanceWithAddress | undefined;
    isContractInitialized: boolean;
    isContractPubliclyDeployed: boolean;
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
      isContractPubliclyDeployed: await this.#isContractPubliclyDeployed(address),
    };
  }

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

  public getSenders(): Promise<AztecAddress[]> {
    return this.taggingDataProvider.getSenderAddresses();
  }

  public async removeSender(address: AztecAddress): Promise<void> {
    const wasRemoved = await this.taggingDataProvider.removeSenderAddress(address);

    if (wasRemoved) {
      this.log.info(`Removed sender:\n ${address.toString()}`);
    } else {
      this.log.info(`Sender:\n "${address.toString()}"\n not in address book.`);
    }
  }

  public async getRegisteredAccounts(): Promise<CompleteAddress[]> {
    // Get complete addresses of both the recipients and the accounts
    const completeAddresses = await this.addressDataProvider.getCompleteAddresses();
    // Filter out the addresses not corresponding to accounts
    const accounts = await this.keyStore.getAccounts();
    return completeAddresses.filter(completeAddress =>
      accounts.find(address => address.equals(completeAddress.address)),
    );
  }

  public async registerContractClass(artifact: ContractArtifact): Promise<void> {
    const { id: contractClassId } = await getContractClassFromArtifact(artifact);
    await this.contractDataProvider.addContractArtifact(contractClassId, artifact);
    this.log.info(`Added contract class ${artifact.name} with id ${contractClassId}`);
  }

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
      await this.node.registerContractFunctionSignatures(instance.address, publicFunctionSignatures);
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
        header.globalVariables.blockNumber.toNumber(),
      );
      if (!contractClass.id.equals(currentClassId)) {
        throw new Error('Could not update contract to a class different from the current one.');
      }

      await this.contractDataProvider.addContractArtifact(contractClass.id, artifact);

      const publicFunctionSignatures = artifact.functions
        .filter(fn => fn.functionType === FunctionType.PUBLIC)
        .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
      await this.node.registerContractFunctionSignatures(contractAddress, publicFunctionSignatures);

      currentInstance.currentContractClassId = contractClass.id;
      await this.contractDataProvider.addContractInstance(currentInstance);
      this.log.info(`Updated contract ${artifact.name} at ${contractAddress.toString()} to class ${contractClass.id}`);
    });
  }

  public getContracts(): Promise<AztecAddress[]> {
    return this.contractDataProvider.getContractsAddresses();
  }

  public async getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
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
      return new UniqueNote(dao.note, recipient, dao.contractAddress, dao.storageSlot, dao.txHash, dao.nonce);
    });
    return Promise.all(extendedNotes);
  }

  public async getBlock(blockNumber: number): Promise<L2Block | undefined> {
    // If a negative block number is provided the current block number is fetched.
    if (blockNumber < 0) {
      blockNumber = await this.node.getBlockNumber();
    }
    return await this.node.getBlock(blockNumber);
  }

  public async getCurrentBaseFees(): Promise<GasFees> {
    return await this.node.getCurrentBaseFees();
  }

  public proveTx(
    txRequest: TxExecutionRequest,
    privateExecutionResult: PrivateExecutionResult,
  ): Promise<TxProvingResult> {
    // We disable proving concurrently mostly out of caution, since it accesses some of our stores. Proving is so
    // computationally demanding that it'd be rare for someone to try to do it concurrently regardless.
    return this.#putInJobQueue(async () => {
      try {
        const { publicInputs, clientIvcProof } = await this.#prove(
          txRequest,
          this.proofCreator,
          privateExecutionResult,
          {
            simulate: false,
            skipFeeEnforcement: false,
            profileMode: 'none',
          },
        );
        return new TxProvingResult(privateExecutionResult, publicInputs, clientIvcProof!);
      } catch (err: any) {
        throw this.#contextualizeError(err, inspect(txRequest), inspect(privateExecutionResult));
      }
    });
  }

  public profileTx(
    txRequest: TxExecutionRequest,
    profileMode: 'full' | 'execution-steps' | 'gates',
    msgSender?: AztecAddress,
  ): Promise<TxProfileResult> {
    // We disable concurrent profiles for consistency with simulateTx.
    return this.#putInJobQueue(async () => {
      try {
        const txInfo = {
          origin: txRequest.origin,
          functionSelector: txRequest.functionSelector,
          simulatePublic: false,
          msgSender,
          chainId: txRequest.txContext.chainId,
          version: txRequest.txContext.version,
          authWitnesses: txRequest.authWitnesses.map(w => w.requestHash),
        };
        this.log.info(
          `Profiling transaction execution request to ${txRequest.functionSelector} at ${txRequest.origin}`,
          txInfo,
        );
        await this.synchronizer.sync();
        const privateExecutionResult = await this.#executePrivate(txRequest, msgSender);

        const { executionSteps } = await this.#prove(txRequest, this.proofCreator, privateExecutionResult, {
          simulate: true,
          skipFeeEnforcement: false,
          profileMode,
        });

        return new TxProfileResult(executionSteps);
      } catch (err: any) {
        throw this.#contextualizeError(
          err,
          inspect(txRequest),
          `profileMode=${profileMode}`,
          `msgSender=${msgSender?.toString() ?? 'undefined'}`,
        );
      }
    });
  }

  // TODO(#7456) Prevent msgSender being defined here for the first call
  public simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender: AztecAddress | undefined = undefined,
    skipTxValidation: boolean = false,
    skipFeeEnforcement: boolean = false,
    scopes?: AztecAddress[],
  ): Promise<TxSimulationResult> {
    // We disable concurrent simulations since those might execute oracles which read and write to the PXE stores (e.g.
    // to the capsules), and we need to prevent concurrent runs from interfering with one another (e.g. attempting to
    // delete the same read value, or reading values that another simulation is currently modifying).
    return this.#putInJobQueue(async () => {
      try {
        const txInfo = {
          origin: txRequest.origin,
          functionSelector: txRequest.functionSelector,
          simulatePublic,
          msgSender,
          chainId: txRequest.txContext.chainId,
          version: txRequest.txContext.version,
          authWitnesses: txRequest.authWitnesses.map(w => w.requestHash),
        };
        this.log.info(
          `Simulating transaction execution request to ${txRequest.functionSelector} at ${txRequest.origin}`,
          txInfo,
        );
        const timer = new Timer();
        await this.synchronizer.sync();
        const privateExecutionResult = await this.#executePrivate(txRequest, msgSender, scopes);

        const { publicInputs } = await this.#prove(txRequest, this.proofCreator, privateExecutionResult, {
          simulate: true,
          skipFeeEnforcement,
          profileMode: 'none',
        });

        const privateSimulationResult = new PrivateSimulationResult(privateExecutionResult, publicInputs);
        const simulatedTx = privateSimulationResult.toSimulatedTx();
        let publicOutput: PublicSimulationOutput | undefined;
        if (simulatePublic && publicInputs.forPublic) {
          publicOutput = await this.#simulatePublicCalls(simulatedTx, skipFeeEnforcement);
        }

        if (!skipTxValidation) {
          const validationResult = await this.node.isValidTx(simulatedTx, { isSimulation: true, skipFeeEnforcement });
          if (validationResult.result === 'invalid') {
            throw new Error('The simulated transaction is unable to be added to state and is invalid.');
          }
        }

        const txHash = await simulatedTx.getTxHash();
        this.log.info(`Simulation completed for ${txHash.toString()} in ${timer.ms()}ms`, {
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

        return TxSimulationResult.fromPrivateSimulationResultAndPublicOutput(privateSimulationResult, publicOutput);
      } catch (err: any) {
        throw this.#contextualizeError(
          err,
          inspect(txRequest),
          `simulatePublic=${simulatePublic}`,
          `msgSender=${msgSender?.toString() ?? 'undefined'}`,
          `skipTxValidation=${skipTxValidation}`,
          `scopes=${scopes?.map(s => s.toString()).join(', ') ?? 'undefined'}`,
        );
      }
    });
  }

  public async sendTx(tx: Tx): Promise<TxHash> {
    const txHash = await tx.getTxHash();
    if (await this.node.getTxEffect(txHash)) {
      throw new Error(`A settled tx with equal hash ${txHash.toString()} exists.`);
    }
    this.log.debug(`Sending transaction ${txHash}`);
    await this.node.sendTx(tx).catch(err => {
      throw this.#contextualizeError(err, inspect(tx));
    });
    this.log.info(`Sent transaction ${txHash}`);
    return txHash;
  }

  public simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    _from?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<AbiDecoded> {
    // We disable concurrent simulations since those might execute oracles which read and write to the PXE stores (e.g.
    // to the capsules), and we need to prevent concurrent runs from interfering with one another (e.g. attempting to
    // delete the same read value, or reading values that another simulation is currently modifying).
    return this.#putInJobQueue(async () => {
      try {
        await this.synchronizer.sync();
        // TODO - Should check if `from` has the permission to call the view function.
        const functionCall = await this.#getFunctionCall(functionName, args, to);
        const executionResult = await this.#simulateUtility(functionCall, authwits ?? [], scopes);

        // TODO - Return typed result based on the function artifact.
        return executionResult;
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

  public async getNodeInfo(): Promise<NodeInfo> {
    const [nodeVersion, rollupVersion, chainId, enr, contractAddresses, protocolContractAddresses] = await Promise.all([
      this.node.getNodeVersion(),
      this.node.getVersion(),
      this.node.getChainId(),
      this.node.getEncodedEnr(),
      this.node.getL1ContractAddresses(),
      this.node.getProtocolContractAddresses(),
    ]);

    const nodeInfo: NodeInfo = {
      nodeVersion,
      l1ChainId: chainId,
      rollupVersion,
      enr,
      l1ContractAddresses: contractAddresses,
      protocolContractAddresses: protocolContractAddresses,
    };

    return nodeInfo;
  }

  public getPXEInfo(): Promise<PXEInfo> {
    return Promise.resolve({
      pxeVersion: this.packageVersion,
      protocolContractAddresses: {
        classRegisterer: ProtocolContractAddress.ContractClassRegisterer,
        feeJuice: ProtocolContractAddress.FeeJuice,
        instanceDeployer: ProtocolContractAddress.ContractInstanceDeployer,
        multiCallEntrypoint: ProtocolContractAddress.MultiCallEntrypoint,
      },
    });
  }

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

    // TODO(#13113): This is a temporary hack to ensure that the notes are synced before getting the events.
    await this.simulateUtility('sync_notes', [], contractAddress);

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

  async getPublicEvents<T>(eventMetadataDef: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    const { logs } = await this.node.getPublicLogs({
      fromBlock: from,
      toBlock: from + limit,
    });

    const decodedEvents = logs
      .map(log => {
        // +1 for the event selector
        const expectedLength = eventMetadataDef.fieldNames.length + 1;
        const logFields = log.log.log.slice(0, expectedLength);
        // We are assuming here that event logs are the last 4 bytes of the event. This is not enshrined but is a function of aztec.nr raw log emission.
        if (!EventSelector.fromField(logFields[logFields.length - 1]).equals(eventMetadataDef.eventSelector)) {
          return undefined;
        }
        // If any of the remaining fields, are non-zero, the payload does match expected:
        if (log.log.log.slice(expectedLength + 1).find(f => !f.isZero())) {
          throw new Error(
            'Something is weird here, we have matching EventSelectors, but the actual payload has mismatched length',
          );
        }

        return decodeFromAbi([eventMetadataDef.abiType], log.log.log) as T;
      })
      .filter(log => log !== undefined) as T[];

    return decodedEvents;
  }

  async resetNoteSyncData() {
    return await this.taggingDataProvider.resetNoteSyncData();
  }
}
