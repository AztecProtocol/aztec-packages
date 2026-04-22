import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type ArchiverEmitter,
  L2BlockSourceEvents,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2Tips,
} from '@aztec/stdlib/block';
import { L2BlockStream } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getEpochAtSlot, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import { type TelemetryClient, type Traceable, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { ArchiverDataSourceBase } from './modules/data_source_base.js';
import { ArchiverDataStoreUpdater } from './modules/data_store_updater.js';
import type { KVArchiverDataStore } from './store/kv_archiver_store.js';
import { L2TipsCache } from './store/l2_tips_cache.js';
import { type InboxMessage, updateRollingHash } from './structs/inbox_message.js';

/**
 * Source interface required by the RpcSyncArchiver. Any upstream `ArchiverDataSource`
 * (including an in-process `Archiver` or an RPC client) satisfies this.
 */
export type RpcSyncArchiverSource = Pick<
  AztecNode,
  'getBlocks' | 'getBlockHeader' | 'getL2Tips' | 'getCheckpoints' | 'getCheckpointedBlocks' | 'getL1ToL2Messages'
>;

export type RpcSyncArchiverL1Addresses = Pick<
  L1ContractAddresses,
  'rollupAddress' | 'registryAddress' | 'inboxAddress' | 'governanceProposerAddress'
> & {
  slashingProposerAddress: EthAddress;
};

export type RpcSyncArchiverConfig = {
  pollingIntervalMs: number;
  batchSize: number;
};

/**
 * A read-only archiver that syncs its local store from an upstream `ArchiverDataSource`
 * (typically another node) via an `L2BlockStream`. Unlike `Archiver`, this variant does
 * not run an L1 synchronizer, does not talk to L1 directly, and does not implement
 * `L2BlockSink` — its only data source is the upstream node.
 */
export class RpcSyncArchiver extends ArchiverDataSourceBase implements L2BlockStreamEventHandler, Traceable {
  public readonly events: ArchiverEmitter;

  public readonly tracer: Tracer;

  private readonly blockStream: L2BlockStream;
  private readonly updater: ArchiverDataStoreUpdater;
  private readonly l2TipsCache: L2TipsCache;

  private initialSyncComplete = false;
  private initialSyncPromise: Promise<void>;
  private resolveInitialSync!: () => void;

  constructor(
    private readonly source: RpcSyncArchiverSource,
    dataStore: KVArchiverDataStore,
    private readonly l1Addresses: RpcSyncArchiverL1Addresses,
    protected override readonly l1Constants: L1RollupConstants & { genesisArchiveRoot: Fr },
    config: RpcSyncArchiverConfig,
    events: ArchiverEmitter,
    telemetry: TelemetryClient = getTelemetryClient(),
    private readonly log: Logger = createLogger('archiver:rpc-sync'),
  ) {
    super(dataStore, l1Constants);

    this.events = events;
    this.tracer = telemetry.getTracer('RpcSyncArchiver');
    this.l2TipsCache = new L2TipsCache(dataStore.blockStore);
    this.updater = new ArchiverDataStoreUpdater(dataStore, this.l2TipsCache, {
      rollupManaLimit: l1Constants.rollupManaLimit,
    });

    const localData: L2BlockStreamLocalDataProvider = {
      getL2Tips: () => this.l2TipsCache.getL2Tips(),
      getL2BlockHash: async (number: BlockNumber) => {
        if (number === 0) {
          return undefined;
        }
        const headers = await this.store.getBlockHeaders(number, 1);
        return headers[0] ? (await headers[0].hash()).toString() : undefined;
      },
    };

    this.blockStream = new L2BlockStream(this.source, localData, this, createLogger('archiver:rpc-sync:stream'), {
      pollIntervalMS: config.pollingIntervalMs,
      batchSize: config.batchSize,
    });

    this.initialSyncPromise = new Promise<void>(resolve => {
      this.resolveInitialSync = resolve;
    });
  }

  /** Starts the underlying block stream. Optionally blocks until the first sync completes. */
  public async start(blockUntilSynced: boolean): Promise<void> {
    if (this.blockStream.isRunning()) {
      throw new Error('RpcSyncArchiver is already running');
    }

    this.log.info(`Starting RPC-sync archiver`);
    this.blockStream.start();

    if (blockUntilSynced) {
      // Trigger one explicit sync so start() does not return until the upstream's current tips are processed.
      await this.blockStream.sync();
      this.markInitialSyncComplete();
    }
  }

  /**
   * Stops the block stream and closes the underlying data store. Since the factory opens the store
   * on behalf of the archiver, the archiver is the sole owner and must release it on stop.
   */
  public async stop(): Promise<void> {
    this.log.debug('Stopping RPC-sync archiver');
    await this.blockStream.stop();
    await this.store.close();
  }

  public async syncImmediate(): Promise<void> {
    await this.blockStream.sync();
    this.markInitialSyncComplete();
  }

  public isInitialSyncComplete(): boolean {
    return this.initialSyncComplete;
  }

  public waitForInitialSync(): Promise<void> {
    return this.initialSyncPromise;
  }

  public backupTo(destPath: string): Promise<string> {
    return this.store.backupTo(destPath);
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.handleBlocksAdded(event);
        break;
      case 'chain-checkpointed':
        await this.handleChainCheckpointed(event);
        break;
      case 'chain-pruned':
        await this.handleChainPruned(event);
        break;
      case 'chain-proven':
        await this.handleChainProven(event);
        break;
      case 'chain-finalized':
        await this.handleChainFinalized(event);
        break;
    }

    // After each batch, check whether we've caught up to the source's proposed tip.
    // This ensures `waitForInitialSync()` eventually resolves even when the caller did not
    // pass `blockUntilSync: true` and does not call `syncImmediate()` manually.
    if (!this.initialSyncComplete) {
      await this.maybeMarkInitialSyncComplete();
    }
  }

  private async maybeMarkInitialSyncComplete(): Promise<void> {
    try {
      const [sourceTips, localTips] = await Promise.all([this.source.getL2Tips(), this.l2TipsCache.getL2Tips()]);
      if (localTips.proposed.number >= sourceTips.proposed.number) {
        this.markInitialSyncComplete();
      }
    } catch (err) {
      // If the source is transiently unavailable we'll retry on the next event.
      this.log.debug(`Failed to check initial sync completion`, err);
    }
  }

  private async handleBlocksAdded(event: Extract<L2BlockStreamEvent, { type: 'blocks-added' }>): Promise<void> {
    for (const block of event.blocks) {
      await this.updater.addProposedBlock(block);
      this.log.debug(`Added proposed block ${block.number}`);
    }
  }

  private async handleChainCheckpointed(
    event: Extract<L2BlockStreamEvent, { type: 'chain-checkpointed' }>,
  ): Promise<void> {
    const published = event.checkpoint;
    const checkpointNumber = published.checkpoint.number;
    this.log.debug(`Handling checkpoint ${checkpointNumber}`);

    // Ensure messages consumed by this checkpoint are stored before the checkpoint is readable.
    const inboxMessages = await this.buildInboxMessagesForCheckpoint(published);
    if (inboxMessages.length > 0) {
      await this.store.addL1ToL2Messages(inboxMessages);
    }

    await this.updater.addCheckpoints([published]);
  }

  /**
   * Reconstructs `InboxMessage` records from the leaves returned by the upstream source.
   * The first message index for a checkpoint is determined by `InboxLeaf.smallestIndexForCheckpoint`;
   * subsequent messages auto-increment. Rolling hashes are computed on the fly so the message store's
   * chain invariant is preserved. L1 block metadata is taken from the checkpoint's own L1PublishedData
   * since the upstream does not expose per-message L1 block data; this field is only used by L1
   * reorg detection (which this archiver does not run) and for archival lookups.
   */
  private async buildInboxMessagesForCheckpoint(published: PublishedCheckpoint): Promise<InboxMessage[]> {
    const checkpointNumber = published.checkpoint.number;
    const leaves = await this.source.getL1ToL2Messages(checkpointNumber);
    if (leaves.length === 0) {
      return [];
    }

    const startIndex = InboxLeaf.smallestIndexForCheckpoint(checkpointNumber);
    const lastMessage = await this.store.getLastL1ToL2Message();
    let rollingHash = lastMessage?.rollingHash ?? Buffer16.ZERO;
    const l1BlockNumber = published.l1.blockNumber;
    const l1BlockHash = Buffer32.fromString(published.l1.blockHash);

    const messages: InboxMessage[] = [];
    for (let i = 0; i < leaves.length; i++) {
      const index = startIndex + BigInt(i);
      // Skip messages that are already stored to avoid rolling-hash conflicts on resync.
      if (lastMessage && index <= lastMessage.index) {
        continue;
      }
      rollingHash = updateRollingHash(rollingHash, leaves[i]);
      messages.push({
        index,
        leaf: leaves[i],
        checkpointNumber,
        l1BlockNumber,
        l1BlockHash,
        rollingHash,
      });
    }
    return messages;
  }

  private async handleChainPruned(event: Extract<L2BlockStreamEvent, { type: 'chain-pruned' }>): Promise<void> {
    const targetBlockNumber = event.block.number;
    const localCheckpointedTip = await this.store.getCheckpointedL2BlockNumber();

    // A prune target of block 0 means everything above genesis is being rolled back. The generic
    // cross-checkpoint branch can't handle this case because `getCheckpointedBlock(0)` returns
    // undefined. Handle it explicitly so we don't throw on every subsequent poll.
    if (targetBlockNumber === 0) {
      const latestBlockNumber = await this.store.getLatestBlockNumber();
      const blocksBeingRemoved =
        latestBlockNumber > 0 ? await this.store.getBlocks(BlockNumber(1), latestBlockNumber) : [];
      this.log.info(`Pruning all checkpoints due to upstream chain-pruned event targeting block 0`);
      await this.updater.removeCheckpointsAfter(CheckpointNumber(0));
      if (blocksBeingRemoved.length > 0) {
        const epochNumber = getEpochAtSlot(blocksBeingRemoved[0].header.globalVariables.slotNumber, this.l1Constants);
        this.events.emit(L2BlockSourceEvents.L2PruneUnproven, {
          type: 'l2PruneUnproven',
          epochNumber,
          blocks: blocksBeingRemoved,
        });
      }
      return;
    }

    if (targetBlockNumber >= localCheckpointedTip) {
      // Only uncheckpointed (proposed) blocks need to be pruned.
      const removed = await this.updater.removeUncheckpointedBlocksAfter(BlockNumber(targetBlockNumber));
      this.log.info(`Pruned ${removed.length} uncheckpointed blocks after ${targetBlockNumber}`);
      if (removed.length > 0) {
        const lastRemoved = removed.at(-1)!;
        this.events.emit(L2BlockSourceEvents.L2PruneUncheckpointed, {
          type: 'l2PruneUncheckpointed',
          slotNumber: lastRemoved.header.globalVariables.slotNumber,
          blocks: removed,
        });
      }
      return;
    }

    // The prune crossed a checkpoint boundary — find the checkpoint at or below the target block and
    // remove everything above it.
    const targetBlock = await this.store.getCheckpointedBlock(BlockNumber(targetBlockNumber));
    if (!targetBlock) {
      // Defence in depth: if we can't resolve the target block (e.g. store was partially cleared),
      // log and return instead of throwing — the stream would otherwise rethrow on every poll.
      this.log.warn(`Cannot resolve checkpoint for pruned block ${targetBlockNumber}; skipping`);
      return;
    }
    const checkpointNumber = targetBlock.checkpointNumber;
    const checkpointData = await this.store.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      throw new Error(`Missing checkpoint data for checkpoint ${checkpointNumber}`);
    }
    const lastBlockInCheckpoint = BlockNumber(checkpointData.startBlock + checkpointData.blockCount - 1);

    // If target block is mid-checkpoint, we must roll back to the previous checkpoint boundary to
    // keep rollback at checkpoint granularity (matches Archiver.rollbackTo semantics).
    const targetCheckpoint =
      targetBlockNumber === lastBlockInCheckpoint
        ? checkpointNumber
        : CheckpointNumber(Math.max(checkpointNumber - 1, 0));

    // Compute the first block that will actually be removed. If the target is at a checkpoint
    // boundary we keep its containing checkpoint, so we start removing at targetBlockNumber + 1.
    // Otherwise the whole containing checkpoint is removed, so we start at its first block.
    const firstRemovedBlock =
      targetBlockNumber === lastBlockInCheckpoint ? BlockNumber(targetBlockNumber + 1) : checkpointData.startBlock;
    const latestBlockNumber = await this.store.getLatestBlockNumber();
    const blocksBeingRemoved = await this.store.getBlocks(firstRemovedBlock, latestBlockNumber - firstRemovedBlock + 1);

    this.log.info(`Pruning checkpoints after ${targetCheckpoint} due to upstream chain-pruned event`);
    await this.updater.removeCheckpointsAfter(targetCheckpoint);

    // Any removal in this branch drops at least one checkpointed block, so this is always
    // L2PruneUnproven (L2PruneUncheckpointed applies only when the proposed tail — no checkpoints —
    // is pruned, which is handled by the early-return branch above).
    if (blocksBeingRemoved.length > 0) {
      const epochNumber = getEpochAtSlot(blocksBeingRemoved[0].header.globalVariables.slotNumber, this.l1Constants);
      this.events.emit(L2BlockSourceEvents.L2PruneUnproven, {
        type: 'l2PruneUnproven',
        epochNumber,
        blocks: blocksBeingRemoved,
      });
    }
  }

  private async handleChainProven(event: Extract<L2BlockStreamEvent, { type: 'chain-proven' }>): Promise<void> {
    if (event.block.number === 0) {
      return;
    }
    const targetBlock = await this.store.getCheckpointedBlock(BlockNumber(event.block.number));
    if (!targetBlock) {
      this.log.warn(`Cannot resolve checkpoint for proven block ${event.block.number}; skipping`);
      return;
    }
    const checkpointNumber = targetBlock.checkpointNumber;
    const currentProven = await this.store.getProvenCheckpointNumber();
    if (checkpointNumber <= currentProven) {
      return;
    }
    await this.updater.setProvenCheckpointNumber(checkpointNumber);
    this.events.emit(L2BlockSourceEvents.L2BlockProven, {
      type: 'l2BlockProven',
      blockNumber: BlockNumber(event.block.number),
      slotNumber: targetBlock.block.header.globalVariables.slotNumber,
      epochNumber: getEpochAtSlot(targetBlock.block.header.globalVariables.slotNumber, this.l1Constants),
    });
  }

  private async handleChainFinalized(event: Extract<L2BlockStreamEvent, { type: 'chain-finalized' }>): Promise<void> {
    if (event.block.number === 0) {
      return;
    }
    const targetBlock = await this.store.getCheckpointedBlock(BlockNumber(event.block.number));
    if (!targetBlock) {
      this.log.warn(`Cannot resolve checkpoint for finalized block ${event.block.number}; skipping`);
      return;
    }
    const currentFinalized = await this.store.getFinalizedCheckpointNumber();
    if (targetBlock.checkpointNumber <= currentFinalized) {
      return;
    }
    await this.updater.setFinalizedCheckpointNumber(targetBlock.checkpointNumber);
  }

  private markInitialSyncComplete() {
    if (!this.initialSyncComplete) {
      this.initialSyncComplete = true;
      this.resolveInitialSync();
    }
  }

  public getRollupAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.rollupAddress);
  }

  public getRegistryAddress(): Promise<EthAddress> {
    return Promise.resolve(this.l1Addresses.registryAddress);
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    return Promise.resolve(this.l1Constants);
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: this.l1Constants.genesisArchiveRoot });
  }

  public getL1Timestamp(): Promise<bigint | undefined> {
    return Promise.resolve(undefined);
  }

  public getL2Tips(): Promise<L2Tips> {
    return this.l2TipsCache.getL2Tips();
  }

  public async getSyncedL2SlotNumber(): Promise<SlotNumber | undefined> {
    const checkpointNumber = await this.store.getSynchedCheckpointNumber();
    if (checkpointNumber === 0) {
      return undefined;
    }
    const checkpointData = await this.store.getCheckpointData(checkpointNumber);
    return checkpointData?.header.slotNumber;
  }

  public async getSyncedL2EpochNumber(): Promise<EpochNumber | undefined> {
    const slot = await this.getSyncedL2SlotNumber();
    if (slot === undefined) {
      return undefined;
    }
    const epoch = getEpochAtSlot(slot, this.l1Constants);
    const [, endSlot] = getSlotRangeForEpoch(epoch, this.l1Constants);
    if (slot >= endSlot) {
      return epoch;
    }
    return Number(epoch) > 0 ? EpochNumber(Number(epoch) - 1) : undefined;
  }

  public async isEpochComplete(epochNumber: EpochNumber): Promise<boolean> {
    const checkpointedBlockNumber = await this.getCheckpointedL2BlockNumber();
    if (checkpointedBlockNumber === 0) {
      return false;
    }
    const header = await this.getBlockHeader(checkpointedBlockNumber);
    const slot = header?.globalVariables.slotNumber;
    const [, endSlot] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    return slot !== undefined && slot >= endSlot;
  }
}
