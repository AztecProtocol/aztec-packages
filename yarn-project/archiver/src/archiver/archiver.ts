import {
  type FromLogType,
  type GetUnencryptedLogsResponse,
  type L1ToL2MessageSource,
  L2Block,
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
import { compactArray, unique } from '@aztec/foundation/collection';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer } from '@aztec/foundation/timer';
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
import { type Chain, type HttpTransport, type PublicClient, createPublicClient, http } from 'viem';

import { type ArchiverDataStore } from './archiver_store.js';
import { type ArchiverConfig } from './config.js';
import {
  type DataRetrieval,
  type SingletonDataRetrieval,
  retrieveBlockBodiesFromAvailabilityOracle,
  retrieveBlockMetadataFromRollup,
  retrieveL1ToL2Messages,
  retrieveL2ProofVerifiedEvents,
} from './data_retrieval.js';
import { ArchiverInstrumentation } from './instrumentation.js';

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
    private readonly availabilityOracleAddress: EthAddress,
    private readonly inboxAddress: EthAddress,
    private readonly registryAddress: EthAddress,
    private readonly store: ArchiverDataStore,
    private readonly pollingIntervalMs = 10_000,
    private readonly instrumentation: ArchiverInstrumentation,
    private readonly log: DebugLogger = createDebugLogger('aztec:archiver'),
  ) {}

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

    const archiver = new Archiver(
      publicClient,
      config.l1Contracts.rollupAddress,
      config.l1Contracts.availabilityOracleAddress,
      config.l1Contracts.inboxAddress,
      config.l1Contracts.registryAddress,
      archiverStore,
      config.archiverPollingIntervalMS,
      new ArchiverInstrumentation(telemetry),
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
    const { blockBodiesSynchedTo, blocksSynchedTo, messagesSynchedTo } = await this.store.getSynchPoint();
    const currentL1BlockNumber = await this.publicClient.getBlockNumber();

    if (
      currentL1BlockNumber <= blocksSynchedTo &&
      currentL1BlockNumber <= messagesSynchedTo &&
      currentL1BlockNumber <= blockBodiesSynchedTo
    ) {
      // chain hasn't moved forward
      // or it's been rolled back
      this.log.debug(`Nothing to sync`, { currentL1BlockNumber, blocksSynchedTo, messagesSynchedTo });
      return;
    }

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

    // ********** Events that are processed per L1 block **********

    // ********** Events that are processed per L2 block **********

    const retrievedL1ToL2Messages = await retrieveL1ToL2Messages(
      this.publicClient,
      this.inboxAddress,
      blockUntilSynced,
      messagesSynchedTo + 1n,
      currentL1BlockNumber,
    );

    if (retrievedL1ToL2Messages.retrievedData.length !== 0) {
      this.log.verbose(
        `Retrieved ${retrievedL1ToL2Messages.retrievedData.length} new L1 -> L2 messages between L1 blocks ${
          messagesSynchedTo + 1n
        } and ${currentL1BlockNumber}.`,
      );
    }

    await this.store.addL1ToL2Messages(retrievedL1ToL2Messages);

    // Read all data from chain and then write to our stores at the end
    const nextExpectedL2BlockNum = BigInt((await this.store.getSynchedL2BlockNumber()) + 1);

    this.log.debug(`Retrieving block bodies from ${blockBodiesSynchedTo + 1n} to ${currentL1BlockNumber}`);
    const retrievedBlockBodies = await retrieveBlockBodiesFromAvailabilityOracle(
      this.publicClient,
      this.availabilityOracleAddress,
      blockUntilSynced,
      blockBodiesSynchedTo + 1n,
      currentL1BlockNumber,
    );

    this.log.debug(
      `Retrieved ${retrievedBlockBodies.retrievedData.length} block bodies up to L1 block ${retrievedBlockBodies.lastProcessedL1BlockNumber}`,
    );
    await this.store.addBlockBodies(retrievedBlockBodies);

    // Now that we have block bodies we will retrieve block metadata and build L2 blocks from the bodies and
    // the metadata
    let retrievedBlocks: DataRetrieval<L2Block>;
    {
      // @todo @LHerskind Investigate how necessary that nextExpectedL2BlockNum really is.
      //                  Also, I would expect it to break horribly if we have a reorg.
      this.log.debug(`Retrieving block metadata from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
      const retrievedBlockMetadata = await retrieveBlockMetadataFromRollup(
        this.publicClient,
        this.rollupAddress,
        blockUntilSynced,
        blocksSynchedTo + 1n,
        currentL1BlockNumber,
        nextExpectedL2BlockNum,
      );

      const retrievedBodyHashes = retrievedBlockMetadata.retrievedData.map(
        ([header]) => header.contentCommitment.txsEffectsHash,
      );

      // @note @LHerskind   We will occasionally be hitting this point BEFORE, we have actually retrieved the bodies.
      //                    The main reason this have not been an issue earlier is because:
      //                    i) the design previously published the body in one tx and the header in another,
      //                       which in an anvil auto mine world mean that they are separate blocks.
      //                    ii) We have been lucky that latency have been small enough to not matter.
      const blockBodiesFromStore = await this.store.getBlockBodies(retrievedBodyHashes);

      if (retrievedBlockMetadata.retrievedData.length !== blockBodiesFromStore.length) {
        this.log.warn('Block headers length does not equal block bodies length');
      }

      const blocks: L2Block[] = [];
      for (let i = 0; i < retrievedBlockMetadata.retrievedData.length; i++) {
        const [header, archive] = retrievedBlockMetadata.retrievedData[i];
        const blockBody = blockBodiesFromStore[i];
        if (blockBody) {
          blocks.push(new L2Block(archive, header, blockBody));
        } else {
          this.log.warn(`Block body not found for block ${header.globalVariables.blockNumber.toBigInt()}.`);
        }
      }

      (blocks.length ? this.log.verbose : this.log.debug)(
        `Retrieved ${blocks.length || 'no'} new L2 blocks between L1 blocks ${
          blocksSynchedTo + 1n
        } and ${currentL1BlockNumber}.`,
      );

      retrievedBlocks = {
        lastProcessedL1BlockNumber: retrievedBlockMetadata.lastProcessedL1BlockNumber,
        retrievedData: blocks,
      };
    }

    this.log.debug(
      `Processing retrieved blocks ${retrievedBlocks.retrievedData
        .map(b => b.number)
        .join(',')} with last processed L1 block ${retrievedBlocks.lastProcessedL1BlockNumber}`,
    );

    await Promise.all(
      retrievedBlocks.retrievedData.map(block => {
        const noteEncryptedLogs = block.body.noteEncryptedLogs;
        const encryptedLogs = block.body.encryptedLogs;
        const unencryptedLogs = block.body.unencryptedLogs;
        return this.store.addLogs(noteEncryptedLogs, encryptedLogs, unencryptedLogs, block.number);
      }),
    );

    // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
    await Promise.all(
      retrievedBlocks.retrievedData.map(async block => {
        const blockLogs = block.body.txEffects
          .flatMap(txEffect => (txEffect ? [txEffect.unencryptedLogs] : []))
          .flatMap(txLog => txLog.unrollLogs());
        await this.storeRegisteredContractClasses(blockLogs, block.number);
        await this.storeDeployedContractInstances(blockLogs, block.number);
        await this.storeBroadcastedIndividualFunctions(blockLogs, block.number);
      }),
    );

    if (retrievedBlocks.retrievedData.length > 0) {
      const timer = new Timer();
      await this.store.addBlocks(retrievedBlocks);
      this.instrumentation.processNewBlocks(
        timer.ms() / retrievedBlocks.retrievedData.length,
        retrievedBlocks.retrievedData,
      );
      const lastL2BlockNumber = retrievedBlocks.retrievedData[retrievedBlocks.retrievedData.length - 1].number;
      this.log.verbose(`Processed ${retrievedBlocks.retrievedData.length} new L2 blocks up to ${lastL2BlockNumber}`);
    }

    // Fetch the logs for proven blocks in the block range and update the last proven block number.
    // Note it's ok to read repeated data here, since we're just using the largest number we see on the logs.
    await this.updateLastProvenL2Block(blocksSynchedTo, currentL1BlockNumber);

    if (retrievedBlocks.retrievedData.length > 0 || blockUntilSynced) {
      (blockUntilSynced ? this.log.info : this.log.verbose)(`Synced to L1 block ${currentL1BlockNumber}`);
    }
  }

  private async updateLastProvenL2Block(fromBlock: bigint, toBlock: bigint) {
    const logs = await retrieveL2ProofVerifiedEvents(this.publicClient, this.rollupAddress, fromBlock, toBlock);
    const lastLog = logs[logs.length - 1];
    if (!lastLog) {
      return;
    }

    const provenBlockNumber = lastLog.l2BlockNumber;
    if (!provenBlockNumber) {
      throw new Error(`Missing argument blockNumber from L2ProofVerified event`);
    }

    await this.emitProofVerifiedMetrics(logs);

    const currentProvenBlockNumber = await this.store.getProvenL2BlockNumber();
    if (provenBlockNumber > currentProvenBlockNumber) {
      this.log.verbose(`Updated last proven block number from ${currentProvenBlockNumber} to ${provenBlockNumber}`);
      await this.store.setProvenL2BlockNumber({
        retrievedData: Number(provenBlockNumber),
        lastProcessedL1BlockNumber: lastLog.l1BlockNumber,
      });
      this.instrumentation.updateLastProvenBlock(Number(provenBlockNumber));
    }
  }

  /**
   * Emits as metrics the block number proven, who proved it, and how much time passed since it was submitted.
   * @param logs - The ProofVerified logs to emit metrics for, as collected from `retrieveL2ProofVerifiedEvents`.
   **/
  private async emitProofVerifiedMetrics(logs: { l1BlockNumber: bigint; l2BlockNumber: bigint; proverId: Fr }[]) {
    if (!logs.length || !this.instrumentation.isEnabled()) {
      return;
    }

    // Collect L1 block times for all ProofVerified event logs, this is the time in which the proof was submitted.
    const getL1BlockTime = async (blockNumber: bigint) =>
      (await this.publicClient.getBlock({ includeTransactions: false, blockNumber })).timestamp;

    const l1BlockTimes = new Map(
      await Promise.all(
        unique(logs.map(log => log.l1BlockNumber)).map(
          async blockNumber => [blockNumber, await getL1BlockTime(blockNumber)] as const,
        ),
      ),
    );

    // Collect L2 block times for all the blocks verified, this is the time in which the block proven was
    // originally submitted, according to the block header global variables. If we stop having this info,
    // we'll have to tweak the archiver store to save the L1 block time of when the block is pushed during
    // the addBlocks call.
    const getL2BlockTime = async (blockNumber: bigint) =>
      (await this.store.getBlocks(Number(blockNumber), 1))[0]?.header.globalVariables.timestamp.toBigInt();

    const l2BlockTimes = new Map(
      await Promise.all(
        unique(logs.map(log => log.l2BlockNumber)).map(
          async blockNumber => [blockNumber, await getL2BlockTime(blockNumber)] as const,
        ),
      ),
    );

    // Emit the prover id and the time difference between block submission and proof.
    this.instrumentation.processProofsVerified(
      compactArray(
        logs.map(log => {
          const l1BlockTime = l1BlockTimes.get(log.l1BlockNumber)!;
          const l2BlockTime = l2BlockTimes.get(log.l2BlockNumber);
          if (!l2BlockTime) {
            return undefined;
          }
          return { ...log, delay: l1BlockTime - l2BlockTime, proverId: log.proverId.toString() };
        }),
      ),
    );
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
    return limitWithProven === 0 ? [] : this.store.getBlocks(from, limitWithProven);
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
    return blocks.length === 0 ? undefined : blocks[0];
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
