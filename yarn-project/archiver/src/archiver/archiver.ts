import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_BLOCK_HEADER_HASH, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { BlockTagTooOldError, InboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { maxBigint } from '@aztec/foundation/bigint';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { merge, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { RunningPromise, makeLoggingErrorHandler } from '@aztec/foundation/running-promise';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer, elapsed } from '@aztec/foundation/timer';
import { isDefined } from '@aztec/foundation/types';
import type { CustomRange } from '@aztec/kv-store';
import { RollupAbi } from '@aztec/l1-artifacts';
import {
  ContractClassPublishedEvent,
  PrivateFunctionBroadcastedEvent,
  UtilityFunctionBroadcastedEvent,
} from '@aztec/protocol-contracts/class-registry';
import {
  ContractInstancePublishedEvent,
  ContractInstanceUpdatedEvent,
} from '@aztec/protocol-contracts/instance-registry';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ArchiverEmitter,
  type CheckpointId,
  CheckpointedL2Block,
  CommitteeAttestation,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  L2BlockNew,
  type L2BlockSink,
  type L2BlockSource,
  L2BlockSourceEvents,
  type L2Tips,
  PublishedL2Block,
} from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
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
import {
  ContractClassLog,
  type LogFilter,
  type PrivateLog,
  type PublicLog,
  type SiloedTag,
  Tag,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';
import { type L1ToL2MessageSource, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import { type BlockHeader, type IndexedTxEffect, TxHash, TxReceipt } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  execInSpan,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import groupBy from 'lodash.groupby';
import { type GetContractReturnType, type Hex, createPublicClient, fallback, http } from 'viem';

import type { ArchiverDataStore, ArchiverL1SynchPoint } from './archiver_store.js';
import type { ArchiverConfig } from './config.js';
import { InitialCheckpointNumberNotSequentialError, NoBlobBodiesFoundError } from './errors.js';
import { ArchiverInstrumentation } from './instrumentation.js';
import type { CheckpointData } from './kv_archiver_store/block_store.js';
import {
  retrieveCheckpointsFromRollup,
  retrieveL1ToL2Message,
  retrieveL1ToL2Messages,
  retrievedToPublishedCheckpoint,
} from './l1/data_retrieval.js';
import { validateAndLogTraceAvailability } from './l1/validate_trace.js';
import type { InboxMessage } from './structs/inbox_message.js';
import { type ValidateBlockResult, validateCheckpointAttestations } from './validation.js';

/**
 * Helper interface to combine all sources this archiver implementation provides.
 */
export type ArchiveSource = L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource;

/** Request to add a block to the archiver, queued for processing by the sync loop. */
type AddBlockRequest = {
  block: L2BlockNew;
  resolve: () => void;
  reject: (err: Error) => void;
};

export type ArchiverDeps = {
  telemetry?: TelemetryClient;
  blobClient: BlobClientInterface;
  epochCache?: EpochCache;
  dateProvider?: DateProvider;
};

function mapArchiverConfig(config: Partial<ArchiverConfig>) {
  return {
    pollingIntervalMs: config.archiverPollingIntervalMS,
    batchSize: config.archiverBatchSize,
    skipValidateCheckpointAttestations: config.skipValidateCheckpointAttestations,
    maxAllowedEthClientDriftSeconds: config.maxAllowedEthClientDriftSeconds,
    ethereumAllowNoDebugHosts: config.ethereumAllowNoDebugHosts,
  };
}

type RollupStatus = {
  provenCheckpointNumber: CheckpointNumber;
  provenArchive: Hex;
  pendingCheckpointNumber: CheckpointNumber;
  pendingArchive: Hex;
  validationResult: ValidateBlockResult | undefined;
  lastRetrievedCheckpoint?: PublishedCheckpoint;
  lastL1BlockWithCheckpoint?: bigint;
};

/**
 * Pulls checkpoints in a non-blocking manner and provides interface for their retrieval.
 * Responsible for handling robust L1 polling so that other components do not need to
 * concern themselves with it.
 */
export class Archiver
  extends (EventEmitter as new () => ArchiverEmitter)
  implements ArchiveSource, L2BlockSink, Traceable
{
  /** A loop in which we will be continually fetching new checkpoints. */
  private runningPromise: RunningPromise;

  private rollup: RollupContract;
  private inbox: InboxContract;

  private store: ArchiverStoreHelper;

  private l1BlockNumber: bigint | undefined;
  private l1Timestamp: bigint | undefined;
  private initialSyncComplete: boolean = false;
  private initialSyncPromise: PromiseWithResolvers<void>;

  /** Queue of blocks to be added to the store, processed by the sync loop. */
  private blockQueue: AddBlockRequest[] = [];

  public readonly tracer: Tracer;

  /**
   * Creates a new instance of the Archiver.
   * @param publicClient - A client for interacting with the Ethereum node.
   * @param debugClient - A client for interacting with the Ethereum node for debug/trace methods.
   * @param rollupAddress - Ethereum address of the rollup contract.
   * @param inboxAddress - Ethereum address of the inbox contract.
   * @param registryAddress - Ethereum address of the registry contract.
   * @param pollingIntervalMs - The interval for polling for L1 logs (in milliseconds).
   * @param store - An archiver data store for storage & retrieval of blocks, encrypted logs & contract data.
   * @param log - A logger.
   */
  constructor(
    private readonly publicClient: ViemPublicClient,
    private readonly debugClient: ViemPublicDebugClient,
    private readonly l1Addresses: Pick<
      L1ContractAddresses,
      'rollupAddress' | 'inboxAddress' | 'registryAddress' | 'governanceProposerAddress' | 'slashFactoryAddress'
    > & { slashingProposerAddress: EthAddress },
    readonly dataStore: ArchiverDataStore,
    private config: {
      pollingIntervalMs: number;
      batchSize: number;
      skipValidateCheckpointAttestations?: boolean;
      maxAllowedEthClientDriftSeconds: number;
      ethereumAllowNoDebugHosts?: boolean;
    },
    private readonly blobClient: BlobClientInterface,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly instrumentation: ArchiverInstrumentation,
    private readonly l1constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr },
    private readonly log: Logger = createLogger('archiver'),
  ) {
    super();

    this.tracer = instrumentation.tracer;
    this.store = new ArchiverStoreHelper(dataStore);

    this.rollup = new RollupContract(publicClient, l1Addresses.rollupAddress);
    this.inbox = new InboxContract(publicClient, l1Addresses.inboxAddress);
    this.initialSyncPromise = promiseWithResolvers();

    // Running promise starts with a small interval inbetween runs, so all iterations needed for the initial sync
    // are done as fast as possible. This then gets updated once the initial sync completes.
    this.runningPromise = new RunningPromise(
      () => this.sync(),
      this.log,
      this.config.pollingIntervalMs / 10,
      makeLoggingErrorHandler(this.log, NoBlobBodiesFoundError, BlockTagTooOldError),
    );
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
    deps: ArchiverDeps,
    blockUntilSynced = true,
  ): Promise<Archiver> {
    const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(config.l1RpcUrls.map(url => http(url, { batch: false }))),
      pollingInterval: config.viemPollingIntervalMS,
    });

    // Create debug client using debug RPC URLs if available, otherwise fall back to regular RPC URLs
    const debugRpcUrls = config.l1DebugRpcUrls.length > 0 ? config.l1DebugRpcUrls : config.l1RpcUrls;
    const debugClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(debugRpcUrls.map(url => http(url, { batch: false }))),
      pollingInterval: config.viemPollingIntervalMS,
    }) as ViemPublicDebugClient;

    const rollup = new RollupContract(publicClient, config.l1Contracts.rollupAddress);

    const [l1StartBlock, l1GenesisTime, proofSubmissionEpochs, genesisArchiveRoot, slashingProposerAddress] =
      await Promise.all([
        rollup.getL1StartBlock(),
        rollup.getL1GenesisTime(),
        rollup.getProofSubmissionEpochs(),
        rollup.getGenesisArchiveTreeRoot(),
        rollup.getSlashingProposerAddress(),
      ] as const);

    const l1StartBlockHash = await publicClient
      .getBlock({ blockNumber: l1StartBlock, includeTransactions: false })
      .then(block => Buffer32.fromString(block.hash));

    const { aztecEpochDuration: epochDuration, aztecSlotDuration: slotDuration, ethereumSlotDuration } = config;

    const l1Constants = {
      l1StartBlockHash,
      l1StartBlock,
      l1GenesisTime,
      epochDuration,
      slotDuration,
      ethereumSlotDuration,
      proofSubmissionEpochs: Number(proofSubmissionEpochs),
      genesisArchiveRoot: Fr.fromString(genesisArchiveRoot.toString()),
    };

    const opts = merge(
      {
        pollingIntervalMs: 10_000,
        batchSize: 100,
        maxAllowedEthClientDriftSeconds: 300,
        ethereumAllowNoDebugHosts: false,
      },
      mapArchiverConfig(config),
    );

    const epochCache = deps.epochCache ?? (await EpochCache.create(config.l1Contracts.rollupAddress, config, deps));
    const telemetry = deps.telemetry ?? getTelemetryClient();

    const archiver = new Archiver(
      publicClient,
      debugClient,
      { ...config.l1Contracts, slashingProposerAddress },
      archiverStore,
      opts,
      deps.blobClient,
      epochCache,
      deps.dateProvider ?? new DateProvider(),
      await ArchiverInstrumentation.new(telemetry, () => archiverStore.estimateSize()),
      l1Constants,
    );
    await archiver.start(blockUntilSynced);
    return archiver;
  }

  /** Updates archiver config */
  public updateConfig(newConfig: Partial<ArchiverConfig>) {
    this.config = merge(this.config, mapArchiverConfig(newConfig));
  }

  /**
   * Starts sync process.
   * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
   */
  public async start(blockUntilSynced: boolean): Promise<void> {
    if (this.runningPromise.isRunning()) {
      throw new Error('Archiver is already running');
    }

    await this.blobClient.testSources();
    await this.testEthereumNodeSynced();
    await validateAndLogTraceAvailability(this.debugClient, this.config.ethereumAllowNoDebugHosts ?? false);

    // Log initial state for the archiver
    const { l1StartBlock } = this.l1constants;
    const { blocksSynchedTo = l1StartBlock, messagesSynchedTo = l1StartBlock } = await this.store.getSynchPoint();
    const currentL2Checkpoint = await this.getSynchedCheckpointNumber();
    this.log.info(
      `Starting archiver sync to rollup contract ${this.l1Addresses.rollupAddress.toString()} from L1 block ${blocksSynchedTo} and L2 checkpoint ${currentL2Checkpoint}`,
      { blocksSynchedTo, messagesSynchedTo, currentL2Checkpoint },
    );

    // Start sync loop, and return the wait for initial sync if we are asked to block until synced
    this.runningPromise.start();
    if (blockUntilSynced) {
      return this.waitForInitialSync();
    }
  }

  public syncImmediate() {
    return this.runningPromise.trigger();
  }

  /**
   * Queues a block to be added to the archiver store and triggers processing.
   * The block will be processed by the sync loop.
   * Implements the L2BlockSink interface.
   * @param block - The L2 block to add.
   * @returns A promise that resolves when the block has been added to the store, or rejects on error.
   */
  public addBlock(block: L2BlockNew): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.blockQueue.push({ block, resolve, reject });
      this.log.debug(`Queued block ${block.number} for processing`);
      // Trigger an immediate sync, but don't wait for it - the promise resolves when the block is processed
      this.syncImmediate().catch(err => {
        this.log.error(`Sync immediate call failed: ${err}`);
      });
    });
  }

  /**
   * Processes all queued blocks, adding them to the store.
   * Called at the beginning of each sync iteration.
   * Blocks are processed in the order they were queued.
   */
  private async processQueuedBlocks(): Promise<void> {
    if (this.blockQueue.length === 0) {
      return;
    }

    // Take all blocks from the queue
    const queuedItems = this.blockQueue.splice(0, this.blockQueue.length);
    this.log.debug(`Processing ${queuedItems.length} queued block(s)`);

    // Process each block individually to properly resolve/reject each promise
    for (const { block, resolve, reject } of queuedItems) {
      try {
        await this.store.addBlocks([block]);
        this.log.debug(`Added block ${block.number} to store`);
        resolve();
      } catch (err: any) {
        this.log.error(`Failed to add block ${block.number} to store: ${err.message}`);
        reject(err);
      }
    }
  }

  public waitForInitialSync() {
    return this.initialSyncPromise.promise;
  }

  /** Checks that the ethereum node we are connected to has a latest timestamp no more than the allowed drift. Throw if not. */
  private async testEthereumNodeSynced() {
    const maxAllowedDelay = this.config.maxAllowedEthClientDriftSeconds;
    if (maxAllowedDelay === 0) {
      return;
    }
    const { number, timestamp: l1Timestamp } = await this.publicClient.getBlock({ includeTransactions: false });
    const currentTime = BigInt(this.dateProvider.nowInSeconds());
    if (currentTime - l1Timestamp > BigInt(maxAllowedDelay)) {
      throw new Error(
        `Ethereum node is out of sync (last block synced ${number} at ${l1Timestamp} vs current time ${currentTime})`,
      );
    }
  }

  @trackSpan('Archiver.syncFromL1')
  private async syncFromL1() {
    /**
     * We keep track of three "pointers" to L1 blocks:
     * 1. the last L1 block that published an L2 block
     * 2. the last L1 block that added L1 to L2 messages
     * 3. the last L1 block that cancelled L1 to L2 messages
     *
     * We do this to deal with L1 data providers that are eventually consistent (e.g. Infura).
     * We guard against seeing block X with no data at one point, and later, the provider processes the block and it has data.
     * The archiver will stay back, until there's data on L1 that will move the pointers forward.
     */
    const { l1StartBlock, l1StartBlockHash } = this.l1constants;
    const {
      blocksSynchedTo = l1StartBlock,
      messagesSynchedTo = { l1BlockNumber: l1StartBlock, l1BlockHash: l1StartBlockHash },
    } = await this.store.getSynchPoint();

    const currentL1Block = await this.publicClient.getBlock({ includeTransactions: false });
    const currentL1BlockNumber = currentL1Block.number;
    const currentL1BlockHash = Buffer32.fromString(currentL1Block.hash);

    this.log.trace(`Starting new archiver sync iteration`, {
      blocksSynchedTo,
      messagesSynchedTo,
      currentL1BlockNumber,
      currentL1BlockHash,
    });

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

    // Warn if the latest L1 block timestamp is too old
    const maxAllowedDelay = this.config.maxAllowedEthClientDriftSeconds;
    const now = this.dateProvider.nowInSeconds();
    if (maxAllowedDelay > 0 && Number(currentL1Timestamp) <= now - maxAllowedDelay) {
      this.log.warn(
        `Latest L1 block ${currentL1BlockNumber} timestamp ${currentL1Timestamp} is too old. Make sure your Ethereum node is synced.`,
        { currentL1BlockNumber, currentL1Timestamp, now, maxAllowedDelay },
      );
    }

    // ********** Events that are processed per checkpoint **********
    if (currentL1BlockNumber > blocksSynchedTo) {
      // First we retrieve new checkpoints and L2 blocks and store them in the DB. This will also update the
      // pending chain validation status, proven checkpoint number, and synched L1 block number.
      const rollupStatus = await this.handleCheckpoints(blocksSynchedTo, currentL1BlockNumber);
      // Then we prune the current epoch if it'd reorg on next submission.
      // Note that we don't do this before retrieving checkpoints because we may need to retrieve
      // checkpoints from more than 2 epochs ago, so we want to make sure we have the latest view of
      // the chain locally before we start unwinding stuff. This can be optimized by figuring out
      // up to which point we're pruning, and then requesting checkpoints up to that point only.
      const { rollupCanPrune } = await this.handleEpochPrune(
        rollupStatus.provenCheckpointNumber,
        currentL1BlockNumber,
        currentL1Timestamp,
      );

      // If the last checkpoint we processed had an invalid attestation, we manually advance the L1 syncpoint
      // past it, since otherwise we'll keep downloading it and reprocessing it on every iteration until
      // we get a valid checkpoint to advance the syncpoint.
      if (!rollupStatus.validationResult?.valid && rollupStatus.lastL1BlockWithCheckpoint !== undefined) {
        await this.store.setCheckpointSynchedL1BlockNumber(rollupStatus.lastL1BlockWithCheckpoint);
      }

      // And lastly we check if we are missing any checkpoints behind us due to a possible L1 reorg.
      // We only do this if rollup cant prune on the next submission. Otherwise we will end up
      // re-syncing the checkpoints we have just unwound above. We also dont do this if the last checkpoint is invalid,
      // since the archiver will rightfully refuse to sync up to it.
      if (!rollupCanPrune && rollupStatus.validationResult?.valid) {
        await this.checkForNewCheckpointsBeforeL1SyncPoint(rollupStatus, blocksSynchedTo, currentL1BlockNumber);
      }

      this.instrumentation.updateL1BlockHeight(currentL1BlockNumber);
    }

    // After syncing has completed, update the current l1 block number and timestamp,
    // otherwise we risk announcing to the world that we've synced to a given point,
    // but the corresponding blocks have not been processed (see #12631).
    this.l1Timestamp = currentL1Timestamp;
    this.l1BlockNumber = currentL1BlockNumber;

    // We resolve the initial sync only once we've caught up with the latest L1 block number (with 1 block grace)
    // so if the initial sync took too long, we still go for another iteration.
    if (!this.initialSyncComplete && currentL1BlockNumber + 1n >= (await this.publicClient.getBlockNumber())) {
      this.log.info(`Initial archiver sync to L1 block ${currentL1BlockNumber} complete`, {
        l1BlockNumber: currentL1BlockNumber,
        syncPoint: await this.store.getSynchPoint(),
        ...(await this.getL2Tips()),
      });
      this.runningPromise.setPollingIntervalMS(this.config.pollingIntervalMs);
      this.initialSyncComplete = true;
      this.initialSyncPromise.resolve();
    }
  }

  /**
   * Fetches logs from L1 contracts and processes them.
   */
  @trackSpan('Archiver.sync')
  private async sync() {
    // Process any queued blocks first, before doing L1 sync
    await this.processQueuedBlocks();
    // Now perform L1 sync
    await this.syncFromL1();
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

  /** Checks if there'd be a reorg for the next checkpoint submission and start pruning now. */
  @trackSpan('Archiver.handleEpochPrune')
  private async handleEpochPrune(
    provenCheckpointNumber: CheckpointNumber,
    currentL1BlockNumber: bigint,
    currentL1Timestamp: bigint,
  ) {
    const rollupCanPrune = await this.canPrune(currentL1BlockNumber, currentL1Timestamp);
    const localPendingCheckpointNumber = await this.getSynchedCheckpointNumber();
    const canPrune = localPendingCheckpointNumber > provenCheckpointNumber && rollupCanPrune;

    if (canPrune) {
      const timer = new Timer();
      const pruneFrom = CheckpointNumber(provenCheckpointNumber + 1);

      const header = await this.getCheckpointHeader(pruneFrom);
      if (header === undefined) {
        throw new Error(`Missing checkpoint header ${pruneFrom}`);
      }

      const pruneFromSlotNumber = header.slotNumber;
      const pruneFromEpochNumber: EpochNumber = getEpochAtSlot(pruneFromSlotNumber, this.l1constants);

      const checkpointsToUnwind = localPendingCheckpointNumber - provenCheckpointNumber;

      const checkpointPromises = Array.from({ length: checkpointsToUnwind })
        .fill(0)
        .map((_, i) => this.store.getCheckpointData(CheckpointNumber(i + pruneFrom)));
      const checkpoints = await Promise.all(checkpointPromises);

      const blockPromises = await Promise.all(
        checkpoints
          .filter(isDefined)
          .map(cp => this.store.getBlocksForCheckpoint(CheckpointNumber(cp.checkpointNumber))),
      );
      const newBlocks = blockPromises.filter(isDefined).flat();

      // Emit an event for listening services to react to the chain prune
      this.emit(L2BlockSourceEvents.L2PruneDetected, {
        type: L2BlockSourceEvents.L2PruneDetected,
        epochNumber: pruneFromEpochNumber,
        blocks: newBlocks,
      });

      this.log.debug(
        `L2 prune from ${provenCheckpointNumber + 1} to ${localPendingCheckpointNumber} will occur on next checkpoint submission.`,
      );
      await this.unwindCheckpoints(localPendingCheckpointNumber, checkpointsToUnwind);
      this.log.warn(
        `Unwound ${count(checkpointsToUnwind, 'checkpoint')} from checkpoint ${localPendingCheckpointNumber} ` +
          `to ${provenCheckpointNumber} due to predicted reorg at L1 block ${currentL1BlockNumber}. ` +
          `Updated latest checkpoint is ${await this.getSynchedCheckpointNumber()}.`,
      );
      this.instrumentation.processPrune(timer.ms());
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

  @trackSpan('Archiver.handleL1ToL2Messages')
  private async handleL1ToL2Messages(
    messagesSyncPoint: L1BlockId,
    currentL1BlockNumber: bigint,
    _currentL1BlockHash: Buffer32,
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
      this.log.trace(
        `No L1 to L2 messages to query between L1 blocks ${messagesSyncPoint.l1BlockNumber} and ${currentL1BlockNumber}.`,
      );
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
      const timer = new Timer();
      await this.store.addL1ToL2Messages(messages);
      const perMsg = timer.ms() / messages.length;
      this.instrumentation.processNewMessages(messages.length, perMsg);
      for (const msg of messages) {
        this.log.debug(`Downloaded L1 to L2 message`, { ...msg, leaf: msg.leaf.toString() });
        lastMessage = msg;
        messageCount++;
      }
    } while (searchEndBlock < currentL1BlockNumber);

    // Log stats for messages retrieved (if any).
    if (messageCount > 0) {
      this.log.info(
        `Retrieved ${messageCount} new L1 to L2 messages up to message with index ${lastMessage?.index} for checkpoint ${lastMessage?.checkpointNumber}`,
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

  @trackSpan('Archiver.handleCheckpoints')
  private async handleCheckpoints(blocksSynchedTo: bigint, currentL1BlockNumber: bigint): Promise<RollupStatus> {
    const localPendingCheckpointNumber = await this.getSynchedCheckpointNumber();
    const initialValidationResult: ValidateBlockResult | undefined = await this.store.getPendingChainValidationStatus();
    const {
      provenCheckpointNumber,
      provenArchive,
      pendingCheckpointNumber,
      pendingArchive,
      archiveOfMyCheckpoint: archiveForLocalPendingCheckpointNumber,
    } = await execInSpan(this.tracer, 'Archiver.getRollupStatus', () =>
      this.rollup.status(localPendingCheckpointNumber, { blockNumber: currentL1BlockNumber }),
    );
    const rollupStatus: RollupStatus = {
      provenCheckpointNumber,
      provenArchive: provenArchive.toString(),
      pendingCheckpointNumber,
      pendingArchive: pendingArchive.toString(),
      validationResult: initialValidationResult,
    };
    this.log.trace(`Retrieved rollup status at current L1 block ${currentL1BlockNumber}.`, {
      localPendingCheckpointNumber,
      blocksSynchedTo,
      currentL1BlockNumber,
      archiveForLocalPendingCheckpointNumber,
      ...rollupStatus,
    });

    const updateProvenCheckpoint = async () => {
      // Annoying edge case: if proven checkpoint is moved back to 0 due to a reorg at the beginning of the chain,
      // we need to set it to zero. This is an edge case because we dont have a checkpoint zero (initial checkpoint is one),
      // so localCheckpointForDestinationProvenCheckpointNumber would not be found below.
      if (provenCheckpointNumber === 0) {
        const localProvenCheckpointNumber = await this.getProvenCheckpointNumber();
        if (localProvenCheckpointNumber !== provenCheckpointNumber) {
          await this.setProvenCheckpointNumber(provenCheckpointNumber);
          this.log.info(`Rolled back proven chain to checkpoint ${provenCheckpointNumber}`, { provenCheckpointNumber });
        }
      }

      const localCheckpointForDestinationProvenCheckpointNumber =
        await this.store.getCheckpointData(provenCheckpointNumber);

      // Sanity check. I've hit what seems to be a state where the proven checkpoint is set to a value greater than the latest
      // synched checkpoint when requesting L2Tips from the archiver. This is the only place where the proven checkpoint is set.
      const synched = await this.getSynchedCheckpointNumber();
      if (
        localCheckpointForDestinationProvenCheckpointNumber &&
        synched < localCheckpointForDestinationProvenCheckpointNumber.checkpointNumber
      ) {
        this.log.error(
          `Hit local checkpoint greater than last synched checkpoint: ${localCheckpointForDestinationProvenCheckpointNumber.checkpointNumber} > ${synched}`,
        );
      }

      this.log.trace(
        `Local checkpoint for remote proven checkpoint ${provenCheckpointNumber} is ${
          localCheckpointForDestinationProvenCheckpointNumber?.archive.root.toString() ?? 'undefined'
        }`,
      );

      if (
        localCheckpointForDestinationProvenCheckpointNumber &&
        provenArchive.equals(localCheckpointForDestinationProvenCheckpointNumber.archive.root)
      ) {
        const localProvenCheckpointNumber = await this.getProvenCheckpointNumber();
        if (localProvenCheckpointNumber !== provenCheckpointNumber) {
          await this.setProvenCheckpointNumber(provenCheckpointNumber);
          this.log.info(`Updated proven chain to checkpoint ${provenCheckpointNumber}`, { provenCheckpointNumber });
          const provenSlotNumber = localCheckpointForDestinationProvenCheckpointNumber.header.slotNumber;
          const provenEpochNumber: EpochNumber = getEpochAtSlot(provenSlotNumber, this.l1constants);
          const lastBlockNumberInCheckpoint =
            localCheckpointForDestinationProvenCheckpointNumber.startBlock +
            localCheckpointForDestinationProvenCheckpointNumber.numBlocks -
            1;

          this.emit(L2BlockSourceEvents.L2BlockProven, {
            type: L2BlockSourceEvents.L2BlockProven,
            blockNumber: BlockNumber(lastBlockNumberInCheckpoint),
            slotNumber: provenSlotNumber,
            epochNumber: provenEpochNumber,
          });
          this.instrumentation.updateLastProvenBlock(lastBlockNumberInCheckpoint);
        } else {
          this.log.trace(`Proven checkpoint ${provenCheckpointNumber} already stored.`);
        }
      }
    };

    // This is an edge case that we only hit if there are no proposed checkpoints.
    // If we have 0 checkpoints locally and there are no checkpoints onchain there is nothing to do.
    const noCheckpoints = localPendingCheckpointNumber === 0 && pendingCheckpointNumber === 0;
    if (noCheckpoints) {
      await this.store.setCheckpointSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.debug(
        `No checkpoints to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}, no checkpoints on chain`,
      );
      return rollupStatus;
    }

    await updateProvenCheckpoint();

    // Related to the L2 reorgs of the pending chain. We are only interested in actually addressing a reorg if there
    // are any state that could be impacted by it. If we have no checkpoints, there is no impact.
    if (localPendingCheckpointNumber > 0) {
      const localPendingCheckpoint = await this.store.getCheckpointData(localPendingCheckpointNumber);
      if (localPendingCheckpoint === undefined) {
        throw new Error(`Missing checkpoint ${localPendingCheckpointNumber}`);
      }

      const localPendingArchiveRoot = localPendingCheckpoint.archive.root.toString();
      const noCheckpointSinceLast = localPendingCheckpoint && pendingArchive.toString() === localPendingArchiveRoot;
      if (noCheckpointSinceLast) {
        // We believe the following line causes a problem when we encounter L1 re-orgs.
        // Basically, by setting the synched L1 block number here, we are saying that we have
        // processed all checkpoints up to the current L1 block number and we will not attempt to retrieve logs from
        // this block again (or any blocks before).
        // However, in the re-org scenario, our L1 node is temporarily lying to us and we end up potentially missing checkpoints.
        // We must only set this block number based on actually retrieved logs.
        // TODO(#8621): Tackle this properly when we handle L1 Re-orgs.
        // await this.store.setBlockSynchedL1BlockNumber(currentL1BlockNumber);
        this.log.debug(`No checkpoints to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
        return rollupStatus;
      }

      const localPendingCheckpointInChain = archiveForLocalPendingCheckpointNumber.equals(
        localPendingCheckpoint.archive.root,
      );
      if (!localPendingCheckpointInChain) {
        // If our local pending checkpoint tip is not in the chain on L1 a "prune" must have happened
        // or the L1 have reorged.
        // In any case, we have to figure out how far into the past the action will take us.
        // For simplicity here, we will simply rewind until we end in a checkpoint that is also on the chain on L1.
        this.log.debug(
          `L2 prune has been detected due to local pending checkpoint ${localPendingCheckpointNumber} not in chain`,
          { localPendingCheckpointNumber, localPendingArchiveRoot, archiveForLocalPendingCheckpointNumber },
        );

        let tipAfterUnwind = localPendingCheckpointNumber;
        while (true) {
          const candidateCheckpoint = await this.store.getCheckpointData(tipAfterUnwind);
          if (candidateCheckpoint === undefined) {
            break;
          }

          const archiveAtContract = await this.rollup.archiveAt(candidateCheckpoint.checkpointNumber);
          this.log.trace(
            `Checking local checkpoint ${candidateCheckpoint.checkpointNumber} with archive ${candidateCheckpoint.archive.root}`,
            {
              archiveAtContract,
              archiveLocal: candidateCheckpoint.archive.root.toString(),
            },
          );
          if (archiveAtContract.equals(candidateCheckpoint.archive.root)) {
            break;
          }
          tipAfterUnwind--;
        }

        const checkpointsToUnwind = localPendingCheckpointNumber - tipAfterUnwind;
        await this.unwindCheckpoints(localPendingCheckpointNumber, checkpointsToUnwind);

        this.log.warn(
          `Unwound ${count(checkpointsToUnwind, 'checkpoint')} from checkpoint ${localPendingCheckpointNumber} ` +
            `due to mismatched checkpoint hashes at L1 block ${currentL1BlockNumber}. ` +
            `Updated L2 latest checkpoint is ${await this.getSynchedCheckpointNumber()}.`,
        );
      }
    }

    // Retrieve checkpoints in batches. Each batch is estimated to accommodate up to 'blockBatchSize' L1 blocks,
    // computed using the L2 block time vs the L1 block time.
    let searchStartBlock: bigint = blocksSynchedTo;
    let searchEndBlock: bigint = blocksSynchedTo;
    let lastRetrievedCheckpoint: PublishedCheckpoint | undefined;
    let lastL1BlockWithCheckpoint: bigint | undefined = undefined;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);

      this.log.trace(`Retrieving checkpoints from L1 block ${searchStartBlock} to ${searchEndBlock}`);

      // TODO(md): Retrieve from blob client then from consensus client, then from peers
      const retrievedCheckpoints = await execInSpan(this.tracer, 'Archiver.retrieveCheckpointsFromRollup', () =>
        retrieveCheckpointsFromRollup(
          this.rollup.getContract() as GetContractReturnType<typeof RollupAbi, ViemPublicClient>,
          this.publicClient,
          this.debugClient,
          this.blobClient,
          searchStartBlock, // TODO(palla/reorg): If the L2 reorg was due to an L1 reorg, we need to start search earlier
          searchEndBlock,
          this.l1Addresses,
          this.instrumentation,
          this.log,
          !this.initialSyncComplete, // isHistoricalSync
        ),
      );

      if (retrievedCheckpoints.length === 0) {
        // We are not calling `setBlockSynchedL1BlockNumber` because it may cause sync issues if based off infura.
        // See further details in earlier comments.
        this.log.trace(`Retrieved no new checkpoints from L1 block ${searchStartBlock} to ${searchEndBlock}`);
        continue;
      }

      this.log.debug(
        `Retrieved ${retrievedCheckpoints.length} new checkpoints between L1 blocks ${searchStartBlock} and ${searchEndBlock}`,
        {
          lastProcessedCheckpoint: retrievedCheckpoints[retrievedCheckpoints.length - 1].l1,
          searchStartBlock,
          searchEndBlock,
        },
      );

      const publishedCheckpoints = await Promise.all(retrievedCheckpoints.map(b => retrievedToPublishedCheckpoint(b)));
      const validCheckpoints: PublishedCheckpoint[] = [];

      for (const published of publishedCheckpoints) {
        const validationResult = this.config.skipValidateCheckpointAttestations
          ? { valid: true as const }
          : await validateCheckpointAttestations(published, this.epochCache, this.l1constants, this.log);

        // Only update the validation result if it has changed, so we can keep track of the first invalid checkpoint
        // in case there is a sequence of more than one invalid checkpoint, as we need to invalidate the first one.
        // There is an exception though: if a checkpoint is invalidated and replaced with another invalid checkpoint,
        // we need to update the validation result, since we need to be able to invalidate the new one.
        // See test 'chain progresses if an invalid checkpoint is invalidated with an invalid one' for more info.
        if (
          rollupStatus.validationResult?.valid !== validationResult.valid ||
          (!rollupStatus.validationResult.valid &&
            !validationResult.valid &&
            rollupStatus.validationResult.block.blockNumber === validationResult.block.blockNumber)
        ) {
          rollupStatus.validationResult = validationResult;
        }

        if (!validationResult.valid) {
          this.log.warn(`Skipping checkpoint ${published.checkpoint.number} due to invalid attestations`, {
            checkpointHash: published.checkpoint.hash(),
            l1BlockNumber: published.l1.blockNumber,
            ...pick(validationResult, 'reason'),
          });

          // Emit event for invalid block detection
          this.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, {
            type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
            validationResult,
          });

          // We keep consuming checkpoints if we find an invalid one, since we do not listen for CheckpointInvalidated events
          // We just pretend the invalid ones are not there and keep consuming the next checkpoints
          // Note that this breaks if the committee ever attests to a descendant of an invalid checkpoint
          continue;
        }

        // Check the inHash of the checkpoint against the l1->l2 messages.
        // The messages should've been synced up to the currentL1BlockNumber and must be available for the published
        // checkpoints we just retrieved.
        const l1ToL2Messages = await this.getL1ToL2Messages(published.checkpoint.number);
        const computedInHash = computeInHashFromL1ToL2Messages(l1ToL2Messages);
        const publishedInHash = published.checkpoint.header.inHash;
        if (!computedInHash.equals(publishedInHash)) {
          this.log.fatal(`Mismatch inHash for checkpoint ${published.checkpoint.number}`, {
            checkpointHash: published.checkpoint.hash(),
            l1BlockNumber: published.l1.blockNumber,
            computedInHash,
            publishedInHash,
          });
          // Throwing an error since this is most likely caused by a bug.
          throw new Error(
            `Mismatch inHash for checkpoint ${published.checkpoint.number}. Expected ${computedInHash} but got ${publishedInHash}`,
          );
        }

        validCheckpoints.push(published);
        this.log.debug(
          `Ingesting new checkpoint ${published.checkpoint.number} with ${published.checkpoint.blocks.length} blocks`,
          {
            checkpointHash: published.checkpoint.hash(),
            l1BlockNumber: published.l1.blockNumber,
            ...published.checkpoint.header.toInspect(),
            blocks: published.checkpoint.blocks.map(b => b.getStats()),
          },
        );
      }

      try {
        const updatedValidationResult =
          rollupStatus.validationResult === initialValidationResult ? undefined : rollupStatus.validationResult;
        const [processDuration] = await elapsed(() =>
          execInSpan(this.tracer, 'Archiver.addCheckpoints', () =>
            this.addCheckpoints(validCheckpoints, updatedValidationResult),
          ),
        );
        this.instrumentation.processNewBlocks(
          processDuration / validCheckpoints.length,
          validCheckpoints.flatMap(c => c.checkpoint.blocks),
        );
      } catch (err) {
        if (err instanceof InitialCheckpointNumberNotSequentialError) {
          const { previousCheckpointNumber, newCheckpointNumber } = err;
          const previousCheckpoint = previousCheckpointNumber
            ? await this.store.getCheckpointData(CheckpointNumber(previousCheckpointNumber))
            : undefined;
          const updatedL1SyncPoint = previousCheckpoint?.l1.blockNumber ?? this.l1constants.l1StartBlock;
          await this.store.setBlockSynchedL1BlockNumber(updatedL1SyncPoint);
          this.log.warn(
            `Attempting to insert checkpoint ${newCheckpointNumber} with previous block ${previousCheckpointNumber}. Rolling back L1 sync point to ${updatedL1SyncPoint} to try and fetch the missing blocks.`,
            {
              previousCheckpointNumber,
              newCheckpointNumber,
              updatedL1SyncPoint,
            },
          );
        }
        throw err;
      }

      for (const checkpoint of validCheckpoints) {
        this.log.info(`Downloaded checkpoint ${checkpoint.checkpoint.number}`, {
          checkpointHash: checkpoint.checkpoint.hash(),
          checkpointNumber: checkpoint.checkpoint.number,
          blockCount: checkpoint.checkpoint.blocks.length,
          txCount: checkpoint.checkpoint.blocks.reduce((acc, b) => acc + b.body.txEffects.length, 0),
          header: checkpoint.checkpoint.header.toInspect(),
          archiveRoot: checkpoint.checkpoint.archive.root.toString(),
          archiveNextLeafIndex: checkpoint.checkpoint.archive.nextAvailableLeafIndex,
        });
      }
      lastRetrievedCheckpoint = validCheckpoints.at(-1) ?? lastRetrievedCheckpoint;
      lastL1BlockWithCheckpoint = retrievedCheckpoints.at(-1)?.l1.blockNumber ?? lastL1BlockWithCheckpoint;
    } while (searchEndBlock < currentL1BlockNumber);

    // Important that we update AFTER inserting the blocks.
    await updateProvenCheckpoint();

    return { ...rollupStatus, lastRetrievedCheckpoint, lastL1BlockWithCheckpoint };
  }

  private async checkForNewCheckpointsBeforeL1SyncPoint(
    status: RollupStatus,
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ) {
    const { lastRetrievedCheckpoint, pendingCheckpointNumber } = status;
    // Compare the last checkpoint we have (either retrieved in this round or loaded from store) with what the
    // rollup contract told us was the latest one (pinned at the currentL1BlockNumber).
    const latestLocalCheckpointNumber =
      lastRetrievedCheckpoint?.checkpoint.number ?? (await this.getSynchedCheckpointNumber());
    if (latestLocalCheckpointNumber < pendingCheckpointNumber) {
      // Here we have consumed all logs until the `currentL1Block` we pinned at the beginning of the archiver loop,
      // but still haven't reached the pending checkpoint according to the call to the rollup contract.
      // We suspect an L1 reorg that added checkpoints *behind* us. If that is the case, it must have happened between
      // the last checkpoint we saw and the current one, so we reset the last synched L1 block number. In the edge case
      // we don't have one, we go back 2 L1 epochs, which is the deepest possible reorg (assuming Casper is working).
      let latestLocalCheckpointArchive: string | undefined = undefined;
      let targetL1BlockNumber = maxBigint(currentL1BlockNumber - 64n, 0n);
      if (lastRetrievedCheckpoint) {
        latestLocalCheckpointArchive = lastRetrievedCheckpoint.checkpoint.archive.root.toString();
        targetL1BlockNumber = lastRetrievedCheckpoint.l1.blockNumber;
      } else if (latestLocalCheckpointNumber > 0) {
        const checkpoint = await this.store.getRangeOfCheckpoints(latestLocalCheckpointNumber, 1).then(([c]) => c);
        latestLocalCheckpointArchive = checkpoint.archive.root.toString();
        targetL1BlockNumber = checkpoint.l1.blockNumber;
      }
      this.log.warn(
        `Failed to reach checkpoint ${pendingCheckpointNumber} at ${currentL1BlockNumber} (latest is ${latestLocalCheckpointNumber}). ` +
          `Rolling back last synched L1 block number to ${targetL1BlockNumber}.`,
        {
          latestLocalCheckpointNumber,
          latestLocalCheckpointArchive,
          blocksSynchedTo,
          currentL1BlockNumber,
          ...status,
        },
      );
      await this.store.setBlockSynchedL1BlockNumber(targetL1BlockNumber);
    } else {
      this.log.trace(`No new checkpoints behind L1 sync point to retrieve.`, {
        latestLocalCheckpointNumber,
        pendingCheckpointNumber,
      });
    }
  }

  /** Resumes the archiver after a stop. */
  public resume() {
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
    await this.runningPromise.stop();

    this.log.info('Stopped.');
    return Promise.resolve();
  }

  public backupTo(destPath: string): Promise<string> {
    return this.dataStore.backupTo(destPath);
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    return Promise.resolve(this.l1constants);
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: this.l1constants.genesisArchiveRoot });
  }

  public getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.rollupAddress);
  }

  public getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.registryAddress);
  }

  public getL1BlockNumber(): bigint | undefined {
    return this.l1BlockNumber;
  }

  public getL1Timestamp(): Promise<bigint | undefined> {
    return Promise.resolve(this.l1Timestamp);
  }

  public getL2SlotNumber(): Promise<SlotNumber | undefined> {
    return Promise.resolve(
      this.l1Timestamp === undefined ? undefined : getSlotAtTimestamp(this.l1Timestamp, this.l1constants),
    );
  }

  public getL2EpochNumber(): Promise<EpochNumber | undefined> {
    return Promise.resolve(
      this.l1Timestamp === undefined ? undefined : getEpochNumberAtTimestamp(this.l1Timestamp, this.l1constants),
    );
  }

  public async getBlocksForEpoch(epochNumber: EpochNumber): Promise<L2Block[]> {
    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    const blocks: L2Block[] = [];

    // Walk the list of checkpoints backwards and filter by slots matching the requested epoch.
    // We'll typically ask for checkpoints for a very recent epoch, so we shouldn't need an index here.
    let checkpoint = await this.store.getCheckpointData(await this.store.getSynchedCheckpointNumber());
    const slot = (b: CheckpointData) => b.header.slotNumber;
    while (checkpoint && slot(checkpoint) >= start) {
      if (slot(checkpoint) <= end) {
        // push the blocks on backwards
        const endBlock = checkpoint.startBlock + checkpoint.numBlocks - 1;
        for (let i = endBlock; i >= checkpoint.startBlock; i--) {
          const block = await this.getBlock(BlockNumber(i));
          if (block) {
            blocks.push(block);
          }
        }
      }
      checkpoint = await this.store.getCheckpointData(CheckpointNumber(checkpoint.checkpointNumber - 1));
    }

    return blocks.reverse();
  }

  public async getBlockHeadersForEpoch(epochNumber: EpochNumber): Promise<BlockHeader[]> {
    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    const blocks: BlockHeader[] = [];

    // Walk the list of checkpoints backwards and filter by slots matching the requested epoch.
    // We'll typically ask for checkpoints for a very recent epoch, so we shouldn't need an index here.
    let checkpoint = await this.store.getCheckpointData(await this.store.getSynchedCheckpointNumber());
    const slot = (b: CheckpointData) => b.header.slotNumber;
    while (checkpoint && slot(checkpoint) >= start) {
      if (slot(checkpoint) <= end) {
        // push the blocks on backwards
        const endBlock = checkpoint.startBlock + checkpoint.numBlocks - 1;
        for (let i = endBlock; i >= checkpoint.startBlock; i--) {
          const block = await this.getBlockHeader(BlockNumber(i));
          if (block) {
            blocks.push(block);
          }
        }
      }
      checkpoint = await this.store.getCheckpointData(CheckpointNumber(checkpoint.checkpointNumber - 1));
    }
    return blocks.reverse();
  }

  public async isEpochComplete(epochNumber: EpochNumber): Promise<boolean> {
    // The epoch is complete if the current L2 block is the last one in the epoch (or later)
    const header = await this.getBlockHeader('latest');
    const slot = header ? header.globalVariables.slotNumber : undefined;
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

  public async getCheckpointHeader(number: CheckpointNumber | 'latest'): Promise<CheckpointHeader | undefined> {
    if (number === 'latest') {
      number = await this.getSynchedCheckpointNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const checkpoint = await this.store.getCheckpointData(number);
    if (!checkpoint) {
      return undefined;
    }
    return checkpoint.header;
  }

  public getCheckpointNumber(): Promise<CheckpointNumber> {
    return this.getSynchedCheckpointNumber();
  }

  public getSynchedCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getSynchedCheckpointNumber();
  }

  public getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getProvenCheckpointNumber();
  }

  public setProvenCheckpointNumber(checkpointNumber: CheckpointNumber): Promise<void> {
    return this.store.setProvenCheckpointNumber(checkpointNumber);
  }

  public unwindCheckpoints(from: CheckpointNumber, checkpointsToUnwind: number): Promise<boolean> {
    return this.store.unwindCheckpoints(from, checkpointsToUnwind);
  }

  public async getLastBlockNumberInCheckpoint(checkpointNumber: CheckpointNumber): Promise<BlockNumber | undefined> {
    const checkpointData = await this.store.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      return undefined;
    }
    return BlockNumber(checkpointData.startBlock + checkpointData.numBlocks - 1);
  }

  public addCheckpoints(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateBlockResult,
  ): Promise<boolean> {
    return this.store.addCheckpoints(checkpoints, pendingChainValidationStatus);
  }

  public getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined> {
    return this.store.getBlockHeaderByHash(blockHash);
  }

  public getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return this.store.getBlockHeaderByArchive(archive);
  }

  /**
   * Gets an l2 block.
   * @param number - The block number to return.
   * @returns The requested L2 block.
   */
  public async getL2BlockNew(number: BlockNumber): Promise<L2BlockNew | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const publishedBlock = await this.store.store.getBlock(number);
    return publishedBlock;
  }

  public async getL2BlocksNew(from: BlockNumber, limit: number, proven?: boolean): Promise<L2BlockNew[]> {
    const blocks = await this.store.store.getBlocks(from, limit);

    if (proven === true) {
      const provenBlockNumber = await this.store.getProvenBlockNumber();
      return blocks.filter(b => b.number <= provenBlockNumber);
    }
    return blocks;
  }

  public async getBlockHeader(number: BlockNumber | 'latest'): Promise<BlockHeader | undefined> {
    if (number === 'latest') {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const headers = await this.store.getBlockHeaders(number, 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlock(number);
  }

  public async getCheckpointedBlocks(
    from: BlockNumber,
    limit: number,
    proven?: boolean,
  ): Promise<CheckpointedL2Block[]> {
    const blocks = await this.store.store.getCheckpointedBlocks(from, limit);

    if (proven === true) {
      const provenBlockNumber = await this.store.getProvenBlockNumber();
      return blocks.filter(b => b.block.number <= provenBlockNumber);
    }
    return blocks;
  }

  getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlockByHash(blockHash);
  }

  getProvenBlockNumber(): Promise<BlockNumber> {
    return this.store.getProvenBlockNumber();
  }
  getCheckpointedBlockNumber(): Promise<BlockNumber> {
    return this.store.getCheckpointedL2BlockNumber();
  }
  getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlockByArchive(archive);
  }

  public getTxEffect(txHash: TxHash) {
    return this.store.getTxEffect(txHash);
  }

  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.store.getSettledTxReceipt(txHash);
  }

  getPrivateLogsByTags(tags: SiloedTag[]): Promise<TxScopedL2Log[][]> {
    return this.store.getPrivateLogsByTags(tags);
  }

  getPublicLogsByTagsFromContract(contractAddress: AztecAddress, tags: Tag[]): Promise<TxScopedL2Log[][]> {
    return this.store.getPublicLogsByTagsFromContract(contractAddress, tags);
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
   * This includes both checkpointed and uncheckpointed blocks.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  public getBlockNumber(): Promise<BlockNumber> {
    return this.store.getLatestBlockNumber();
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.store.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.store.getBytecodeCommitment(id);
  }

  public async getContract(
    address: AztecAddress,
    maybeTimestamp?: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    let timestamp;
    if (maybeTimestamp === undefined) {
      const latestBlockHeader = await this.getBlockHeader('latest');
      // If we get undefined block header, it means that the archiver has not yet synced any block so we default to 0.
      timestamp = latestBlockHeader ? latestBlockHeader.globalVariables.timestamp : 0n;
    } else {
      timestamp = maybeTimestamp;
    }

    return this.store.getContractInstance(address, timestamp);
  }

  /**
   * Gets L1 to L2 message (to be) included in a given checkpoint.
   * @param checkpointNumber - Checkpoint number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.store.getL1ToL2Messages(checkpointNumber);
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

  registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.store.registerContractFunctionSignatures(signatures);
  }

  getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return this.store.getDebugFunctionName(address, selector);
  }

  async getPendingChainValidationStatus(): Promise<ValidateBlockResult> {
    return (await this.store.getPendingChainValidationStatus()) ?? { valid: true };
  }

  isPendingChainInvalid(): Promise<boolean> {
    return this.getPendingChainValidationStatus().then(status => !status.valid);
  }

  async getL2Tips(): Promise<L2Tips> {
    const [latestBlockNumber, provenBlockNumber, checkpointedBlockNumber] = await Promise.all([
      this.getBlockNumber(),
      this.getProvenBlockNumber(),
      this.getCheckpointedBlockNumber(),
    ] as const);

    // TODO(#13569): Compute proper finalized block number based on L1 finalized block.
    // We just force it 2 epochs worth of proven data for now.
    // NOTE: update end-to-end/src/e2e_epochs/epochs_empty_blocks.test.ts as that uses finalized blocks in computations
    const finalizedBlockNumber = BlockNumber(Math.max(provenBlockNumber - this.l1constants.epochDuration * 2, 0));

    const beforeInitialblockNumber = BlockNumber(INITIAL_L2_BLOCK_NUM - 1);

    // Get the latest block header and checkpointed blocks for proven, finalised and checkpointed blocks
    const [latestBlockHeader, provenCheckpointedBlock, finalizedCheckpointedBlock, checkpointedBlock] =
      await Promise.all([
        latestBlockNumber > beforeInitialblockNumber ? this.getBlockHeader(latestBlockNumber) : undefined,
        provenBlockNumber > beforeInitialblockNumber ? this.getCheckpointedBlock(provenBlockNumber) : undefined,
        finalizedBlockNumber > beforeInitialblockNumber ? this.getCheckpointedBlock(finalizedBlockNumber) : undefined,
        checkpointedBlockNumber > beforeInitialblockNumber
          ? this.getCheckpointedBlock(checkpointedBlockNumber)
          : undefined,
      ] as const);

    if (latestBlockNumber > beforeInitialblockNumber && !latestBlockHeader) {
      throw new Error(`Failed to retrieve latest block header for block ${latestBlockNumber}`);
    }

    // Checkpointed blocks must exist for proven, finalized and checkpointed tips if they are beyond the initial block number.
    if (checkpointedBlockNumber > beforeInitialblockNumber && !checkpointedBlock?.block.header) {
      throw new Error(
        `Failed to retrieve checkpointed block header for block ${checkpointedBlockNumber} (latest block is ${latestBlockNumber})`,
      );
    }

    if (provenBlockNumber > beforeInitialblockNumber && !provenCheckpointedBlock?.block.header) {
      throw new Error(
        `Failed to retrieve proven checkpointed for block ${provenBlockNumber} (latest block is ${latestBlockNumber})`,
      );
    }

    if (finalizedBlockNumber > beforeInitialblockNumber && !finalizedCheckpointedBlock?.block.header) {
      throw new Error(
        `Failed to retrieve finalized block header for block ${finalizedBlockNumber} (latest block is ${latestBlockNumber})`,
      );
    }

    const latestBlockHeaderHash = (await latestBlockHeader?.hash()) ?? GENESIS_BLOCK_HEADER_HASH;
    const provenBlockHeaderHash = (await provenCheckpointedBlock?.block.header?.hash()) ?? GENESIS_BLOCK_HEADER_HASH;
    const finalizedBlockHeaderHash =
      (await finalizedCheckpointedBlock?.block.header?.hash()) ?? GENESIS_BLOCK_HEADER_HASH;
    const checkpointedBlockHeaderHash = (await checkpointedBlock?.block.header?.hash()) ?? GENESIS_BLOCK_HEADER_HASH;

    // Now attempt to retrieve checkpoints for proven, finalised and checkpointed blocks
    const [[provenBlockCheckpoint], [finalizedBlockCheckpoint], [checkpointedBlockCheckpoint]] = await Promise.all([
      provenCheckpointedBlock !== undefined
        ? await this.getPublishedCheckpoints(provenCheckpointedBlock?.checkpointNumber, 1)
        : [undefined],
      finalizedCheckpointedBlock !== undefined
        ? await this.getPublishedCheckpoints(finalizedCheckpointedBlock?.checkpointNumber, 1)
        : [undefined],
      checkpointedBlock !== undefined
        ? await this.getPublishedCheckpoints(checkpointedBlock?.checkpointNumber, 1)
        : [undefined],
    ]);

    const initialcheckpointId: CheckpointId = {
      number: CheckpointNumber.ZERO,
      hash: GENESIS_CHECKPOINT_HEADER_HASH.toString(),
    };

    const makeCheckpointId = (checkpoint: PublishedCheckpoint | undefined) => {
      if (checkpoint === undefined) {
        return initialcheckpointId;
      }
      return {
        number: checkpoint.checkpoint.number,
        hash: checkpoint.checkpoint.hash().toString(),
      };
    };

    const l2Tips: L2Tips = {
      proposed: {
        number: latestBlockNumber,
        hash: latestBlockHeaderHash.toString(),
      },
      proven: {
        block: {
          number: provenBlockNumber,
          hash: provenBlockHeaderHash.toString(),
        },
        checkpoint: makeCheckpointId(provenBlockCheckpoint),
      },
      finalized: {
        block: {
          number: finalizedBlockNumber,
          hash: finalizedBlockHeaderHash.toString(),
        },
        checkpoint: makeCheckpointId(finalizedBlockCheckpoint),
      },
      checkpointed: {
        block: {
          number: checkpointedBlockNumber,
          hash: checkpointedBlockHeaderHash.toString(),
        },
        checkpoint: makeCheckpointId(checkpointedBlockCheckpoint),
      },
    };

    return l2Tips;
  }

  public async rollbackTo(targetL2BlockNumber: BlockNumber): Promise<void> {
    // TODO(pw/mbps): This still assumes 1 block per checkpoint
    const currentBlocks = await this.getL2Tips();
    const currentL2Block = currentBlocks.proposed.number;
    const currentProvenBlock = currentBlocks.proven.block.number;

    if (targetL2BlockNumber >= currentL2Block) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} must be less than current L2 block ${currentL2Block}`);
    }
    const blocksToUnwind = currentL2Block - targetL2BlockNumber;
    const targetL2Block = await this.store.getCheckpointedBlock(targetL2BlockNumber);
    if (!targetL2Block) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} not found`);
    }
    const targetL1BlockNumber = targetL2Block.l1.blockNumber;
    const targetCheckpointNumber = CheckpointNumber.fromBlockNumber(targetL2BlockNumber);
    const targetL1BlockHash = await this.getL1BlockHash(targetL1BlockNumber);
    this.log.info(`Unwinding ${blocksToUnwind} checkpoints from L2 block ${currentL2Block}`);
    await this.store.unwindCheckpoints(CheckpointNumber(currentL2Block), blocksToUnwind);
    this.log.info(`Unwinding L1 to L2 messages to checkpoint ${targetCheckpointNumber}`);
    await this.store.rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber);
    this.log.info(`Setting L1 syncpoints to ${targetL1BlockNumber}`);
    await this.store.setBlockSynchedL1BlockNumber(targetL1BlockNumber);
    await this.store.setMessageSynchedL1Block({ l1BlockNumber: targetL1BlockNumber, l1BlockHash: targetL1BlockHash });
    if (targetL2BlockNumber < currentProvenBlock) {
      this.log.info(`Clearing proven L2 block number`);
      await this.store.setProvenCheckpointNumber(CheckpointNumber.ZERO);
    }
    // TODO(palla/reorg): Set the finalized block when we add support for it.
    // if (targetL2BlockNumber < currentFinalizedBlock) {
    //   this.log.info(`Clearing finalized L2 block number`);
    //   await this.store.setFinalizedL2BlockNumber(0);
    // }
  }

  public async getPublishedCheckpoints(
    checkpointNumber: CheckpointNumber,
    limit: number,
  ): Promise<PublishedCheckpoint[]> {
    const checkpoints = await this.store.getRangeOfCheckpoints(checkpointNumber, limit);
    const blocks = (
      await Promise.all(checkpoints.map(ch => this.store.getBlocksForCheckpoint(ch.checkpointNumber)))
    ).filter(isDefined);

    const fullCheckpoints: PublishedCheckpoint[] = [];
    for (let i = 0; i < checkpoints.length; i++) {
      const blocksForCheckpoint = blocks[i];
      const checkpoint = checkpoints[i];
      const fullCheckpoint = new Checkpoint(
        checkpoint.archive,
        checkpoint.header,
        blocksForCheckpoint,
        checkpoint.checkpointNumber,
      );
      const publishedCheckpoint = new PublishedCheckpoint(
        fullCheckpoint,
        checkpoint.l1,
        checkpoint.attestations.map(x => CommitteeAttestation.fromBuffer(x)),
      );
      fullCheckpoints.push(publishedCheckpoint);
    }
    return fullCheckpoints;
  }

  public async getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]> {
    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1constants);
    const checkpoints: Checkpoint[] = [];

    // Walk the list of checkpoints backwards and filter by slots matching the requested epoch.
    // We'll typically ask for checkpoints for a very recent epoch, so we shouldn't need an index here.
    let checkpointData = await this.store.getCheckpointData(await this.store.getSynchedCheckpointNumber());
    const slot = (b: CheckpointData) => b.header.slotNumber;
    while (checkpointData && slot(checkpointData) >= start) {
      if (slot(checkpointData) <= end) {
        // push the checkpoints on backwards
        const [checkpoint] = await this.getPublishedCheckpoints(checkpointData.checkpointNumber, 1);
        checkpoints.push(checkpoint.checkpoint);
      }
      checkpointData = await this.store.getCheckpointData(CheckpointNumber(checkpointData.checkpointNumber - 1));
    }

    return checkpoints.reverse();
  }

  /* Legacy APIs */

  public async getPublishedBlockByHash(blockHash: Fr): Promise<PublishedL2Block | undefined> {
    const checkpointedBlock = await this.store.getCheckpointedBlockByHash(blockHash);
    return this.buildOldBlockFromCheckpointedBlock(checkpointedBlock);
  }
  public async getPublishedBlockByArchive(archive: Fr): Promise<PublishedL2Block | undefined> {
    const checkpointedBlock = await this.store.getCheckpointedBlockByArchive(archive);
    return this.buildOldBlockFromCheckpointedBlock(checkpointedBlock);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @param proven - If true, only return blocks that have been proven.
   * @returns The requested L2 blocks.
   */
  public async getBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<L2Block[]> {
    const publishedBlocks = await this.getPublishedBlocks(from, limit, proven);
    return publishedBlocks.map(x => x.block);
  }

  public async getPublishedBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<PublishedL2Block[]> {
    const checkpoints = await this.store.getRangeOfCheckpoints(CheckpointNumber(from), limit);
    const provenCheckpointNumber = await this.getProvenCheckpointNumber();
    const blocks = (
      await Promise.all(checkpoints.map(ch => this.store.getBlocksForCheckpoint(ch.checkpointNumber)))
    ).filter(isDefined);

    const olbBlocks: PublishedL2Block[] = [];
    for (let i = 0; i < checkpoints.length; i++) {
      const blockForCheckpoint = blocks[i][0];
      const checkpoint = checkpoints[i];
      if (checkpoint.checkpointNumber > provenCheckpointNumber && proven === true) {
        // this checkpointisn't proven and we only want proven
        continue;
      }
      const oldCheckpoint = new Checkpoint(
        blockForCheckpoint.archive,
        checkpoint.header,
        [blockForCheckpoint],
        checkpoint.checkpointNumber,
      );
      const oldBlock = L2Block.fromCheckpoint(oldCheckpoint);
      const publishedBlock = new PublishedL2Block(
        oldBlock,
        checkpoint.l1,
        checkpoint.attestations.map(x => CommitteeAttestation.fromBuffer(x)),
      );
      olbBlocks.push(publishedBlock);
    }
    return olbBlocks;
  }

  private async buildOldBlockFromCheckpointedBlock(
    checkpointedBlock: CheckpointedL2Block | undefined,
  ): Promise<PublishedL2Block | undefined> {
    if (!checkpointedBlock) {
      return undefined;
    }
    const checkpoint = await this.store.getCheckpointData(checkpointedBlock.checkpointNumber);
    if (!checkpoint) {
      return checkpoint;
    }
    const fullCheckpoint = new Checkpoint(
      checkpointedBlock?.block.archive,
      checkpoint?.header,
      [checkpointedBlock.block],
      checkpoint.checkpointNumber,
    );
    const oldBlock = L2Block.fromCheckpoint(fullCheckpoint);
    const published = new PublishedL2Block(
      oldBlock,
      checkpoint.l1,
      checkpoint.attestations.map(x => CommitteeAttestation.fromBuffer(x)),
    );
    return published;
  }

  public async getBlock(number: BlockNumber): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getSynchedL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const publishedBlocks = await this.getPublishedBlocks(number, 1);
    if (publishedBlocks.length === 0) {
      return undefined;
    }
    return publishedBlocks[0].block;
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
      | 'addBlocks'
      | 'getBlock'
      | 'getBlocks'
      | 'getCheckpointedBlocks'
    >
{
  #log = createLogger('archiver:block-helper');

  constructor(public readonly store: ArchiverDataStore) {}

  /**
   * Extracts and stores contract classes out of ContractClassPublished events emitted by the class registry contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  async #updatePublishedContractClasses(allLogs: ContractClassLog[], blockNum: BlockNumber, operation: Operation) {
    const contractClassPublishedEvents = allLogs
      .filter(log => ContractClassPublishedEvent.isContractClassPublishedEvent(log))
      .map(log => ContractClassPublishedEvent.fromLog(log));

    const contractClasses = await Promise.all(contractClassPublishedEvents.map(e => e.toContractClassPublic()));
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
   * Extracts and stores contract instances out of ContractInstancePublished events emitted by the canonical deployer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   */
  async #updateDeployedContractInstances(allLogs: PrivateLog[], blockNum: BlockNumber, operation: Operation) {
    const contractInstances = allLogs
      .filter(log => ContractInstancePublishedEvent.isContractInstancePublishedEvent(log))
      .map(log => ContractInstancePublishedEvent.fromLog(log))
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
   * Extracts and stores contract instances out of ContractInstancePublished events emitted by the canonical deployer contract.
   * @param allLogs - All logs emitted in a bunch of blocks.
   * @param timestamp - Timestamp at which the updates were scheduled.
   * @param operation - The operation to perform on the contract instance updates (Store or Delete).
   */
  async #updateUpdatedContractInstances(allLogs: PublicLog[], timestamp: UInt64, operation: Operation) {
    const contractUpdates = allLogs
      .filter(log => ContractInstanceUpdatedEvent.isContractInstanceUpdatedEvent(log))
      .map(log => ContractInstanceUpdatedEvent.fromLog(log))
      .map(e => e.toContractInstanceUpdate());

    if (contractUpdates.length > 0) {
      contractUpdates.forEach(c =>
        this.#log.verbose(`${Operation[operation]} contract instance update at ${c.address.toString()}`),
      );
      if (operation == Operation.Store) {
        return await this.store.addContractInstanceUpdates(contractUpdates, timestamp);
      } else if (operation == Operation.Delete) {
        return await this.store.deleteContractInstanceUpdates(contractUpdates, timestamp);
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
  async #storeBroadcastedIndividualFunctions(allLogs: ContractClassLog[], _blockNum: BlockNumber) {
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

  private async addBlockDataToDB(block: L2BlockNew) {
    const contractClassLogs = block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
    // ContractInstancePublished event logs are broadcast in privateLogs.
    const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
    const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

    return (
      await Promise.all([
        this.#updatePublishedContractClasses(contractClassLogs, block.number, Operation.Store),
        this.#updateDeployedContractInstances(privateLogs, block.number, Operation.Store),
        this.#updateUpdatedContractInstances(publicLogs, block.header.globalVariables.timestamp, Operation.Store),
        this.#storeBroadcastedIndividualFunctions(contractClassLogs, block.number),
      ])
    ).every(Boolean);
  }

  public addBlocks(blocks: L2BlockNew[], pendingChainValidationStatus?: ValidateBlockResult): Promise<boolean> {
    // Add the blocks to the store. Store will throw if the blocks are not in order, there are gaps,
    // or if the previous block is not in the store.
    return this.store.transactionAsync(async () => {
      await this.store.addBlocks(blocks);

      const opResults = await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus && this.store.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved blocks
        this.store.addLogs(blocks),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...blocks.map(block => {
          return this.addBlockDataToDB(block);
        }),
      ]);

      return opResults.every(Boolean);
    });
  }

  public addCheckpoints(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateBlockResult,
  ): Promise<boolean> {
    // Add the blocks to the store. Store will throw if the blocks are not in order, there are gaps,
    // or if the previous block is not in the store.
    return this.store.transactionAsync(async () => {
      await this.store.addCheckpoints(checkpoints);
      const allBlocks = checkpoints.flatMap((ch: PublishedCheckpoint) => ch.checkpoint.blocks);

      const opResults = await Promise.all([
        // Update the pending chain validation status if provided
        pendingChainValidationStatus && this.store.setPendingChainValidationStatus(pendingChainValidationStatus),
        // Add any logs emitted during the retrieved blocks
        this.store.addLogs(allBlocks),
        // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
        ...allBlocks.map(block => {
          return this.addBlockDataToDB(block);
        }),
      ]);

      return opResults.every(Boolean);
    });
  }

  public async unwindCheckpoints(from: CheckpointNumber, checkpointsToUnwind: number): Promise<boolean> {
    if (checkpointsToUnwind <= 0) {
      throw new Error(`Cannot unwind ${checkpointsToUnwind} blocks`);
    }

    const last = await this.getSynchedCheckpointNumber();
    if (from != last) {
      throw new Error(`Cannot unwind checkpoints from checkpoint ${from} when the last checkpoint is ${last}`);
    }

    const blocks = [];
    const lastCheckpointNumber = from + checkpointsToUnwind - 1;
    for (let checkpointNumber = from; checkpointNumber <= lastCheckpointNumber; checkpointNumber++) {
      const blocksForCheckpoint = await this.store.getBlocksForCheckpoint(checkpointNumber);
      if (!blocksForCheckpoint) {
        continue;
      }
      blocks.push(...blocksForCheckpoint);
    }

    const opResults = await Promise.all([
      // Prune rolls back to the last proven block, which is by definition valid
      this.store.setPendingChainValidationStatus({ valid: true }),
      // Unroll all logs emitted during the retrieved blocks and extract any contract classes and instances from them
      ...blocks.map(async block => {
        const contractClassLogs = block.body.txEffects.flatMap(txEffect => txEffect.contractClassLogs);
        // ContractInstancePublished event logs are broadcast in privateLogs.
        const privateLogs = block.body.txEffects.flatMap(txEffect => txEffect.privateLogs);
        const publicLogs = block.body.txEffects.flatMap(txEffect => txEffect.publicLogs);

        return (
          await Promise.all([
            this.#updatePublishedContractClasses(contractClassLogs, block.number, Operation.Delete),
            this.#updateDeployedContractInstances(privateLogs, block.number, Operation.Delete),
            this.#updateUpdatedContractInstances(publicLogs, block.header.globalVariables.timestamp, Operation.Delete),
          ])
        ).every(Boolean);
      }),

      this.store.deleteLogs(blocks),
      this.store.unwindCheckpoints(from, checkpointsToUnwind),
    ]);

    return opResults.every(Boolean);
  }

  getCheckpointData(checkpointNumber: CheckpointNumber): Promise<CheckpointData | undefined> {
    return this.store.getCheckpointData(checkpointNumber);
  }

  getRangeOfCheckpoints(from: CheckpointNumber, limit: number): Promise<CheckpointData[]> {
    return this.store.getRangeOfCheckpoints(from, limit);
  }

  getCheckpointedL2BlockNumber(): Promise<BlockNumber> {
    return this.store.getCheckpointedL2BlockNumber();
  }
  getSynchedCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getSynchedCheckpointNumber();
  }
  setCheckpointSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    return this.store.setCheckpointSynchedL1BlockNumber(l1BlockNumber);
  }
  getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlock(number);
  }
  getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlockByHash(blockHash);
  }
  getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlockByArchive(archive);
  }
  getBlockHeaders(from: BlockNumber, limit: number): Promise<BlockHeader[]> {
    return this.store.getBlockHeaders(from, limit);
  }
  getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined> {
    return this.store.getBlockHeaderByHash(blockHash);
  }
  getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return this.store.getBlockHeaderByArchive(archive);
  }
  getBlockByHash(blockHash: Fr): Promise<L2BlockNew | undefined> {
    return this.store.getBlockByHash(blockHash);
  }
  getBlockByArchive(archive: Fr): Promise<L2BlockNew | undefined> {
    return this.store.getBlockByArchive(archive);
  }
  getLatestBlockNumber(): Promise<BlockNumber> {
    return this.store.getLatestBlockNumber();
  }
  getBlocksForCheckpoint(checkpointNumber: CheckpointNumber): Promise<L2BlockNew[] | undefined> {
    return this.store.getBlocksForCheckpoint(checkpointNumber);
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
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.store.getL1ToL2Messages(checkpointNumber);
  }
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.store.getL1ToL2MessageIndex(l1ToL2Message);
  }
  getPrivateLogsByTags(tags: SiloedTag[]): Promise<TxScopedL2Log[][]> {
    return this.store.getPrivateLogsByTags(tags);
  }
  getPublicLogsByTagsFromContract(contractAddress: AztecAddress, tags: Tag[]): Promise<TxScopedL2Log[][]> {
    return this.store.getPublicLogsByTagsFromContract(contractAddress, tags);
  }
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.store.getPublicLogs(filter);
  }
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.store.getContractClassLogs(filter);
  }
  getSynchedL2BlockNumber(): Promise<BlockNumber> {
    return this.store.getCheckpointedL2BlockNumber();
  }
  getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getProvenCheckpointNumber();
  }
  getProvenBlockNumber(): Promise<BlockNumber> {
    return this.store.getProvenBlockNumber();
  }
  setProvenCheckpointNumber(checkpointNumber: CheckpointNumber): Promise<void> {
    return this.store.setProvenCheckpointNumber(checkpointNumber);
  }
  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    return this.store.setCheckpointSynchedL1BlockNumber(l1BlockNumber);
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
  getContractInstance(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined> {
    return this.store.getContractInstance(address, timestamp);
  }
  getContractClassIds(): Promise<Fr[]> {
    return this.store.getContractClassIds();
  }
  registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.store.registerContractFunctionSignatures(signatures);
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
  rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber: CheckpointNumber): Promise<void> {
    return this.store.rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber);
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
  getPendingChainValidationStatus(): Promise<ValidateBlockResult | undefined> {
    return this.store.getPendingChainValidationStatus();
  }
  setPendingChainValidationStatus(status: ValidateBlockResult | undefined): Promise<void> {
    this.#log.debug(`Setting pending chain validation status to valid ${status?.valid}`, status);
    return this.store.setPendingChainValidationStatus(status);
  }
}
