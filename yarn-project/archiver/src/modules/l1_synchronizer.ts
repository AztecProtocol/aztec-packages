import type { BlobClientInterface } from '@aztec/blob-client/client';
import { EpochCache } from '@aztec/epoch-cache';
import { InboxContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { maxBigint } from '@aztec/foundation/bigint';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer, elapsed } from '@aztec/foundation/timer';
import { isDefined } from '@aztec/foundation/types';
import { type ArchiverEmitter, L2BlockSourceEvents, type ValidateCheckpointResult } from '@aztec/stdlib/block';
import { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getEpochAtSlot, getSlotAtTimestamp } from '@aztec/stdlib/epoch-helpers';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { type Traceable, type Tracer, execInSpan, trackSpan } from '@aztec/telemetry-client';

import { InitialCheckpointNumberNotSequentialError } from '../errors.js';
import {
  retrieveCheckpointsFromRollup,
  retrieveL1ToL2Message,
  retrieveL1ToL2Messages,
  retrievedToPublishedCheckpoint,
} from '../l1/data_retrieval.js';
import type { KVArchiverDataStore } from '../store/kv_archiver_store.js';
import type { InboxMessage } from '../structs/inbox_message.js';
import { ArchiverDataStoreUpdater } from './data_store_updater.js';
import type { ArchiverInstrumentation } from './instrumentation.js';
import { validateCheckpointAttestations } from './validation.js';

type RollupStatus = {
  provenCheckpointNumber: CheckpointNumber;
  provenArchive: string;
  pendingCheckpointNumber: CheckpointNumber;
  pendingArchive: string;
  validationResult: ValidateCheckpointResult | undefined;
  lastRetrievedCheckpoint?: PublishedCheckpoint;
  lastL1BlockWithCheckpoint?: bigint;
};

/**
 * Handles L1 synchronization for the archiver.
 * Responsible for fetching checkpoints, L1→L2 messages, and handling L1 reorgs.
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
    private readonly l1Addresses: Pick<
      L1ContractAddresses,
      'registryAddress' | 'governanceProposerAddress' | 'slashFactoryAddress'
    > & { slashingProposerAddress: EthAddress },
    private readonly store: KVArchiverDataStore,
    private config: {
      batchSize: number;
      skipValidateCheckpointAttestations?: boolean;
      maxAllowedEthClientDriftSeconds: number;
    },
    private readonly blobClient: BlobClientInterface,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly instrumentation: ArchiverInstrumentation,
    private readonly l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr },
    private readonly events: ArchiverEmitter,
    tracer: Tracer,
    private readonly log: Logger = createLogger('archiver:l1-sync'),
  ) {
    this.updater = new ArchiverDataStoreUpdater(this.store);
    this.tracer = tracer;
  }

  /** Sets new config */
  public setConfig(newConfig: {
    batchSize: number;
    skipValidateCheckpointAttestations?: boolean;
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
    const currentL1Block = await this.publicClient.getBlock({ includeTransactions: false });
    const currentL1BlockNumber = currentL1Block.number;
    const currentL1BlockHash = Buffer32.fromString(currentL1Block.hash);
    const currentL1Timestamp = currentL1Block.timestamp;

    if (this.l1BlockHash && currentL1BlockHash.equals(this.l1BlockHash)) {
      this.log.trace(`No new L1 blocks since last sync at L1 block ${this.l1BlockNumber}`);
      return;
    }

    // Warn if the latest L1 block timestamp is too old
    const maxAllowedDelay = this.config.maxAllowedEthClientDriftSeconds;
    const now = this.dateProvider.nowInSeconds();
    if (maxAllowedDelay > 0 && Number(currentL1Timestamp) <= now - maxAllowedDelay) {
      this.log.warn(
        `Latest L1 block ${currentL1BlockNumber} timestamp ${currentL1Timestamp} is too old. Make sure your Ethereum node is synced.`,
        { currentL1BlockNumber, currentL1Timestamp, now, maxAllowedDelay },
      );
    }

    // Load sync point for blocks and messages defaulting to start block
    const {
      blocksSynchedTo = this.l1Constants.l1StartBlock,
      messagesSynchedTo = {
        l1BlockNumber: this.l1Constants.l1StartBlock,
        l1BlockHash: this.l1Constants.l1StartBlockHash,
      },
    } = await this.store.getSynchPoint();

    this.log.debug(`Starting new archiver sync iteration`, {
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
    await this.handleL1ToL2Messages(messagesSynchedTo, currentL1BlockNumber);

    // ********** Events that are processed per checkpoint **********
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
    this.l1BlockHash = currentL1BlockHash;

    const l1BlockNumberAtEnd = await this.publicClient.getBlockNumber();
    this.log.debug(`Archiver sync iteration complete`, {
      l1BlockNumberAtStart: currentL1BlockNumber,
      l1TimestampAtStart: currentL1Timestamp,
      l1BlockNumberAtEnd,
    });
  }

  /** Prune all proposed local blocks that should have been checkpointed by now. */
  private async pruneUncheckpointedBlocks(currentL1Timestamp: bigint) {
    const [lastCheckpointedBlockNumber, lastProposedBlockNumber] = await Promise.all([
      this.store.getCheckpointedL2BlockNumber(),
      this.store.getLatestBlockNumber(),
    ]);

    // If there are no uncheckpointed blocks, we got nothing to do
    if (lastProposedBlockNumber === lastCheckpointedBlockNumber) {
      this.log.trace(`No uncheckpointed blocks to prune.`);
      return;
    }

    // What's the slot of the first uncheckpointed block?
    const firstUncheckpointedBlockNumber = BlockNumber(lastCheckpointedBlockNumber + 1);
    const [firstUncheckpointedBlockHeader] = await this.store.getBlockHeaders(firstUncheckpointedBlockNumber, 1);
    const firstUncheckpointedBlockSlot = firstUncheckpointedBlockHeader?.getSlot();

    // What's the slot at the next L1 block? All blocks for slots strictly before this one should've been checkpointed by now.
    const nextL1BlockTimestamp = currentL1Timestamp + BigInt(this.l1Constants.ethereumSlotDuration);
    const slotAtNextL1Block = getSlotAtTimestamp(nextL1BlockTimestamp, this.l1Constants);

    // Prune provisional blocks from slots that have ended without being checkpointed
    if (firstUncheckpointedBlockSlot !== undefined && firstUncheckpointedBlockSlot < slotAtNextL1Block) {
      this.log.warn(
        `Pruning blocks after block ${lastCheckpointedBlockNumber} due to slot ${firstUncheckpointedBlockSlot} not being checkpointed`,
        { firstUncheckpointedBlockHeader: firstUncheckpointedBlockHeader.toInspect(), slotAtNextL1Block },
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
    const localPendingCheckpointNumber = await this.store.getSynchedCheckpointNumber();
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
          `Updated latest checkpoint is ${await this.store.getSynchedCheckpointNumber()}.`,
      );
      this.instrumentation.processPrune(timer.ms());
      // TODO(palla/reorg): Do we need to set the block synched L1 block number here?
      // Seems like the next iteration should handle this.
      // await this.store.setCheckpointSynchedL1BlockNumber(currentL1BlockNumber);
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
  private async handleL1ToL2Messages(messagesSyncPoint: L1BlockId, currentL1BlockNumber: bigint): Promise<void> {
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
      remoteMessagesState.messagesRollingHash.equals(localLastMessage?.rollingHash ?? Buffer32.ZERO)
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
      this.log.trace(`Retrieving L1 to L2 messages in L1 blocks ${searchStartBlock}-${searchEndBlock}`);
      const messages = await retrieveL1ToL2Messages(this.inbox, searchStartBlock, searchEndBlock);
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
    let searchEndBlock: bigint = this.l1Constants.l1StartBlock - 1n;

    do {
      [searchStartBlock, searchEndBlock] = this.nextRange(searchEndBlock, currentL1BlockNumber);

      const message = await retrieveL1ToL2Message(this.inbox, leaf, searchStartBlock, searchEndBlock);

      if (message) {
        return message;
      }
    } while (searchEndBlock < currentL1BlockNumber);

    return undefined;
  }

  private async rollbackL1ToL2Messages(
    localLastMessage: InboxMessage,
    messagesSyncPoint: L1BlockId,
  ): Promise<L1BlockId> {
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
    const syncPointL1BlockNumber = commonMsg ? commonMsg.l1BlockNumber - 1n : this.l1Constants.l1StartBlock;
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
  private async handleCheckpoints(
    blocksSynchedTo: bigint,
    currentL1BlockNumber: bigint,
    initialSyncComplete: boolean,
  ): Promise<RollupStatus> {
    const localPendingCheckpointNumber = await this.store.getSynchedCheckpointNumber();
    const initialValidationResult: ValidateCheckpointResult | undefined =
      await this.store.getPendingChainValidationStatus();
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
        const localProvenCheckpointNumber = await this.store.getProvenCheckpointNumber();
        if (localProvenCheckpointNumber !== provenCheckpointNumber) {
          await this.store.setProvenCheckpointNumber(provenCheckpointNumber);
          this.log.info(`Rolled back proven chain to checkpoint ${provenCheckpointNumber}`, { provenCheckpointNumber });
        }
      }

      const localCheckpointForDestinationProvenCheckpointNumber =
        await this.store.getCheckpointData(provenCheckpointNumber);

      // Sanity check. I've hit what seems to be a state where the proven checkpoint is set to a value greater than the latest
      // synched checkpoint when requesting L2Tips from the archiver. This is the only place where the proven checkpoint is set.
      const synched = await this.store.getSynchedCheckpointNumber();
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
        const localProvenCheckpointNumber = await this.store.getProvenCheckpointNumber();
        if (localProvenCheckpointNumber !== provenCheckpointNumber) {
          await this.store.setProvenCheckpointNumber(provenCheckpointNumber);
          this.log.info(`Updated proven chain to checkpoint ${provenCheckpointNumber}`, { provenCheckpointNumber });
          const provenSlotNumber = localCheckpointForDestinationProvenCheckpointNumber.header.slotNumber;
          const provenEpochNumber: EpochNumber = getEpochAtSlot(provenSlotNumber, this.l1Constants);
          const lastBlockNumberInCheckpoint =
            localCheckpointForDestinationProvenCheckpointNumber.startBlock +
            localCheckpointForDestinationProvenCheckpointNumber.numBlocks -
            1;

          this.events.emit(L2BlockSourceEvents.L2BlockProven, {
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
        // await this.store.setCheckpointSynchedL1BlockNumber(currentL1BlockNumber);
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

        const checkpointsToRemove = localPendingCheckpointNumber - tipAfterUnwind;
        await this.updater.removeCheckpointsAfter(CheckpointNumber(tipAfterUnwind));

        this.log.warn(
          `Removed ${count(checkpointsToRemove, 'checkpoint')} after checkpoint ${tipAfterUnwind} ` +
            `due to mismatched checkpoint hashes at L1 block ${currentL1BlockNumber}. ` +
            `Updated L2 latest checkpoint is ${await this.store.getSynchedCheckpointNumber()}.`,
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
          this.rollup,
          this.publicClient,
          this.debugClient,
          this.blobClient,
          searchStartBlock, // TODO(palla/reorg): If the L2 reorg was due to an L1 reorg, we need to start search earlier
          searchEndBlock,
          this.l1Addresses,
          this.instrumentation,
          this.log,
          !initialSyncComplete, // isHistoricalSync
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
          : await validateCheckpointAttestations(published, this.epochCache, this.l1Constants, this.log);

        // Only update the validation result if it has changed, so we can keep track of the first invalid checkpoint
        // in case there is a sequence of more than one invalid checkpoint, as we need to invalidate the first one.
        // There is an exception though: if a checkpoint is invalidated and replaced with another invalid checkpoint,
        // we need to update the validation result, since we need to be able to invalidate the new one.
        // See test 'chain progresses if an invalid checkpoint is invalidated with an invalid one' for more info.
        if (
          rollupStatus.validationResult?.valid !== validationResult.valid ||
          (!rollupStatus.validationResult.valid &&
            !validationResult.valid &&
            rollupStatus.validationResult.checkpoint.checkpointNumber === validationResult.checkpoint.checkpointNumber)
        ) {
          rollupStatus.validationResult = validationResult;
        }

        if (!validationResult.valid) {
          this.log.warn(`Skipping checkpoint ${published.checkpoint.number} due to invalid attestations`, {
            checkpointHash: published.checkpoint.hash(),
            l1BlockNumber: published.l1.blockNumber,
            ...pick(validationResult, 'reason'),
          });

          // Emit event for invalid checkpoint detection
          this.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, {
            type: L2BlockSourceEvents.InvalidAttestationsCheckpointDetected,
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
        const l1ToL2Messages = await this.store.getL1ToL2Messages(published.checkpoint.number);
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
        const [processDuration, result] = await elapsed(() =>
          execInSpan(this.tracer, 'Archiver.addCheckpoints', () =>
            this.updater.addCheckpoints(validCheckpoints, updatedValidationResult),
          ),
        );
        this.instrumentation.processNewBlocks(
          processDuration / validCheckpoints.length,
          validCheckpoints.flatMap(c => c.checkpoint.blocks),
        );

        // If blocks were pruned due to conflict with L1 checkpoints, emit event
        if (result.prunedBlocks && result.prunedBlocks.length > 0) {
          const prunedCheckpointNumber = result.prunedBlocks[0].checkpointNumber;
          const prunedSlotNumber = result.prunedBlocks[0].header.globalVariables.slotNumber;

          this.log.warn(
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
            ? await this.store.getCheckpointData(CheckpointNumber(previousCheckpointNumber))
            : undefined;
          const updatedL1SyncPoint = previousCheckpoint?.l1.blockNumber ?? this.l1Constants.l1StartBlock;
          await this.store.setCheckpointSynchedL1BlockNumber(updatedL1SyncPoint);
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
  ): Promise<void> {
    const { lastRetrievedCheckpoint, pendingCheckpointNumber } = status;
    // Compare the last checkpoint we have (either retrieved in this round or loaded from store) with what the
    // rollup contract told us was the latest one (pinned at the currentL1BlockNumber).
    const latestLocalCheckpointNumber =
      lastRetrievedCheckpoint?.checkpoint.number ?? (await this.store.getSynchedCheckpointNumber());
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
      await this.store.setCheckpointSynchedL1BlockNumber(targetL1BlockNumber);
    } else {
      this.log.trace(`No new checkpoints behind L1 sync point to retrieve.`, {
        latestLocalCheckpointNumber,
        pendingCheckpointNumber,
      });
    }
  }

  private async getCheckpointHeader(number: CheckpointNumber) {
    const checkpoint = await this.store.getCheckpointData(number);
    if (!checkpoint) {
      return undefined;
    }
    return checkpoint.header;
  }
}
