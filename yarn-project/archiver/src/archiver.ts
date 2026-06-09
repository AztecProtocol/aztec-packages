import type { BlobClientInterface } from '@aztec/blob-client/client';
import { EpochCache } from '@aztec/epoch-cache';
import { BlockTagTooOldError, OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { merge, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { RunningPromise, makeLoggingErrorHandler } from '@aztec/foundation/running-promise';
import { DateProvider, elapsed } from '@aztec/foundation/timer';
import {
  type ArchiverEmitter,
  type BlockHash,
  L2Block,
  type L2BlockSink,
  L2BlockSourceEvents,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { type ProposedCheckpointInput, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getSlotAtNextL1Block,
  getSlotRangeForEpoch,
  getTimestampForSlot,
  getTimestampRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';
import type { L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import type { BlockHeader, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { type ArchiverConfig, mapArchiverConfig } from './config.js';
import { BlockAlreadyCheckpointedError, BlockOrCheckpointSlotExpiredError, NoBlobBodiesFoundError } from './errors.js';
import { validateAndLogHistoricalLogsAvailability } from './l1/validate_historical_logs.js';
import { validateAndLogTraceAvailability } from './l1/validate_trace.js';
import { ArchiverDataSourceBase } from './modules/data_source_base.js';
import { ArchiverDataStoreUpdater } from './modules/data_store_updater.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import type { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { OutboxTreesResolver } from './modules/outbox_trees_resolver.js';
import { type ArchiverDataStores, backupArchiverDataStores, getArchiverSynchPoint } from './store/data_stores.js';
import { L2TipsCache } from './store/l2_tips_cache.js';

/** Export ArchiverEmitter for use in factory and tests. */
export type { ArchiverEmitter };

/** Request to add a block to the archiver, queued for processing by the sync loop. */
type AddBlockRequest = {
  type: 'block';
  block: L2Block;
  resolve: () => void;
  reject: (err: Error) => void;
};

/** Request to add a proposed checkpoint to the archiver, queued for processing by the sync loop. */
type AddProposedCheckpointRequest = {
  type: 'checkpoint';
  checkpoint: ProposedCheckpointInput;
  resolve: () => void;
  reject: (err: Error) => void;
};

export type ArchiverDeps = {
  telemetry?: TelemetryClient;
  blobClient: BlobClientInterface;
  epochCache?: EpochCache;
  dateProvider?: DateProvider;
};

/** Minimal dependency for observing whether a checkpoint proposal was received for a slot. */
export type CheckpointProposalPresence = {
  /** Returns true when a checkpoint proposal for `slot` has been retained locally. */
  hasCheckpointProposalForSlot(slot: SlotNumber): Promise<boolean>;
};

const noCheckpointProposalPresence: CheckpointProposalPresence = {
  hasCheckpointProposalForSlot: () => Promise.resolve(false),
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
  protected runningPromise: RunningPromise;

  /** L1 synchronizer that handles fetching checkpoints and messages from L1. */
  private readonly synchronizer: ArchiverL1Synchronizer;

  /** Resolver for L2-to-L1 message membership witnesses, built over this archiver's read view. */
  private readonly outboxTreesResolver: OutboxTreesResolver;

  private initialSyncComplete: boolean = false;
  private initialSyncPromise: PromiseWithResolvers<void>;

  /** Queue of blocks and checkpoints to be added to the store, processed by the sync loop. */
  private inboundQueue: (AddBlockRequest | AddProposedCheckpointRequest)[] = [];

  /** Helper to handle updates to the store */
  private readonly updater: ArchiverDataStoreUpdater;

  /** In-memory cache for L2 chain tips. */
  private readonly l2TipsCache: L2TipsCache;

  /** Consensus timing model used for proposed-checkpoint arrival expectations. */
  private readonly timetable: ConsensusTimetable;

  public readonly tracer: Tracer;

  private readonly instrumentation: ArchiverInstrumentation;

  /**
   * Creates a new instance of the Archiver.
   * @param publicClient - A client for interacting with the Ethereum node.
   * @param debugClient - A client for interacting with the Ethereum node for debug/trace methods.
   * @param rollup - Rollup contract instance.
   * @param outbox - Outbox contract instance, used to read per-epoch L2-to-L1 message roots.
   * @param inbox - Inbox contract instance.
   * @param l1Addresses - L1 contract addresses (registry, governance proposer, slashing proposer).
   * @param dataStores - Archiver substores for storage & retrieval of blocks, encrypted logs & contract data.
   * @param config - Archiver configuration options.
   * @param blobClient - Client for retrieving blob data.
   * @param instrumentation - Instrumentation for metrics and tracing.
   * @param l1Constants - L1 rollup constants.
   * @param synchronizer - L1 synchronizer that handles fetching checkpoints and messages from L1.
   * @param events - Event emitter shared with the synchronizer.
   * @param initialHeader - Genesis block header.
   * @param initialBlockHash - Precomputed hash of the genesis block header.
   * @param l2TipsCache - In-memory cache for L2 chain tips.
   * @param dateProvider - Provider for current date/time, used for wall-clock orphan-block pruning.
   * @param log - A logger.
   */
  constructor(
    private readonly publicClient: ViemPublicClient,
    private readonly debugClient: ViemPublicDebugClient,
    private readonly rollup: RollupContract,
    private readonly outbox: OutboxContract,
    private readonly l1Addresses: Pick<
      L1ContractAddresses,
      'rollupAddress' | 'registryAddress' | 'inboxAddress' | 'governanceProposerAddress'
    > & {
      slashingProposerAddress: EthAddress;
    },
    readonly dataStores: ArchiverDataStores,
    private config: {
      pollingIntervalMs: number;
      batchSize: number;
      skipValidateCheckpointAttestations?: boolean;
      maxAllowedEthClientDriftSeconds: number;
      ethereumAllowNoDebugHosts?: boolean;
      skipHistoricalLogsCheck?: boolean;
      checkpointProposalSyncGrace: number;
      orphanPruneNoProposalTolerance: number;
      skipOrphanProposedBlockPruning: boolean;
      blockDuration: number;
    },
    private readonly blobClient: BlobClientInterface,
    instrumentation: ArchiverInstrumentation,
    protected override readonly l1Constants: L1RollupConstants & {
      l1StartBlockHash: Buffer32;
      genesisArchiveRoot: Fr;
    },
    synchronizer: ArchiverL1Synchronizer,
    events: ArchiverEmitter,
    initialHeader: BlockHeader,
    initialBlockHash: BlockHash,
    l2TipsCache: L2TipsCache,
    private readonly dateProvider: DateProvider,
    private checkpointProposalPresence: CheckpointProposalPresence = noCheckpointProposalPresence,
    private readonly log: Logger = createLogger('archiver'),
  ) {
    super(dataStores, l1Constants, initialHeader, initialBlockHash, l1Constants.genesisArchiveRoot);

    this.tracer = instrumentation.tracer;
    this.instrumentation = instrumentation;
    this.initialSyncPromise = promiseWithResolvers();
    this.synchronizer = synchronizer;
    this.events = events;
    this.l2TipsCache = l2TipsCache;
    this.timetable = new ConsensusTimetable({
      l1Constants,
      blockDuration: this.config.blockDuration,
      checkpointProposalSyncGrace: this.config.checkpointProposalSyncGrace,
    });
    this.updater = new ArchiverDataStoreUpdater(this.dataStores, this.l2TipsCache, {
      rollupManaLimit: l1Constants.rollupManaLimit,
    });

    // The resolver reads its witness data from this archiver and pins its lazy Outbox-root fetches
    // to the archiver's synced L1 block. No method on `this` is invoked during construction.
    this.outboxTreesResolver = new OutboxTreesResolver(
      this.outbox,
      this,
      () => Promise.resolve(this.getL1BlockNumber()),
      l1Constants.epochDuration,
    );

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
   * Returns the L2-to-L1 membership witness for `message` emitted by tx `txHash`. The node selects
   * the smallest partial-proof root on the Outbox that covers the tx's checkpoint and builds the
   * witness against it.
   *
   * The node reads the Outbox roots lazily, pinned to its synced L1 block, so the witness reflects
   * the node's synced view. Returns `undefined` if the tx isn't yet in a block/epoch or no covering
   * root has landed on L1 as of the synced block.
   *
   * Caveat: roots are cached only for the current synced L1 block and re-fetched once the node
   * advances, so a reorg is picked up on the next synced-block advance rather than re-validated per
   * request.
   */
  public getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined> {
    return this.outboxTreesResolver.getL2ToL1MembershipWitness(txHash, message, messageIndexInTx);
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
    await validateAndLogTraceAvailability(
      this.debugClient,
      this.config.ethereumAllowNoDebugHosts ?? false,
      this.log.getBindings(),
    );
    await validateAndLogHistoricalLogsAvailability(
      this.publicClient,
      {
        rollupAddress: this.l1Addresses.rollupAddress,
        inboxAddress: this.l1Addresses.inboxAddress,
        registryAddress: this.l1Addresses.registryAddress,
        governanceProposerAddress: this.l1Addresses.governanceProposerAddress,
      },
      this.config.skipHistoricalLogsCheck ?? false,
      this.log.getBindings(),
    );

    // Log initial state for the archiver
    const { l1StartBlock } = this.l1Constants;
    const { blocksSynchedTo = l1StartBlock, messagesSynchedTo = l1StartBlock } = await getArchiverSynchPoint(
      this.stores,
    );
    const currentL2Checkpoint = await this.getCheckpointNumber();
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

  /** Sets the proposal-presence provider used by orphan proposed-block pruning. */
  public setCheckpointProposalPresence(checkpointProposalPresence: CheckpointProposalPresence): void {
    this.checkpointProposalPresence = checkpointProposalPresence;
  }

  public trySyncImmediate() {
    try {
      return this.syncImmediate();
    } catch (err) {
      this.log.error(`Failed to trigger immediate archiver sync: ${err}`, err);
    }
  }

  /**
   * Queues a block to be added to the archiver store and triggers processing.
   * The block will be processed by the sync loop.
   * Implements the L2BlockSink interface.
   * @param block - The L2 block to add.
   * @returns A promise that resolves when the block has been added to the store, or rejects on error.
   */
  public addBlock(block: L2Block): Promise<void> {
    const promise = promiseWithResolvers<void>();
    this.inboundQueue.push({ block, ...promise, type: 'block' });
    this.log.debug(`Queued block ${block.number} for processing`);
    void this.trySyncImmediate();
    return promise.promise;
  }

  /**
   * Queues a new proposed checkpoint into the archiver store.
   * Checks that the checkpoint is not for an L2 slot already synced from L1.
   * Resolves once the checkpoint has been processed.
   */
  public addProposedCheckpoint(pending: ProposedCheckpointInput): Promise<void> {
    const promise = promiseWithResolvers<void>();
    this.inboundQueue.push({ checkpoint: pending, ...promise, type: 'checkpoint' });
    this.log.debug(`Queued checkpoint ${pending.checkpointNumber} for processing`);
    void this.trySyncImmediate();
    return promise.promise;
  }

  /**
   * Processes all queued blocks and checkpoints, adding them to the store.
   * Called at the beginning of each sync iteration.
   * Items are processed in the order they were queued.
   */
  private async processInboundQueue(): Promise<void> {
    if (this.inboundQueue.length === 0) {
      return;
    }

    // Take all items from the queue
    const queuedItems = this.inboundQueue.splice(0, this.inboundQueue.length);
    this.log.debug(`Processing ${queuedItems.length} queued inbound items`);

    // Calculate slot threshold for validation
    const l1Timestamp = this.synchronizer.getL1Timestamp();
    const slotAtNextL1Block =
      l1Timestamp === undefined ? undefined : getSlotAtNextL1Block(l1Timestamp, this.l1Constants);

    // Helpers for manipulating blocks and checkpoints in the queue
    const getSlot: (item: AddBlockRequest | AddProposedCheckpointRequest) => SlotNumber = item =>
      item.type === 'block' ? item.block.header.globalVariables.slotNumber : item.checkpoint.header.slotNumber;
    const getNumber: (item: AddBlockRequest | AddProposedCheckpointRequest) => number = item =>
      item.type === 'block' ? item.block.number : item.checkpoint.checkpointNumber;

    // Process each item individually to properly resolve/reject each promise
    for (const item of queuedItems) {
      const { resolve, reject, type } = item;
      const itemSlot = getSlot(item);
      const itemNumber = getNumber(item);
      if (slotAtNextL1Block !== undefined && itemSlot < slotAtNextL1Block) {
        const nextSlotTimestamp = getTimestampForSlot(slotAtNextL1Block, this.l1Constants);
        this.log.warn(
          `Rejecting proposed ${type} ${itemNumber} for past slot ${itemSlot} (current ${slotAtNextL1Block})`,
          { number: itemNumber, type, l1Timestamp, slotAtNextL1Block, nextSlotTimestamp },
        );
        reject(new BlockOrCheckpointSlotExpiredError(itemSlot, nextSlotTimestamp, l1Timestamp));
        continue;
      }

      try {
        if (type === 'block') {
          const [durationMs] = await elapsed(() => this.updater.addProposedBlock(item.block));
          this.instrumentation.processNewProposedBlock(durationMs, item.block);
        } else {
          await this.updater.addProposedCheckpoint(item.checkpoint);
        }
        this.log.debug(`Added ${type} ${itemNumber} to store`);
        resolve();
      } catch (err: any) {
        if (err instanceof BlockAlreadyCheckpointedError) {
          this.log.debug(`Proposed block ${itemNumber} matches already checkpointed block, ignoring late proposal`);
          resolve();
          continue;
        }
        this.log.error(`Failed to add ${type} ${itemNumber} to store: ${err.message}`, err, {
          number: itemNumber,
          type,
        });
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
    await this.processInboundQueue();
    // Now perform L1 sync
    await this.syncFromL1();
    // Prune proposed blocks with no corresponding proposed checkpoint after the appropriate materialization deadline.
    await this.pruneOrphanProposedBlocks();
  }

  /**
   * Prunes a block-only local tip that was built atop a checkpoint that was never itself proposed.
   *
   * Under pipelining, a proposer publishes the blocks for a checkpoint (block-only proposals) before
   * assembling and publishing the enclosing proposed checkpoint at the end of the build slot. A node
   * that received those blocks but never the proposed checkpoint is left with an orphan tip it must not build on.
   * If no checkpoint proposal was received for the orphan slot, we prune after the receive deadline plus local
   * tolerance. If a checkpoint proposal was received but has not materialized into proposed archiver state,
   * we prune after the consensus materialization deadline.
   *
   * The uncheckpointed suffix is scanned in order. Blocks covered by proposed checkpoints are left in
   * place; the first block not covered by a proposed checkpoint starts the orphan suffix to prune.
   */
  private async pruneOrphanProposedBlocks(): Promise<void> {
    if (this.config.skipOrphanProposedBlockPruning) {
      return;
    }
    const tips = await this.getL2Tips();
    const now = BigInt(this.dateProvider.nowInSeconds());

    // The proposed tip is a proposed-checkpointed block, so there are no orphan proposed blocks to prune
    if (tips.proposedCheckpoint.block.number === tips.proposed.number) {
      this.log.trace(
        `No orphan proposed blocks to prune: proposed tip ${tips.proposed.number} is checkpointed`,
        pick(tips, 'proposed', 'proposedCheckpoint'),
      );
      return;
    }

    // Load the blocks that are candidates for pruning (ie blocks without a proposed checkpoint covering them)
    const blocksWithoutProposedCheckpoint = await this.stores.blocks.getBlocksData({
      from: BlockNumber(tips.proposedCheckpoint.block.number + 1),
      limit: tips.proposed.number - tips.proposedCheckpoint.block.number,
    });

    // Iterate through them in order, the first one with a slot that should have received a proposed checkpoint
    // is the first orphan block, and all blocks after it are also orphaned and should be pruned.
    let lastSlotChecked = undefined;
    for (const blockData of blocksWithoutProposedCheckpoint) {
      // No need to recheck if this block had the same slot as the previous one.
      const blockSlot = blockData.header.getSlot();
      const blockNumber = blockData.header.getBlockNumber();
      if (lastSlotChecked !== undefined && blockSlot === lastSlotChecked) {
        continue;
      }
      lastSlotChecked = blockSlot;

      const hasCheckpointProposal = await this.checkpointProposalPresence.hasCheckpointProposalForSlot(blockSlot);
      const deadlineType = hasCheckpointProposal ? 'checkpoint-proposal-synced' : 'checkpoint-proposal-received';
      const selectedDeadline = BigInt(
        hasCheckpointProposal
          ? this.timetable.getCheckpointProposalSyncedDeadline(blockSlot)
          : Math.ceil(
              this.timetable.getCheckpointProposalReceiveDeadline(blockSlot) +
                this.config.orphanPruneNoProposalTolerance,
            ),
      );

      // If it's still not checkpointed once strictly past the selected deadline, prune it along with all blocks after
      // it. A proposal may still legitimately arrive or materialize at exactly its deadline, so the tip is only
      // orphaned once that instant has fully elapsed.
      if (now > selectedDeadline) {
        const pruneAfterBlockNumber = BlockNumber(blockNumber - 1);
        this.log.warn(
          `Pruning orphan blocks after block ${pruneAfterBlockNumber}: block at slot ${blockSlot} belongs to ` +
            `checkpoint ${blockData.checkpointNumber} which has no matching proposed checkpoint`,
          {
            firstUncheckpointedBlockHeader: blockData.header.toInspect(),
            blockCheckpointNumber: blockData.checkpointNumber,
            blockNumber,
            blockSlot,
            hasCheckpointProposal,
            deadlineType,
            selectedDeadline,
            now,
          },
        );

        const prunedBlocks = await this.updater.removeBlocksWithoutProposedCheckpointAfter(pruneAfterBlockNumber);
        if (prunedBlocks.length > 0) {
          this.events.emit(L2BlockSourceEvents.L2PruneUncheckpointed, {
            type: L2BlockSourceEvents.L2PruneUncheckpointed,
            slotNumber: blockSlot,
            blocks: prunedBlocks,
          });
        }
        return;
      }
    }

    this.log.trace('No orphan proposed blocks to prune: all uncheckpointed blocks are still within deadline', {
      blocksWithoutProposedCheckpoint: blocksWithoutProposedCheckpoint.map(b => b.header.toInspect()),
    });
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
          syncPoint: await getArchiverSynchPoint(this.stores),
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
    return backupArchiverDataStores(this.dataStores, destPath);
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

  public async getSyncedL2SlotNumber(): Promise<SlotNumber | undefined> {
    // The synced L2 slot is the latest slot for which we have all L1 data,
    // either because we have seen all L1 blocks for that slot, or because
    // we have seen the corresponding checkpoint.

    let slotFromL1Sync: SlotNumber | undefined;
    const l1Timestamp = this.synchronizer.getL1Timestamp();
    if (l1Timestamp !== undefined) {
      const nextL1BlockSlot = getSlotAtNextL1Block(l1Timestamp, this.l1Constants);
      if (Number(nextL1BlockSlot) > 0) {
        slotFromL1Sync = SlotNumber.add(nextL1BlockSlot, -1);
      }
    }

    let slotFromCheckpoint: SlotNumber | undefined;
    const latestCheckpointNumber = await this.stores.blocks.getLatestCheckpointNumber();
    if (latestCheckpointNumber > 0) {
      const checkpointData = await this.stores.blocks.getCheckpointData(latestCheckpointNumber);
      if (checkpointData) {
        slotFromCheckpoint = checkpointData.header.slotNumber;
      }
    }

    if (slotFromL1Sync === undefined && slotFromCheckpoint === undefined) {
      return undefined;
    }
    return SlotNumber(Math.max(slotFromL1Sync ?? 0, slotFromCheckpoint ?? 0));
  }

  public async getSyncedL2EpochNumber(): Promise<EpochNumber | undefined> {
    const syncedSlot = await this.getSyncedL2SlotNumber();
    if (syncedSlot === undefined) {
      return undefined;
    }
    // An epoch is fully synced when all its slots are synced.
    // We check if syncedSlot is the last slot of its epoch; if so, that epoch is fully synced.
    // Otherwise, only the previous epoch is fully synced.
    const epoch = getEpochAtSlot(syncedSlot, this.l1Constants);
    const [, endSlot] = getSlotRangeForEpoch(epoch, this.l1Constants);
    if (syncedSlot >= endSlot) {
      return epoch;
    }
    return Number(epoch) > 0 ? EpochNumber(Number(epoch) - 1) : undefined;
  }

  public async isEpochComplete(epochNumber: EpochNumber): Promise<boolean> {
    // The epoch is complete if the current checkpointed L2 block is the last one in the epoch (or later).
    // We use the checkpointed block number (synced from L1) instead of 'latest' to avoid returning true
    // prematurely when proposed blocks have been pushed to the archiver but not yet checkpointed on L1.
    const header = (await this.getBlockData({ tag: 'checkpointed' }))?.header;
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

  public removeCheckpointsAfter(checkpointNumber: CheckpointNumber): Promise<boolean> {
    return this.updater.removeCheckpointsAfter(checkpointNumber);
  }

  /** Used by TXE to add checkpoints directly without syncing from L1. */
  public async addCheckpoints(
    checkpoints: PublishedCheckpoint[],
    pendingChainValidationStatus?: ValidateCheckpointResult,
  ): Promise<boolean> {
    await this.updater.addCheckpoints(checkpoints, pendingChainValidationStatus);
    return true;
  }

  public getL2Tips(): Promise<L2Tips> {
    return this.l2TipsCache.getL2Tips();
  }

  public async rollbackTo(targetL2BlockNumber: BlockNumber): Promise<void> {
    const currentBlocks = await this.getL2Tips();
    const currentL2Block = currentBlocks.proposed.number;
    const currentProvenBlock = currentBlocks.proven.block.number;

    if (targetL2BlockNumber >= currentL2Block) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} must be less than current L2 block ${currentL2Block}`);
    }
    const checkpointedTip = await this.stores.blocks.getCheckpointedL2BlockNumber();
    if (targetL2BlockNumber > checkpointedTip) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} is not checkpointed yet`);
    }
    const targetBlockData = await this.stores.blocks.getBlockData({ number: targetL2BlockNumber });
    if (!targetBlockData) {
      throw new Error(`Target L2 block ${targetL2BlockNumber} not found`);
    }
    const targetCheckpointNumber = targetBlockData.checkpointNumber;

    // Rollback operates at checkpoint granularity: the target block must be the last block of its checkpoint.
    const checkpointData = await this.stores.blocks.getCheckpointData(targetCheckpointNumber);
    if (!checkpointData) {
      throw new Error(`Checkpoint ${targetCheckpointNumber} not found for block ${targetL2BlockNumber}`);
    }
    const lastBlockInCheckpoint = BlockNumber(checkpointData.startBlock + checkpointData.blockCount - 1);
    if (targetL2BlockNumber !== lastBlockInCheckpoint) {
      const previousCheckpointBoundary =
        checkpointData.startBlock > 1 ? BlockNumber(checkpointData.startBlock - 1) : BlockNumber(0);
      throw new Error(
        `Target L2 block ${targetL2BlockNumber} is not at a checkpoint boundary. ` +
          `Checkpoint ${targetCheckpointNumber} spans blocks ${checkpointData.startBlock} to ${lastBlockInCheckpoint}. ` +
          `Use block ${lastBlockInCheckpoint} to roll back to this checkpoint, ` +
          `or block ${previousCheckpointBoundary} to roll back to the previous one.`,
      );
    }

    const targetL1BlockNumber = checkpointData.l1.blockNumber;
    const targetL1Block = await this.publicClient.getBlock({
      blockNumber: targetL1BlockNumber,
      includeTransactions: false,
    });
    if (!targetL1Block) {
      throw new Error(`Missing L1 block ${targetL1BlockNumber}`);
    }
    const targetL1BlockHash = Buffer32.fromString(targetL1Block.hash);
    this.log.info(
      `Removing checkpoints after checkpoint ${targetCheckpointNumber} (target block ${targetL2BlockNumber})`,
    );
    await this.updater.removeCheckpointsAfter(targetCheckpointNumber);
    this.log.info(`Rolling back L1 to L2 messages to checkpoint ${targetCheckpointNumber}`);
    await this.stores.messages.rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber);
    this.log.info(`Setting L1 syncpoints to ${targetL1BlockNumber}`);
    await this.stores.blocks.setSynchedL1BlockNumber(targetL1BlockNumber);
    await this.stores.messages.setMessageSyncState(
      { l1BlockNumber: targetL1BlockNumber, l1BlockHash: targetL1BlockHash },
      undefined,
    );
    if (targetL2BlockNumber < currentProvenBlock) {
      this.log.info(`Rolling back proven L2 checkpoint to ${targetCheckpointNumber}`);
      await this.updater.setProvenCheckpointNumber(targetCheckpointNumber);
    }
    const currentFinalizedBlock = currentBlocks.finalized.block.number;
    if (targetL2BlockNumber < currentFinalizedBlock) {
      this.log.info(`Rolling back finalized L2 checkpoint to ${targetCheckpointNumber}`);
      await this.updater.setFinalizedCheckpointNumber(targetCheckpointNumber);
    }
  }
}
