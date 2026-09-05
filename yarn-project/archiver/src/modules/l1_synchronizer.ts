import type { BlobClientInterface } from '@aztec/blob-client/client';
import { EpochCache } from '@aztec/epoch-cache';
import { InboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1BlockId } from '@aztec/ethereum/l1-types';
import { getFinalizedL1Block } from '@aztec/ethereum/queries';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { asyncPool } from '@aztec/foundation/async-pool';
import { maxBigint } from '@aztec/foundation/bigint';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { partition, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer, elapsed } from '@aztec/foundation/timer';
import { isDefined } from '@aztec/foundation/types';
import {
  type ArchiverEmitter,
  type L2Block,
  L2BlockSourceEvents,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  type CheckpointInfo,
  type L1PublishedData,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getEpochAtSlot, getSlotAtNextL1Block } from '@aztec/stdlib/epoch-helpers';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { type Traceable, type Tracer, execInSpan, trackSpan } from '@aztec/telemetry-client';

import { InitialCheckpointNumberNotSequentialError } from '../errors.js';
import {
  type RetrievedCheckpointFromCalldata,
  getCheckpointBlobDataFromBlobs,
  retrieveCheckpointCalldataFromRollup,
  retrievedToPublishedCheckpoint,
} from '../l1/data_retrieval.js';
import type { RejectedCheckpoint } from '../store/block_store.js';
import { type ArchiverDataStores, getArchiverSynchPoint } from '../store/data_stores.js';
import type { L2TipsCache } from '../store/l2_tips_cache.js';
import { ArchiverDataStoreUpdater } from './data_store_updater.js';
import { InboxMessageSynchronizer } from './inbox_message_synchronizer.js';
import type { ArchiverInstrumentation } from './instrumentation.js';
import { validateCheckpointAttestationsFromCalldata } from './validation.js';

type RollupStatus = {
  provenCheckpointNumber: CheckpointNumber;
  provenArchive: string;
  pendingCheckpointNumber: CheckpointNumber;
  pendingArchive: string;
  validationResult: ValidateCheckpointResult | undefined;
  /** Last valid checkpoint observed on L1 and synced on this iteration */
  lastRetrievedCheckpoint?: PublishedCheckpoint;
  /** Last checkpoint observed on L1 across both valid and rejected entries on this iteration */
  lastSeenCheckpoint?: { checkpointNumber: CheckpointNumber; l1: L1PublishedData };
  /** Blocks added while handling checkpoints this iteration, for the aggregate block source update event. */
  blocksAdded: L2Block[];
};

/** Bounded Inbox message sync passes (a recovery step each) taken within one archiver sync iteration. */
const MAX_MESSAGE_SYNC_PASSES_PER_ITERATION = 3;

/**
 * Handles L1 synchronization for the archiver.
 * Responsible for fetching checkpoints, L1 to L2 messages, and handling L1 reorgs.
 */
export class ArchiverL1Synchronizer implements Traceable {
  private l1BlockNumber: bigint | undefined;
  private l1BlockHash: Buffer32 | undefined;
  private l1Timestamp: bigint | undefined;

  private readonly updater: ArchiverDataStoreUpdater;
  private readonly messageSynchronizer: InboxMessageSynchronizer;
  /**
   * Set when an Inbox message replacement reached below the checkpointed tip's consumed count. The published chain
   * is then L1's to reconcile through checkpoint sync; until the checkpointed tip agrees with the message log again,
   * proposed checkpoints are withheld so nothing speculates on top of blocks whose messages no longer exist.
   */
  private speculationGate: { sinceL1BlockNumber: bigint } | undefined;
  public readonly tracer: Tracer;

  constructor(
    private readonly publicClient: ViemPublicClient,
    private readonly debugClient: ViemPublicDebugClient,
    private readonly rollup: RollupContract,
    private readonly inbox: InboxContract,
    private readonly stores: ArchiverDataStores,
    private config: {
      batchSize: number;
      skipValidateCheckpointAttestations?: boolean;
      skipPromoteProposedCheckpointDuringL1Sync?: boolean;
      maxAllowedEthClientDriftSeconds: number;
    },
    private readonly blobClient: BlobClientInterface,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly instrumentation: ArchiverInstrumentation,
    private readonly l1Constants: L1RollupConstants & {
      l1StartBlockHash: Buffer32;
      genesisArchiveRoot: Fr;
    },
    private readonly events: ArchiverEmitter,
    tracer: Tracer,
    l2TipsCache?: L2TipsCache,
    private readonly log: Logger = createLogger('archiver:l1-sync'),
  ) {
    this.updater = new ArchiverDataStoreUpdater(this.stores, l2TipsCache, {
      rollupManaLimit: l1Constants.rollupManaLimit,
    });
    this.messageSynchronizer = new InboxMessageSynchronizer(
      publicClient,
      inbox,
      stores,
      this.updater,
      { l1BlockNumber: l1Constants.l1StartBlock, l1BlockHash: l1Constants.l1StartBlockHash },
      () => this.getBatchSizeInL1Blocks(),
      undefined,
      (count, msPerMessage) => this.instrumentation.processNewMessages(count, msPerMessage),
      this.log.createChild('inbox'),
    );
    this.tracer = tracer;
  }

  /**
   * Whether speculative work is gated because the Inbox message log disagrees with the checkpointed tip, pending
   * checkpoint reconciliation from L1: proposed checkpoints are withheld and the synced L1 block is not advanced, so
   * proposers neither pipeline on a proposed checkpoint nor build on the checkpointed tip until the gate lifts.
   */
  public isSpeculationGated(): boolean {
    return this.speculationGate !== undefined;
  }

  /** Whether the Inbox message log is still being recovered after an L1 reorg. */
  public isRecoveringMessages(): boolean {
    return this.messageSynchronizer.isRecovering();
  }

  /** Sets new config */
  public setConfig(newConfig: {
    batchSize: number;
    skipValidateCheckpointAttestations?: boolean;
    skipPromoteProposedCheckpointDuringL1Sync?: boolean;
    maxAllowedEthClientDriftSeconds: number;
  }) {
    this.config = newConfig;
  }

  /** Returns the last L1 block number that was synced. */
  public getL1BlockNumber(): bigint | undefined {
    return this.l1BlockNumber;
  }

  /** Returns the last L1 timestamp that was synced. */
  public getL1Timestamp(): bigint | undefined {
    return this.l1Timestamp;
  }

  private getSignatureContext(): CoordinationSignatureContext {
    return {
      chainId: this.publicClient.chain.id,
      rollupAddress: EthAddress.fromString(this.rollup.address),
    };
  }

  /** Checks that the ethereum node we are connected to has a latest timestamp no more than the allowed drift. Throw if not. */
  public async testEthereumNodeSynced(): Promise<void> {
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
  public async syncFromL1(initialSyncComplete: boolean): Promise<L2Block[]> {
    const blocksAdded: L2Block[] = [];

    // In between the various calls to L1, the block number can move meaning some of the following
    // calls will return data for blocks that were not present during earlier calls. To combat this
    // we ensure that all data retrieval methods only retrieve data up to the currentBlockNumber
    // captured at the top of this function.
    const currentL1Block = await this.publicClient.getBlock({ includeTransactions: false });
    const currentL1BlockNumber = currentL1Block.number;
    const currentL1BlockHash = Buffer32.fromString(currentL1Block.hash);
    const currentL1Timestamp = currentL1Block.timestamp;
    const currentL1BlockData = { l1BlockNumber: currentL1BlockNumber, l1BlockHash: currentL1BlockHash };

    if (this.l1BlockHash && currentL1BlockHash.equals(this.l1BlockHash)) {
      this.log.trace(`No new L1 blocks since last sync at L1 block ${this.l1BlockNumber}`);
      return blocksAdded;
    }

    // Log at error if the latest L1 block timestamp is too old
    const maxAllowedDelay = this.config.maxAllowedEthClientDriftSeconds;
    const now = this.dateProvider.nowInSeconds();
    if (maxAllowedDelay > 0 && Number(currentL1Timestamp) <= now - maxAllowedDelay) {
      this.log.error(
        `Latest L1 block ${currentL1BlockNumber} timestamp ${currentL1Timestamp} is too old. Make sure your Ethereum node is synced.`,
        { currentL1BlockNumber, currentL1Timestamp, now, maxAllowedDelay },
      );
    }

    // Query finalized block on L1
    const rawFinalizedL1Block = await getFinalizedL1Block(this.publicClient);
    const finalizedL1Block: L1BlockId | undefined = rawFinalizedL1Block && {
      l1BlockNumber: rawFinalizedL1Block.number,
      l1BlockHash: Buffer32.fromString(rawFinalizedL1Block.hash),
    };

    // Load sync point for blocks defaulting to start block
    const { blocksSynchedTo = this.l1Constants.l1StartBlock } = await getArchiverSynchPoint(this.stores);
    this.log.debug(`Starting new archiver sync iteration`, { blocksSynchedTo, currentL1BlockData, finalizedL1Block });

    // Sync L1 to L2 messages first, since blocks are checked against them. A reorg recovery is bounded per pass and
    // may leave the messages pending; checkpoints are still processed below so a disagreement below the checkpointed
    // tip can be reconciled from L1, but the iteration then does not advertise the head as synced.
    const messageSync = await this.syncL1ToL2Messages(currentL1BlockData, finalizedL1Block);

    if (currentL1BlockNumber > blocksSynchedTo) {
      // First we retrieve new checkpoints and L2 blocks and store them in the DB. This will also update the
      // pending chain validation status, proven checkpoint number, and synched L1 block number.
      const rollupStatus = await this.handleCheckpoints(blocksSynchedTo, currentL1BlockNumber, initialSyncComplete);
      blocksAdded.push(...rollupStatus.blocksAdded);

      // Then we try pruning uncheckpointed blocks if a new slot was mined without checkpoints
      await this.pruneUncheckpointedBlocks(currentL1Timestamp);

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

      // And lastly we check if we are missing any checkpoints behind us due to a possible L1 reorg.
      // We only do this if rollup cant prune on the next submission. Otherwise we will end up
      // re-syncing the checkpoints we have just unwound above.
      if (!rollupCanPrune) {
        await this.checkForNewCheckpointsBeforeL1SyncPoint(rollupStatus, blocksSynchedTo, currentL1BlockNumber);
      }

      this.instrumentation.updateL1BlockHeight(currentL1BlockNumber);
    } else if (await this.checkpointedChainNeedsReconciliation(currentL1BlockData)) {
      await this.reconcileCheckpointedChainAtNonAdvancingHead(blocksSynchedTo, currentL1BlockNumber);
    }

    // Update the finalized L2 checkpoint based on L1 finality.
    await this.updateFinalizedCheckpoint(finalizedL1Block);

    await this.updateSpeculationGate(currentL1BlockNumber);

    // Readiness (the synced L1 block, which drives the synced L2 slot proposers build on) is only advanced once the
    // messages agree with L1 at this head and the checkpointed tip agrees with them: while either is pending, nothing
    // may build on the local tip.
    if (messageSync !== 'synced' || this.speculationGate !== undefined) {
      this.log.verbose(`Not advertising L1 block ${currentL1BlockNumber} as synced`, {
        currentL1BlockNumber,
        messageSync,
        speculationGate: this.speculationGate,
        recovery: this.messageSynchronizer.getRecoveryProgress(),
      });
      return blocksAdded;
    }

    // After syncing has completed, update the current l1 block number and timestamp,
    // otherwise we risk announcing to the world that we've synced to a given point,
    // but the corresponding blocks have not been processed (see #12631).
    this.l1Timestamp = currentL1Timestamp;
    this.l1BlockNumber = currentL1BlockNumber;
    this.l1BlockHash = currentL1BlockHash;

    const l1BlockNumberAtEnd = await this.publicClient.getBlockNumber();
    this.log.debug(`Archiver sync iteration complete`, {
      l1BlockNumberAtStart: currentL1BlockNumber,
      l1TimestampAtStart: currentL1Timestamp,
      l1BlockNumberAtEnd,
    });

    return blocksAdded;
  }

  /** Updates the finalized checkpoint using the pre-fetched finalized L1 block from the current sync iteration. */
  private async updateFinalizedCheckpoint(finalizedL1Block: L1BlockId | undefined): Promise<void> {
    try {
      if (!finalizedL1Block) {
        this.log.trace(`Skipping finalized checkpoint update: L1 has no finalized block yet.`);
        return;
      }
      const finalizedL1BlockNumber = finalizedL1Block.l1BlockNumber;
      const finalizedCheckpointNumber = await this.rollup.getProvenCheckpointNumber({
        blockNumber: finalizedL1BlockNumber,
      });
      const localFinalizedCheckpointNumber = await this.stores.blocks.getFinalizedCheckpointNumber();
      if (localFinalizedCheckpointNumber !== finalizedCheckpointNumber) {
        await this.updater.setFinalizedCheckpointNumber(finalizedCheckpointNumber);
        this.log.info(`Updated finalized chain to checkpoint ${finalizedCheckpointNumber}`, {
          finalizedCheckpointNumber,
          finalizedL1BlockNumber,
        });
      }
    } catch (err: any) {
      // The rollup contract may not exist at the finalized L1 block right after deployment.
      if (!err?.message?.includes('returned no data')) {
        this.log.warn(`Failed to update finalized checkpoint: ${err}`);
      }
    }
  }

  /** Prune all proposed local blocks that should have been checkpointed by now. */
  private async pruneUncheckpointedBlocks(currentL1Timestamp: bigint): Promise<void> {
    const [lastCheckpointedBlockNumber, lastProposedBlockNumber] = await Promise.all([
      this.stores.blocks.getCheckpointedL2BlockNumber(),
      this.stores.blocks.getLatestL2BlockNumber(),
    ]);

    // If there are no uncheckpointed blocks, we got nothing to do
    if (lastProposedBlockNumber === lastCheckpointedBlockNumber) {
      this.log.trace(`No uncheckpointed blocks to prune.`);
      return;
    }

    // What's the slot at the next L1 block? All blocks for slots strictly before this one should've been checkpointed by now.
    const slotAtNextL1Block = getSlotAtNextL1Block(currentL1Timestamp, this.l1Constants);
    const firstUncheckpointedBlockNumber = BlockNumber(lastCheckpointedBlockNumber + 1);

    // What's the slot of the first uncheckpointed block?
    const firstUncheckpointedBlockData = await this.stores.blocks.getBlockData({
      number: firstUncheckpointedBlockNumber,
    });
    const firstUncheckpointedBlockSlot = firstUncheckpointedBlockData?.header.getSlot();

    if (firstUncheckpointedBlockSlot === undefined || firstUncheckpointedBlockSlot >= slotAtNextL1Block) {
      return;
    }

    // Prune provisional blocks from slots that have ended without being checkpointed.
    // This also clears any proposed checkpoint whose blocks are being pruned.
    this.log.warn(
      `Pruning blocks after block ${lastCheckpointedBlockNumber} due to slot ${firstUncheckpointedBlockSlot} not being checkpointed`,
      { firstUncheckpointedBlockHeader: firstUncheckpointedBlockData?.header.toInspect(), slotAtNextL1Block },
    );

    const prunedBlocks = await this.updater.removeUncheckpointedBlocksAfter(lastCheckpointedBlockNumber);
    if (prunedBlocks.length > 0) {
      this.instrumentation.recordPrune('uncheckpointed');
      this.events.emit(L2BlockSourceEvents.L2PruneUncheckpointed, {
        type: L2BlockSourceEvents.L2PruneUncheckpointed,
        slotNumber: firstUncheckpointedBlockSlot,
        blocks: prunedBlocks,
      });
    }
  }

  /** Queries the rollup contract on whether a prune can be executed on the immediate next L1 block. */
  private async canPrune(currentL1BlockNumber: bigint, currentL1Timestamp: bigint): Promise<boolean> {
    const time = (currentL1Timestamp ?? 0n) + BigInt(this.l1Constants.ethereumSlotDuration);
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
  ): Promise<{ rollupCanPrune: boolean }> {
    const rollupCanPrune = await this.canPrune(currentL1BlockNumber, currentL1Timestamp);
    const localPendingCheckpointNumber = await this.stores.blocks.getLatestCheckpointNumber();
    const canPrune = localPendingCheckpointNumber > provenCheckpointNumber && rollupCanPrune;

    if (canPrune) {
      const timer = new Timer();
      const pruneFrom = CheckpointNumber(provenCheckpointNumber + 1);

      const header = await this.getCheckpointHeader(pruneFrom);
      if (header === undefined) {
        throw new Error(`Missing checkpoint header ${pruneFrom}`);
      }

      const pruneFromSlotNumber = header.slotNumber;
      const pruneFromEpochNumber: EpochNumber = getEpochAtSlot(pruneFromSlotNumber, this.l1Constants);

      const checkpointsToUnwind = localPendingCheckpointNumber - provenCheckpointNumber;

      // Fetch checkpoints and blocks in bounded batches to avoid unbounded concurrent
      // promises when the gap between local pending and proven checkpoint numbers is large.
      const BATCH_SIZE = 10;
      const indices = Array.from({ length: checkpointsToUnwind }, (_, i) => CheckpointNumber(i + pruneFrom));
      const checkpoints = (
        await asyncPool(BATCH_SIZE, indices, idx => this.stores.blocks.getCheckpointData(idx))
      ).filter(isDefined);
      const newBlocks = (
        await asyncPool(BATCH_SIZE, checkpoints, cp =>
          this.stores.blocks.getBlocksForCheckpoint(CheckpointNumber(cp.checkpointNumber)),
        )
      )
        .filter(isDefined)
        .flat();

      // Emit an event for listening services to react to the chain prune
      this.events.emit(L2BlockSourceEvents.L2PruneUnproven, {
        type: L2BlockSourceEvents.L2PruneUnproven,
        epochNumber: pruneFromEpochNumber,
        blocks: newBlocks,
      });

      this.log.debug(
        `L2 prune from ${provenCheckpointNumber + 1} to ${localPendingCheckpointNumber} will occur on next checkpoint submission.`,
      );
      await this.updater.removeCheckpointsAfter(provenCheckpointNumber);
      this.log.warn(
        `Removed ${count(checkpointsToUnwind, 'checkpoint')} after checkpoint ${provenCheckpointNumber} ` +
          `due to predicted reorg at L1 block ${currentL1BlockNumber}. ` +
          `Updated latest checkpoint is ${await this.stores.blocks.getLatestCheckpointNumber()}.`,
      );
      this.instrumentation.processPrune(timer.ms());
      // TODO(palla/reorg): Do we need to set the block synched L1 block number here?
      // Seems like the next iteration should handle this.
      // await this.stores.blocks.setSynchedL1BlockNumber(currentL1BlockNumber);
    }

    return { rollupCanPrune };
  }

  private nextRange(end: bigint, limit: bigint): [bigint, bigint] {
    const nextStart = end + 1n;
    const nextEnd = nextStart + this.getBatchSizeInL1Blocks();
    if (nextEnd > limit) {
      return [nextStart, limit];
    }
    return [nextStart, nextEnd];
  }

  /**
   * Runs Inbox message sync passes against the captured head until the messages are synced to it or the per-iteration
   * pass budget is spent. Each pass is bounded; a recovery that needs more work continues on the next iteration, which
   * re-captures the head but keeps the recovery pinned to the head it started against.
   */
  @trackSpan('Archiver.syncL1ToL2Messages')
  private async syncL1ToL2Messages(
    currentL1Block: L1BlockId,
    finalizedL1Block: L1BlockId | undefined,
  ): Promise<'synced' | 'pending'> {
    for (let pass = 0; pass < MAX_MESSAGE_SYNC_PASSES_PER_ITERATION; pass++) {
      const result = await this.messageSynchronizer.sync(currentL1Block, finalizedL1Block);
      if (result.checkpointedTipAffected) {
        this.speculationGate = { sinceL1BlockNumber: currentL1Block.l1BlockNumber };
        this.log.warn(`Inbox messages consumed by the checkpointed tip changed on L1; gating speculative work`, {
          currentL1BlockNumber: currentL1Block.l1BlockNumber,
        });
      }
      if (result.prunedBlocks.length > 0) {
        this.log.warn(`Pruned ${result.prunedBlocks.length} proposed blocks that consumed replaced Inbox messages`, {
          prunedBlocks: result.prunedBlocks.map(b => b.toBlockInfo()),
        });
        this.instrumentation.recordPrune('inbox_reorg');
        this.events.emit(L2BlockSourceEvents.L2PruneUncheckpointed, {
          type: L2BlockSourceEvents.L2PruneUncheckpointed,
          slotNumber: result.prunedBlocks[0].header.globalVariables.slotNumber,
          blocks: result.prunedBlocks,
        });
      }
      if (result.status === 'synced') {
        return 'synced';
      }
    }
    return 'pending';
  }

  /**
   * Re-evaluates the speculation gate from persisted state: it holds while the latest checkpoint's consumed message
   * prefix (its count and rolling hash) disagrees with the message log, and lifts once checkpoint sync has rolled the
   * published chain back or replaced it with what L1 mined over the new messages. Evaluated every iteration rather
   * than only after a replacement, so a restart between a replacement and its reconciliation rebuilds the gate.
   */
  private async updateSpeculationGate(currentL1BlockNumber: bigint): Promise<void> {
    const agrees = await this.checkpointedTipAgreesWithMessages();
    if (agrees && this.speculationGate !== undefined) {
      this.log.info(`Checkpointed tip agrees with the Inbox message log again; releasing speculative work`, {
        ...this.speculationGate,
        currentL1BlockNumber,
      });
      this.speculationGate = undefined;
    } else if (!agrees && this.speculationGate === undefined) {
      this.speculationGate = { sinceL1BlockNumber: currentL1BlockNumber };
      this.log.warn(`Checkpointed tip disagrees with the Inbox message log; gating speculative work`, {
        currentL1BlockNumber,
      });
    }
  }

  /** Whether the latest checkpoint's consumed message prefix (its count and rolling hash) is what the message log holds. */
  private async checkpointedTipAgreesWithMessages(): Promise<boolean> {
    const latestCheckpointNumber = await this.stores.blocks.getLatestCheckpointNumber();
    if (latestCheckpointNumber === CheckpointNumber.ZERO) {
      return true;
    }
    const checkpoint = await this.stores.blocks.getCheckpointData(latestCheckpointNumber);
    if (checkpoint === undefined) {
      return true;
    }
    const lastBlockNumber = BlockNumber(checkpoint.startBlock + checkpoint.blockCount - 1);
    const [lastBlock] = await this.stores.blocks.getBlocksData({ from: lastBlockNumber, limit: 1 });
    if (lastBlock === undefined || lastBlock.header.getBlockNumber() !== lastBlockNumber) {
      return false;
    }
    const consumedCount = BigInt(lastBlock.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
    const position = await this.stores.messages.getMessagePosition(consumedCount);
    return position !== undefined && position.rollingHash.equals(checkpoint.header.inboxRollingHash);
  }

  /** The number of L1 blocks one message or checkpoint retrieval batch spans. */
  private getBatchSizeInL1Blocks(): bigint {
    return BigInt(
      Math.max(
        1,
        Math.floor((this.config.batchSize * this.l1Constants.slotDuration) / this.l1Constants.ethereumSlotDuration),
      ),
    );
  }

  /**
   * Whether a head that did not advance past the checkpoint syncpoint (a same-height or shorter replacement, or a
   * view of the chain behind what was already synced) calls for the checkpointed chain to be reconciled against L1:
   * when the checkpointed tip disagrees with the message log, so that only reconciliation can lift the speculation
   * gate, or when the L1 block the latest local checkpoint was published in is within the head's reach and no longer
   * carries that hash. A view that merely stops short of the latest checkpoint's block waits for L1 to grow past it.
   */
  private async checkpointedChainNeedsReconciliation(head: L1BlockId): Promise<boolean> {
    if (this.speculationGate !== undefined || !(await this.checkpointedTipAgreesWithMessages())) {
      return true;
    }
    const latestCheckpointNumber = await this.stores.blocks.getLatestCheckpointNumber();
    if (latestCheckpointNumber === CheckpointNumber.ZERO) {
      return false;
    }
    const checkpoint = await this.stores.blocks.getCheckpointData(latestCheckpointNumber);
    if (checkpoint === undefined || checkpoint.l1.blockNumber > head.l1BlockNumber) {
      return false;
    }
    const block = await this.publicClient.getBlock({
      blockNumber: checkpoint.l1.blockNumber,
      includeTransactions: false,
    });
    return !Buffer32.fromString(block.hash).equals(Buffer32.fromString(checkpoint.l1.blockHash));
  }

  /**
   * Reconciles the checkpointed chain with L1 at a head that is not past the checkpoint syncpoint, without fetching
   * any log range (there is no forward range to fetch, and an inverted one must never be issued). Rolls the published
   * chain back to what L1 holds at the head, and moves the syncpoint back to a head below it: the blocks past the head
   * no longer exist, so whatever L1 mines there next has to be scanned.
   */
  private async reconcileCheckpointedChainAtNonAdvancingHead(
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ): Promise<void> {
    this.log.warn(
      `L1 head ${currentL1BlockNumber} is not past the checkpoint syncpoint ${blocksSynchedTo}; reconciling the checkpointed chain with it`,
      { blocksSynchedTo, currentL1BlockNumber },
    );
    const { rollupStatus } = await this.reconcileCheckpointedChain(blocksSynchedTo, currentL1BlockNumber);
    if (currentL1BlockNumber < (await this.stores.blocks.getSynchedL1BlockNumber())!) {
      await this.stores.blocks.setSynchedL1BlockNumber(currentL1BlockNumber);
    }
    await this.checkForNewCheckpointsBeforeL1SyncPoint(rollupStatus, blocksSynchedTo, currentL1BlockNumber);
  }

  /**
   * Compares the local checkpointed chain with the rollup's status at the given L1 head: updates the proven tip and
   * unwinds local checkpoints L1 no longer has. Returns whether checkpoint logs still have to be fetched forward, which
   * is not the case when neither side has checkpoints or L1's pending tip is exactly the local one.
   */
  private async reconcileCheckpointedChain(
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ): Promise<{ rollupStatus: RollupStatus; fetchCheckpoints: boolean; provenArchive: Fr }> {
    const localPendingCheckpointNumber = await this.stores.blocks.getLatestCheckpointNumber();
    const initialValidationResult: ValidateCheckpointResult | undefined =
      await this.stores.blocks.getPendingChainValidationStatus();
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
      blocksAdded: [],
    };
    this.log.trace(`Retrieved rollup status at current L1 block ${currentL1BlockNumber}.`, {
      localPendingCheckpointNumber,
      blocksSynchedTo,
      currentL1BlockNumber,
      archiveForLocalPendingCheckpointNumber,
      ...rollupStatus,
    });

    // This is an edge case that we only hit if there are no proposed checkpoints.
    // If we have 0 checkpoints locally and there are no checkpoints onchain there is nothing to do.
    const noCheckpoints = localPendingCheckpointNumber === 0 && pendingCheckpointNumber === 0;
    if (noCheckpoints) {
      await this.stores.blocks.setSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.debug(
        `No checkpoints to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}, no checkpoints on chain`,
      );
      return { rollupStatus, fetchCheckpoints: false, provenArchive };
    }

    await this.updateProvenCheckpoint(provenCheckpointNumber, provenArchive);

    // Related to the L2 reorgs of the pending chain. We are only interested in actually addressing a reorg if there
    // are any state that could be impacted by it. If we have no checkpoints, there is no impact.
    if (localPendingCheckpointNumber > 0) {
      const localPendingCheckpoint = await this.stores.blocks.getCheckpointData(localPendingCheckpointNumber);
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
        // await this.stores.blocks.setSynchedL1BlockNumber(currentL1BlockNumber);
        this.log.debug(`No checkpoints to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}`);
        return { rollupStatus, fetchCheckpoints: false, provenArchive };
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
          const candidateCheckpoint = await this.stores.blocks.getCheckpointData(tipAfterUnwind);
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

        const checkpointsToRemove = localPendingCheckpointNumber - tipAfterUnwind;
        await this.updater.removeCheckpointsAfter(CheckpointNumber(tipAfterUnwind));
        if (checkpointsToRemove > 0) {
          this.instrumentation.recordPrune('l1_mismatch');
        }

        this.log.warn(
          `Removed ${count(checkpointsToRemove, 'checkpoint')} after checkpoint ${tipAfterUnwind} ` +
            `due to mismatched checkpoint hashes at L1 block ${currentL1BlockNumber}. ` +
            `Updated L2 latest checkpoint is ${await this.stores.blocks.getLatestCheckpointNumber()}.`,
        );
      }
    }

    return { rollupStatus, fetchCheckpoints: true, provenArchive };
  }

  private async updateProvenCheckpoint(provenCheckpointNumber: CheckpointNumber, provenArchive: Fr): Promise<void> {
    // Annoying edge case: if proven checkpoint is moved back to 0 due to a reorg at the beginning of the chain,
    // we need to set it to zero. This is an edge case because we dont have a checkpoint zero (initial checkpoint is one),
    // so localCheckpointForDestinationProvenCheckpointNumber would not be found below.
    if (provenCheckpointNumber === 0) {
      const localProvenCheckpointNumber = await this.stores.blocks.getProvenCheckpointNumber();
      if (localProvenCheckpointNumber !== provenCheckpointNumber) {
        await this.updater.setProvenCheckpointNumber(provenCheckpointNumber);
        this.log.info(`Rolled back proven chain to checkpoint ${provenCheckpointNumber}`, { provenCheckpointNumber });
      }
    }

    const localCheckpointForDestinationProvenCheckpointNumber =
      await this.stores.blocks.getCheckpointData(provenCheckpointNumber);

    // Sanity check. I've hit what seems to be a state where the proven checkpoint is set to a value greater than the latest
    // synched checkpoint when requesting L2Tips from the archiver. This is the only place where the proven checkpoint is set.
    const synched = await this.stores.blocks.getLatestCheckpointNumber();
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
      const localProvenCheckpointNumber = await this.stores.blocks.getProvenCheckpointNumber();
      if (localProvenCheckpointNumber !== provenCheckpointNumber) {
        await this.updater.setProvenCheckpointNumber(provenCheckpointNumber);
        this.log.info(`Updated proven chain to checkpoint ${provenCheckpointNumber}`, { provenCheckpointNumber });
        const provenSlotNumber = localCheckpointForDestinationProvenCheckpointNumber.header.slotNumber;
        const provenEpochNumber: EpochNumber = getEpochAtSlot(provenSlotNumber, this.l1Constants);
        const lastBlockNumberInCheckpoint =
          localCheckpointForDestinationProvenCheckpointNumber.startBlock +
          localCheckpointForDestinationProvenCheckpointNumber.blockCount -
          1;

        this.events.emit(L2BlockSourceEvents.L2BlockProven, {
          type: L2BlockSourceEvents.L2BlockProven,
          blockNumber: BlockNumber(lastBlockNumberInCheckpoint),
          slotNumber: provenSlotNumber,
          epochNumber: provenEpochNumber,
        });
        this.instrumentation.updateLastProvenCheckpoint(localCheckpointForDestinationProvenCheckpointNumber);
      } else {
        this.log.trace(`Proven checkpoint ${provenCheckpointNumber} already stored.`);
      }
    }
  }

  @trackSpan('Archiver.handleCheckpoints')
  private async handleCheckpoints(
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
    initialSyncComplete: boolean,
  ): Promise<RollupStatus> {
    const { rollupStatus, fetchCheckpoints, provenArchive } = await this.reconcileCheckpointedChain(
      blocksSynchedTo,
      currentL1BlockNumber,
    );
    if (!fetchCheckpoints) {
      return rollupStatus;
    }
    const { blocksAdded, validationResult: initialValidationResult } = rollupStatus;

    // Retrieve checkpoints in batches. Each batch is estimated to accommodate up to 'blockBatchSize' L1 blocks,
    // computed using the L2 block time vs the L1 block time.
    let searchStartBlock: bigint = blocksSynchedTo;
    let searchEndBlock: bigint = blocksSynchedTo;
    let lastRetrievedCheckpoint: PublishedCheckpoint | undefined;
    let lastSeenCheckpoint: { checkpointNumber: CheckpointNumber; l1: L1PublishedData } | undefined;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);

      this.log.trace(`Retrieving checkpoints from L1 block ${searchStartBlock} to ${searchEndBlock}`);

      // First fetch calldata only, no blobs yet, since we may be able to just get that data out of the proposed chain
      const calldataCheckpoints = await execInSpan(this.tracer, 'Archiver.retrieveCheckpointCalldataFromRollup', () =>
        retrieveCheckpointCalldataFromRollup(
          this.rollup,
          this.publicClient,
          this.debugClient,
          searchStartBlock, // TODO(palla/reorg): If the L2 reorg was due to an L1 reorg, we need to start search earlier
          searchEndBlock,
          this.instrumentation,
          this.log,
        ),
      );

      if (calldataCheckpoints.length === 0) {
        // We are not calling `setBlockSynchedL1BlockNumber` because it may cause sync issues if based off infura.
        // See further details in earlier comments.
        this.log.trace(`Retrieved no new checkpoints from L1 block ${searchStartBlock} to ${searchEndBlock}`);
        continue;
      }

      this.log.debug(
        `Retrieved ${calldataCheckpoints.length} new checkpoint calldata between L1 blocks ${searchStartBlock} and ${searchEndBlock}`,
        {
          lastProcessedCheckpoint: calldataCheckpoints[calldataCheckpoints.length - 1].l1,
          searchStartBlock,
          searchEndBlock,
        },
      );

      // Check if the last checkpoint matches a local pending entry (so we can skip blob fetch).
      // We only check the last one; if it matches, the blob fetch is skipped for that entry.
      // TODO(palla/pipelining): We may have more than a single checkpoint to promote
      const lastCalldataCheckpoint = calldataCheckpoints[calldataCheckpoints.length - 1];
      const promoteResult = await this.tryBuildPublishedCheckpointFromProposed(lastCalldataCheckpoint);
      const checkpointToPromote = promoteResult && !('diverged' in promoteResult) ? promoteResult : undefined;
      const evictProposedFrom =
        promoteResult && 'diverged' in promoteResult ? promoteResult.fromCheckpointNumber : undefined;

      // Validate attestations from CALLDATA before fetching any blobs. A checkpoint with invalid
      // attestations (or one descending from a rejected ancestor) is rejected here without fetching its
      // blobs, so a malformed blob does not throw during decode before the rejection path runs and
      // stall sync. The signed consensus payload (header, archive root, fee asset price
      // modifier) is fully available from calldata.
      const checkpointsToIngest: RetrievedCheckpointFromCalldata[] = [];

      for (const calldataCheckpoint of calldataCheckpoints) {
        // Check the attestations uploaded by the publisher to L1 are correct.
        // Rollup contract does not validate attestations to save on gas, so this
        // falls on the nodes to verify offchain and skip those checkpoints.
        const validationResult = this.config.skipValidateCheckpointAttestations
          ? { valid: true as const }
          : await validateCheckpointAttestationsFromCalldata(
              calldataCheckpoint,
              this.epochCache,
              this.l1Constants,
              this.getSignatureContext(),
              this.log,
            );

        // Also skip the checkpoint if it builds on a previously-rejected ancestor. Without
        // this, addCheckpoints would throw InitialCheckpointNumberNotSequentialError when the
        // ancestor was skipped earlier (e.g. due to invalid attestations), the catch handler
        // would roll back the L1 sync point, and the next iteration would re-fetch and re-throw.
        const rejectedAncestor = await this.stores.blocks.getRejectedCheckpointByArchiveRoot(
          calldataCheckpoint.header.lastArchiveRoot,
        );

        // Update the validation result if it has changed, so we can keep track of the first invalid checkpoint
        // in case there is a sequence of more than one invalid checkpoint, as we need to invalidate the first one.
        // There is an exception though: if a checkpoint is invalidated and replaced with another invalid checkpoint,
        // we need to update the validation result, since we need to be able to invalidate the new one.
        // See test 'chain progresses if an invalid checkpoint is invalidated with an invalid one' for more info.
        // Do not update the validation result if there is a rejected ancestor, since in that case we want to keep the
        // original invalidation, as the new checkpoint is extending from a previous invalid one.
        const validStatusChanged = rollupStatus.validationResult?.valid !== validationResult.valid;
        const invalidStatusWithSameCheckpointNumber =
          !validationResult.valid &&
          rollupStatus.validationResult &&
          !rollupStatus.validationResult.valid &&
          rollupStatus.validationResult.checkpoint.checkpointNumber === validationResult.checkpoint.checkpointNumber;

        if (!rejectedAncestor && (validStatusChanged || invalidStatusWithSameCheckpointNumber)) {
          rollupStatus.validationResult = validationResult;
        }

        if (!validationResult.valid) {
          this.log.warn(`Skipping checkpoint ${calldataCheckpoint.checkpointNumber} due to invalid attestations`, {
            checkpointNumber: calldataCheckpoint.checkpointNumber,
            l1BlockNumber: calldataCheckpoint.l1.blockNumber,
            ...pick(validationResult, 'reason'),
          });

          // Emit event for invalid checkpoint detection
          this.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, {
            type: L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
            validationResult,
          });

          // Persist a rejected-ancestor entry so any later checkpoint that builds on this one
          // is detected and skipped (rather than tripping the addCheckpoints consecutive-number
          // check and causing the sync point to roll back in a loop).
          await this.stores.blocks.addRejectedCheckpoint({
            checkpointNumber: calldataCheckpoint.checkpointNumber,
            archiveRoot: calldataCheckpoint.archiveRoot,
            parentArchiveRoot: calldataCheckpoint.header.lastArchiveRoot,
            slotNumber: calldataCheckpoint.header.slotNumber,
            l1: calldataCheckpoint.l1,
            reason: 'invalid-attestations' as const,
          });

          continue;
        }

        if (rejectedAncestor) {
          const descendantInfo: CheckpointInfo = {
            archive: calldataCheckpoint.archiveRoot,
            lastArchive: calldataCheckpoint.header.lastArchiveRoot,
            slotNumber: calldataCheckpoint.header.slotNumber,
            checkpointNumber: calldataCheckpoint.checkpointNumber,
            timestamp: calldataCheckpoint.header.timestamp,
          };
          this.log.warn(
            `Skipping checkpoint ${calldataCheckpoint.checkpointNumber} as it is a descendant of ` +
              `rejected checkpoint ${rejectedAncestor.checkpointNumber} (${rejectedAncestor.reason})`,
            {
              checkpointNumber: calldataCheckpoint.checkpointNumber,
              l1BlockNumber: calldataCheckpoint.l1.blockNumber,
              l1BlockHash: calldataCheckpoint.l1.blockHash,
              ancestorCheckpointNumber: rejectedAncestor.checkpointNumber,
              ancestorArchiveRoot: rejectedAncestor.archiveRoot.toString(),
              ancestorReason: rejectedAncestor.reason,
            },
          );

          this.events.emit(L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected, {
            type: L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected,
            checkpoint: descendantInfo,
            ancestorArchiveRoot: rejectedAncestor.archiveRoot,
            ancestorCheckpointNumber: rejectedAncestor.checkpointNumber,
          });

          // Persist this chainpoint as rejected as well, so we can construct a chain of
          // skipped checkpoints starting from the first one with invalid attestations.
          await this.stores.blocks.addRejectedCheckpoint({
            checkpointNumber: calldataCheckpoint.checkpointNumber,
            archiveRoot: calldataCheckpoint.archiveRoot,
            parentArchiveRoot: calldataCheckpoint.header.lastArchiveRoot,
            slotNumber: calldataCheckpoint.header.slotNumber,
            l1: calldataCheckpoint.l1,
            reason: 'descends-from-invalid-attestations' as const,
          });

          continue;
        }

        checkpointsToIngest.push(calldataCheckpoint);
      }

      // Fetch blobs in parallel only for the surviving (attestation-valid, non-descendant) checkpoints,
      // then build the full published checkpoints. The last calldata checkpoint may be promotable from a
      // local proposed block (checkpointToPromote), in which case it carries no blob to fetch. A missing or
      // undecodable blob throws and propagates, rolling back the L1 sync point so the fetch is retried.
      const toFetchBlobs = checkpointToPromote
        ? checkpointsToIngest.filter(c => c.checkpointNumber !== checkpointToPromote.checkpoint.number)
        : checkpointsToIngest;
      const blobFetched = await asyncPool(10, toFetchBlobs, async checkpoint =>
        retrievedToPublishedCheckpoint({
          ...checkpoint,
          checkpointBlobData: await getCheckpointBlobDataFromBlobs(
            this.blobClient,
            checkpoint.l1.blockHash,
            checkpoint.blobHashes,
            checkpoint.checkpointNumber,
            this.log,
            !initialSyncComplete,
            checkpoint.parentBeaconBlockRoot,
            checkpoint.l1.timestamp,
          ),
        }),
      );

      // Index the built checkpoints by number so we can ingest them in calldata order, slotting in the
      // promoted checkpoint (built from a local proposed block rather than blobs).
      const publishedByNumber = new Map(blobFetched.map(published => [published.checkpoint.number, published]));
      if (checkpointToPromote) {
        publishedByNumber.set(checkpointToPromote.checkpoint.number, checkpointToPromote);
      }

      const validCheckpoints: PublishedCheckpoint[] = [];
      for (const calldataCheckpoint of checkpointsToIngest) {
        const published = publishedByNumber.get(calldataCheckpoint.checkpointNumber)!;

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

      for (const published of validCheckpoints) {
        this.instrumentation.processCheckpointL1Timing({
          slotNumber: published.checkpoint.header.slotNumber,
          l1Timestamp: published.l1.timestamp,
          l1Constants: this.l1Constants,
        });
      }

      try {
        const updatedValidationResult =
          rollupStatus.validationResult === initialValidationResult ? undefined : rollupStatus.validationResult;

        // Split valid checkpoints: the promoted one (if any) is persisted via the proposed-promotion path,
        // the rest via addCheckpoints. Both paths run within the same store transaction for atomicity.
        const [[maybeValidCheckpointToPromote], checkpointsToAdd] = partition(
          validCheckpoints,
          c => c.checkpoint.number === checkpointToPromote?.checkpoint.number,
        );

        const [processDuration, result] = await elapsed(() =>
          execInSpan(this.tracer, 'Archiver.addCheckpoints', () =>
            this.updater.addCheckpoints(
              checkpointsToAdd,
              updatedValidationResult,
              maybeValidCheckpointToPromote && {
                l1: lastCalldataCheckpoint.l1,
                attestations: lastCalldataCheckpoint.attestations,
                checkpoint: maybeValidCheckpointToPromote,
              },
              evictProposedFrom,
            ),
          ),
        );

        if (validCheckpoints.length > 0) {
          this.instrumentation.processNewCheckpointedBlocks(
            processDuration / validCheckpoints.length,
            validCheckpoints.flatMap(c => c.checkpoint.blocks),
          );
        }

        // Record blocks newly fetched from L1 checkpoint payloads as added. The promoted checkpoint (if any) is
        // excluded: its blocks were already in local archiver storage (added via the proposed-block path) so the
        // block stream does not need them re-downloaded.
        blocksAdded.push(...checkpointsToAdd.flatMap(c => c.checkpoint.blocks));

        // If blocks were pruned due to conflict with L1 checkpoints, emit event
        if (result.prunedBlocks && result.prunedBlocks.length > 0) {
          const prunedCheckpointNumber = result.prunedBlocks[0].checkpointNumber;
          const prunedSlotNumber = result.prunedBlocks[0].header.globalVariables.slotNumber;

          this.log.info(
            `Pruned ${result.prunedBlocks.length} mismatching blocks for checkpoint ${prunedCheckpointNumber}`,
            { prunedBlocks: result.prunedBlocks.map(b => b.toBlockInfo()), prunedSlotNumber, prunedCheckpointNumber },
          );

          this.instrumentation.recordPrune('l1_conflict');

          // Emit event for listening services to react to the prune.
          // Note: slotNumber comes from the first pruned block. If pruned blocks theoretically spanned multiple slots,
          // only one slot number would be reported (though in practice all blocks in a checkpoint span a single slot).
          this.events.emit(L2BlockSourceEvents.L2PruneUncheckpointed, {
            type: L2BlockSourceEvents.L2PruneUncheckpointed,
            slotNumber: prunedSlotNumber,
            blocks: result.prunedBlocks,
          });
        }
      } catch (err) {
        if (err instanceof InitialCheckpointNumberNotSequentialError) {
          const { previousCheckpointNumber, newCheckpointNumber } = err;
          const previousCheckpoint = previousCheckpointNumber
            ? await this.stores.blocks.getCheckpointData(CheckpointNumber(previousCheckpointNumber))
            : undefined;
          const lastFinalizedCheckpoint = await this.stores.blocks.getCheckpointData(
            await this.stores.blocks.getFinalizedCheckpointNumber(),
          );
          const updatedL1SyncPoint =
            previousCheckpoint?.l1.blockNumber ??
            lastFinalizedCheckpoint?.l1.blockNumber ??
            this.l1Constants.l1StartBlock;
          await this.stores.blocks.setSynchedL1BlockNumber(updatedL1SyncPoint);
          this.log.warn(
            `Attempting to insert checkpoint ${newCheckpointNumber} with previous block ${previousCheckpointNumber}. Rolling back L1 sync point to ${updatedL1SyncPoint} to try and fetch the missing blocks.`,
            {
              previousCheckpointNumber,
              previousCheckpoint: previousCheckpoint?.header.toInspect(),
              lastFinalizedCheckpoint: lastFinalizedCheckpoint?.header.toInspect(),
              l1StartBlock: this.l1Constants.l1StartBlock,
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
      // The last checkpoint seen on L1 this batch (valid or rejected), tracked from calldata since
      // rejected checkpoints are no longer built into PublishedCheckpoints.
      lastSeenCheckpoint = lastCalldataCheckpoint;
    } while (searchEndBlock < currentL1BlockNumber);

    // Important that we update AFTER inserting the blocks.
    await this.updateProvenCheckpoint(rollupStatus.provenCheckpointNumber, provenArchive);

    return { ...rollupStatus, lastRetrievedCheckpoint, lastSeenCheckpoint };
  }

  /**
   * Checks if a specific checkpoint matches a local pending entry, and if so, loads local data to build
   * a synthetic published checkpoint (skipping blob fetch).
   *
   * Returns { diverged: true, fromCheckpointNumber } when the L1 checkpoint does NOT match local pending
   * data for that number, so the caller can evict the entire pending suffix >= fromCheckpointNumber
   * (those entries chain off the now-invalid local state) within the same addCheckpoints transaction.
   */
  private async tryBuildPublishedCheckpointFromProposed(
    calldataCheckpoint: RetrievedCheckpointFromCalldata | undefined,
  ): Promise<PublishedCheckpoint | { diverged: true; fromCheckpointNumber: CheckpointNumber } | undefined> {
    if (this.config.skipPromoteProposedCheckpointDuringL1Sync || !calldataCheckpoint) {
      return undefined;
    }

    // Look up the specific pending entry for the checkpoint being mined, not just the tip
    const proposed = await this.stores.blocks.getProposedCheckpointByNumber(calldataCheckpoint.checkpointNumber);
    if (!proposed) {
      return undefined;
    }

    if (
      !proposed.header.equals(calldataCheckpoint.header) ||
      !proposed.archive.root.equals(calldataCheckpoint.archiveRoot)
    ) {
      this.log.warn(
        `Local proposed checkpoint ${proposed.checkpointNumber} does not match checkpoint retrieved from L1, overriding with L1 data`,
        {
          proposedCheckpointNumber: proposed.checkpointNumber,
          proposedHeader: proposed.header.toInspect(),
          proposedArchiveRoot: proposed.archive.root.toString(),
          calldataCheckpointNumber: calldataCheckpoint.checkpointNumber,
          calldataHeader: calldataCheckpoint.header.toInspect(),
          calldataArchiveRoot: calldataCheckpoint.archiveRoot.toString(),
        },
      );
      // Both the locally-proposed checkpoint and the L1-confirmed one are signed by the
      // slot proposer; emit a divergence event so the slasher can attribute equivocation.
      // Only emit when the slots match — uncheckpointed entries are pruned above so this
      // should always hold, but guard defensively to avoid mis-attributing a slash.
      if (proposed.header.slotNumber === calldataCheckpoint.header.slotNumber) {
        this.events.emit(L2BlockSourceEvents.CheckpointEquivocationDetected, {
          type: L2BlockSourceEvents.CheckpointEquivocationDetected,
          slotNumber: calldataCheckpoint.header.slotNumber,
          checkpointNumber: calldataCheckpoint.checkpointNumber,
          l1ArchiveRoot: calldataCheckpoint.archiveRoot,
          proposedArchiveRoot: proposed.archive.root,
        });
      }
      // Return a divergence signal so the caller can evict pending >= this number
      return { diverged: true, fromCheckpointNumber: proposed.checkpointNumber };
    }

    this.log.debug(
      `Building published checkpoint from proposed ${calldataCheckpoint.checkpointNumber} (skipping blob fetch)`,
      { proposedHeader: proposed.header.toInspect(), proposedArchiveRoot: proposed.archive.root.toString() },
    );

    const blocks = await this.stores.blocks.getBlocks({
      from: BlockNumber(proposed.startBlock),
      limit: proposed.blockCount,
    });
    if (blocks.length !== proposed.blockCount) {
      this.log.warn(
        `Local proposed checkpoint ${proposed.checkpointNumber} has wrong block count (expected ${proposed.blockCount} blocks starting at ${proposed.startBlock} but got ${blocks.length})`,
        {
          proposedCheckpointNumber: proposed.checkpointNumber,
          proposedStartBlock: proposed.startBlock,
          proposedBlockCount: proposed.blockCount,
          retrievedBlocks: blocks.map(b => b.number),
        },
      );
      return undefined;
    }

    const checkpoint = Checkpoint.from({
      archive: proposed.archive,
      header: proposed.header,
      blocks,
      number: proposed.checkpointNumber,
      feeAssetPriceModifier: proposed.feeAssetPriceModifier,
    });
    const promotedCheckpoint = PublishedCheckpoint.from({
      checkpoint,
      l1: calldataCheckpoint.l1,
      attestations: calldataCheckpoint.attestations,
    });
    this.instrumentation.processCheckpointPromoted();

    return promotedCheckpoint;
  }

  private async checkForNewCheckpointsBeforeL1SyncPoint(
    status: RollupStatus,
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
  ): Promise<void> {
    const { lastSeenCheckpoint, pendingCheckpointNumber } = status;
    // Compare the last checkpoint (valid or not) we have (either retrieved in this round or loaded from store)
    // with what the rollup contract told us was the latest one (pinned at the currentL1BlockNumber).
    const latestLocalCheckpointNumber =
      lastSeenCheckpoint?.checkpointNumber ??
      CheckpointNumber.max(
        await this.stores.blocks.getLatestCheckpointNumber(),
        await this.stores.blocks.getLatestRejectedCheckpointNumber(),
      ) ??
      CheckpointNumber.ZERO;

    if (latestLocalCheckpointNumber < pendingCheckpointNumber) {
      // Here we have consumed all logs until the `currentL1Block` we pinned at the beginning of the archiver loop,
      // but still haven't reached the pending checkpoint according to the call to the rollup contract.
      // We suspect an L1 reorg that added checkpoints *behind* us. If that is the case, it must have happened between
      // the last checkpoint we saw and the current one, so we reset the last synched L1 block number. In the edge case
      // we don't have one, we go back 2 L1 epochs, which is the deepest possible reorg (assuming Casper is working).
      const latestLocalCheckpoint:
        | { checkpointNumber: CheckpointNumber; l1: L1PublishedData }
        | CheckpointData
        | RejectedCheckpoint
        | undefined =
        lastSeenCheckpoint ??
        (await this.stores.blocks.getCheckpointData(latestLocalCheckpointNumber)) ??
        (await this.stores.blocks.getRejectedCheckpointByNumber(latestLocalCheckpointNumber));

      const targetL1BlockNumber =
        latestLocalCheckpoint?.l1.blockNumber ??
        maxBigint(currentL1BlockNumber - 64n, this.l1Constants.l1StartBlock, 0n);

      this.log.warn(
        `Failed to reach checkpoint ${pendingCheckpointNumber} at ${currentL1BlockNumber} (latest is ${latestLocalCheckpointNumber}). ` +
          `Rolling back last synched L1 block number to ${targetL1BlockNumber}.`,
        {
          latestLocalCheckpointNumber,
          latestLocalCheckpointL1: latestLocalCheckpoint?.l1,
          blocksSynchedTo,
          currentL1BlockNumber,
          ...status,
        },
      );
      await this.stores.blocks.setSynchedL1BlockNumber(targetL1BlockNumber);
    } else {
      this.log.trace(`No new checkpoints behind L1 sync point to retrieve.`, {
        latestLocalCheckpointNumber,
        pendingCheckpointNumber,
      });
    }
  }

  private async getCheckpointHeader(number: CheckpointNumber) {
    const checkpoint = await this.stores.blocks.getCheckpointData(number);
    if (!checkpoint) {
      return undefined;
    }
    return checkpoint.header;
  }
}
