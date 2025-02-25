import {
  EventMetadata,
  type FunctionCall,
  type GetContractClassLogsResponse,
  type GetPublicLogsResponse,
  type InBlock,
  L1EventPayload,
  type L2Block,
  type LogFilter,
  type NotesFilter,
  PrivateSimulationResult,
  type PublicSimulationOutput,
  SimulationError,
  type Tx,
  type TxEffect,
  type TxExecutionRequest,
  type TxHash,
  TxProvingResult,
  type TxReceipt,
  TxSimulationResult,
  UniqueNote,
  getNonNullifiedL1ToL2MessageWitness,
} from '@aztec/circuit-types';
import { type AuthWitness } from '@aztec/circuit-types/auth-witness';
import {
  type AztecNode,
  type EventMetadataDefinition,
  type PXE,
  type PXEInfo,
  type PrivateExecutionResult,
  type PrivateKernelProver,
  type PrivateKernelSimulateOutput,
} from '@aztec/circuit-types/interfaces/client';
import {
  type AbiDecoded,
  type ContractArtifact,
  EventSelector,
  FunctionSelector,
  FunctionType,
  decodeFunctionSignature,
  encodeArguments,
} from '@aztec/circuits.js/abi';
import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import type {
  CompleteAddress,
  ContractClassWithId,
  ContractInstanceWithAddress,
  NodeInfo,
  PartialAddress,
} from '@aztec/circuits.js/contract';
import { computeContractAddressFromInstance, getContractClassFromArtifact } from '@aztec/circuits.js/contract';
import type { GasFees } from '@aztec/circuits.js/gas';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/circuits.js/kernel';
import { computeAddressSecret } from '@aztec/circuits.js/keys';
import { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Fr, type Point } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type SiblingPath } from '@aztec/foundation/trees';
import { type KeyStore } from '@aztec/key-store';
import { type L2TipsStore } from '@aztec/kv-store/stores';
import { ProtocolContractAddress, protocolContractNames } from '@aztec/protocol-contracts';
import { getCanonicalProtocolContract } from '@aztec/protocol-contracts/bundle';
import { type AcirSimulator, type SimulationProvider, readCurrentClassId } from '@aztec/simulator/client';

import { inspect } from 'util';

import { type PXEServiceConfig } from '../config/index.js';
import { getPackageInfo } from '../config/package_info.js';
import { ContractDataOracle } from '../contract_data_oracle/index.js';
import { type PxeDatabase } from '../database/index.js';
import { KernelOracle } from '../kernel_oracle/index.js';
import { KernelProver, type ProvingConfig } from '../kernel_prover/kernel_prover.js';
import { getAcirSimulator } from '../simulator/index.js';
import { Synchronizer } from '../synchronizer/index.js';
import { enrichPublicSimulationError, enrichSimulationError } from './error_enriching.js';

/**
 * A Private eXecution Environment (PXE) implementation.
 */
export class PXEService implements PXE {
  private synchronizer: Synchronizer;
  private contractDataOracle: ContractDataOracle;
  private simulator: AcirSimulator;
  private log: Logger;
  private packageVersion: string;
  private proverEnabled: boolean;

  constructor(
    private keyStore: KeyStore,
    private node: AztecNode,
    private db: PxeDatabase,
    tipsStore: L2TipsStore,
    private proofCreator: PrivateKernelProver,
    private simulationProvider: SimulationProvider,
    config: PXEServiceConfig,
    loggerOrSuffix?: string | Logger,
  ) {
    this.log =
      !loggerOrSuffix || typeof loggerOrSuffix === 'string'
        ? createLogger(loggerOrSuffix ? `pxe:service:${loggerOrSuffix}` : `pxe:service`)
        : loggerOrSuffix;
    this.synchronizer = new Synchronizer(node, db, tipsStore, config, loggerOrSuffix);
    this.contractDataOracle = new ContractDataOracle(db);
    this.simulator = getAcirSimulator(db, node, keyStore, this.simulationProvider, this.contractDataOracle);
    this.packageVersion = getPackageInfo().version;
    this.proverEnabled = !!config.proverEnabled;
  }

  /**
   * Starts the PXE Service by beginning the synchronization process between the Aztec node and the database.
   *
   * @returns A promise that resolves when the server has started successfully.
   */
  public async init() {
    await this.#registerProtocolContracts();
    const info = await this.getNodeInfo();
    this.log.info(`Started PXE connected to chain ${info.l1ChainId} version ${info.protocolVersion}`);
  }

  isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean> {
    return this.node.isL1ToL2MessageSynced(l1ToL2Message);
  }

  /** Returns an estimate of the db size in bytes. */
  public estimateDbSize() {
    return this.db.estimateSize();
  }

  public addAuthWitness(witness: AuthWitness) {
    return this.db.addAuthWitness(witness.requestHash, witness.witness);
  }

  public getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    return this.db.getAuthWitness(messageHash);
  }

  public storeCapsule(contract: AztecAddress, storageSlot: Fr, capsule: Fr[]) {
    return this.db.storeCapsule(contract, storageSlot, capsule);
  }

  public getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.db.getContractInstance(address);
  }

  public async getContractClassMetadata(
    id: Fr,
    includeArtifact: boolean = false,
  ): Promise<{
    contractClass: ContractClassWithId | undefined;
    isContractClassPubliclyRegistered: boolean;
    artifact: ContractArtifact | undefined;
  }> {
    const artifact = await this.db.getContractArtifact(id);

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
    return {
      contractInstance: await this.db.getContractInstance(address),
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

    await this.db.addCompleteAddress(accountCompleteAddress);
    return accountCompleteAddress;
  }

  public async registerSender(address: AztecAddress): Promise<AztecAddress> {
    const accounts = await this.keyStore.getAccounts();
    if (accounts.includes(address)) {
      this.log.info(`Sender:\n "${address.toString()}"\n already registered.`);
      return address;
    }

    const wasAdded = await this.db.addSenderAddress(address);

    if (wasAdded) {
      this.log.info(`Added sender:\n ${address.toString()}`);
    } else {
      this.log.info(`Sender:\n "${address.toString()}"\n already registered.`);
    }

    return address;
  }

  public getSenders(): Promise<AztecAddress[]> {
    const senders = this.db.getSenderAddresses();

    return Promise.resolve(senders);
  }

  public async removeSender(address: AztecAddress): Promise<void> {
    const wasRemoved = await this.db.removeSenderAddress(address);

    if (wasRemoved) {
      this.log.info(`Removed sender:\n ${address.toString()}`);
    } else {
      this.log.info(`Sender:\n "${address.toString()}"\n not in address book.`);
    }

    return Promise.resolve();
  }

  public async getRegisteredAccounts(): Promise<CompleteAddress[]> {
    // Get complete addresses of both the recipients and the accounts
    const completeAddresses = await this.db.getCompleteAddresses();
    // Filter out the addresses not corresponding to accounts
    const accounts = await this.keyStore.getAccounts();
    return completeAddresses.filter(completeAddress =>
      accounts.find(address => address.equals(completeAddress.address)),
    );
  }

  public async registerContractClass(artifact: ContractArtifact): Promise<void> {
    const { id: contractClassId } = await getContractClassFromArtifact(artifact);
    await this.db.addContractArtifact(contractClassId, artifact);
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

      await this.db.addContractArtifact(contractClass.id, artifact);

      const publicFunctionSignatures = artifact.functions
        .filter(fn => fn.functionType === FunctionType.PUBLIC)
        .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
      await this.node.registerContractFunctionSignatures(instance.address, publicFunctionSignatures);

      // TODO(#10007): Node should get public contract class from the registration event, not from PXE registration
      await this.node.addContractClass({ ...contractClass, privateFunctions: [], unconstrainedFunctions: [] });
    } else {
      // Otherwise, make sure there is an artifact already registered for that class id
      artifact = await this.db.getContractArtifact(instance.currentContractClassId);
      if (!artifact) {
        throw new Error(
          `Missing contract artifact for class id ${instance.currentContractClassId} for contract ${instance.address}`,
        );
      }
    }

    await this.db.addContractInstance(instance);
    this.log.info(
      `Added contract ${artifact.name} at ${instance.address.toString()} with class ${instance.currentContractClassId}`,
    );
  }

  public async updateContract(contractAddress: AztecAddress, artifact: ContractArtifact): Promise<void> {
    const currentInstance = await this.db.getContractInstance(contractAddress);
    if (!currentInstance) {
      throw new Error(`Contract ${contractAddress.toString()} is not registered.`);
    }
    const contractClass = await getContractClassFromArtifact(artifact);
    await this.synchronizer.sync();

    const header = await this.db.getBlockHeader();

    const currentClassId = await readCurrentClassId(
      contractAddress,
      currentInstance,
      this.node,
      header.globalVariables.blockNumber.toNumber(),
    );
    if (!contractClass.id.equals(currentClassId)) {
      throw new Error('Could not update contract to a class different from the current one.');
    }

    await this.db.addContractArtifact(contractClass.id, artifact);

    const publicFunctionSignatures = artifact.functions
      .filter(fn => fn.functionType === FunctionType.PUBLIC)
      .map(fn => decodeFunctionSignature(fn.name, fn.parameters));
    await this.node.registerContractFunctionSignatures(contractAddress, publicFunctionSignatures);

    // TODO(#10007): Node should get public contract class from the registration event, not from PXE registration
    await this.node.addContractClass({ ...contractClass, privateFunctions: [], unconstrainedFunctions: [] });
    currentInstance.currentContractClassId = contractClass.id;
    await this.db.addContractInstance(currentInstance);
    this.log.info(`Updated contract ${artifact.name} at ${contractAddress.toString()} to class ${contractClass.id}`);
  }

  public getContracts(): Promise<AztecAddress[]> {
    return this.db.getContractsAddresses();
  }

  public async getPublicStorageAt(contract: AztecAddress, slot: Fr) {
    if (!(await this.getContractInstance(contract))) {
      throw new Error(`Contract ${contract.toString()} is not deployed`);
    }
    return await this.node.getPublicStorageAt(contract, slot, 'latest');
  }

  public async getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    const noteDaos = await this.db.getNotes(filter);

    const extendedNotes = noteDaos.map(async dao => {
      let owner = filter.owner;
      if (owner === undefined) {
        const completeAddresses = await this.db.getCompleteAddresses();
        const completeAddressIndex = (
          await Promise.all(completeAddresses.map(completeAddresses => completeAddresses.address.toAddressPoint()))
        ).findIndex(addressPoint => addressPoint.equals(dao.addressPoint));
        const completeAddress = completeAddresses[completeAddressIndex];
        if (completeAddress === undefined) {
          throw new Error(`Cannot find complete address for addressPoint ${dao.addressPoint.toString()}`);
        }
        owner = completeAddress.address;
      }
      return new UniqueNote(
        dao.note,
        owner,
        dao.contractAddress,
        dao.storageSlot,
        dao.noteTypeId,
        dao.txHash,
        dao.nonce,
      );
    });
    return Promise.all(extendedNotes);
  }

  public async getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
    return await getNonNullifiedL1ToL2MessageWitness(this.node, contractAddress, messageHash, secret);
  }

  public getL2ToL1MembershipWitness(blockNumber: number, l2Tol1Message: Fr): Promise<[bigint, SiblingPath<number>]> {
    return this.node.getL2ToL1MessageMembershipWitness(blockNumber, l2Tol1Message);
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

  public async proveTx(
    txRequest: TxExecutionRequest,
    privateExecutionResult: PrivateExecutionResult,
  ): Promise<TxProvingResult> {
    try {
      const { publicInputs, clientIvcProof } = await this.#prove(txRequest, this.proofCreator, privateExecutionResult, {
        simulate: false,
        skipFeeEnforcement: false,
        profile: false,
        dryRun: false,
      });
      return new TxProvingResult(privateExecutionResult, publicInputs, clientIvcProof!);
    } catch (err: any) {
      throw this.contextualizeError(err, inspect(txRequest), inspect(privateExecutionResult));
    }
  }

  // TODO(#7456) Prevent msgSender being defined here for the first call
  public async simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender: AztecAddress | undefined = undefined,
    skipTxValidation: boolean = false,
    skipFeeEnforcement: boolean = false,
    profile: boolean = false,
    scopes?: AztecAddress[],
  ): Promise<TxSimulationResult> {
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

      const { publicInputs, profileResult } = await this.#prove(txRequest, this.proofCreator, privateExecutionResult, {
        simulate: !profile,
        skipFeeEnforcement,
        profile,
        dryRun: true,
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
        ...(profileResult ? { gateCounts: profileResult.gateCounts } : {}),
        ...(publicOutput
          ? {
              gasUsed: publicOutput.gasUsed,
              revertCode: publicOutput.txEffect.revertCode.getCode(),
              revertReason: publicOutput.revertReason,
            }
          : {}),
      });

      return TxSimulationResult.fromPrivateSimulationResultAndPublicOutput(
        privateSimulationResult,
        publicOutput,
        profileResult,
      );
    } catch (err: any) {
      throw this.contextualizeError(
        err,
        inspect(txRequest),
        `simulatePublic=${simulatePublic}`,
        `msgSender=${msgSender?.toString() ?? 'undefined'}`,
        `skipTxValidation=${skipTxValidation}`,
        `profile=${profile}`,
        `scopes=${scopes?.map(s => s.toString()).join(', ') ?? 'undefined'}`,
      );
    }
  }

  public async sendTx(tx: Tx): Promise<TxHash> {
    const txHash = await tx.getTxHash();
    if (await this.node.getTxEffect(txHash)) {
      throw new Error(`A settled tx with equal hash ${txHash.toString()} exists.`);
    }
    this.log.debug(`Sending transaction ${txHash}`);
    await this.node.sendTx(tx).catch(err => {
      throw this.contextualizeError(err, inspect(tx));
    });
    this.log.info(`Sent transaction ${txHash}`);
    return txHash;
  }

  public async simulateUnconstrained(
    functionName: string,
    args: any[],
    to: AztecAddress,
    _from?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<AbiDecoded> {
    try {
      await this.synchronizer.sync();
      // TODO - Should check if `from` has the permission to call the view function.
      const functionCall = await this.#getFunctionCall(functionName, args, to);
      const executionResult = await this.#simulateUnconstrained(functionCall, scopes);

      // TODO - Return typed result based on the function artifact.
      return executionResult;
    } catch (err: any) {
      const stringifiedArgs = args.map(arg => arg.toString()).join(', ');
      throw this.contextualizeError(
        err,
        `simulateUnconstrained ${to}:${functionName}(${stringifiedArgs})`,
        `scopes=${scopes?.map(s => s.toString()).join(', ') ?? 'undefined'}`,
      );
    }
  }

  public getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.node.getTxReceipt(txHash);
  }

  public getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    return this.node.getTxEffect(txHash);
  }

  public async getBlockNumber(): Promise<number> {
    return await this.node.getBlockNumber();
  }

  public async getProvenBlockNumber(): Promise<number> {
    return await this.node.getProvenBlockNumber();
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  public getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.node.getPublicLogs(filter);
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  public getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.node.getContractClassLogs(filter);
  }

  async #getFunctionCall(functionName: string, args: any[], to: AztecAddress): Promise<FunctionCall> {
    const contract = await this.db.getContract(to);
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

  public async getNodeInfo(): Promise<NodeInfo> {
    const [nodeVersion, protocolVersion, chainId, enr, contractAddresses, protocolContractAddresses] =
      await Promise.all([
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
      protocolVersion,
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

  async #registerProtocolContracts() {
    const registered: Record<string, string> = {};
    for (const name of protocolContractNames) {
      const { address, contractClass, instance, artifact } = await getCanonicalProtocolContract(name);
      await this.db.addContractArtifact(contractClass.id, artifact);
      await this.db.addContractInstance(instance);
      registered[name] = address.toString();
    }
    this.log.verbose(`Registered protocol contracts in pxe`, registered);
  }

  /**
   * Retrieves the simulation parameters required to run an ACIR simulation.
   * This includes the contract address, function artifact, and historical tree roots.
   *
   * @param execRequest - The transaction request object containing details of the contract call.
   * @returns An object containing the contract address, function artifact, and historical tree roots.
   */
  #getSimulationParameters(execRequest: FunctionCall | TxExecutionRequest) {
    const contractAddress = (execRequest as FunctionCall).to ?? (execRequest as TxExecutionRequest).origin;
    const functionSelector =
      (execRequest as FunctionCall).selector ?? (execRequest as TxExecutionRequest).functionSelector;

    return {
      contractAddress,
      functionSelector,
    };
  }

  async #executePrivate(
    txRequest: TxExecutionRequest,
    msgSender?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<PrivateExecutionResult> {
    // TODO - Pause syncing while simulating.
    const { contractAddress, functionSelector } = this.#getSimulationParameters(txRequest);

    try {
      const result = await this.simulator.run(txRequest, contractAddress, functionSelector, msgSender, scopes);
      this.log.debug(`Private simulation completed for ${contractAddress.toString()}:${functionSelector}`);
      return result;
    } catch (err) {
      if (err instanceof SimulationError) {
        await enrichSimulationError(err, this.db, this.log);
      }
      throw err;
    }
  }

  /**
   * Simulate an unconstrained transaction on the given contract, without considering constraints set by ACIR.
   * The simulation parameters are fetched using ContractDataOracle and executed using AcirSimulator.
   * Returns the simulation result containing the outputs of the unconstrained function.
   *
   * @param execRequest - The transaction request object containing the target contract and function data.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns The simulation result containing the outputs of the unconstrained function.
   */
  async #simulateUnconstrained(execRequest: FunctionCall, scopes?: AztecAddress[]) {
    const { contractAddress, functionSelector } = this.#getSimulationParameters(execRequest);

    this.log.debug('Executing unconstrained simulator...');
    try {
      const result = await this.simulator.runUnconstrained(execRequest, contractAddress, functionSelector, scopes);
      this.log.verbose(`Unconstrained simulation for ${contractAddress}.${functionSelector} completed`);

      return result;
    } catch (err) {
      if (err instanceof SimulationError) {
        await enrichSimulationError(err, this.db, this.log);
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
          await enrichPublicSimulationError(err, this.contractDataOracle, this.db, this.log);
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
   * @returns An object that contains the output of the kernel execution, including the ClientIvcProof if proving is enabled.
   */
  async #prove(
    txExecutionRequest: TxExecutionRequest,
    proofCreator: PrivateKernelProver,
    privateExecutionResult: PrivateExecutionResult,
    { simulate, skipFeeEnforcement, profile, dryRun }: ProvingConfig,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    // use the block the tx was simulated against
    const block =
      privateExecutionResult.entrypoint.publicInputs.historicalHeader.globalVariables.blockNumber.toNumber();
    const kernelOracle = new KernelOracle(this.contractDataOracle, this.keyStore, this.node, block);
    const kernelProver = new KernelProver(kernelOracle, proofCreator, !this.proverEnabled);
    this.log.debug(`Executing kernel prover (simulate: ${simulate}, profile: ${profile}, dryRun: ${dryRun})...`);
    return await kernelProver.prove(txExecutionRequest.toTxRequest(), privateExecutionResult, {
      simulate,
      skipFeeEnforcement,
      profile,
      dryRun,
    });
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

  public async getPrivateEvents<T>(
    eventMetadataDef: EventMetadataDefinition,
    from: number,
    limit: number,
    // TODO (#9272): Make this better, we should be able to only pass an address now
    vpks: Point[],
  ): Promise<T[]> {
    const eventMetadata = new EventMetadata<T>(eventMetadataDef);
    if (vpks.length === 0) {
      throw new Error('Tried to get encrypted events without supplying any viewing public keys');
    }

    const blocks = await this.node.getBlocks(from, limit);

    const txEffects = blocks.flatMap(block => block.body.txEffects);
    const privateLogs = txEffects.flatMap(txEffect => txEffect.privateLogs);

    const vsks = await Promise.all(
      vpks.map(async vpk => {
        const [keyPrefix, account] = await this.keyStore.getKeyPrefixAndAccount(vpk);
        let secretKey = await this.keyStore.getMasterSecretKey(vpk);
        if (keyPrefix === 'iv') {
          const registeredAccount = (await this.getRegisteredAccounts()).find(completeAddress =>
            completeAddress.address.equals(account),
          );
          if (!registeredAccount) {
            throw new Error('No registered account');
          }

          const preaddress = await registeredAccount.getPreaddress();

          secretKey = await computeAddressSecret(preaddress, secretKey);
        }

        return secretKey;
      }),
    );

    const visibleEvents = (
      await Promise.all(
        privateLogs.map(async log => {
          for (const sk of vsks) {
            // TODO: Verify that the first field of the log is the tag siloed with contract address.
            // Or use tags to query logs, like we do with notes.
            const decryptedEvent = await L1EventPayload.decryptAsIncoming(log, sk);
            if (decryptedEvent !== undefined) {
              return [decryptedEvent];
            }
          }

          return [];
        }),
      )
    ).flat();

    const decodedEvents = visibleEvents
      .map(visibleEvent => {
        if (visibleEvent === undefined) {
          return undefined;
        }
        if (!visibleEvent.eventTypeId.equals(eventMetadata.eventSelector)) {
          return undefined;
        }

        return eventMetadata.decode(visibleEvent);
      })
      .filter(visibleEvent => visibleEvent !== undefined) as T[];

    return decodedEvents;
  }

  async getPublicEvents<T>(eventMetadataDef: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    const eventMetadata = new EventMetadata<T>(eventMetadataDef);
    const { logs } = await this.node.getPublicLogs({
      fromBlock: from,
      toBlock: from + limit,
    });

    const decodedEvents = logs
      .map(log => {
        // +1 for the event selector
        const expectedLength = eventMetadata.fieldNames.length + 1;
        const logFields = log.log.log.slice(0, expectedLength);
        // We are assuming here that event logs are the last 4 bytes of the event. This is not enshrined but is a function of aztec.nr raw log emission.
        if (!EventSelector.fromField(logFields[logFields.length - 1]).equals(eventMetadata.eventSelector)) {
          return undefined;
        }
        // If any of the remaining fields, are non-zero, the payload does match expected:
        if (log.log.log.slice(expectedLength + 1).find(f => !f.isZero())) {
          throw new Error(
            'Something is weird here, we have matching EventSelectors, but the actual payload has mismatched length',
          );
        }

        return eventMetadata.decode(log.log);
      })
      .filter(log => log !== undefined) as T[];

    return decodedEvents;
  }

  async resetNoteSyncData() {
    return await this.db.resetNoteSyncData();
  }

  private contextualizeError(err: Error, ...context: string[]): Error {
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
}
