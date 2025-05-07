import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { RollupContract, type ViemPublicClient, createEthereumChain } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise, makeLoggingErrorHandler } from '@aztec/foundation/running-promise';
import { count } from '@aztec/foundation/string';
import { elapsed } from '@aztec/foundation/timer';
import { InboxAbi } from '@aztec/l1-artifacts';
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
import type { InboxLeaf, L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { type BlockHeader, type IndexedTxEffect, TxHash, TxReceipt } from '@aztec/stdlib/tx';
import { Attributes, type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import groupBy from 'lodash.groupby';
import { type GetContractReturnType, createPublicClient, fallback, getContract, http } from 'viem';

import type { ArchiverDataStore, ArchiverL1SynchPoint } from './archiver_store.js';
import type { ArchiverConfig } from './config.js';
import { retrieveBlocksFromRollup, retrieveL1ToL2Messages } from './data_retrieval.js';
import { InitialBlockNumberNotSequentialError, NoBlobBodiesFoundError } from './errors.js';
import { ArchiverInstrumentation } from './instrumentation.js';
import type { DataRetrieval } from './structs/data_retrieval.js';
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
export class Archiver extends EventEmitter implements ArchiveSource, Traceable {
  /**
   * A promise in which we will be continually fetching new L2 blocks.
   */
  private runningPromise?: RunningPromise;

  private rollup: RollupContract;
  private inbox: GetContractReturnType<typeof InboxAbi, ViemPublicClient>;

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
    private readonly l1constants: L1RollupConstants,
    private readonly log: Logger = createLogger('archiver'),
  ) {
    super();

    this.tracer = instrumentation.tracer;
    this.store = new ArchiverStoreHelper(dataStore);

    this.rollup = new RollupContract(publicClient, l1Addresses.rollupAddress);

    this.inbox = getContract({
      address: l1Addresses.inboxAddress.toString(),
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

    const {
      aztecEpochDuration: epochDuration,
      aztecSlotDuration: slotDuration,
      ethereumSlotDuration,
      aztecProofSubmissionWindow: proofSubmissionWindow,
    } = config;

    const archiver = new Archiver(
      publicClient,
      config.l1Contracts,
      archiverStore,
      {
        pollingIntervalMs: config.archiverPollingIntervalMS ?? 10_000,
        batchSize: config.archiverBatchSize ?? 100,
      },
      deps.blobSinkClient,
      await ArchiverInstrumentation.new(deps.telemetry, () => archiverStore.estimateSize()),
      { l1StartBlock, l1GenesisTime, epochDuration, slotDuration, ethereumSlotDuration, proofSubmissionWindow },
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
    const { l1StartBlock } = this.l1constants;
    const { blocksSynchedTo = l1StartBlock, messagesSynchedTo = l1StartBlock } = await this.store.getSynchPoint();
    const currentL1BlockNumber = await this.publicClient.getBlockNumber();

    if (initialRun) {
      this.log.info(
        `Starting archiver sync to rollup contract ${this.l1Addresses.rollupAddress.toString()} from L1 block ${Math.min(
          Number(blocksSynchedTo),
          Number(messagesSynchedTo),
        )} to current L1 block ${currentL1BlockNumber}`,
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
    await this.handleL1ToL2Messages(messagesSynchedTo, currentL1BlockNumber);

    // Get L1 timestamp for the current block
    const currentL1Timestamp =
      !this.l1Timestamp || !this.l1BlockNumber || this.l1BlockNumber !== currentL1BlockNumber
        ? (await this.publicClient.getBlock({ blockNumber: currentL1BlockNumber })).timestamp
        : this.l1Timestamp;

    // ********** Events that are processed per L2 block **********
    if (currentL1BlockNumber > blocksSynchedTo) {
      // First we retrieve new L2 blocks
      const { provenBlockNumber } = await this.handleL2blocks(blocksSynchedTo, currentL1BlockNumber);
      // And then we prune the current epoch if it'd reorg on next submission.
      // Note that we don't do this before retrieving L2 blocks because we may need to retrieve
      // blocks from more than 2 epochs ago, so we want to make sure we have the latest view of
      // the chain locally before we start unwinding stuff. This can be optimized by figuring out
      // up to which point we're pruning, and then requesting L2 blocks up to that point only.
      await this.handleEpochPrune(provenBlockNumber, currentL1BlockNumber, currentL1Timestamp);
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

  /** Queries the rollup contract on whether a prune can be executed on the immediatenext L1 block. */
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
    const localPendingBlockNumber = BigInt(await this.getBlockNumber());
    const canPrune =
      localPendingBlockNumber > provenBlockNumber && (await this.canPrune(currentL1BlockNumber, currentL1Timestamp));

    if (canPrune) {
      const pruneFrom = provenBlockNumber + 1n;

      const header = await this.getBlockHeader(Number(pruneFrom));
      if (header === undefined) {
        throw new Error(`Missing block header ${pruneFrom}`);
      }

      const pruneFromSlotNumber = header.globalVariables.slotNumber.toBigInt();
      const pruneFromEpochNumber = getEpochAtSlot(pruneFromSlotNumber, this.l1constants);

      // Emit an event for listening services to react to the chain prune
      this.emit(L2BlockSourceEvents.L2PruneDetected, {
        type: L2BlockSourceEvents.L2PruneDetected,
        blockNumber: pruneFrom,
        slotNumber: pruneFromSlotNumber,
        epochNumber: pruneFromEpochNumber,
      });

      const blocksToUnwind = localPendingBlockNumber - provenBlockNumber;
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

  private async handleL1ToL2Messages(messagesSynchedTo: bigint, currentL1BlockNumber: bigint) {
    this.log.trace(`Handling L1 to L2 messages from ${messagesSynchedTo} to ${currentL1BlockNumber}.`);
    if (currentL1BlockNumber <= messagesSynchedTo) {
      return;
    }

    const localTotalMessageCount = await this.store.getTotalL1ToL2MessageCount();
    const destinationTotalMessageCount = await this.inbox.read.totalMessagesInserted({
      blockNumber: currentL1BlockNumber,
    });

    if (localTotalMessageCount === destinationTotalMessageCount) {
      await this.store.setMessageSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.trace(
        `Retrieved no new L1 to L2 messages between L1 blocks ${messagesSynchedTo + 1n} and ${currentL1BlockNumber}.`,
      );
      return;
    }

    // Retrieve messages in batches. Each batch is estimated to acommodate up to L2 'blockBatchSize' blocks,
    let searchStartBlock: bigint = messagesSynchedTo;
    let searchEndBlock: bigint = messagesSynchedTo;
    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);
      this.log.trace(`Retrieving L1 to L2 messages between L1 blocks ${searchStartBlock} and ${searchEndBlock}.`);
      const retrievedL1ToL2Messages = await retrieveL1ToL2Messages(this.inbox, searchStartBlock, searchEndBlock);
      this.log.verbose(
        `Retrieved ${retrievedL1ToL2Messages.retrievedData.length} new L1 to L2 messages between L1 blocks ${searchStartBlock} and ${searchEndBlock}.`,
      );
      await this.store.addL1ToL2Messages(retrievedL1ToL2Messages);
      for (const msg of retrievedL1ToL2Messages.retrievedData) {
        this.log.debug(`Downloaded L1 to L2 message`, { leaf: msg.leaf.toString(), index: msg.index });
      }
    } while (searchEndBlock < currentL1BlockNumber);
  }

  private async handleL2blocks(
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ): Promise<{ provenBlockNumber: bigint }> {
    const localPendingBlockNumber = BigInt(await this.getBlockNumber());
    const [provenBlockNumber, provenArchive, pendingBlockNumber, pendingArchive, archiveForLocalPendingBlockNumber] =
      await this.rollup.status(localPendingBlockNumber, { blockNumber: currentL1BlockNumber });

    const updateProvenBlock = async () => {
      const localBlockForDestinationProvenBlockNumber = await this.getBlock(Number(provenBlockNumber));

      // Sanity check. I've hit what seems to be a state where the proven block is set to a value greater than the latest
      // synched block when requesting L2Tips from the archiver. This is the only place where the proven block is set.
      const synched = await this.store.getSynchedL2BlockNumber();
      if (localBlockForDestinationProvenBlockNumber && synched < localBlockForDestinationProvenBlockNumber?.number) {
        this.log.error(
          `Hit local block greater than last synched block: ${localBlockForDestinationProvenBlockNumber.number} > ${synched}`,
        );
      }

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
      return { provenBlockNumber };
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
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8621): Tackle this properly when we handle L1 Re-orgs.
        //await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
        this.log.debug(`No blocks to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
        return { provenBlockNumber };
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

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);

      this.log.trace(`Retrieving L2 blocks from L1 block ${searchStartBlock} to ${searchEndBlock}`);

      // TODO(md): Retrieve from blob sink then from consensus client, then from peers
      const retrievedBlocks = await retrieveBlocksFromRollup(
        this.rollup.getContract(),
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

      for (const block of retrievedBlocks) {
        this.log.debug(`Ingesting new L2 block ${block.block.number} with ${block.block.body.txEffects.length} txs`, {
          blockHash: block.block.hash(),
          l1BlockNumber: block.l1.blockNumber,
          ...block.block.header.globalVariables.toInspect(),
          ...block.block.getStats(),
        });
      }

      try {
        const [processDuration] = await elapsed(() => this.store.addBlocks(retrievedBlocks));
        this.instrumentation.processNewBlocks(
          processDuration / retrievedBlocks.length,
          retrievedBlocks.map(b => b.block),
        );
      } catch (err) {
        if (err instanceof InitialBlockNumberNotSequentialError) {
          const { previousBlockNumber, newBlockNumber } = err;
          const previousBlock = previousBlockNumber ? await this.store.getBlock(previousBlockNumber) : undefined;
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

      for (const block of retrievedBlocks) {
        this.log.info(`Downloaded L2 block ${block.block.number}`, {
          blockHash: block.block.hash(),
          blockNumber: block.block.number,
          txCount: block.block.body.txEffects.length,
          globalVariables: block.block.header.globalVariables.toInspect(),
        });
      }
    } while (searchEndBlock < currentL1BlockNumber);

    // Important that we update AFTER inserting the blocks.
    await updateProvenBlock();

    return { provenBlockNumber };
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

  public getL1Timestamp(): bigint {
    const l1Timestamp = this.l1Timestamp;
    if (!l1Timestamp) {
      throw new Error('L1 timestamp not yet available. Complete an initial sync first.');
    }
    return l1Timestamp;
  }

  public getL2SlotNumber(): Promise<bigint> {
    return Promise.resolve(getSlotAtTimestamp(this.getL1Timestamp(), this.l1constants));
  }

  public getL2EpochNumber(): Promise<bigint> {
    return Promise.resolve(getEpochNumberAtTimestamp(this.getL1Timestamp(), this.l1constants));
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
    return limitWithProven === 0 ? [] : await this.store.getBlocks(from, limitWithProven);
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
    const publishedBlock = await this.store.getBlock(number);
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

    const [latestBlockHeader, provenBlockHeader] = await Promise.all([
      latestBlockNumber > 0 ? this.getBlockHeader(latestBlockNumber) : undefined,
      provenBlockNumber > 0 ? this.getBlockHeader(provenBlockNumber) : undefined,
    ] as const);

    if (latestBlockNumber > 0 && !latestBlockHeader) {
      throw new Error(`Failed to retrieve latest block header for block ${latestBlockNumber}`);
    }

    if (provenBlockNumber > 0 && !provenBlockHeader) {
      throw new Error(
        `Failed to retrieve proven block header for block ${provenBlockNumber} (latest block is ${latestBlockNumber})`,
      );
    }

    const latestBlockHeaderHash = await latestBlockHeader?.hash();
    const provenBlockHeaderHash = await provenBlockHeader?.hash();
    const finalizedBlockHeaderHash = await provenBlockHeader?.hash();
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
        number: provenBlockNumber,
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
    const [targetL2Block] = await this.store.getBlocks(targetL2BlockNumber, 1);
    if (!targetL2Block) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} not found`);
    }
    const targetL1BlockNumber = targetL2Block.l1.blockNumber;
    this.log.info(`Unwinding ${blocksToUnwind} blocks from L2 block ${currentL2Block}`);
    await this.store.unwindBlocks(currentL2Block, blocksToUnwind);
    this.log.info(`Unwinding L1 to L2 messages to ${targetL2BlockNumber}`);
    await this.store.rollbackL1ToL2MessagesToL2Block(targetL2BlockNumber, currentL2Block);
    this.log.info(`Setting L1 syncpoints to ${targetL1BlockNumber}`);
    await this.store.setBlockSynchedL1BlockNumber(targetL1BlockNumber);
    await this.store.setMessageSynchedL1BlockNumber(targetL1BlockNumber);
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
class ArchiverStoreHelper
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
    >
{
  #log = createLogger('archiver:block-helper');

  constructor(private readonly store: ArchiverDataStore) {}

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

  async addBlocks(blocks: PublishedL2Block[]): Promise<boolean> {
    // TODO(palla/reorg): Run all these ops in a single write transaction

    // Add the blocks to the store. Store will throw if the blocks are not in order, there are gaps,
    // or if the previous block is not in the store.
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
    const blocks = await this.getBlocks(from - blocksToUnwind + 1, blocksToUnwind);

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
  getBlock(number: number): Promise<PublishedL2Block | undefined> {
    return this.store.getBlock(number);
  }
  getBlocks(from: number, limit: number): Promise<PublishedL2Block[]> {
    return this.store.getBlocks(from, limit);
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
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
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
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    return this.store.getLogsByTags(tags);
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
  setMessageSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    return this.store.setMessageSynchedL1BlockNumber(l1BlockNumber);
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
  estimateSize(): Promise<{ mappingSize: number; actualSize: number; numItems: number }> {
    return this.store.estimateSize();
  }
  rollbackL1ToL2MessagesToL2Block(
    targetBlockNumber: number | bigint,
    currentBlockNumber: number | bigint,
  ): Promise<void> {
    return this.store.rollbackL1ToL2MessagesToL2Block(targetBlockNumber, currentBlockNumber);
  }
}
