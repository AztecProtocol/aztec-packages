import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_BLOCK_HEADER_HASH, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockTagTooOldError, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { merge } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { RunningPromise, makeLoggingErrorHandler } from '@aztec/foundation/running-promise';
import {
  type ArchiverEmitter,
  type CheckpointId,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2BlockNew,
  type L2BlockSink,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import {
  type L1RollupConstants,
  getEpochNumberAtTimestamp,
  getSlotAtTimestamp,
  getSlotRangeForEpoch,
  getTimestampRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';
import { type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { type ArchiverConfig, mapArchiverConfig } from './config.js';
import { NoBlobBodiesFoundError } from './errors.js';
import { validateAndLogTraceAvailability } from './l1/validate_trace.js';
import { ArchiverDataSourceBase } from './modules/data_source_base.js';
import { ArchiverDataStoreUpdater } from './modules/data_store_updater.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import type { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import type { KVArchiverDataStore } from './store/kv_archiver_store.js';

/** Export ArchiverEmitter for use in factory and tests. */
export type { ArchiverEmitter };

/** Request to add a block to the archiver, queued for processing by the sync loop. */
type AddBlockRequest = {
  block: L2BlockNew;
  resolve: () => void;
  reject: (err: Error) => void;
};

/**
 * Pulls checkpoints in a non-blocking manner and provides interface for their retrieval.
 * Responsible for handling robust L1 polling so that other components do not need to
 * concern themselves with it.
 */
export class Archiver extends ArchiverDataSourceBase implements L2BlockSink, Traceable {
  /** Event emitter for archiver events (L2BlockProven, L2PruneUnproven, L2PruneUncheckpointed, etc). */
  public readonly events: ArchiverEmitter;

  /** A loop in which we will be continually fetching new checkpoints. */
  private runningPromise: RunningPromise;

  /** L1 synchronizer that handles fetching checkpoints and messages from L1. */
  private readonly synchronizer: ArchiverL1Synchronizer;

  private initialSyncComplete: boolean = false;
  private initialSyncPromise: PromiseWithResolvers<void>;

  /** Queue of blocks to be added to the store, processed by the sync loop. */
  private blockQueue: AddBlockRequest[] = [];

  /** Helper to handle updates to the store */
  private readonly updater: ArchiverDataStoreUpdater;

  public readonly tracer: Tracer;

  /**
   * Creates a new instance of the Archiver.
   * @param publicClient - A client for interacting with the Ethereum node.
   * @param debugClient - A client for interacting with the Ethereum node for debug/trace methods.
   * @param rollup - Rollup contract instance.
   * @param inbox - Inbox contract instance.
   * @param l1Addresses - L1 contract addresses (registry, governance proposer, slash factory, slashing proposer).
   * @param dataStore - An archiver data store for storage & retrieval of blocks, encrypted logs & contract data.
   * @param config - Archiver configuration options.
   * @param blobClient - Client for retrieving blob data.
   * @param epochCache - Cache for epoch-related data.
   * @param dateProvider - Provider for current date/time.
   * @param instrumentation - Instrumentation for metrics and tracing.
   * @param l1Constants - L1 rollup constants.
   * @param log - A logger.
   */
  constructor(
    private readonly publicClient: ViemPublicClient,
    private readonly debugClient: ViemPublicDebugClient,
    private readonly rollup: RollupContract,
    private readonly l1Addresses: Pick<
      L1ContractAddresses,
      'registryAddress' | 'governanceProposerAddress' | 'slashFactoryAddress'
    > & { slashingProposerAddress: EthAddress },
    readonly dataStore: KVArchiverDataStore,
    private config: {
      pollingIntervalMs: number;
      batchSize: number;
      skipValidateCheckpointAttestations?: boolean;
      maxAllowedEthClientDriftSeconds: number;
      ethereumAllowNoDebugHosts?: boolean;
    },
    private readonly blobClient: BlobClientInterface,
    instrumentation: ArchiverInstrumentation,
    protected override readonly l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr },
    synchronizer: ArchiverL1Synchronizer,
    events: ArchiverEmitter,
    private readonly log: Logger,
  ) {
    super(dataStore, l1Constants);

    this.tracer = instrumentation.tracer;
    this.initialSyncPromise = promiseWithResolvers();
    this.synchronizer = synchronizer;
    this.events = events;
    this.updater = new ArchiverDataStoreUpdater(this.dataStore, this.log.createChild('store_updater'));

    // Running promise starts with a small interval inbetween runs, so all iterations needed for the initial sync
    // are done as fast as possible. This then gets updated once the initial sync completes.
    this.runningPromise = new RunningPromise(
      () => this.sync(),
      this.log,
      this.config.pollingIntervalMs / 10,
      makeLoggingErrorHandler(this.log, NoBlobBodiesFoundError, BlockTagTooOldError),
    );
  }

  /** Updates archiver config */
  public updateConfig(newConfig: Partial<ArchiverConfig>) {
    this.config = merge(this.config, mapArchiverConfig(newConfig));
    this.synchronizer.setConfig(this.config);
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
    await this.synchronizer.testEthereumNodeSynced();
    await validateAndLogTraceAvailability(this.debugClient, this.config.ethereumAllowNoDebugHosts ?? false, this.log);

    // Log initial state for the archiver
    const { l1StartBlock } = this.l1Constants;
    const { blocksSynchedTo = l1StartBlock, messagesSynchedTo = l1StartBlock } = await this.store.getSynchPoint();
    const currentL2Checkpoint = await this.getSynchedCheckpointNumber();
    this.log.info(
      `Starting archiver sync to rollup contract ${this.rollup.address} from L1 block ${blocksSynchedTo} and L2 checkpoint ${currentL2Checkpoint}`,
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
        await this.updater.addBlocks([block]);
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

  private async syncFromL1() {
    // Delegate to the L1 synchronizer
    await this.synchronizer.syncFromL1(this.initialSyncComplete);

    // Check if we've completed initial sync
    const currentL1BlockNumber = this.synchronizer.getL1BlockNumber();
    if (currentL1BlockNumber !== undefined && !this.initialSyncComplete) {
      const l1BlockNumberAtEnd = await this.publicClient.getBlockNumber();
      if (currentL1BlockNumber + 1n >= l1BlockNumberAtEnd) {
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
    return Promise.resolve(this.l1Constants);
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: this.l1Constants.genesisArchiveRoot });
  }

  public getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(EthAddress.fromString(this.rollup.address));
  }

  public getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.registryAddress);
  }

  public getL1BlockNumber(): bigint | undefined {
    return this.synchronizer.getL1BlockNumber();
  }

  public getL1Timestamp(): Promise<bigint | undefined> {
    return Promise.resolve(this.synchronizer.getL1Timestamp());
  }

  public getL2SlotNumber(): Promise<SlotNumber | undefined> {
    const l1Timestamp = this.synchronizer.getL1Timestamp();
    return Promise.resolve(l1Timestamp === undefined ? undefined : getSlotAtTimestamp(l1Timestamp, this.l1Constants));
  }

  public getL2EpochNumber(): Promise<EpochNumber | undefined> {
    const l1Timestamp = this.synchronizer.getL1Timestamp();
    return Promise.resolve(
      l1Timestamp === undefined ? undefined : getEpochNumberAtTimestamp(l1Timestamp, this.l1Constants),
    );
  }

  public async isEpochComplete(epochNumber: EpochNumber): Promise<boolean> {
    // The epoch is complete if the current checkpointed L2 block is the last one in the epoch (or later).
    // We use the checkpointed block number (synced from L1) instead of 'latest' to avoid returning true
    // prematurely when proposed blocks have been pushed to the archiver but not yet checkpointed on L1.
    const checkpointedBlockNumber = await this.getCheckpointedL2BlockNumber();
    const header = checkpointedBlockNumber > 0 ? await this.getBlockHeader(checkpointedBlockNumber) : undefined;
    const slot = header ? header.globalVariables.slotNumber : undefined;
    const [_startSlot, endSlot] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    if (slot && slot >= endSlot) {
      return true;
    }

    // If we haven't run an initial sync, just return false.
    const l1Timestamp = this.synchronizer.getL1Timestamp();
    if (l1Timestamp === undefined) {
      return false;
    }

    // If not, the epoch may also be complete if the L2 slot has passed without a block
    // We compute this based on the end timestamp for the given epoch and the timestamp of the last L1 block
    const [_startTimestamp, endTimestamp] = getTimestampRangeForEpoch(epochNumber, this.l1Constants);

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

  public unwindCheckpoints(from: CheckpointNumber, checkpointsToUnwind: number): Promise<boolean> {
    return this.updater.unwindCheckpoints(from, checkpointsToUnwind);
  }

  /** Used by TXE to add checkpoints directly without syncing from L1. */
  public async addCheckpoints(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateCheckpointResult,
  ): Promise<boolean> {
    await this.updater.setNewCheckpointData(checkpoints, pendingChainValidationStatus);
    return true;
  }

  public async getL2Tips(): Promise<L2Tips> {
    const [latestBlockNumber, provenBlockNumber, checkpointedBlockNumber, finalizedBlockNumber] = await Promise.all([
      this.getBlockNumber(),
      this.getProvenBlockNumber(),
      this.getCheckpointedL2BlockNumber(),
      this.getFinalizedL2BlockNumber(),
    ] as const);

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
    const targetL1Block = await this.publicClient.getBlock({
      blockNumber: targetL1BlockNumber,
      includeTransactions: false,
    });
    if (!targetL1Block) {
      throw new Error(`Missing L1 block ${targetL1BlockNumber}`);
    }
    const targetL1BlockHash = Buffer32.fromString(targetL1Block.hash);
    this.log.info(`Unwinding ${blocksToUnwind} checkpoints from L2 block ${currentL2Block}`);
    await this.updater.unwindCheckpoints(CheckpointNumber(currentL2Block), blocksToUnwind);
    this.log.info(`Unwinding L1 to L2 messages to checkpoint ${targetCheckpointNumber}`);
    await this.store.rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber);
    this.log.info(`Setting L1 syncpoints to ${targetL1BlockNumber}`);
    await this.store.setCheckpointSynchedL1BlockNumber(targetL1BlockNumber);
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
}
