import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import {
  BlockTagTooOldError,
  InboxContract,
  type L1BlockId,
  RollupContract,
  type ViemPublicClient,
  createEthereumChain,
} from '@aztec/ethereum';
import { maxBigint } from '@aztec/foundation/bigint';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise, makeLoggingErrorHandler } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { count } from '@aztec/foundation/string';
import { elapsed } from '@aztec/foundation/timer';
import type { CustomRange } from '@aztec/kv-store';
import { RollupAbi } from '@aztec/l1-artifacts';
import {
  ContractClassRegisteredEvent,
  PrivateFunctionBroadcastedEvent,
  UtilityFunctionBroadcastedEvent,
} from '@aztec/protocol-contracts/class-registerer';
import {
  ContractInstanceDeployedEvent,
  ContractInstanceUpdatedEvent,
} from '@aztec/protocol-contracts/instance-deployer';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ArchiverEmitter,
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  L2BlockSourceEvents,
  type L2Tips,
} from '@aztec/stdlib/block';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  type ExecutablePrivateFunctionWithMembershipProof,
  type UtilityFunctionWithMembershipProof,
  computePublicBytecodeCommitment,
  isValidPrivateFunctionMembershipProof,
  isValidUtilityFunctionMembershipProof,
} from '@aztec/stdlib/contract';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
  getSlotRangeForEpoch,
  getTimestampRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import type { L2LogsSource } from '@aztec/stdlib/interfaces/server';
import { ContractClassLog, type LogFilter, type PrivateLog, type PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { type BlockHeader, type IndexedTxEffect, TxHash, TxReceipt } from '@aztec/stdlib/tx';
import { Attributes, type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import groupBy from 'lodash.groupby';
import { type GetContractReturnType, createPublicClient, fallback, http } from 'viem';

import type { ArchiverDataStore, ArchiverL1SynchPoint } from './archiver_store.js';
import type { ArchiverConfig } from './config.js';
import {
  retrieveBlocksFromRollup,
  retrieveL1ToL2Message,
  retrieveL1ToL2Messages,
  retrievedBlockToPublishedL2Block,
} from './data_retrieval.js';
import { InitialBlockNumberNotSequentialError, NoBlobBodiesFoundError } from './errors.js';
import { ArchiverInstrumentation } from './instrumentation.js';
import type { InboxMessage } from './structs/inbox_message.js';
import type { PublishedL2Block } from './structs/published.js';

/**
 * Helper interface to combine all sources this archiver implementation provides.
 */
export type ArchiveSource = L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource;

/**
 * Pulls L2 blocks in a non-blocking manner and provides interface for their retrieval.
 * Responsible for handling robust L1 polling so that other components do not need to
 * concern themselves with it.
 */
export class Archiver extends (EventEmitter as new () => ArchiverEmitter) implements ArchiveSource, Traceable {
  /**
   * A promise in which we will be continually fetching new L2 blocks.
   */
  private runningPromise?: RunningPromise;

  private rollup: RollupContract;
  private inbox: InboxContract;

  private store: ArchiverStoreHelper;

  private l1BlockNumber: bigint | undefined;
  private l1Timestamp: bigint | undefined;
  private initialSyncComplete: boolean = false;

  public readonly tracer: Tracer;

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
    private readonly publicClient: ViemPublicClient,
    private readonly l1Addresses: { rollupAddress: EthAddress; inboxAddress: EthAddress; registryAddress: EthAddress },
    readonly dataStore: ArchiverDataStore,
    private readonly config: { pollingIntervalMs: number; batchSize: number },
    private readonly blobSinkClient: BlobSinkClientInterface,
    private readonly instrumentation: ArchiverInstrumentation,
    private readonly l1constants: L1RollupConstants & { l1StartBlockHash: Buffer32 },
    private readonly log: Logger = createLogger('archiver'),
  ) {
    super();

    this.tracer = instrumentation.tracer;
    this.store = new ArchiverStoreHelper(dataStore);

    this.rollup = new RollupContract(publicClient, l1Addresses.rollupAddress);
    this.inbox = new InboxContract(publicClient, l1Addresses.inboxAddress);
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
    deps: { telemetry: TelemetryClient; blobSinkClient: BlobSinkClientInterface },
    blockUntilSynced = true,
  ): Promise<Archiver> {
    const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(config.l1RpcUrls.map(url => http(url))),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const rollup = new RollupContract(publicClient, config.l1Contracts.rollupAddress);

    const [l1StartBlock, l1GenesisTime] = await Promise.all([
      rollup.getL1StartBlock(),
      rollup.getL1GenesisTime(),
    ] as const);

    const l1StartBlockHash = await publicClient
      .getBlock({ blockNumber: l1StartBlock, includeTransactions: false })
      .then(block => Buffer32.fromString(block.hash));

    const {
      aztecEpochDuration: epochDuration,
      aztecSlotDuration: slotDuration,
      ethereumSlotDuration,
      aztecProofSubmissionWindow: proofSubmissionWindow,
    } = config;

    const l1Constants = {
      l1StartBlockHash,
      l1StartBlock,
      l1GenesisTime,
      epochDuration,
      slotDuration,
      ethereumSlotDuration,
      proofSubmissionWindow,
    };

    const opts = {
      pollingIntervalMs: config.archiverPollingIntervalMS ?? 10_000,
      batchSize: config.archiverBatchSize ?? 100,
    };

    const archiver = new Archiver(
      publicClient,
      config.l1Contracts,
      archiverStore,
      opts,
      deps.blobSinkClient,
      await ArchiverInstrumentation.new(deps.telemetry, () => archiverStore.estimateSize()),
      l1Constants,
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

    await this.blobSinkClient.testSources();

    if (blockUntilSynced) {
      while (!(await this.syncSafe(true))) {
        this.log.info(`Retrying initial archiver sync in ${this.config.pollingIntervalMs}ms`);
        await sleep(this.config.pollingIntervalMs);
      }
    }

    this.runningPromise = new RunningPromise(
      () => this.sync(false),
      this.log,
      this.config.pollingIntervalMs,
      makeLoggingErrorHandler(
        this.log,
        // Ignored errors will not log to the console
        // We ignore NoBlobBodiesFound as the message may not have been passed to the blob sink yet
        NoBlobBodiesFoundError,
      ),
    );

    this.runningPromise.start();
  }

  public syncImmediate() {
    if (!this.runningPromise) {
      throw new Error('Archiver is not running');
    }
    return this.runningPromise.trigger();
  }

  private async syncSafe(initialRun: boolean) {
    try {
      await this.sync(initialRun);
      return true;
    } catch (error) {
      if (error instanceof NoBlobBodiesFoundError) {
        this.log.error(`Error syncing archiver: ${error.message}`);
      } else if (error instanceof BlockTagTooOldError) {
        this.log.warn(`Re-running archiver sync: ${error.message}`);
      } else {
        this.log.error('Error during archiver sync', error);
      }
      return false;
    }
  }

  /**
   * Fetches logs from L1 contracts and processes them.
   */
  @trackSpan('Archiver.sync', initialRun => ({ [Attributes.INITIAL_SYNC]: initialRun }))
  private async sync(initialRun: boolean) {
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
    const { l1StartBlock, l1StartBlockHash } = this.l1constants;
    const {
      blocksSynchedTo = l1StartBlock,
      messagesSynchedTo = { l1BlockNumber: l1StartBlock, l1BlockHash: l1StartBlockHash },
    } = await this.store.getSynchPoint();

    const currentL1Block = await this.publicClient.getBlock({ includeTransactions: false });
    const currentL1BlockNumber = currentL1Block.number;
    const currentL1BlockHash = Buffer32.fromString(currentL1Block.hash);

    if (initialRun) {
      this.log.info(
        `Starting archiver sync to rollup contract ${this.l1Addresses.rollupAddress.toString()} from L1 block ${blocksSynchedTo}` +
          ` to current L1 block ${currentL1BlockNumber} with hash ${currentL1BlockHash.toString()}`,
        { blocksSynchedTo, messagesSynchedTo },
      );
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
    await this.handleL1ToL2Messages(messagesSynchedTo, currentL1BlockNumber, currentL1BlockHash);

    // Get L1 timestamp for the current block
    const currentL1Timestamp =
      !this.l1Timestamp || !this.l1BlockNumber || this.l1BlockNumber !== currentL1BlockNumber
        ? (await this.publicClient.getBlock({ blockNumber: currentL1BlockNumber })).timestamp
        : this.l1Timestamp;

    // ********** Events that are processed per L2 block **********
    if (currentL1BlockNumber > blocksSynchedTo) {
      // First we retrieve new L2 blocks
      const rollupStatus = await this.handleL2blocks(blocksSynchedTo, currentL1BlockNumber);
      // Then we prune the current epoch if it'd reorg on next submission.
      // Note that we don't do this before retrieving L2 blocks because we may need to retrieve
      // blocks from more than 2 epochs ago, so we want to make sure we have the latest view of
      // the chain locally before we start unwinding stuff. This can be optimized by figuring out
      // up to which point we're pruning, and then requesting L2 blocks up to that point only.
      const { rollupCanPrune } = await this.handleEpochPrune(
        rollupStatus.provenBlockNumber,
        currentL1BlockNumber,
        currentL1Timestamp,
      );
      // And lastly we check if we are missing any L2 blocks behind us due to a possible L1 reorg.
      // We only do this if rollup cant prune on the next submission. Otherwise we will end up
      // re-syncing the blocks we have just unwound above.
      if (!rollupCanPrune) {
        await this.checkForNewBlocksBeforeL1SyncPoint(rollupStatus, blocksSynchedTo, currentL1BlockNumber);
      }

      this.instrumentation.updateL1BlockHeight(currentL1BlockNumber);
    }

    // After syncing has completed, update the current l1 block number and timestamp,
    // otherwise we risk announcing to the world that we've synced to a given point,
    // but the corresponding blocks have not been processed (see #12631).
    this.l1Timestamp = currentL1Timestamp;
    this.l1BlockNumber = currentL1BlockNumber;
    this.initialSyncComplete = true;

    if (initialRun) {
      this.log.info(`Initial archiver sync to L1 block ${currentL1BlockNumber} complete.`, {
        l1BlockNumber: currentL1BlockNumber,
        syncPoint: await this.store.getSynchPoint(),
        ...(await this.getL2Tips()),
      });
    }
  }

  /** Queries the rollup contract on whether a prune can be executed on the immediate next L1 block. */
  private async canPrune(currentL1BlockNumber: bigint, currentL1Timestamp: bigint) {
    const time = (currentL1Timestamp ?? 0n) + BigInt(this.l1constants.ethereumSlotDuration);
    const result = await this.rollup.canPruneAtTime(time, { blockNumber: currentL1BlockNumber });
    if (result) {
      this.log.debug(`Rollup contract allows pruning at L1 block ${currentL1BlockNumber} time ${time}`, {
        currentL1Timestamp,
        pruneTime: time,
        currentL1BlockNumber,
      });
    }
    return result;
  }

  /** Checks if there'd be a reorg for the next block submission and start pruning now. */
  private async handleEpochPrune(provenBlockNumber: bigint, currentL1BlockNumber: bigint, currentL1Timestamp: bigint) {
    const rollupCanPrune = await this.canPrune(currentL1BlockNumber, currentL1Timestamp);
    const localPendingBlockNumber = BigInt(await this.getBlockNumber());
    const canPrune = localPendingBlockNumber > provenBlockNumber && rollupCanPrune;

    if (canPrune) {
      const pruneFrom = provenBlockNumber + 1n;

      const header = await this.getBlockHeader(Number(pruneFrom));
      if (header === undefined) {
        throw new Error(`Missing block header ${pruneFrom}`);
      }

      const pruneFromSlotNumber = header.globalVariables.slotNumber.toBigInt();
      const pruneFromEpochNumber = getEpochAtSlot(pruneFromSlotNumber, this.l1constants);

      const blocksToUnwind = localPendingBlockNumber - provenBlockNumber;

      const blocks = await this.getBlocks(Number(provenBlockNumber) + 1, Number(blocksToUnwind));

      // Emit an event for listening services to react to the chain prune
      this.emit(L2BlockSourceEvents.L2PruneDetected, {
        type: L2BlockSourceEvents.L2PruneDetected,
        epochNumber: pruneFromEpochNumber,
        blocks,
      });

      this.log.debug(
        `L2 prune from ${provenBlockNumber + 1n} to ${localPendingBlockNumber} will occur on next block submission.`,
      );
      await this.store.unwindBlocks(Number(localPendingBlockNumber), Number(blocksToUnwind));
      this.log.warn(
        `Unwound ${count(blocksToUnwind, 'block')} from L2 block ${localPendingBlockNumber} ` +
          `to ${provenBlockNumber} due to predicted reorg at L1 block ${currentL1BlockNumber}. ` +
          `Updated L2 latest block is ${await this.getBlockNumber()}.`,
      );
      this.instrumentation.processPrune();
      // TODO(palla/reorg): Do we need to set the block synched L1 block number here?
      // Seems like the next iteration should handle this.
      // await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
    }

    return { rollupCanPrune };
  }

  private nextRange(end: bigint, limit: bigint): [bigint, bigint] {
    const batchSize = (this.config.batchSize * this.l1constants.slotDuration) / this.l1constants.ethereumSlotDuration;
    const nextStart = end + 1n;
    const nextEnd = nextStart + BigInt(batchSize);
    if (nextEnd > limit) {
      return [nextStart, limit];
    }
    return [nextStart, nextEnd];
  }

  private async handleL1ToL2Messages(
    messagesSyncPoint: L1BlockId,
    currentL1BlockNumber: bigint,
    currentL1BlockHash: Buffer32,
  ) {
    this.log.trace(`Handling L1 to L2 messages from ${messagesSyncPoint.l1BlockNumber} to ${currentL1BlockNumber}.`);
    if (currentL1BlockNumber <= messagesSyncPoint.l1BlockNumber) {
      return;
    }

    // Load remote and local inbox states.
    const localMessagesInserted = await this.store.getTotalL1ToL2MessageCount();
    const localLastMessage = await this.store.getLastL1ToL2Message();
    const remoteMessagesState = await this.inbox.getState({ blockNumber: currentL1BlockNumber });

    this.log.trace(`Retrieved remote inbox state at L1 block ${currentL1BlockNumber}.`, {
      localMessagesInserted,
      localLastMessage,
      remoteMessagesState,
    });

    // Compare message count and rolling hash. If they match, no need to retrieve anything.
    if (
      remoteMessagesState.totalMessagesInserted === localMessagesInserted &&
      remoteMessagesState.messagesRollingHash.equals(localLastMessage?.rollingHash ?? Buffer16.ZERO)
    ) {
      this.log.debug(
        `No L1 to L2 messages to query between L1 blocks ${messagesSyncPoint.l1BlockNumber} and ${currentL1BlockNumber}.`,
      );
      await this.store.setMessageSynchedL1Block({
        l1BlockHash: currentL1BlockHash,
        l1BlockNumber: currentL1BlockNumber,
      });
      return;
    }

    // Check if our syncpoint is still valid. If not, there was an L1 reorg and we need to re-retrieve messages.
    // Note that we need to fetch it from logs and not from inbox state at the syncpoint l1 block number, since it
    // could be older than 128 blocks and non-archive nodes cannot resolve it.
    if (localLastMessage) {
      const remoteLastMessage = await this.retrieveL1ToL2Message(localLastMessage.leaf);
      this.log.trace(`Retrieved remote message for local last`, { remoteLastMessage, localLastMessage });
      if (!remoteLastMessage || !remoteLastMessage.rollingHash.equals(localLastMessage.rollingHash)) {
        this.log.warn(`Rolling back L1 to L2 messages due to hash mismatch or msg not found.`, {
          remoteLastMessage,
          messagesSyncPoint,
          localLastMessage,
        });

        messagesSyncPoint = await this.rollbackL1ToL2Messages(localLastMessage, messagesSyncPoint);
        this.log.debug(`Rolled back L1 to L2 messages to L1 block ${messagesSyncPoint.l1BlockNumber}.`, {
          messagesSyncPoint,
        });
      }
    }

    // Retrieve and save messages in batches. Each batch is estimated to acommodate up to L2 'blockBatchSize' blocks,
    let searchStartBlock: bigint = 0n;
    let searchEndBlock: bigint = messagesSyncPoint.l1BlockNumber;

    let lastMessage: InboxMessage | undefined;
    let messageCount = 0;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);
      this.log.trace(`Retrieving L1 to L2 messages between L1 blocks ${searchStartBlock} and ${searchEndBlock}.`);
      const messages = await retrieveL1ToL2Messages(this.inbox.getContract(), searchStartBlock, searchEndBlock);
      this.log.verbose(
        `Retrieved ${messages.length} new L1 to L2 messages between L1 blocks ${searchStartBlock} and ${searchEndBlock}.`,
      );
      await this.store.addL1ToL2Messages(messages);
      for (const msg of messages) {
        this.log.debug(`Downloaded L1 to L2 message`, { ...msg, leaf: msg.leaf.toString() });
        lastMessage = msg;
        messageCount++;
      }
    } while (searchEndBlock < currentL1BlockNumber);

    // Log stats for messages retrieved (if any).
    if (messageCount > 0) {
      this.log.info(
        `Retrieved ${messageCount} new L1 to L2 messages up to message with index ${lastMessage?.index} for L2 block ${lastMessage?.l2BlockNumber}`,
        { lastMessage, messageCount },
      );
    }

    // Warn if the resulting rolling hash does not match the remote state we had retrieved.
    if (lastMessage && !lastMessage.rollingHash.equals(remoteMessagesState.messagesRollingHash)) {
      this.log.warn(`Last message retrieved rolling hash does not match remote state.`, {
        lastMessage,
        remoteMessagesState,
      });
    }
  }

  private async retrieveL1ToL2Message(leaf: Fr): Promise<InboxMessage | undefined> {
    const currentL1BlockNumber = await this.publicClient.getBlockNumber();
    let searchStartBlock: bigint = 0n;
    let searchEndBlock: bigint = this.l1constants.l1StartBlock - 1n;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);

      const message = await retrieveL1ToL2Message(this.inbox.getContract(), leaf, searchStartBlock, searchEndBlock);

      if (message) {
        return message;
      }
    } while (searchEndBlock < currentL1BlockNumber);

    return undefined;
  }

  private async rollbackL1ToL2Messages(localLastMessage: InboxMessage, messagesSyncPoint: L1BlockId) {
    // Slowly go back through our messages until we find the last common message.
    // We could query the logs in batch as an optimization, but the depth of the reorg should not be deep, and this
    // is a very rare case, so it's fine to query one log at a time.
    let commonMsg: undefined | InboxMessage;
    this.log.verbose(`Searching most recent common L1 to L2 message at or before index ${localLastMessage.index}`);
    for await (const msg of this.store.iterateL1ToL2Messages({ reverse: true, end: localLastMessage.index })) {
      const remoteMsg = await this.retrieveL1ToL2Message(msg.leaf);
      const logCtx = { remoteMsg, localMsg: msg };
      if (remoteMsg && remoteMsg.rollingHash.equals(msg.rollingHash)) {
        this.log.verbose(
          `Found most recent common L1 to L2 message at index ${msg.index} on L1 block ${msg.l1BlockNumber}`,
          logCtx,
        );
        commonMsg = remoteMsg;
        break;
      } else if (remoteMsg) {
        this.log.debug(`Local L1 to L2 message with index ${msg.index} has different rolling hash`, logCtx);
      } else {
        this.log.debug(`Local L1 to L2 message with index ${msg.index} not found on L1`, logCtx);
      }
    }

    // Delete everything after the common message we found.
    const lastGoodIndex = commonMsg?.index;
    this.log.warn(`Deleting all local L1 to L2 messages after index ${lastGoodIndex ?? 'undefined'}`);
    await this.store.removeL1ToL2Messages(lastGoodIndex !== undefined ? lastGoodIndex + 1n : 0n);

    // Update the syncpoint so the loop below reprocesses the changed messages. We go to the block before
    // the last common one, so we force reprocessing it, in case new messages were added on that same L1 block
    // after the last common message.
    const syncPointL1BlockNumber = commonMsg ? commonMsg.l1BlockNumber - 1n : this.l1constants.l1StartBlock;
    const syncPointL1BlockHash = await this.getL1BlockHash(syncPointL1BlockNumber);
    messagesSyncPoint = { l1BlockNumber: syncPointL1BlockNumber, l1BlockHash: syncPointL1BlockHash };
    await this.store.setMessageSynchedL1Block(messagesSyncPoint);
    return messagesSyncPoint;
  }

  private async getL1BlockHash(l1BlockNumber: bigint): Promise<Buffer32> {
    const block = await this.publicClient.getBlock({ blockNumber: l1BlockNumber, includeTransactions: false });
    if (!block) {
      throw new Error(`Missing L1 block ${l1BlockNumber}`);
    }
    return Buffer32.fromString(block.hash);
  }

  private async handleL2blocks(blocksSynchedTo: bigint, currentL1BlockNumber: bigint) {
    const localPendingBlockNumber = BigInt(await this.getBlockNumber());
    const [provenBlockNumber, provenArchive, pendingBlockNumber, pendingArchive, archiveForLocalPendingBlockNumber] =
      await this.rollup.status(localPendingBlockNumber, { blockNumber: currentL1BlockNumber });
    const rollupStatus = { provenBlockNumber, provenArchive, pendingBlockNumber, pendingArchive };
    this.log.trace(`Retrieved rollup status at current L1 block ${currentL1BlockNumber}.`, {
      localPendingBlockNumber,
      blocksSynchedTo,
      currentL1BlockNumber,
      archiveForLocalPendingBlockNumber,
      ...rollupStatus,
    });

    const updateProvenBlock = async () => {
      // Annoying edge case: if proven block is moved back to 0 due to a reorg at the beginning of the chain,
      // we need to set it to zero. This is an edge case because we dont have a block zero (initial block is one),
      // so localBlockForDestinationProvenBlockNumber would not be found below.
      if (provenBlockNumber === 0n) {
        const localProvenBlockNumber = await this.store.getProvenL2BlockNumber();
        if (localProvenBlockNumber !== Number(provenBlockNumber)) {
          await this.store.setProvenL2BlockNumber(Number(provenBlockNumber));
          this.log.info(`Rolled back proven chain to block ${provenBlockNumber}`, { provenBlockNumber });
        }
      }

      const localBlockForDestinationProvenBlockNumber = await this.getBlock(Number(provenBlockNumber));

      // Sanity check. I've hit what seems to be a state where the proven block is set to a value greater than the latest
      // synched block when requesting L2Tips from the archiver. This is the only place where the proven block is set.
      const synched = await this.store.getSynchedL2BlockNumber();
      if (localBlockForDestinationProvenBlockNumber && synched < localBlockForDestinationProvenBlockNumber?.number) {
        this.log.error(
          `Hit local block greater than last synched block: ${localBlockForDestinationProvenBlockNumber.number} > ${synched}`,
        );
      }

      this.log.trace(
        `Local block for remote proven block ${provenBlockNumber} is ${
          localBlockForDestinationProvenBlockNumber?.archive.root.toString() ?? 'undefined'
        }`,
      );

      if (
        localBlockForDestinationProvenBlockNumber &&
        provenArchive === localBlockForDestinationProvenBlockNumber.archive.root.toString()
      ) {
        const localProvenBlockNumber = await this.store.getProvenL2BlockNumber();
        if (localProvenBlockNumber !== Number(provenBlockNumber)) {
          await this.store.setProvenL2BlockNumber(Number(provenBlockNumber));
          this.log.info(`Updated proven chain to block ${provenBlockNumber}`, {
            provenBlockNumber,
          });
          const provenSlotNumber =
            localBlockForDestinationProvenBlockNumber.header.globalVariables.slotNumber.toBigInt();
          const provenEpochNumber = getEpochAtSlot(provenSlotNumber, this.l1constants);
          this.emit(L2BlockSourceEvents.L2BlockProven, {
            type: L2BlockSourceEvents.L2BlockProven,
            blockNumber: provenBlockNumber,
            slotNumber: provenSlotNumber,
            epochNumber: provenEpochNumber,
          });
        } else {
          this.log.trace(`Proven block ${provenBlockNumber} already stored.`);
        }
      }
      this.instrumentation.updateLastProvenBlock(Number(provenBlockNumber));
    };

    // This is an edge case that we only hit if there are no proposed blocks.
    // If we have 0 blocks locally and there are no blocks onchain there is nothing to do.
    const noBlocks = localPendingBlockNumber === 0n && pendingBlockNumber === 0n;
    if (noBlocks) {
      await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.debug(
        `No blocks to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}, no blocks on chain`,
      );
      return rollupStatus;
    }

    await updateProvenBlock();

    // Related to the L2 reorgs of the pending chain. We are only interested in actually addressing a reorg if there
    // are any state that could be impacted by it. If we have no blocks, there is no impact.
    if (localPendingBlockNumber > 0) {
      const localPendingBlock = await this.getBlock(Number(localPendingBlockNumber));
      if (localPendingBlock === undefined) {
        throw new Error(`Missing block ${localPendingBlockNumber}`);
      }

      const noBlockSinceLast = localPendingBlock && pendingArchive === localPendingBlock.archive.root.toString();
      if (noBlockSinceLast) {
        // We believe the following line causes a problem when we encounter L1 re-orgs.
        // Basically, by setting the synched L1 block number here, we are saying that we have
        // processed all blocks up to the current L1 block number and we will not attempt to retrieve logs from
        // this block again (or any blocks before).
        // However, in the re-org scenario, our L1 node is temporarily lying to us and we end up potentially missing blocks
        // We must only set this block number based on actually retrieved logs.
        // TODO(#8621): Tackle this properly when we handle L1 Re-orgs.
        // await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
        this.log.debug(`No blocks to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
        return rollupStatus;
      }

      const localPendingBlockInChain = archiveForLocalPendingBlockNumber === localPendingBlock.archive.root.toString();
      if (!localPendingBlockInChain) {
        // If our local pending block tip is not in the chain on L1 a "prune" must have happened
        // or the L1 have reorged.
        // In any case, we have to figure out how far into the past the action will take us.
        // For simplicity here, we will simply rewind until we end in a block that is also on the chain on L1.
        this.log.debug(`L2 prune has been detected.`);

        let tipAfterUnwind = localPendingBlockNumber;
        while (true) {
          const candidateBlock = await this.getBlock(Number(tipAfterUnwind));
          if (candidateBlock === undefined) {
            break;
          }

          const archiveAtContract = await this.rollup.archiveAt(BigInt(candidateBlock.number));

          if (archiveAtContract === candidateBlock.archive.root.toString()) {
            break;
          }
          tipAfterUnwind--;
        }

        const blocksToUnwind = localPendingBlockNumber - tipAfterUnwind;
        await this.store.unwindBlocks(Number(localPendingBlockNumber), Number(blocksToUnwind));

        this.log.warn(
          `Unwound ${count(blocksToUnwind, 'block')} from L2 block ${localPendingBlockNumber} ` +
            `due to mismatched block hashes at L1 block ${currentL1BlockNumber}. ` +
            `Updated L2 latest block is ${await this.getBlockNumber()}.`,
        );
      }
    }

    // Retrieve L2 blocks in batches. Each batch is estimated to accommodate up to L2 'blockBatchSize' blocks,
    // computed using the L2 block time vs the L1 block time.
    let searchStartBlock: bigint = blocksSynchedTo;
    let searchEndBlock: bigint = blocksSynchedTo;
    let lastRetrievedBlock: PublishedL2Block | undefined;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);

      this.log.trace(`Retrieving L2 blocks from L1 block ${searchStartBlock} to ${searchEndBlock}`);

      // TODO(md): Retrieve from blob sink then from consensus client, then from peers
      const retrievedBlocks = await retrieveBlocksFromRollup(
        this.rollup.getContract() as GetContractReturnType<typeof RollupAbi, ViemPublicClient>,
        this.publicClient,
        this.blobSinkClient,
        searchStartBlock, // TODO(palla/reorg): If the L2 reorg was due to an L1 reorg, we need to start search earlier
        searchEndBlock,
        this.log,
      );

      if (retrievedBlocks.length === 0) {
        // We are not calling `setBlockSynchedL1BlockNumber` because it may cause sync issues if based off infura.
        // See further details in earlier comments.
        this.log.trace(`Retrieved no new L2 blocks from L1 block ${searchStartBlock} to ${searchEndBlock}`);
        continue;
      }

      const lastProcessedL1BlockNumber = retrievedBlocks[retrievedBlocks.length - 1].l1.blockNumber;
      this.log.debug(
        `Retrieved ${retrievedBlocks.length} new L2 blocks between L1 blocks ${searchStartBlock} and ${searchEndBlock} with last processed L1 block ${lastProcessedL1BlockNumber}.`,
      );

      const publishedBlocks = retrievedBlocks.map(b => retrievedBlockToPublishedL2Block(b));

      for (const block of publishedBlocks) {
        this.log.debug(`Ingesting new L2 block ${block.block.number} with ${block.block.body.txEffects.length} txs`, {
          blockHash: block.block.hash(),
          l1BlockNumber: block.l1.blockNumber,
          ...block.block.header.globalVariables.toInspect(),
          ...block.block.getStats(),
        });
      }

      try {
        const [processDuration] = await elapsed(() => this.store.addBlocks(publishedBlocks));
        this.instrumentation.processNewBlocks(
          processDuration / publishedBlocks.length,
          publishedBlocks.map(b => b.block),
        );
      } catch (err) {
        if (err instanceof InitialBlockNumberNotSequentialError) {
          const { previousBlockNumber, newBlockNumber } = err;
          const previousBlock = previousBlockNumber
            ? await this.store.getPublishedBlock(previousBlockNumber)
            : undefined;
          const updatedL1SyncPoint = previousBlock?.l1.blockNumber ?? this.l1constants.l1StartBlock;
          await this.store.setBlockSynchedL1BlockNumber(updatedL1SyncPoint);
          this.log.warn(
            `Attempting to insert block ${newBlockNumber} with previous block ${previousBlockNumber}. Rolling back L1 sync point to ${updatedL1SyncPoint} to try and fetch the missing blocks.`,
            {
              previousBlockNumber,
              previousBlockHash: await previousBlock?.block.hash(),
              newBlockNumber,
              updatedL1SyncPoint,
            },
          );
        }
        throw err;
      }

      for (const block of publishedBlocks) {
        this.log.info(`Downloaded L2 block ${block.block.number}`, {
          blockHash: await block.block.hash(),
          blockNumber: block.block.number,
          txCount: block.block.body.txEffects.length,
          globalVariables: block.block.header.globalVariables.toInspect(),
          archiveRoot: block.block.archive.root.toString(),
          archiveNextLeafIndex: block.block.archive.nextAvailableLeafIndex,
        });
      }
      lastRetrievedBlock = publishedBlocks.at(-1) ?? lastRetrievedBlock;
    } while (searchEndBlock < currentL1BlockNumber);

    // Important that we update AFTER inserting the blocks.
    await updateProvenBlock();

    return { ...rollupStatus, lastRetrievedBlock };
  }

  private async checkForNewBlocksBeforeL1SyncPoint(
    status: {
      lastRetrievedBlock?: PublishedL2Block;
      pendingBlockNumber: bigint;
    },
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ) {
    const { lastRetrievedBlock, pendingBlockNumber } = status;
    // Compare the last L2 block we have (either retrieved in this round or loaded from store) with what the
    // rollup contract told us was the latest one (pinned at the currentL1BlockNumber).
    const latestLocalL2BlockNumber = lastRetrievedBlock?.block.number ?? (await this.store.getSynchedL2BlockNumber());
    if (latestLocalL2BlockNumber < pendingBlockNumber) {
      // Here we have consumed all logs until the `currentL1Block` we pinned at the beginning of the archiver loop,
      // but still havent reached the pending block according to the call to the rollup contract.
      // We suspect an L1 reorg that added blocks *behind* us. If that is the case, it must have happened between the
      // last L2 block we saw and the current one, so we reset the last synched L1 block number. In the edge case we
      // don't have one, we go back 2 L1 epochs, which is the deepest possible reorg (assuming Casper is working).
      const latestLocalL2Block =
        lastRetrievedBlock ??
        (latestLocalL2BlockNumber > 0
          ? await this.store.getPublishedBlocks(latestLocalL2BlockNumber, 1).then(([b]) => b)
          : undefined);
      const targetL1BlockNumber = latestLocalL2Block?.l1.blockNumber ?? maxBigint(currentL1BlockNumber - 64n, 0n);
      const latestLocalL2BlockArchive = latestLocalL2Block?.block.archive.root.toString();
      this.log.warn(
        `Failed to reach L2 block ${pendingBlockNumber} at ${currentL1BlockNumber} (latest is ${latestLocalL2BlockNumber}). ` +
          `Rolling back last synched L1 block number to ${targetL1BlockNumber}.`,
        {
          latestLocalL2BlockNumber,
          latestLocalL2BlockArchive,
          blocksSynchedTo,
          currentL1BlockNumber,
          ...status,
        },
      );
      await this.store.setBlockSynchedL1BlockNumber(targetL1BlockNumber);
    } else {
      this.log.trace(`No new blocks behind L1 sync point to retrieve.`, {
        latestLocalL2BlockNumber,
        pendingBlockNumber,
      });
    }
  }

  /** Resumes the archiver after a stop. */
  public resume() {
    if (!this.runningPromise) {
      throw new Error(`Archiver was never started`);
    }
    if (this.runningPromise.isRunning()) {
      this.log.warn(`Archiver already running`);
    }
    this.log.info(`Restarting archiver`);
    this.runningPromise.start();
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

  public backupTo(destPath: string): Promise<string> {
    return this.dataStore.backupTo(destPath);
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    return Promise.resolve(this.l1constants);
  }

  public getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.rollupAddress);
  }

  public getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.registryAddress);
  }

  public getL1BlockNumber(): bigint {
    const l1BlockNumber = this.l1BlockNumber;
    if (!l1BlockNumber) {
      throw new Error('L1 block number not yet available. Complete an initial sync first.');
    }
    return l1BlockNumber;
  }

  public getL1Timestamp(): Promise<bigint> {
    const l1Timestamp = this.l1Timestamp;
    if (!l1Timestamp) {
      throw new Error('L1 timestamp not yet available. Complete an initial sync first.');
    }
    return Promise.resolve(l1Timestamp);
  }

  public async getL2SlotNumber(): Promise<bigint> {
    return getSlotAtTimestamp(await this.getL1Timestamp(), this.l1constants);
  }

  public async getL2EpochNumber(): Promise<bigint> {
    return getEpochNumberAtTimestamp(await this.getL1Timestamp(), this.l1constants);
  }

  public async getBlocksForEpoch(epochNumber: bigint): Promise<L2Block[]> {
    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    const blocks: L2Block[] = [];

    // Walk the list of blocks backwards and filter by slots matching the requested epoch.
    // We'll typically ask for blocks for a very recent epoch, so we shouldn't need an index here.
    let block = await this.getBlock(await this.store.getSynchedL2BlockNumber());
    const slot = (b: L2Block) => b.header.globalVariables.slotNumber.toBigInt();
    while (block && slot(block) >= start) {
      if (slot(block) <= end) {
        blocks.push(block);
      }
      block = await this.getBlock(block.number - 1);
    }

    return blocks.reverse();
  }

  public async getBlockHeadersForEpoch(epochNumber: bigint): Promise<BlockHeader[]> {
    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    const blocks: BlockHeader[] = [];

    // Walk the list of blocks backwards and filter by slots matching the requested epoch.
    // We'll typically ask for blocks for a very recent epoch, so we shouldn't need an index here.
    let number = await this.store.getSynchedL2BlockNumber();
    let header = await this.getBlockHeader(number);
    const slot = (b: BlockHeader) => b.globalVariables.slotNumber.toBigInt();
    while (header && slot(header) >= start) {
      if (slot(header) <= end) {
        blocks.push(header);
      }
      header = await this.getBlockHeader(--number);
    }
    return blocks.reverse();
  }

  public async isEpochComplete(epochNumber: bigint): Promise<boolean> {
    // The epoch is complete if the current L2 block is the last one in the epoch (or later)
    const header = await this.getBlockHeader('latest');
    const slot = header?.globalVariables.slotNumber.toBigInt();
    const [_startSlot, endSlot] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    if (slot && slot >= endSlot) {
      return true;
    }

    // If we haven't run an initial sync, just return false.
    const l1Timestamp = this.l1Timestamp;
    if (l1Timestamp === undefined) {
      return false;
    }

    // If not, the epoch may also be complete if the L2 slot has passed without a block
    // We compute this based on the end timestamp for the given epoch and the timestamp of the last L1 block
    const [_startTimestamp, endTimestamp] = getTimestampRangeForEpoch(epochNumber, this.l1constants);

    // For this computation, we throw in a few extra seconds just for good measure,
    // since we know the next L1 block won't be mined within this range. Remember that
    // l1timestamp is the timestamp of the last l1 block we've seen, so this relies on
    // the fact that L1 won't mine two blocks within this time of each other.
    // TODO(palla/reorg): Is the above a safe assumption?
    const leeway = 1n;
    return l1Timestamp + leeway >= endTimestamp;
  }

  /** Returns whether the archiver has completed an initial sync run successfully. */
  public isInitialSyncComplete(): boolean {
    return this.initialSyncComplete;
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @param proven - If true, only return blocks that have been proven.
   * @returns The requested L2 blocks.
   */
  public getBlocks(from: number, limit: number, proven?: boolean): Promise<L2Block[]> {
    return this.getPublishedBlocks(from, limit, proven).then(blocks => blocks.map(b => b.block));
  }

  /** Equivalent to getBlocks but includes publish data. */
  public async getPublishedBlocks(from: number, limit: number, proven?: boolean): Promise<PublishedL2Block[]> {
    const limitWithProven = proven
      ? Math.min(limit, Math.max((await this.store.getProvenL2BlockNumber()) - from + 1, 0))
      : limit;
    return limitWithProven === 0 ? [] : await this.store.getPublishedBlocks(from, limitWithProven);
  }

  /**
   * Gets an l2 block.
   * @param number - The block number to return.
   * @returns The requested L2 block.
   */
  public async getBlock(number: number): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const publishedBlock = await this.store.getPublishedBlock(number);
    return publishedBlock?.block;
  }

  public async getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined> {
    if (number === 'latest') {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const headers = await this.store.getBlockHeaders(number, 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  public getTxEffect(txHash: TxHash) {
    return this.store.getTxEffect(txHash);
  }

  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.store.getSettledTxReceipt(txHash);
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  public getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]> {
    return this.store.getPrivateLogs(from, limit);
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    return this.store.getLogsByTags(tags);
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.store.getPublicLogs(filter);
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.store.getContractClassLogs(filter);
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
  public setProvenBlockNumber(blockNumber: number): Promise<void> {
    return this.store.setProvenL2BlockNumber(blockNumber);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.store.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.store.getBytecodeCommitment(id);
  }

  public async getContract(
    address: AztecAddress,
    blockNumber?: number,
  ): Promise<ContractInstanceWithAddress | undefined> {
    return this.store.getContractInstance(address, blockNumber ?? (await this.getBlockNumber()));
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
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.store.getL1ToL2MessageIndex(l1ToL2Message);
  }

  getContractClassIds(): Promise<Fr[]> {
    return this.store.getContractClassIds();
  }

  registerContractFunctionSignatures(address: AztecAddress, signatures: string[]): Promise<void> {
    return this.store.registerContractFunctionSignatures(address, signatures);
  }

  getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return this.store.getDebugFunctionName(address, selector);
  }

  async getL2Tips(): Promise<L2Tips> {
    const [latestBlockNumber, provenBlockNumber] = await Promise.all([
      this.getBlockNumber(),
      this.getProvenBlockNumber(),
    ] as const);

    // TODO(#13569): Compute proper finalized block number based on L1 finalized block.
    // We just force it 2 epochs worth of proven data for now.
    // NOTE: update end-to-end/src/e2e_epochs/epochs_empty_blocks.test.ts as that uses finalised blocks in computations
    const finalizedBlockNumber = Math.max(provenBlockNumber - this.l1constants.epochDuration * 2, 0);

    const [latestBlockHeader, provenBlockHeader, finalizedBlockHeader] = await Promise.all([
      latestBlockNumber > 0 ? this.getBlockHeader(latestBlockNumber) : undefined,
      provenBlockNumber > 0 ? this.getBlockHeader(provenBlockNumber) : undefined,
      finalizedBlockNumber > 0 ? this.getBlockHeader(finalizedBlockNumber) : undefined,
    ] as const);

    if (latestBlockNumber > 0 && !latestBlockHeader) {
      throw new Error(`Failed to retrieve latest block header for block ${latestBlockNumber}`);
    }

    if (provenBlockNumber > 0 && !provenBlockHeader) {
      throw new Error(
        `Failed to retrieve proven block header for block ${provenBlockNumber} (latest block is ${latestBlockNumber})`,
      );
    }

    if (finalizedBlockNumber > 0 && !finalizedBlockHeader) {
      throw new Error(
        `Failed to retrieve finalized block header for block ${finalizedBlockNumber} (latest block is ${latestBlockNumber})`,
      );
    }

    const latestBlockHeaderHash = await latestBlockHeader?.hash();
    const provenBlockHeaderHash = await provenBlockHeader?.hash();
    const finalizedBlockHeaderHash = await finalizedBlockHeader?.hash();

    return {
      latest: {
        number: latestBlockNumber,
        hash: latestBlockHeaderHash?.toString(),
      } as L2BlockId,
      proven: {
        number: provenBlockNumber,
        hash: provenBlockHeaderHash?.toString(),
      } as L2BlockId,
      finalized: {
        number: finalizedBlockNumber,
        hash: finalizedBlockHeaderHash?.toString(),
      } as L2BlockId,
    };
  }

  public async rollbackTo(targetL2BlockNumber: number): Promise<void> {
    const currentBlocks = await this.getL2Tips();
    const currentL2Block = currentBlocks.latest.number;
    const currentProvenBlock = currentBlocks.proven.number;
    // const currentFinalizedBlock = currentBlocks.finalized.number;

    if (targetL2BlockNumber >= currentL2Block) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} must be less than current L2 block ${currentL2Block}`);
    }
    const blocksToUnwind = currentL2Block - targetL2BlockNumber;
    const targetL2Block = await this.store.getPublishedBlock(targetL2BlockNumber);
    if (!targetL2Block) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} not found`);
    }
    const targetL1BlockNumber = targetL2Block.l1.blockNumber;
    const targetL1BlockHash = await this.getL1BlockHash(targetL1BlockNumber);
    this.log.info(`Unwinding ${blocksToUnwind} blocks from L2 block ${currentL2Block}`);
    await this.store.unwindBlocks(currentL2Block, blocksToUnwind);
    this.log.info(`Unwinding L1 to L2 messages to ${targetL2BlockNumber}`);
    await this.store.rollbackL1ToL2MessagesToL2Block(targetL2BlockNumber);
    this.log.info(`Setting L1 syncpoints to ${targetL1BlockNumber}`);
    await this.store.setBlockSynchedL1BlockNumber(targetL1BlockNumber);
    await this.store.setMessageSynchedL1Block({ l1BlockNumber: targetL1BlockNumber, l1BlockHash: targetL1BlockHash });
    if (targetL2BlockNumber < currentProvenBlock) {
      this.log.info(`Clearing proven L2 block number`);
      await this.store.setProvenL2BlockNumber(0);
    }
    // TODO(palla/reorg): Set the finalized block when we add support for it.
    // if (targetL2BlockNumber < currentFinalizedBlock) {
    //   this.log.info(`Clearing finalized L2 block number`);
    //   await this.store.setFinalizedL2BlockNumber(0);
    // }
  }
}

enum Operation {
  Store,
  Delete,
}

/**
 * A helper class that we use to deal with some of the logic needed when adding blocks.
 *
 * I would have preferred to not have this type. But it is useful for handling the logic that any
 * store would need to include otherwise while exposing fewer functions and logic directly to the archiver.
 */
export class ArchiverStoreHelper
  implements
    Omit<
      ArchiverDataStore,
      | 'addLogs'
      | 'deleteLogs'
      | 'addContractClasses'
      | 'deleteContractClasses'
      | 'addContractInstances'
      | 'deleteContractInstances'
      | 'addContractInstanceUpdates'
      | 'deleteContractInstanceUpdates'
      | 'addFunctions'
      | 'backupTo'
      | 'close'
      | 'transactionAsync'
    >
{
  #log = createLogger('archiver:block-helper');

  constructor(protected readonly store: ArchiverDataStore) {}

  /**
   * Extracts and stores contract classes out of ContractClassRegistered events emitted by the class registerer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  async #updateRegisteredContractClasses(allLogs: ContractClassLog[], blockNum: number, operation: Operation) {
    const contractClassRegisteredEvents = allLogs
      .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
      .map(log => ContractClassRegisteredEvent.fromLog(log));

    const contractClasses = await Promise.all(contractClassRegisteredEvents.map(e => e.toContractClassPublic()));
    if (contractClasses.length > 0) {
      contractClasses.forEach(c => this.#log.verbose(`${Operation[operation]} contract class ${c.id.toString()}`));
      if (operation == Operation.Store) {
        // TODO: Will probably want to create some worker threads to compute these bytecode commitments as they are expensive
        const commitments = await Promise.all(
          contractClasses.map(c => computePublicBytecodeCommitment(c.packedBytecode)),
        );
        return await this.store.addContractClasses(contractClasses, commitments, blockNum);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractClasses(contractClasses, blockNum);
      }
    }
    return true;
  }

  /**
   * Extracts and stores contract instances out of ContractInstanceDeployed events emitted by the canonical deployer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  async #updateDeployedContractInstances(allLogs: PrivateLog[], blockNum: number, operation: Operation) {
    const contractInstances = allLogs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log))
      .map(log => ContractInstanceDeployedEvent.fromLog(log))
      .map(e => e.toContractInstance());
    if (contractInstances.length > 0) {
      contractInstances.forEach(c =>
        this.#log.verbose(`${Operation[operation]} contract instance at ${c.address.toString()}`),
      );
      if (operation == Operation.Store) {
        return await this.store.addContractInstances(contractInstances, blockNum);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractInstances(contractInstances, blockNum);
      }
    }
    return true;
  }

  /**
   * Extracts and stores contract instances out of ContractInstanceDeployed events emitted by the canonical deployer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  async #updateUpdatedContractInstances(allLogs: PublicLog[], blockNum: number, operation: Operation) {
    const contractUpdates = allLogs
      .filter(log => ContractInstanceUpdatedEvent.isContractInstanceUpdatedEvent(log))
      .map(log => ContractInstanceUpdatedEvent.fromLog(log))
      .map(e => e.toContractInstanceUpdate());

    if (contractUpdates.length > 0) {
      contractUpdates.forEach(c =>
        this.#log.verbose(`${Operation[operation]} contract instance update at ${c.address.toString()}`),
      );
      if (operation == Operation.Store) {
        return await this.store.addContractInstanceUpdates(contractUpdates, blockNum);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractInstanceUpdates(contractUpdates, blockNum);
      }
    }
    return true;
  }

  /**
   * Stores the functions that were broadcasted individually
   *
   * @dev   Beware that there is not a delete variant of this, since they are added to contract classes
   *        and will be deleted as part of the class if needed.
   *
   * @param allLogs - The logs from the block
   * @param _blockNum - The block number
   * @returns
   */
  async #storeBroadcastedIndividualFunctions(allLogs: ContractClassLog[], _blockNum: number) {
    // Filter out private and utility function broadcast events
    const privateFnEvents = allLogs
      .filter(log => PrivateFunctionBroadcastedEvent.isPrivateFunctionBroadcastedEvent(log))
      .map(log => PrivateFunctionBroadcastedEvent.fromLog(log));
    const utilityFnEvents = allLogs
      .filter(log => UtilityFunctionBroadcastedEvent.isUtilityFunctionBroadcastedEvent(log))
      .map(log => UtilityFunctionBroadcastedEvent.fromLog(log));

    // Group all events by contract class id
    for (const [classIdString, classEvents] of Object.entries(
      groupBy([...privateFnEvents, ...utilityFnEvents], e => e.contractClassId.toString()),
    )) {
      const contractClassId = Fr.fromHexString(classIdString);
      const contractClass = await this.getContractClass(contractClassId);
      if (!contractClass) {
        this.#log.warn(`Skipping broadcasted functions as contract class ${contractClassId.toString()} was not found`);
        continue;
      }

      // Split private and utility functions, and filter out invalid ones
      const allFns = classEvents.map(e => e.toFunctionWithMembershipProof());
      const privateFns = allFns.filter(
        (fn): fn is ExecutablePrivateFunctionWithMembershipProof => 'utilityFunctionsTreeRoot' in fn,
      );
      const utilityFns = allFns.filter(
        (fn): fn is UtilityFunctionWithMembershipProof => 'privateFunctionsArtifactTreeRoot' in fn,
      );

      const privateFunctionsWithValidity = await Promise.all(
        privateFns.map(async fn => ({ fn, valid: await isValidPrivateFunctionMembershipProof(fn, contractClass) })),
      );
      const validPrivateFns = privateFunctionsWithValidity.filter(({ valid }) => valid).map(({ fn }) => fn);
      const utilityFunctionsWithValidity = await Promise.all(
        utilityFns.map(async fn => ({
          fn,
          valid: await isValidUtilityFunctionMembershipProof(fn, contractClass),
        })),
      );
      const validUtilityFns = utilityFunctionsWithValidity.filter(({ valid }) => valid).map(({ fn }) => fn);
      const validFnCount = validPrivateFns.length + validUtilityFns.length;
      if (validFnCount !== allFns.length) {
        this.#log.warn(`Skipping ${allFns.length - validFnCount} invalid functions`);
      }

      // Store the functions in the contract class in a single operation
      if (validFnCount > 0) {
        this.#log.verbose(`Storing ${validFnCount} functions for contract class ${contractClassId.toString()}`);
      }
      return await this.store.addFunctions(contractClassId, validPrivateFns, validUtilityFns);
    }
    return true;
  }

  public addBlocks(blocks: PublishedL2Block[]): Promise<boolean> {
    // Add the blocks to the store. Store will throw if the blocks are not in order, there are gaps,
    // or if the previous block is not in the store.
    return this.store.transactionAsync(async () => {
      await this.store.addBlocks(blocks);

      const opResults = await Promise.all([
        this.store.addLogs(blocks.map(block => block.block)),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...blocks.map(async block => {
          const contractClassLogs = block.block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
          // ContractInstanceDeployed event logs are broadcast in privateLogs.
          const privateLogs = block.block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
          const publicLogs = block.block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);
          return (
            await Promise.all([
              this.#updateRegisteredContractClasses(contractClassLogs, block.block.number, Operation.Store),
              this.#updateDeployedContractInstances(privateLogs, block.block.number, Operation.Store),
              this.#updateUpdatedContractInstances(publicLogs, block.block.number, Operation.Store),
              this.#storeBroadcastedIndividualFunctions(contractClassLogs, block.block.number),
            ])
          ).every(Boolean);
        }),
      ]);

      return opResults.every(Boolean);
    });
  }

  public async unwindBlocks(from: number, blocksToUnwind: number): Promise<boolean> {
    const last = await this.getSynchedL2BlockNumber();
    if (from != last) {
      throw new Error(`Cannot unwind blocks from block ${from} when the last block is ${last}`);
    }
    if (blocksToUnwind <= 0) {
      throw new Error(`Cannot unwind ${blocksToUnwind} blocks`);
    }

    // from - blocksToUnwind = the new head, so + 1 for what we need to remove
    const blocks = await this.getPublishedBlocks(from - blocksToUnwind + 1, blocksToUnwind);

    const opResults = await Promise.all([
      // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
      ...blocks.map(async block => {
        const contractClassLogs = block.block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
        // ContractInstanceDeployed event logs are broadcast in privateLogs.
        const privateLogs = block.block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
        const publicLogs = block.block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

        return (
          await Promise.all([
            this.#updateRegisteredContractClasses(contractClassLogs, block.block.number, Operation.Delete),
            this.#updateDeployedContractInstances(privateLogs, block.block.number, Operation.Delete),
            this.#updateUpdatedContractInstances(publicLogs, block.block.number, Operation.Delete),
          ])
        ).every(Boolean);
      }),

      this.store.deleteLogs(blocks.map(b => b.block)),
      this.store.unwindBlocks(from, blocksToUnwind),
    ]);

    return opResults.every(Boolean);
  }

  getPublishedBlocks(from: number, limit: number): Promise<PublishedL2Block[]> {
    return this.store.getPublishedBlocks(from, limit);
  }
  getPublishedBlock(number: number): Promise<PublishedL2Block | undefined> {
    return this.store.getPublishedBlock(number);
  }
  getBlockHeaders(from: number, limit: number): Promise<BlockHeader[]> {
    return this.store.getBlockHeaders(from, limit);
  }
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.store.getTxEffect(txHash);
  }
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.store.getSettledTxReceipt(txHash);
  }
  addL1ToL2Messages(messages: InboxMessage[]): Promise<void> {
    return this.store.addL1ToL2Messages(messages);
  }
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    return this.store.getL1ToL2Messages(blockNumber);
  }
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.store.getL1ToL2MessageIndex(l1ToL2Message);
  }
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]> {
    return this.store.getPrivateLogs(from, limit);
  }
  getLogsByTags(tags: Fr[], logsPerTag?: number): Promise<TxScopedL2Log[][]> {
    return this.store.getLogsByTags(tags, logsPerTag);
  }
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.store.getPublicLogs(filter);
  }
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.store.getContractClassLogs(filter);
  }
  getSynchedL2BlockNumber(): Promise<number> {
    return this.store.getSynchedL2BlockNumber();
  }
  getProvenL2BlockNumber(): Promise<number> {
    return this.store.getProvenL2BlockNumber();
  }
  setProvenL2BlockNumber(l2BlockNumber: number): Promise<void> {
    return this.store.setProvenL2BlockNumber(l2BlockNumber);
  }
  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    return this.store.setBlockSynchedL1BlockNumber(l1BlockNumber);
  }
  setMessageSynchedL1Block(l1Block: L1BlockId): Promise<void> {
    return this.store.setMessageSynchedL1Block(l1Block);
  }
  getSynchPoint(): Promise<ArchiverL1SynchPoint> {
    return this.store.getSynchPoint();
  }
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.store.getContractClass(id);
  }
  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    return this.store.getBytecodeCommitment(contractClassId);
  }
  getContractInstance(address: AztecAddress, blockNumber: number): Promise<ContractInstanceWithAddress | undefined> {
    return this.store.getContractInstance(address, blockNumber);
  }
  getContractClassIds(): Promise<Fr[]> {
    return this.store.getContractClassIds();
  }
  registerContractFunctionSignatures(address: AztecAddress, signatures: string[]): Promise<void> {
    return this.store.registerContractFunctionSignatures(address, signatures);
  }
  getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return this.store.getDebugFunctionName(address, selector);
  }
  getTotalL1ToL2MessageCount(): Promise<bigint> {
    return this.store.getTotalL1ToL2MessageCount();
  }
  estimateSize(): Promise<{ mappingSize: number; physicalFileSize: number; actualSize: number; numItems: number }> {
    return this.store.estimateSize();
  }
  rollbackL1ToL2MessagesToL2Block(targetBlockNumber: number | bigint): Promise<void> {
    return this.store.rollbackL1ToL2MessagesToL2Block(targetBlockNumber);
  }
  iterateL1ToL2Messages(range: CustomRange<bigint> = {}): AsyncIterableIterator<InboxMessage> {
    return this.store.iterateL1ToL2Messages(range);
  }
  removeL1ToL2Messages(startIndex: bigint): Promise<void> {
    return this.store.removeL1ToL2Messages(startIndex);
  }
  getLastL1ToL2Message(): Promise<InboxMessage | undefined> {
    return this.store.getLastL1ToL2Message();
  }
}
