import {
  collectEncryptedLogs,
  collectEnqueuedPublicFunctionCalls,
  collectUnencryptedLogs,
} from '@aztec/acir-simulator';
import {
  AztecAddress,
  FunctionData,
  PartialContractAddress,
  PrivateHistoricTreeRoots,
  PrivateKey,
  PublicKey,
} from '@aztec/circuits.js';
import { encodeArguments } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import {
  AztecNode,
  AztecRPC,
  ContractDao,
  ContractData,
  ContractPublicData,
  DeployedContract,
  ExecutionRequest,
  KeyStore,
  L2BlockL2Logs,
  LogType,
  MerkleTreeId,
  NodeInfo,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxL2Logs,
  TxReceipt,
  TxStatus,
  getNewContractPublicFunctions,
  toContractDao,
} from '@aztec/types';

import { RpcServerConfig } from '../config/index.js';
import { ContractDataOracle } from '../contract_data_oracle/index.js';
import { Database, TxDao } from '../database/index.js';
import { KernelOracle } from '../kernel_oracle/index.js';
import { KernelProver } from '../kernel_prover/kernel_prover.js';
import { getAcirSimulator } from '../simulator/index.js';
import { Synchroniser } from '../synchroniser/index.js';

/**
 * A remote Aztec RPC Client implementation.
 */
export class AztecRPCServer implements AztecRPC {
  private synchroniser: Synchroniser;
  private log: DebugLogger;

  constructor(
    private keyStore: KeyStore,
    private node: AztecNode,
    private db: Database,
    private config: RpcServerConfig,
    logSuffix?: string,
  ) {
    this.log = createDebugLogger(logSuffix ? `aztec:rpc_server_${logSuffix}` : `aztec:rpc_server`);
    this.synchroniser = new Synchroniser(node, db, logSuffix);
  }

  /**
   * Starts the Aztec RPC server by beginning the synchronisation process between the Aztec node and the database.
   *
   * @returns A promise that resolves when the server has started successfully.
   */
  public async start() {
    await this.synchroniser.start(1, 1, this.config.l2BlockPollingIntervalMS);
    const info = await this.getNodeInfo();
    this.log.info(`Started RPC server connected to chain ${info.chainId} version ${info.version}`);
  }

  /**
   * Stops the Aztec RPC server, halting processing of new transactions and shutting down the synchronizer.
   * This function ensures that all ongoing tasks are completed before stopping the server.
   * It is useful for gracefully shutting down the server during maintenance or restarts.
   *
   * @returns A Promise resolving once the server has been stopped successfully.
   */
  public async stop() {
    await this.synchroniser.stop();
    this.log.info('Stopped');
  }

  public async addAccount(privKey: PrivateKey, address: AztecAddress, partialContractAddress: PartialContractAddress) {
    const pubKey = this.keyStore.addAccount(privKey);
    // TODO(#1007): ECDSA contract breaks this check, since the ecdsa public key does not match the one derived from the keystore.
    // Once we decouple the ecdsa contract signing and encryption keys, we can re-enable this check.
    // const wasm = await CircuitsWasm.get();
    // const expectedAddress = computeContractAddressFromPartial(wasm, pubKey, partialContractAddress);
    // if (!expectedAddress.equals(address)) {
    //   throw new Error(
    //     `Address cannot be derived from pubkey and partial address (received ${address.toString()}, derived ${expectedAddress.toString()})`,
    //   );
    // }
    await this.db.addPublicKeyAndPartialAddress(address, pubKey, partialContractAddress);
    this.synchroniser.addAccount(pubKey, this.keyStore);
    this.log.info(`Added account ${address.toString()}`);
    return address;
  }

  public async addPublicKeyAndPartialAddress(
    address: AztecAddress,
    publicKey: PublicKey,
    partialAddress: PartialContractAddress,
  ): Promise<void> {
    await this.db.addPublicKeyAndPartialAddress(address, publicKey, partialAddress);
    this.log.info(`Added public key for ${address.toString()}`);
  }

  public async addContracts(contracts: DeployedContract[]) {
    const contractDaos = contracts.map(c => toContractDao(c.abi, c.address, c.portalContract));
    await Promise.all(contractDaos.map(c => this.db.addContract(c)));
    for (const contract of contractDaos) {
      const portalInfo =
        contract.portalContract && !contract.portalContract.isZero() ? ` with portal ${contract.portalContract}` : '';
      this.log.info(`Added contract ${contract.name} at ${contract.address}${portalInfo}`);
    }
  }

  public async getAccounts(): Promise<AztecAddress[]> {
    return await this.db.getAccounts();
  }

  public async getPublicKey(address: AztecAddress): Promise<PublicKey> {
    const result = await this.db.getPublicKeyAndPartialAddress(address);
    if (!result) {
      throw new Error(`Unable to retrieve public key for address ${address.toString()}`);
    }
    return Promise.resolve(result[0]);
  }

  public async getPublicKeyAndPartialAddress(address: AztecAddress): Promise<[PublicKey, PartialContractAddress]> {
    const result = await this.db.getPublicKeyAndPartialAddress(address);
    if (!result) {
      throw new Error(`Unable to get public key for address ${address.toString()}`);
    }
    return Promise.resolve(result);
  }

  public async getPreimagesAt(contract: AztecAddress, storageSlot: Fr) {
    const noteSpendingInfo = await this.db.getNoteSpendingInfo(contract, storageSlot);
    return noteSpendingInfo.map(d => d.notePreimage.items.map(item => item.value));
  }

  public async getPublicStorageAt(contract: AztecAddress, storageSlot: Fr) {
    if (!(await this.isContractDeployed(contract))) {
      throw new Error(`Contract ${contract.toString()} is not deployed`);
    }
    return await this.node.getPublicStorageAt(contract, storageSlot.value);
  }

  public async isContractDeployed(contractAddress: AztecAddress): Promise<boolean> {
    return !!(await this.node.getContractInfo(contractAddress));
  }

  public async simulateTx(txRequest: TxExecutionRequest) {
    if (!txRequest.functionData.isPrivate) {
      throw new Error(`Public entrypoints are not allowed`);
    }
    if (txRequest.functionData.isInternal === undefined) {
      throw new Error(`Unspecified internal are not allowed`);
    }

    // We get the contract address from origin, since contract deployments are signalled as origin from their own address
    // TODO: Is this ok? Should it be changed to be from ZERO?
    const deployedContractAddress = txRequest.txContext.isContractDeploymentTx ? txRequest.origin : undefined;
    const newContract = deployedContractAddress ? await this.db.getContract(deployedContractAddress) : undefined;

    const tx = await this.#simulateAndProve(txRequest, newContract);

    await this.db.addTx(
      TxDao.from({
        txHash: await tx.getTxHash(),
        origin: txRequest.origin,
        contractAddress: deployedContractAddress,
      }),
    );

    this.log.info(`Executed local simulation for ${await tx.getTxHash()}`);
    return tx;
  }

  public async sendTx(tx: Tx): Promise<TxHash> {
    const txHash = await tx.getTxHash();
    this.log.info(`Sending transaction ${txHash}`);
    await this.node.sendTx(tx);
    return txHash;
  }

  public async viewTx(functionName: string, args: any[], to: AztecAddress, from?: AztecAddress) {
    const txRequest = await this.#getExecutionRequest(functionName, args, to, from ?? AztecAddress.ZERO);

    const executionResult = await this.#simulateUnconstrained(txRequest);

    // TODO - Return typed result based on the function abi.
    return executionResult;
  }

  public async getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    const localTx = await this.#getTxByHash(txHash);
    const partialReceipt = new TxReceipt(
      txHash,
      TxStatus.PENDING,
      '',
      localTx?.blockHash,
      localTx?.blockNumber,
      localTx?.origin,
      localTx?.contractAddress,
    );

    if (localTx?.blockHash) {
      partialReceipt.status = TxStatus.MINED;
      return partialReceipt;
    }

    const pendingTx = await this.node.getPendingTxByHash(txHash);
    if (pendingTx) {
      return partialReceipt;
    }

    // if the transaction mined it will be removed from the pending pool and there is a race condition here as the synchroniser will not have the tx as mined yet, so it will appear dropped
    // until the synchroniser picks this up

    const isSynchronised = await this.synchroniser.isSynchronised();
    if (!isSynchronised) {
      // there is a pending L2 block, which means the transaction will not be in the tx pool but may be awaiting mine on L1
      return partialReceipt;
    }

    // TODO we should refactor this once the node can store transactions. At that point we should query the node and not deal with block heights.
    partialReceipt.status = TxStatus.DROPPED;
    partialReceipt.error = 'Tx dropped by P2P node.';
    return partialReceipt;
  }

  async getBlockNum(): Promise<number> {
    return await this.node.getBlockHeight();
  }

  public async getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined> {
    return await this.node.getContractData(contractAddress);
  }

  public async getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    return await this.node.getContractInfo(contractAddress);
  }

  public async getUnencryptedLogs(from: number, take: number): Promise<L2BlockL2Logs[]> {
    return await this.node.getLogs(from, take, LogType.UNENCRYPTED);
  }

  async #getExecutionRequest(
    functionName: string,
    args: any[],
    to: AztecAddress,
    from: AztecAddress,
  ): Promise<ExecutionRequest> {
    const contract = await this.db.getContract(to);
    if (!contract) {
      throw new Error(`Unknown contract ${to}: add it to Aztec RPC server by calling server.addContracts(...)`);
    }

    const functionDao = contract.functions.find(f => f.name === functionName);
    if (!functionDao) {
      throw new Error(`Unknown function ${functionName} in contract ${contract.name}.`);
    }

    return {
      args: encodeArguments(functionDao, args),
      from,
      functionData: FunctionData.fromAbi(functionDao),
      to,
    };
  }

  public async getNodeInfo(): Promise<NodeInfo> {
    const [version, chainId] = await Promise.all([this.node.getVersion(), this.node.getChainId()]);

    return {
      version,
      chainId,
    };
  }

  /**
   * Retrieve a transaction by its hash from the database.
   *
   * @param txHash - The hash of the transaction to be fetched.
   * @returns A TxDao instance representing the retrieved transaction.
   */
  async #getTxByHash(txHash: TxHash): Promise<TxDao> {
    const tx = await this.db.getTx(txHash);
    if (!tx) {
      throw new Error(`Transaction ${txHash} not found in RPC database`);
    }
    return tx;
  }

  /**
   * Retrieves the simulation parameters required to run an ACIR simulation.
   * This includes the contract address, function ABI, portal contract address, and historic tree roots.
   * The function uses the given 'contractDataOracle' to fetch the necessary data from the node and user's database.
   *
   * @param execRequest - The transaction request object containing details of the contract call.
   * @param contractDataOracle - An instance of ContractDataOracle used to fetch the necessary data.
   * @returns An object containing the contract address, function ABI, portal contract address, and historic tree roots.
   */
  async #getSimulationParameters(
    execRequest: ExecutionRequest | TxExecutionRequest,
    contractDataOracle: ContractDataOracle,
  ) {
    const contractAddress = (execRequest as ExecutionRequest).to ?? (execRequest as TxExecutionRequest).origin;
    const functionAbi = await contractDataOracle.getFunctionAbi(
      contractAddress,
      execRequest.functionData.functionSelectorBuffer,
    );
    const portalContract = await contractDataOracle.getPortalContractAddress(contractAddress);

    const currentRoots = this.db.getTreeRoots();
    const historicRoots = PrivateHistoricTreeRoots.from({
      contractTreeRoot: currentRoots[MerkleTreeId.CONTRACT_TREE],
      nullifierTreeRoot: currentRoots[MerkleTreeId.NULLIFIER_TREE],
      privateDataTreeRoot: currentRoots[MerkleTreeId.PRIVATE_DATA_TREE],
      l1ToL2MessagesTreeRoot: currentRoots[MerkleTreeId.L1_TO_L2_MESSAGES_TREE],
      blocksTreeRoot: currentRoots[MerkleTreeId.BLOCKS_TREE],
      privateKernelVkTreeRoot: Fr.ZERO,
    });

    return {
      contractAddress,
      functionAbi,
      portalContract,
      historicRoots,
    };
  }

  async #simulate(txRequest: TxExecutionRequest, contractDataOracle?: ContractDataOracle) {
    // TODO - Pause syncing while simulating.
    if (!contractDataOracle) {
      contractDataOracle = new ContractDataOracle(this.db, this.node);
    }

    const { contractAddress, functionAbi, portalContract, historicRoots } = await this.#getSimulationParameters(
      txRequest,
      contractDataOracle,
    );

    const simulator = getAcirSimulator(this.db, this.node, this.node, this.node, this.keyStore, contractDataOracle);

    try {
      this.log('Executing simulator...');
      const result = await simulator.run(txRequest, functionAbi, contractAddress, portalContract, historicRoots);
      this.log('Simulation completed!');

      return result;
    } catch (err: any) {
      throw typeof err === 'string' ? new Error(err) : err; // Work around raw string being thrown
    }
  }

  /**
   * Simulate an unconstrained transaction on the given contract, without considering constraints set by ACIR.
   * The simulation parameters are fetched using ContractDataOracle and executed using AcirSimulator.
   * Returns the simulation result containing the outputs of the unconstrained function.
   *
   * @param execRequest - The transaction request object containing the target contract and function data.
   * @param contractDataOracle - Optional instance of ContractDataOracle for fetching and caching contract information.
   * @returns The simulation result containing the outputs of the unconstrained function.
   */
  async #simulateUnconstrained(execRequest: ExecutionRequest, contractDataOracle?: ContractDataOracle) {
    if (!contractDataOracle) {
      contractDataOracle = new ContractDataOracle(this.db, this.node);
    }

    const { contractAddress, functionAbi, portalContract, historicRoots } = await this.#getSimulationParameters(
      execRequest,
      contractDataOracle,
    );

    const simulator = getAcirSimulator(this.db, this.node, this.node, this.node, this.keyStore, contractDataOracle);

    this.log('Executing unconstrained simulator...');
    const result = await simulator.runUnconstrained(
      execRequest,
      functionAbi,
      contractAddress,
      portalContract,
      historicRoots,
    );
    this.log('Unconstrained simulation completed!');

    return result;
  }

  /**
   * Simulate a transaction, generate a kernel proof, and create a private transaction object.
   * The function takes in a transaction request and an ECDSA signature. It simulates the transaction,
   * then generates a kernel proof using the simulation result. Finally, it creates a private
   * transaction object with the generated proof and public inputs. If a new contract address is provided,
   * the function will also include the new contract's public functions in the transaction object.
   *
   * @param txExecutionRequest - The transaction request to be simulated and proved.
   * @param signature - The ECDSA signature for the transaction request.
   * @param newContract - Optional. The address of a new contract to be included in the transaction object.
   * @returns A private transaction object containing the proof, public inputs, and encrypted logs.
   */
  async #simulateAndProve(txExecutionRequest: TxExecutionRequest, newContract: ContractDao | undefined) {
    // TODO - Pause syncing while simulating.

    const contractDataOracle = new ContractDataOracle(this.db, this.node);

    const kernelOracle = new KernelOracle(contractDataOracle, this.node);
    const executionResult = await this.#simulate(txExecutionRequest, contractDataOracle);

    const kernelProver = new KernelProver(kernelOracle);
    this.log(`Executing kernel prover...`);
    const { proof, publicInputs } = await kernelProver.prove(txExecutionRequest.toTxRequest(), executionResult);
    this.log('Proof completed!');

    const newContractPublicFunctions = newContract ? getNewContractPublicFunctions(newContract) : [];

    const encryptedLogs = new TxL2Logs(collectEncryptedLogs(executionResult));
    const unencryptedLogs = new TxL2Logs(collectUnencryptedLogs(executionResult));
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(executionResult);

    return new Tx(
      publicInputs,
      proof,
      encryptedLogs,
      unencryptedLogs,
      newContractPublicFunctions,
      enqueuedPublicFunctions,
    );
  }

  public async isSynchronised() {
    return await this.synchroniser.isSynchronised();
  }

  public async isAccountSynchronised(account: AztecAddress) {
    return await this.synchroniser.isAccountSynchronised(account);
  }
}
