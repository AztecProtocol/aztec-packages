import type { BlobClientInterface } from '@aztec/blob-client/client';
import { EpochCache } from '@aztec/epoch-cache';
import { InboxContract, type InboxContractState, RollupContract } from '@aztec/ethereum/contracts';
import type { L1BlockId } from '@aztec/ethereum/l1-types';
import { getFinalizedL1Block } from '@aztec/ethereum/queries';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { asyncPool } from '@aztec/foundation/async-pool';
import { maxBigint } from '@aztec/foundation/bigint';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { compactArray, partition, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryTimes } from '@aztec/foundation/retry';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer, elapsed } from '@aztec/foundation/timer';
import { isDefined, isErrorClass } from '@aztec/foundation/types';
import {
  type ArchiverEmitter,
  type CommitteeAttestation,
  L2BlockSourceEvents,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  type CheckpointInfo,
  L1PublishedData,
  PublishedCheckpoint,
  archiveFromBuffer,
} from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getEpochAtSlot, getSlotAtNextL1Block } from '@aztec/stdlib/epoch-helpers';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import {
  type L1CheckpointHeader,
  OutOfRangeFieldError,
  l1CheckpointHeaderHash,
  toL1CheckpointHeader,
} from '@aztec/stdlib/rollup';
import { type Traceable, type Tracer, execInSpan, trackSpan } from '@aztec/telemetry-client';

import { InitialCheckpointNumberNotSequentialError } from '../errors.js';
import {
  type RetrievedCheckpointFromCalldata,
  getCheckpointBlobDataFromBlobs,
  retrieveCheckpointCalldataFromRollup,
  retrieveL1ToL2Message,
  retrieveL1ToL2Messages,
  retrievedToPublishedCheckpoint,
} from '../l1/data_retrieval.js';
import type { RejectedCheckpoint } from '../store/block_store.js';
import { type ArchiverDataStores, getArchiverSynchPoint } from '../store/data_stores.js';
import type { L2TipsCache } from '../store/l2_tips_cache.js';
import { MessageStoreError } from '../store/message_store.js';
import type { InboxMessage } from '../structs/inbox_message.js';
import { ArchiverDataStoreUpdater } from './data_store_updater.js';
import type { ArchiverInstrumentation } from './instrumentation.js';
import { type CheckpointForValidation, validateCheckpointAttestations } from './validation.js';

/** Byte-level equality of two archive roots, regardless of whether each is carried as an Fr or raw Buffer32. */
function archiveRootsEqual(a: Fr | Buffer32, b: Fr | Buffer32): boolean {
  return a.toString() === b.toString();
}

/**
 * A checkpoint observed on L1 in its raw form, used to validate attestations and classify the checkpoint as
 * valid/invalid/descendant-of-rejected before any blob fetch or Fr/CheckpointHeader conversion. Either a freshly
 * retrieved calldata checkpoint or one promoted from local proposed data (already in range).
 */
type RawCheckpointEntry = {
  checkpointNumber: CheckpointNumber;
  header: L1CheckpointHeader;
  /** Raw archive root, used for digest/validation; may be out of range. */
  archiveRoot: Buffer32;
  /** Archive root normalized to Fr when in range, used for persisted records and emitted events. */
  normalizedArchiveRoot: Fr | Buffer32;
  feeAssetPriceModifier: bigint;
  attestations: CommitteeAttestation[];
  l1: L1PublishedData;
  /** `lastArchiveRoot` of this checkpoint (always in range), as Fr, for rejected-ancestor lookups. */
  lastArchiveRoot: Fr;
  slotNumber: SlotNumber;
} & (
  | { kind: 'calldata'; calldata: RetrievedCheckpointFromCalldata }
  | { kind: 'promoted'; promoted: PublishedCheckpoint }
);

type RollupStatus = {
  provenCheckpointNumber: CheckpointNumber;
  provenArchive: string;
  pendingCheckpointNumber: CheckpointNumber;
  pendingArchive: string;
  validationResult: ValidateCheckpointResult | undefined;
  /** Last valid checkpoint observed on L1 and synced on this iteration */
  lastRetrievedCheckpoint?: PublishedCheckpoint;
  /** Last checkpoint observed on L1 across both valid and rejected entries on this iteration */
  lastSeenCheckpoint?: PublishedCheckpoint;
};

/**
 * Handles L1 synchronization for the archiver.
 * Responsible for fetching checkpoints, L1 to L2 messages, and handling L1 reorgs.
 */
export class ArchiverL1Synchronizer implements Traceable {
  private l1BlockNumber: bigint | undefined;
  private l1BlockHash: Buffer32 | undefined;
  private l1Timestamp: bigint | undefined;

  private readonly updater: ArchiverDataStoreUpdater;
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
    this.tracer = tracer;
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
  public async syncFromL1(initialSyncComplete: boolean): Promise<void> {
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
      return;
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

    // Sync L1 to L2 messages. We retry this a few times since there are error conditions that reset the sync point, requiring a new iteration.
    // Note that we cannot just wait for the l1 synchronizer to loop again, since the synchronizer would report as synced up to the current L1
    // block, when that wouldn't be the case, since L1 to L2 messages would need another iteration.
    await retryTimes(
      () => this.handleL1ToL2Messages(currentL1BlockData, finalizedL1Block),
      'Handling L1 to L2 messages',
      3,
      0.1,
    );

    if (currentL1BlockNumber > blocksSynchedTo) {
      // First we retrieve new checkpoints and L2 blocks and store them in the DB. This will also update the
      // pending chain validation status, proven checkpoint number, and synched L1 block number.
      const rollupStatus = await this.handleCheckpoints(blocksSynchedTo, currentL1BlockNumber, initialSyncComplete);

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
    }

    // Update the finalized L2 checkpoint based on L1 finality.
    await this.updateFinalizedCheckpoint(finalizedL1Block);

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
  private async pruneUncheckpointedBlocks(currentL1Timestamp: bigint) {
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
    const batchSize = (this.config.batchSize * this.l1Constants.slotDuration) / this.l1Constants.ethereumSlotDuration;
    const nextStart = end + 1n;
    const nextEnd = nextStart + BigInt(batchSize);
    if (nextEnd > limit) {
      return [nextStart, limit];
    }
    return [nextStart, nextEnd];
  }

  @trackSpan('Archiver.handleL1ToL2Messages')
  private async handleL1ToL2Messages(
    currentL1Block: L1BlockId,
    finalizedL1Block: L1BlockId | undefined,
  ): Promise<boolean> {
    // Load the syncpoint, which may have been updated in a previous iteration
    const {
      messagesSynchedTo = {
        l1BlockNumber: this.l1Constants.l1StartBlock,
        l1BlockHash: this.l1Constants.l1StartBlockHash,
      },
    } = await getArchiverSynchPoint(this.stores);

    // Nothing to do if L1 block number has not moved forward
    const currentL1BlockNumber = currentL1Block.l1BlockNumber;
    if (currentL1BlockNumber <= messagesSynchedTo.l1BlockNumber) {
      return true;
    }

    // Compare local message store state with the remote. If they match, we just advance the match pointer.
    const remoteMessagesState = await this.inbox.getState({ blockNumber: currentL1BlockNumber });
    const localLastMessage = await this.stores.messages.getLastMessage();
    if (await this.localStateMatches(localLastMessage, remoteMessagesState)) {
      this.log.trace(`Local L1 to L2 messages are already in sync with remote at L1 block ${currentL1BlockNumber}`);
      await this.stores.messages.setMessageSyncState(
        currentL1Block,
        remoteMessagesState.treeInProgress,
        finalizedL1Block,
      );
      return true;
    }

    // If not, then we are out of sync. Most likely there are new messages on the inbox, so we try retrieving them.
    // However, it could also be the case that there was an L1 reorg and our syncpoint is no longer valid.
    // If that's the case, we'd get an exception out of the message store since the rolling hash of the first message
    // we try to insert would not match the one in the db, in which case we rollback to the last common message with L1.
    try {
      await this.retrieveAndStoreMessages(messagesSynchedTo.l1BlockNumber, currentL1BlockNumber);
    } catch (error) {
      if (isErrorClass(error, MessageStoreError)) {
        this.log.warn(
          `Failed to store L1 to L2 messages retrieved from L1: ${error.message}. Rolling back syncpoint to retry.`,
          { inboxMessage: error.inboxMessage },
        );
        await this.rollbackL1ToL2Messages(remoteMessagesState);
        return false;
      }
      throw error;
    }

    // Note that, if there are no new messages to insert, but there was an L1 reorg that pruned out last messages,
    // we'd notice by comparing our local state with the remote one again, and seeing they don't match even after
    // our sync attempt. In this case, we also rollback our syncpoint, and trigger a retry.
    const localLastMessageAfterSync = await this.stores.messages.getLastMessage();
    if (!(await this.localStateMatches(localLastMessageAfterSync, remoteMessagesState))) {
      this.log.warn(
        `Local L1 to L2 messages state does not match remote after sync attempt. Rolling back syncpoint to retry.`,
        { localLastMessageAfterSync, remoteMessagesState },
      );
      await this.rollbackL1ToL2Messages(remoteMessagesState);
      return false;
    }

    // Advance the syncpoint after a successful sync
    await this.stores.messages.setMessageSyncState(
      currentL1Block,
      remoteMessagesState.treeInProgress,
      finalizedL1Block,
    );
    return true;
  }

  /** Checks if the local rolling hash and message count matches the remote state */
  private async localStateMatches(localLastMessage: InboxMessage | undefined, remoteState: InboxContractState) {
    const localMessageCount = await this.stores.messages.getTotalL1ToL2MessageCount();
    this.log.trace(`Comparing local and remote inbox state`, { localMessageCount, localLastMessage, remoteState });

    return (
      remoteState.totalMessagesInserted === localMessageCount &&
      remoteState.messagesRollingHash.equals(localLastMessage?.rollingHash ?? Buffer16.ZERO)
    );
  }

  /** Retrieves L1 to L2 messages from L1 in batches and stores them. */
  private async retrieveAndStoreMessages(fromL1Block: bigint, toL1Block: bigint): Promise<void> {
    let searchStartBlock: bigint = 0n;
    let searchEndBlock: bigint = fromL1Block;

    let lastMessage: InboxMessage | undefined;
    let messageCount = 0;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, toL1Block);
      this.log.trace(`Retrieving L1 to L2 messages in L1 blocks ${searchStartBlock}-${searchEndBlock}`);
      const messages = await retrieveL1ToL2Messages(this.inbox, searchStartBlock, searchEndBlock);
      const timer = new Timer();
      await this.stores.messages.addL1ToL2Messages(messages);
      const perMsg = timer.ms() / messages.length;
      this.instrumentation.processNewMessages(messages.length, perMsg);
      for (const msg of messages) {
        this.log.debug(`Downloaded L1 to L2 message`, { ...msg, leaf: msg.leaf.toString() });
        lastMessage = msg;
        messageCount++;
      }
    } while (searchEndBlock < toL1Block);

    if (messageCount > 0) {
      this.log.info(
        `Retrieved ${messageCount} new L1 to L2 messages up to message with index ${lastMessage?.index} for checkpoint ${lastMessage?.checkpointNumber}`,
        { lastMessage, messageCount },
      );
    }
  }

  /**
   * Rolls back local L1 to L2 messages to the last common message with L1, and updates the syncpoint to the L1 block of that message.
   * If no common message is found, rolls back all messages and sets the syncpoint to the start block.
   */
  private async rollbackL1ToL2Messages(remoteMessagesState: InboxContractState): Promise<L1BlockId> {
    const { treeInProgress: remoteTreeInProgress, messagesRollingHash: remoteRollingHash } = remoteMessagesState;

    const messagesFinalizedL1Block = await this.stores.messages.getMessagesFinalizedL1Block();
    const finalizedL1BlockNumber = messagesFinalizedL1Block?.l1BlockNumber;

    // Slowly go back through our messages until we find the last common message. We could query the logs in
    // batch as an optimization, but the depth of the reorg should not be deep, and this is a very rare case,
    // so it's fine to query one log at a time.
    let commonMsg: undefined | InboxMessage;
    let messagesToDelete = 0;
    this.log.verbose(`Searching most recent common L1 to L2 message`);
    for await (const localMsg of this.stores.messages.iterateL1ToL2Messages({ reverse: true })) {
      const logCtx = { remoteMsg: undefined as InboxMessage | undefined, localMsg, remoteMessagesState };

      // First check if the local message rolling hash matches the current rolling hash of the inbox contract,
      // which means we just need to rollback some local messages and we should be back in sync. This means there
      // was an L1 reorg that removed some of the messages we had, but no new messages were added compared.
      if (localMsg.rollingHash.equals(remoteRollingHash)) {
        this.log.info(
          `Found common L1 to L2 message at index ${localMsg.index} on L1 block ${localMsg.l1BlockNumber} matching current remote state`,
          logCtx,
        );
        commonMsg = localMsg;
        break;
      }

      // Messages at or below the finalized L1 block cannot have been reorged — accept as common without querying L1.
      if (finalizedL1BlockNumber !== undefined && localMsg.l1BlockNumber <= finalizedL1BlockNumber) {
        this.log.info(`Found common L1 to L2 message at finalized L1 block ${localMsg.l1BlockNumber}`, logCtx);
        commonMsg = localMsg;
        break;
      }

      // If there's no match with the current remote state, check if the message exists on the inbox contract at all
      // by looking at the inbox events. If the L1 reorg *added* new messages in addition to deleting existing ones,
      // then the current remote state's rolling hash will not match anything we have locally, so we need to check existence
      // of individual messages via logs. Note we use logs and not historical queries so we don't have to depend on
      // an archival rpc node, since the message could be from a long time ago if we're catching up with syncing.
      const remoteMsg = await retrieveL1ToL2Message(this.inbox, localMsg);
      logCtx.remoteMsg = remoteMsg;
      if (remoteMsg && remoteMsg.rollingHash.equals(localMsg.rollingHash)) {
        this.log.info(
          `Found most recent common L1 to L2 message at index ${localMsg.index} on L1 block ${localMsg.l1BlockNumber}`,
          logCtx,
        );
        commonMsg = remoteMsg;
        break;
      } else if (remoteMsg) {
        this.log.debug(`Local L1 to L2 message with index ${localMsg.index} has different rolling hash`, logCtx);
        messagesToDelete++;
      } else {
        this.log.debug(`Local L1 to L2 message with index ${localMsg.index} not found on L1`, logCtx);
        messagesToDelete++;
      }
    }

    // Delete everything after the common message we found, if anything needs to be deleted.
    // Do not exit early if there are no messages to delete, we still want to update the syncpoint.
    if (messagesToDelete > 0) {
      const lastGoodIndex = commonMsg?.index;
      this.log.warn(`Rolling back all local L1 to L2 messages after index ${lastGoodIndex ?? 'initial'}`);
      await this.stores.messages.removeL1ToL2Messages(lastGoodIndex !== undefined ? lastGoodIndex + 1n : 0n);
    }

    // Update the syncpoint so the loop below reprocesses the changed messages. We go to the block before
    // the last common one, so we force reprocessing it, in case new messages were added on that same L1 block
    // after the last common message. Cap at the finalized L1 block: messages at or below finalized cannot
    // have been reorged, so there is no need to walk back any further than that.
    const syncPointL1BlockNumber = maxBigint(
      ...compactArray([
        commonMsg ? commonMsg.l1BlockNumber - 1n : undefined,
        finalizedL1BlockNumber,
        this.l1Constants.l1StartBlock,
      ]),
    );

    const syncPointL1BlockHash =
      syncPointL1BlockNumber === finalizedL1BlockNumber
        ? messagesFinalizedL1Block!.l1BlockHash
        : await this.getL1BlockHash(syncPointL1BlockNumber);

    const messagesSyncPoint = { l1BlockNumber: syncPointL1BlockNumber, l1BlockHash: syncPointL1BlockHash };
    await this.stores.messages.setMessageSyncState(messagesSyncPoint, remoteTreeInProgress);
    this.log.verbose(`Updated messages syncpoint to L1 block ${messagesSyncPoint.l1BlockNumber}`, {
      ...messagesSyncPoint,
      remoteTreeInProgress,
    });
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
  private async handleCheckpoints(
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
    initialSyncComplete: boolean,
  ): Promise<RollupStatus> {
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
        archiveRootsEqual(provenArchive, localCheckpointForDestinationProvenCheckpointNumber.archive.root)
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
    };

    // This is an edge case that we only hit if there are no proposed checkpoints.
    // If we have 0 checkpoints locally and there are no checkpoints onchain there is nothing to do.
    const noCheckpoints = localPendingCheckpointNumber === 0 && pendingCheckpointNumber === 0;
    if (noCheckpoints) {
      await this.stores.blocks.setSynchedL1BlockNumber(currentL1BlockNumber);
      this.log.debug(
        `No checkpoints to retrieve from ${blocksSynchedTo + 1n} to ${currentL1BlockNumber}, no checkpoints on chain`,
      );
      return rollupStatus;
    }

    await updateProvenCheckpoint();

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
        return rollupStatus;
      }

      const localPendingCheckpointInChain = archiveRootsEqual(
        archiveForLocalPendingCheckpointNumber,
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
          if (archiveRootsEqual(archiveAtContract, candidateCheckpoint.archive.root)) {
            break;
          }
          tipAfterUnwind--;
        }

        const checkpointsToRemove = localPendingCheckpointNumber - tipAfterUnwind;
        await this.updater.removeCheckpointsAfter(CheckpointNumber(tipAfterUnwind));

        this.log.warn(
          `Removed ${count(checkpointsToRemove, 'checkpoint')} after checkpoint ${tipAfterUnwind} ` +
            `due to mismatched checkpoint hashes at L1 block ${currentL1BlockNumber}. ` +
            `Updated L2 latest checkpoint is ${await this.stores.blocks.getLatestCheckpointNumber()}.`,
        );
      }
    }

    // Retrieve checkpoints in batches. Each batch is estimated to accommodate up to 'blockBatchSize' L1 blocks,
    // computed using the L2 block time vs the L1 block time.
    let searchStartBlock: bigint = blocksSynchedTo;
    let searchEndBlock: bigint = blocksSynchedTo;
    let lastRetrievedCheckpoint: PublishedCheckpoint | undefined;
    let lastSeenCheckpoint: PublishedCheckpoint | undefined;

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

      // Build the per-checkpoint raw view used for attestation validation. We validate BEFORE building the
      // PublishedCheckpoint (which requires blob fetch and Fr/CheckpointHeader conversion), so a malicious
      // out-of-range header/archive is rejected via the normal insufficient/invalid-attestations path
      // instead of throwing during decode and stalling the L1 sync point. The promoted checkpoint
      // (built from local, in-range proposed data) is folded in via its raw form.
      const promotedRaw: RawCheckpointEntry[] = checkpointToPromote
        ? [
            {
              kind: 'promoted',
              checkpointNumber: checkpointToPromote.checkpoint.number,
              header: toL1CheckpointHeader(checkpointToPromote.checkpoint.header),
              archiveRoot: Buffer32.fromField(checkpointToPromote.checkpoint.archive.root),
              normalizedArchiveRoot: checkpointToPromote.checkpoint.archive.root,
              feeAssetPriceModifier: checkpointToPromote.checkpoint.feeAssetPriceModifier,
              attestations: checkpointToPromote.attestations,
              l1: checkpointToPromote.l1,
              lastArchiveRoot: checkpointToPromote.checkpoint.header.lastArchiveRoot,
              slotNumber: checkpointToPromote.checkpoint.header.slotNumber,
              promoted: checkpointToPromote,
            },
          ]
        : [];
      const calldataRaw: RawCheckpointEntry[] = (
        checkpointToPromote ? calldataCheckpoints.slice(0, -1) : calldataCheckpoints
      ).map(checkpoint => ({
        kind: 'calldata',
        checkpointNumber: checkpoint.checkpointNumber,
        header: checkpoint.header,
        archiveRoot: checkpoint.archiveRoot,
        normalizedArchiveRoot: archiveFromBuffer(checkpoint.archiveRoot.toBuffer()),
        feeAssetPriceModifier: checkpoint.feeAssetPriceModifier,
        attestations: checkpoint.attestations,
        l1: checkpoint.l1,
        lastArchiveRoot: Fr.fromString(checkpoint.header.lastArchiveRoot),
        slotNumber: SlotNumber.fromBigInt(checkpoint.header.slotNumber),
        calldata: checkpoint,
      }));
      // Calldata checkpoints come first (in their L1 order), then the promoted one (the latest tip).
      const rawCheckpoints: RawCheckpointEntry[] = [...calldataRaw, ...promotedRaw];

      const validCheckpoints: PublishedCheckpoint[] = [];

      // Validate attestations and classify each checkpoint before any blob fetch / Fr conversion.
      for (const raw of rawCheckpoints) {
        const validationInput: CheckpointForValidation = {
          checkpointNumber: raw.checkpointNumber,
          header: raw.header,
          archiveRoot: raw.archiveRoot,
          feeAssetPriceModifier: raw.feeAssetPriceModifier,
          attestations: raw.attestations,
        };

        // Check the attestations uploaded by the publisher to L1 are correct
        // Rollup contract does not validate attestations to save on gas, so this
        // falls on the nodes to verify offchain and skip those checkpoints.
        const validationResult = this.config.skipValidateCheckpointAttestations
          ? { valid: true as const }
          : await validateCheckpointAttestations(
              validationInput,
              this.epochCache,
              this.l1Constants,
              this.getSignatureContext(),
              this.log,
            );

        // Also skip the checkpoint if it builds on a previously-rejected ancestor. Without
        // this, addCheckpoints would throw InitialCheckpointNumberNotSequentialError when the
        // ancestor was skipped earlier (e.g. due to invalid attestations), the catch handler
        // would roll back the L1 sync point, and the next iteration would re-fetch and re-throw.
        const rejectedAncestor = await this.stores.blocks.getRejectedCheckpointByArchiveRoot(raw.lastArchiveRoot);

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
          this.log.warn(`Skipping checkpoint ${raw.checkpointNumber} due to invalid attestations`, {
            checkpointNumber: raw.checkpointNumber,
            l1BlockNumber: raw.l1.blockNumber,
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
            checkpointNumber: raw.checkpointNumber,
            archiveRoot: raw.normalizedArchiveRoot,
            parentArchiveRoot: raw.lastArchiveRoot,
            slotNumber: raw.slotNumber,
            l1: raw.l1,
            reason: 'invalid-attestations' as const,
          });

          continue;
        }

        if (rejectedAncestor) {
          const descendantInfo: CheckpointInfo = {
            archive: raw.normalizedArchiveRoot,
            lastArchive: raw.lastArchiveRoot,
            slotNumber: raw.slotNumber,
            checkpointNumber: raw.checkpointNumber,
            timestamp: raw.header.timestamp,
          };
          this.log.warn(
            `Skipping checkpoint ${raw.checkpointNumber} as it is a descendant of ` +
              `rejected checkpoint ${rejectedAncestor.checkpointNumber} (${rejectedAncestor.reason})`,
            {
              checkpointNumber: raw.checkpointNumber,
              l1BlockNumber: raw.l1.blockNumber,
              l1BlockHash: raw.l1.blockHash,
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
            checkpointNumber: raw.checkpointNumber,
            archiveRoot: raw.normalizedArchiveRoot,
            parentArchiveRoot: raw.lastArchiveRoot,
            slotNumber: raw.slotNumber,
            l1: raw.l1,
            reason: 'descends-from-invalid-attestations' as const,
          });

          continue;
        }

        // Build the full PublishedCheckpoint for a checkpoint that passed validation. This is the ingestion
        // boundary where the raw header/archive root are converted to CheckpointHeader/Fr. Because attestations
        // validated, an out-of-range field here means a committee quorum signed an out-of-range header — a
        // catastrophic, Fix-2-unreachable state we deliberately surface (fail loud) rather than recover from.
        let published: PublishedCheckpoint;
        try {
          published =
            raw.kind === 'promoted'
              ? raw.promoted
              : await retrievedToPublishedCheckpoint({
                  ...raw.calldata,
                  checkpointBlobData: await getCheckpointBlobDataFromBlobs(
                    this.blobClient,
                    raw.calldata.l1.blockHash,
                    raw.calldata.blobHashes,
                    raw.calldata.checkpointNumber,
                    this.log,
                    !initialSyncComplete,
                    raw.calldata.parentBeaconBlockRoot,
                    raw.calldata.l1.timestamp,
                  ),
                });
        } catch (err) {
          if (isErrorClass(err, OutOfRangeFieldError)) {
            this.log.fatal(
              `Checkpoint ${raw.checkpointNumber} carries out-of-range header/archive fields yet its attestations ` +
                `validated. A committee quorum signed an out-of-range header — refusing to ingest.`,
              { checkpointNumber: raw.checkpointNumber, fields: err.fields, l1BlockNumber: raw.l1.blockNumber },
            );
          }
          throw err;
        }

        // Check the inHash of the checkpoint against the l1->l2 messages.
        // The messages should've been synced up to the currentL1BlockNumber and must be available for the published
        // checkpoints we just retrieved.
        const l1ToL2Messages = await this.stores.messages.getL1ToL2Messages(published.checkpoint.number);
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

        // If blocks were pruned due to conflict with L1 checkpoints, emit event
        if (result.prunedBlocks && result.prunedBlocks.length > 0) {
          const prunedCheckpointNumber = result.prunedBlocks[0].checkpointNumber;
          const prunedSlotNumber = result.prunedBlocks[0].header.globalVariables.slotNumber;

          this.log.info(
            `Pruned ${result.prunedBlocks.length} mismatching blocks for checkpoint ${prunedCheckpointNumber}`,
            { prunedBlocks: result.prunedBlocks.map(b => b.toBlockInfo()), prunedSlotNumber, prunedCheckpointNumber },
          );

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
      // Invalid checkpoints are no longer built into PublishedCheckpoints; they are persisted as rejected
      // entries, so the reorg fallback in checkForNewCheckpointsBeforeL1SyncPoint recovers their L1 block via
      // getLatestRejectedCheckpointNumber / getRejectedCheckpointByNumber.
      lastSeenCheckpoint = validCheckpoints.at(-1) ?? lastSeenCheckpoint;
    } while (searchEndBlock < currentL1BlockNumber);

    // Important that we update AFTER inserting the blocks.
    await updateProvenCheckpoint();

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

    // The calldata header is raw (L1CheckpointHeader) and may be out of range; compare by header hash and
    // archive root bytes rather than converting it into a CheckpointHeader (which could throw).
    if (
      !l1CheckpointHeaderHash(toL1CheckpointHeader(proposed.header)).equals(
        l1CheckpointHeaderHash(calldataCheckpoint.header),
      ) ||
      !archiveRootsEqual(proposed.archive.root, calldataCheckpoint.archiveRoot)
    ) {
      this.log.warn(
        `Local proposed checkpoint ${proposed.checkpointNumber} does not match checkpoint retrieved from L1, overriding with L1 data`,
        {
          proposedCheckpointNumber: proposed.checkpointNumber,
          proposedHeader: proposed.header.toInspect(),
          proposedArchiveRoot: proposed.archive.root.toString(),
          calldataCheckpointNumber: calldataCheckpoint.checkpointNumber,
          calldataHeader: calldataCheckpoint.header,
          calldataArchiveRoot: calldataCheckpoint.archiveRoot.toString(),
        },
      );
      // Both the locally-proposed checkpoint and the L1-confirmed one are signed by the
      // slot proposer; emit a divergence event so the slasher can attribute equivocation.
      // Only emit when the slots match — uncheckpointed entries are pruned above so this
      // should always hold, but guard defensively to avoid mis-attributing a slash.
      if (BigInt(proposed.header.slotNumber) === calldataCheckpoint.header.slotNumber) {
        this.events.emit(L2BlockSourceEvents.CheckpointEquivocationDetected, {
          type: L2BlockSourceEvents.CheckpointEquivocationDetected,
          slotNumber: SlotNumber.fromBigInt(calldataCheckpoint.header.slotNumber),
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
    // Invalid checkpoints are persisted as rejected entries (not as PublishedCheckpoints), so the latest
    // rejected number must always be folded in — otherwise a freshly-rejected tip would be treated as
    // "behind L1" and trigger a spurious sync-point rollback.
    const latestLocalCheckpointNumber =
      CheckpointNumber.max(
        lastSeenCheckpoint?.checkpoint.number ?? CheckpointNumber.ZERO,
        await this.stores.blocks.getLatestCheckpointNumber(),
        await this.stores.blocks.getLatestRejectedCheckpointNumber(),
      ) ?? CheckpointNumber.ZERO;

    if (latestLocalCheckpointNumber < pendingCheckpointNumber) {
      // Here we have consumed all logs until the `currentL1Block` we pinned at the beginning of the archiver loop,
      // but still haven't reached the pending checkpoint according to the call to the rollup contract.
      // We suspect an L1 reorg that added checkpoints *behind* us. If that is the case, it must have happened between
      // the last checkpoint we saw and the current one, so we reset the last synched L1 block number. In the edge case
      // we don't have one, we go back 2 L1 epochs, which is the deepest possible reorg (assuming Casper is working).
      const latestLocalCheckpoint: PublishedCheckpoint | CheckpointData | RejectedCheckpoint | undefined =
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
