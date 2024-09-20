import {
  type FromLogType,
  type GetUnencryptedLogsResponse,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockL2Logs,
  type L2BlockSource,
  type L2LogsSource,
  type LogFilter,
  type LogType,
  type TxEffect,
  type TxHash,
  type TxReceipt,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { ContractClassRegisteredEvent, type FunctionSelector } from '@aztec/circuits.js';
import {
  ContractInstanceDeployedEvent,
  PrivateFunctionBroadcastedEvent,
  UnconstrainedFunctionBroadcastedEvent,
  isValidPrivateFunctionMembershipProof,
  isValidUnconstrainedFunctionMembershipProof,
} from '@aztec/circuits.js/contract';
import { createEthereumChain } from '@aztec/ethereum';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer } from '@aztec/foundation/timer';
import { InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { ClassRegistererAddress } from '@aztec/protocol-contracts/class-registerer';
import { type TelemetryClient } from '@aztec/telemetry-client';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  type ExecutablePrivateFunctionWithMembershipProof,
  type PublicFunction,
  type UnconstrainedFunctionWithMembershipProof,
} from '@aztec/types/contracts';

import groupBy from 'lodash.groupby';
import {
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  getContract,
  http,
} from 'viem';

import { type ArchiverDataStore } from './archiver_store.js';
import { type ArchiverConfig } from './config.js';
import { retrieveBlockFromRollup, retrieveL1ToL2Messages } from './data_retrieval.js';
import { ArchiverInstrumentation } from './instrumentation.js';
import { type SingletonDataRetrieval } from './structs/data_retrieval.js';

/**
 * Helper interface to combine all sources this archiver implementation provides.
 */
export type ArchiveSource = L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource;

/**
 * Pulls L2 blocks in a non-blocking manner and provides interface for their retrieval.
 * Responsible for handling robust L1 polling so that other components do not need to
 * concern themselves with it.
 */
export class Archiver implements ArchiveSource {
  /**
   * A promise in which we will be continually fetching new L2 blocks.
   */
  private runningPromise?: RunningPromise;

  private rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;
  private inbox: GetContractReturnType<typeof InboxAbi, PublicClient<HttpTransport, Chain>>;

  /**
   * Creates a new instance of the Archiver.
   * @param publicClient - A client for interacting with the Ethereum node.
   * @param rollupAddress - Ethereum address of the rollup contract.
   * @param inboxAddress - Ethereum address of the inbox contract.
   * @param registryAddress - Ethereum address of the registry contract.
   * @param pollingIntervalMs - The interval for polling for L1 logs (in milliseconds).
   * @param store - An archiver data store for storage & retrieval of blocks, encrypted logs & contract data.
   * @param log - A logger.
   */
  constructor(
    private readonly publicClient: PublicClient<HttpTransport, Chain>,
    private readonly rollupAddress: EthAddress,
    private readonly inboxAddress: EthAddress,
    private readonly registryAddress: EthAddress,
    private readonly store: ArchiverDataStore,
    private readonly pollingIntervalMs = 10_000,
    private readonly instrumentation: ArchiverInstrumentation,
    private readonly l1StartBlock: bigint = 0n,
    private readonly log: DebugLogger = createDebugLogger('aztec:archiver'),
  ) {
    this.rollup = getContract({
      address: rollupAddress.toString(),
      abi: RollupAbi,
      client: publicClient,
    });

    this.inbox = getContract({
      address: inboxAddress.toString(),
      abi: InboxAbi,
      client: publicClient,
    });
  }

  /**
   * Creates a new instance of the Archiver and blocks until it syncs from chain.
   * @param config - The archiver's desired configuration.
   * @param archiverStore - The backing store for the archiver.
   * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
   * @returns - An instance of the archiver.
   */
  public static async createAndSync(
    config: ArchiverConfig,
    archiverStore: ArchiverDataStore,
    telemetry: TelemetryClient,
    blockUntilSynced = true,
  ): Promise<Archiver> {
    const chain = createEthereumChain(config.l1RpcUrl, config.l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const rollup = getContract({
      address: config.l1Contracts.rollupAddress.toString(),
      abi: RollupAbi,
      client: publicClient,
    });

    const l1StartBlock = await rollup.read.L1_BLOCK_AT_GENESIS();

    const archiver = new Archiver(
      publicClient,
      config.l1Contracts.rollupAddress,
      config.l1Contracts.inboxAddress,
      config.l1Contracts.registryAddress,
      archiverStore,
      config.archiverPollingIntervalMS,
      new ArchiverInstrumentation(telemetry),
      BigInt(l1StartBlock),
    );
    await archiver.start(blockUntilSynced);
    return archiver;
  }

  /**
   * Starts sync process.
   * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
   */
  public async start(blockUntilSynced: boolean): Promise<void> {
    if (this.runningPromise) {
      throw new Error('Archiver is already running');
    }

    if (blockUntilSynced) {
      this.log.info(`Performing initial chain sync to rollup contract ${this.rollupAddress.toString()}`);
      await this.sync(blockUntilSynced);
    }

    this.runningPromise = new RunningPromise(() => this.safeSync(), this.pollingIntervalMs);
    this.runningPromise.start();
  }

  /**
   * Syncs and catches exceptions.
   */
  private async safeSync() {
    try {
      await this.sync(false);
    } catch (error) {
      this.log.error('Error syncing archiver', error);
    }
  }

  /**
   * Fetches logs from L1 contracts and processes them.
   * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
   */
  private async sync(blockUntilSynced: boolean) {
    /**
     * We keep track of three "pointers" to L1 blocks:
     * 1. the last L1 block that published an L2 block
     * 2. the last L1 block that added L1 to L2 messages
     * 3. the last L1 block that cancelled L1 to L2 messages
     *
     * We do this to deal with L1 data providers that are eventually consistent (e.g. Infura).
     * We guard against seeing block X with no data at one point, and later, the provider processes the block and it has data.
     * The archiver will stay back, until there's data on L1 that will move the pointers forward.
     *
     * This code does not handle reorgs.
     */
    const {
      blocksSynchedTo = this.l1StartBlock,
      messagesSynchedTo = this.l1StartBlock,
      provenLogsSynchedTo = this.l1StartBlock,
    } = await this.store.getSynchPoint();
    const currentL1BlockNumber = await this.publicClient.getBlockNumber();

    // ********** Ensuring Consistency of data pulled from L1 **********

    /**
     * There are a number of calls in this sync operation to L1 for retrieving
     * events and transaction data. There are a couple of things we need to bear in mind
     * to ensure that data is read exactly once.
     *
     * The first is the problem of eventually consistent ETH service providers like Infura.
     * Each L1 read operation will query data from the last L1 block that it saw emit its kind of data.
     * (so pending L1 to L2 messages will read from the last L1 block that emitted a message and so  on)
     * This will mean the archiver will lag behind L1 and will only advance when there's L2-relevant activity on the chain.
     *
     * The second is that in between the various calls to L1, the block number can move meaning some
     * of the following calls will return data for blocks that were not present during earlier calls.
     * To combat this for the time being we simply ensure that all data retrieval methods only retrieve
     * data up to the currentBlockNumber captured at the top of this function. We might want to improve on this
     * in future but for the time being it should give us the guarantees that we need
     */

    await this.updateLastProvenL2Block(provenLogsSynchedTo, currentL1BlockNumber);

    // ********** Events that are processed per L1 block **********

    await this.handleL1ToL2Messages(blockUntilSynced, messagesSynchedTo, currentL1BlockNumber);

    // ********** Events that are processed per L2 block **********
    await this.handleL2blocks(blockUntilSynced, blocksSynchedTo, currentL1BlockNumber);
  }

  private async handleL1ToL2Messages(
    blockUntilSynced: boolean,
    messagesSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ) {
    if (currentL1BlockNumber <= messagesSynchedTo) {
      return;
    }

    const retrievedL1ToL2Messages = await retrieveL1ToL2Messages(
      this.inbox,
      blockUntilSynced,
      messagesSynchedTo + 1n,
      currentL1BlockNumber,
    );

    if (retrievedL1ToL2Messages.retrievedData.length === 0) {
      await this.store.setMessageSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.verbose(
        `Retrieved no new L1 -> L2 messages between L1 blocks ${messagesSynchedTo + 1n} and ${currentL1BlockNumber}.`,
      );
      return;
    }

    await this.store.addL1ToL2Messages(retrievedL1ToL2Messages);

    this.log.verbose(
      `Retrieved ${retrievedL1ToL2Messages.retrievedData.length} new L1 -> L2 messages between L1 blocks ${
        messagesSynchedTo + 1n
      } and ${currentL1BlockNumber}.`,
    );
  }

  private async updateLastProvenL2Block(provenSynchedTo: bigint, currentL1BlockNumber: bigint) {
    if (currentL1BlockNumber <= provenSynchedTo) {
      return;
    }

    const provenBlockNumber = await this.rollup.read.getProvenBlockNumber();
    if (provenBlockNumber) {
      await this.store.setProvenL2BlockNumber({
        retrievedData: Number(provenBlockNumber),
        lastProcessedL1BlockNumber: currentL1BlockNumber,
      });
    }
  }

  private async handleL2blocks(blockUntilSynced: boolean, blocksSynchedTo: bigint, currentL1BlockNumber: bigint) {
    if (currentL1BlockNumber <= blocksSynchedTo) {
      return;
    }

    const lastBlock = await this.getBlock(-1);

    const [, , pendingBlockNumber, pendingArchive, archiveOfMyBlock] = await this.rollup.read.status([
      BigInt(lastBlock?.number ?? 0),
    ]);

    const noBlocksButInitial = lastBlock === undefined && pendingBlockNumber == 0n;
    const noBlockSinceLast =
      lastBlock &&
      pendingBlockNumber === BigInt(lastBlock.number) &&
      pendingArchive === lastBlock.archive.root.toString();

    if (noBlocksButInitial || noBlockSinceLast) {
      await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.verbose(`No blocks to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
      return;
    }

    if (lastBlock && archiveOfMyBlock !== lastBlock.archive.root.toString()) {
      // @todo  Either `prune` have been called, or L1 have re-orged deep enough to remove a block.
      //        Issue#8620 and Issue#8621
    }

    this.log.debug(`Retrieving blocks from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
    const retrievedBlocks = await retrieveBlockFromRollup(
      this.rollup,
      this.publicClient,
      blockUntilSynced,
      blocksSynchedTo + 1n,
      currentL1BlockNumber,
      this.log,
    );

    if (retrievedBlocks.length === 0) {
      await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.verbose(`Retrieved no new blocks from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
      return;
    }

    this.log.debug(
      `Retrieved ${retrievedBlocks.length} new L2 blocks between L1 blocks ${
        blocksSynchedTo + 1n
      } and ${currentL1BlockNumber}.`,
    );

    const lastProcessedL1BlockNumber = retrievedBlocks[retrievedBlocks.length - 1].l1.blockNumber;

    this.log.debug(
      `Processing retrieved blocks ${retrievedBlocks
        .map(b => b.data.number)
        .join(',')} with last processed L1 block ${lastProcessedL1BlockNumber}`,
    );

    await Promise.all(
      retrievedBlocks.map(block => {
        return this.store.addLogs(
          block.data.body.noteEncryptedLogs,
          block.data.body.encryptedLogs,
          block.data.body.unencryptedLogs,
          block.data.number,
        );
      }),
    );

    // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
    await Promise.all(
      retrievedBlocks.map(async block => {
        const blockLogs = block.data.body.txEffects
          .flatMap(txEffect => (txEffect ? [txEffect.unencryptedLogs] : []))
          .flatMap(txLog => txLog.unrollLogs());
        await this.storeRegisteredContractClasses(blockLogs, block.data.number);
        await this.storeDeployedContractInstances(blockLogs, block.data.number);
        await this.storeBroadcastedIndividualFunctions(blockLogs, block.data.number);
      }),
    );

    const timer = new Timer();
    await this.store.addBlocks(retrievedBlocks);
    this.instrumentation.processNewBlocks(
      timer.ms() / retrievedBlocks.length,
      retrievedBlocks.map(b => b.data),
    );
    const lastL2BlockNumber = retrievedBlocks[retrievedBlocks.length - 1].data.number;
    this.log.verbose(`Processed ${retrievedBlocks.length} new L2 blocks up to ${lastL2BlockNumber}`);
  }

  /**
   * Extracts and stores contract classes out of ContractClassRegistered events emitted by the class registerer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  private async storeRegisteredContractClasses(allLogs: UnencryptedL2Log[], blockNum: number) {
    const contractClasses = ContractClassRegisteredEvent.fromLogs(allLogs, ClassRegistererAddress).map(e =>
      e.toContractClassPublic(),
    );
    if (contractClasses.length > 0) {
      contractClasses.forEach(c => this.log.verbose(`Registering contract class ${c.id.toString()}`));
      await this.store.addContractClasses(contractClasses, blockNum);
    }
  }

  /**
   * Extracts and stores contract instances out of ContractInstanceDeployed events emitted by the canonical deployer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  private async storeDeployedContractInstances(allLogs: UnencryptedL2Log[], blockNum: number) {
    const contractInstances = ContractInstanceDeployedEvent.fromLogs(allLogs).map(e => e.toContractInstance());
    if (contractInstances.length > 0) {
      contractInstances.forEach(c => this.log.verbose(`Storing contract instance at ${c.address.toString()}`));
      await this.store.addContractInstances(contractInstances, blockNum);
    }
  }

  private async storeBroadcastedIndividualFunctions(allLogs: UnencryptedL2Log[], _blockNum: number) {
    // Filter out private and unconstrained function broadcast events
    const privateFnEvents = PrivateFunctionBroadcastedEvent.fromLogs(allLogs, ClassRegistererAddress);
    const unconstrainedFnEvents = UnconstrainedFunctionBroadcastedEvent.fromLogs(allLogs, ClassRegistererAddress);

    // Group all events by contract class id
    for (const [classIdString, classEvents] of Object.entries(
      groupBy([...privateFnEvents, ...unconstrainedFnEvents], e => e.contractClassId.toString()),
    )) {
      const contractClassId = Fr.fromString(classIdString);
      const contractClass = await this.store.getContractClass(contractClassId);
      if (!contractClass) {
        this.log.warn(`Skipping broadcasted functions as contract class ${contractClassId.toString()} was not found`);
        continue;
      }

      // Split private and unconstrained functions, and filter out invalid ones
      const allFns = classEvents.map(e => e.toFunctionWithMembershipProof());
      const privateFns = allFns.filter(
        (fn): fn is ExecutablePrivateFunctionWithMembershipProof => 'unconstrainedFunctionsArtifactTreeRoot' in fn,
      );
      const unconstrainedFns = allFns.filter(
        (fn): fn is UnconstrainedFunctionWithMembershipProof => 'privateFunctionsArtifactTreeRoot' in fn,
      );
      const validPrivateFns = privateFns.filter(fn => isValidPrivateFunctionMembershipProof(fn, contractClass));
      const validUnconstrainedFns = unconstrainedFns.filter(fn =>
        isValidUnconstrainedFunctionMembershipProof(fn, contractClass),
      );
      const validFnCount = validPrivateFns.length + validUnconstrainedFns.length;
      if (validFnCount !== allFns.length) {
        this.log.warn(`Skipping ${allFns.length - validFnCount} invalid functions`);
      }

      // Store the functions in the contract class in a single operation
      if (validFnCount > 0) {
        this.log.verbose(`Storing ${validFnCount} functions for contract class ${contractClassId.toString()}`);
      }
      await this.store.addFunctions(contractClassId, validPrivateFns, validUnconstrainedFns);
    }
  }

  /**
   * Stops the archiver.
   * @returns A promise signalling completion of the stop process.
   */
  public async stop(): Promise<void> {
    this.log.debug('Stopping...');
    await this.runningPromise?.stop();

    this.log.info('Stopped.');
    return Promise.resolve();
  }

  public getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(this.rollupAddress);
  }

  public getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(this.registryAddress);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @param proven - If true, only return blocks that have been proven.
   * @returns The requested L2 blocks.
   */
  public async getBlocks(from: number, limit: number, proven?: boolean): Promise<L2Block[]> {
    const limitWithProven = proven
      ? Math.min(limit, Math.max((await this.store.getProvenL2BlockNumber()) - from + 1, 0))
      : limit;
    return limitWithProven === 0 ? [] : (await this.store.getBlocks(from, limitWithProven)).map(b => b.data);
  }

  /**
   * Gets an l2 block.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public async getBlock(number: number): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getSynchedL2BlockNumber();
    }
    const blocks = await this.store.getBlocks(number, 1);
    return blocks.length === 0 ? undefined : blocks[0].data;
  }

  public getTxEffect(txHash: TxHash): Promise<TxEffect | undefined> {
    return this.store.getTxEffect(txHash);
  }

  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.store.getSettledTxReceipt(txHash);
  }

  /**
   * Gets the public function data for a contract.
   * @param address - The contract address containing the function to fetch.
   * @param selector - The function selector of the function to fetch.
   * @returns The public function data (if found).
   */
  public async getPublicFunction(
    address: AztecAddress,
    selector: FunctionSelector,
  ): Promise<PublicFunction | undefined> {
    const instance = await this.getContract(address);
    if (!instance) {
      throw new Error(`Contract ${address.toString()} not found`);
    }
    const contractClass = await this.getContractClass(instance.contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class ${instance.contractClassId.toString()} for ${address.toString()} not found`);
    }
    return contractClass.publicFunctions.find(f => f.selector.equals(selector));
  }

  /**
   * Gets up to `limit` amount of logs starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first logs to be returned.
   * @param limit - The number of logs to return.
   * @param logType - Specifies whether to return encrypted or unencrypted logs.
   * @returns The requested logs.
   */
  public getLogs<TLogType extends LogType>(
    from: number,
    limit: number,
    logType: TLogType,
  ): Promise<L2BlockL2Logs<FromLogType<TLogType>>[]> {
    return this.store.getLogs(from, limit, logType);
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    return this.store.getUnencryptedLogs(filter);
  }

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  public getBlockNumber(): Promise<number> {
    return this.store.getSynchedL2BlockNumber();
  }

  public getProvenBlockNumber(): Promise<number> {
    return this.store.getProvenL2BlockNumber();
  }

  /** Forcefully updates the last proven block number. Use for testing. */
  public setProvenBlockNumber(block: SingletonDataRetrieval<number>): Promise<void> {
    return this.store.setProvenL2BlockNumber(block);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.store.getContractClass(id);
  }

  public getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.store.getContractInstance(address);
  }

  /**
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    return this.store.getL1ToL2Messages(blockNumber);
  }

  /**
   * Gets the first L1 to L2 message index in the L1 to L2 message tree which is greater than or equal to `startIndex`.
   * @param l1ToL2Message - The L1 to L2 message.
   * @param startIndex - The index to start searching from.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr, startIndex: bigint): Promise<bigint | undefined> {
    return this.store.getL1ToL2MessageIndex(l1ToL2Message, startIndex);
  }

  getContractClassIds(): Promise<Fr[]> {
    return this.store.getContractClassIds();
  }

  addContractArtifact(address: AztecAddress, artifact: ContractArtifact): Promise<void> {
    return this.store.addContractArtifact(address, artifact);
  }

  getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    return this.store.getContractArtifact(address);
  }
}
