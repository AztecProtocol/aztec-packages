import { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2TipsKVStore } from '@aztec/kv-store/stores';
import { BlockHash, L2BlockStream, type L2BlockStreamEvent, type L2BlockStreamEventHandler } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import type { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';

/**
 * The BlockSynchronizer class orchestrates synchronization between PXE and Aztec node, maintaining an up-to-date
 * view of the L2 chain state. It handles block header retrieval, chain reorganizations, and provides an interface
 * for querying sync status.
 */
export class BlockSynchronizer implements L2BlockStreamEventHandler {
  private log: Logger;
  private isSyncing: Promise<void> | undefined;
  private readonly eventQueue = new SerialQueue();
  protected readonly blockStream: L2BlockStream;

  constructor(
    private node: AztecNode,
    private store: AztecAsyncKVStore,
    private anchorBlockStore: AnchorBlockStore,
    private noteStore: NoteStore,
    private privateEventStore: PrivateEventStore,
    private l2TipsStore: L2TipsKVStore,
    private contractSyncService: ContractSyncService,
    private config: Partial<BlockSynchronizerConfig> = {},
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('pxe:block_synchronizer', bindings);
    this.blockStream = this.createBlockStream(config);
    this.eventQueue.start();
  }

  protected createBlockStream(config: Partial<BlockSynchronizerConfig>): L2BlockStream {
    return new L2BlockStream(
      this.node,
      this.l2TipsStore,
      this,
      createLogger('pxe:block_stream', this.log.getBindings()),
      {
        batchSize: config.l2BlockBatchSize,
        // Skipping finalized blocks makes us sync much faster - we only need to download blocks other than the latest one
        // in order to detect reorgs, and there can be no reorgs on finalized block, making this safe.
        skipFinalized: true,
      },
    );
  }

  /** Handle events emitted by the block stream. Serialized to prevent concurrent mutations to anchor state. */
  public handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    return this.eventQueue.put(() => this.doHandleBlockStreamEvent(event));
  }

  private async doHandleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    await this.l2TipsStore.handleBlockStreamEvent(event);

    switch (event.type) {
      case 'blocks-added': {
        if (this.config.syncChainTip === undefined || this.config.syncChainTip === 'proposed') {
          const lastBlock = event.blocks.at(-1)!;
          await this.updateAnchorBlockHeader(lastBlock.header);
        }
        break;
      }
      case 'chain-checkpointed': {
        if (this.config.syncChainTip === 'checkpointed') {
          // Get the last block header from the checkpoint
          const lastBlock = event.checkpoint.checkpoint.blocks.at(-1)!;
          await this.updateAnchorBlockHeader(lastBlock.header);
        }
        break;
      }
      case 'chain-proven': {
        if (this.config.syncChainTip === 'proven') {
          const blockHeader = await this.node.getBlockHeader(BlockNumber(event.block.number));
          if (blockHeader) {
            await this.updateAnchorBlockHeader(blockHeader);
          } else {
            this.log.warn(`Block header not found for proven block ${event.block.number}, skipping anchor update`);
          }
        }
        break;
      }
      case 'chain-finalized': {
        if (this.config.syncChainTip === 'finalized') {
          const blockHeader = await this.node.getBlockHeader(BlockNumber(event.block.number));
          if (blockHeader) {
            await this.updateAnchorBlockHeader(blockHeader);
          } else {
            this.log.warn(`Block header not found for finalized block ${event.block.number}, skipping anchor update`);
          }
        }
        break;
      }
      case 'chain-pruned': {
        const currentAnchorBlockHeader = await this.anchorBlockStore.getBlockHeader();
        const currentAnchorBlockNumber = currentAnchorBlockHeader.getBlockNumber();
        if (currentAnchorBlockNumber <= event.block.number) {
          this.log.verbose(
            `Ignoring prune event to block ${event.block.number} greater than current anchor block ${currentAnchorBlockNumber}`,
            { pruneEvent: event, currentAnchorBlockHeader: currentAnchorBlockHeader.toInspect() },
          );
          return;
        }

        this.log.warn(`Pruning data after block ${event.block.number} due to reorg`);

        // Note that the following is not necessarily the anchor block that will be used in the transaction - if
        // the chain has already moved past the reorg, we'll also see blocks-added events that will push the anchor
        // forward.
        const newAnchorBlockHeader = await this.node.getBlockHeader(BlockHash.fromString(event.block.hash));

        if (!newAnchorBlockHeader) {
          throw new Error(
            `Block header for block number ${event.block.number} and hash ${event.block.hash} not found during chain prune. This likely indicates a bug in the node, as we receive block stream events and fetch block headers from the same node.`,
          );
        }

        // Operations are wrapped in a single transaction to ensure atomicity.
        await this.store.transactionAsync(async () => {
          await this.noteStore.rollback(event.block.number, currentAnchorBlockNumber);
          await this.privateEventStore.rollback(event.block.number, currentAnchorBlockNumber);
          await this.updateAnchorBlockHeader(newAnchorBlockHeader);
        });
        break;
      }
    }
  }

  /** Updates the anchor block header to the target block */
  private async updateAnchorBlockHeader(blockHeader: BlockHeader) {
    // Whenever the anchor block header is updated, we need to synchronize the private state of contracts again.
    // Therefore, we clear the contract synchronization cache here such that the sync is re-triggered upon new
    // execution.
    this.contractSyncService.wipe();
    this.log.verbose(`Updated pxe last block to ${blockHeader.getBlockNumber()}`, blockHeader.toInspect());
    await this.anchorBlockStore.setHeader(blockHeader);
  }

  /**
   * Syncs PXE and the node by downloading the metadata of the latest blocks, allowing simulations to use
   * recent data (e.g. notes), and handling any reorgs that might have occurred.
   *
   * Note this BlockSynchronizer is designed to let its users control when a synchronization is run,
   * so this component doesn't proactively stay up to date with the blockchain.
   *
   * We do this so PXE can ensure data consistency.
   */
  public async sync() {
    if (this.isSyncing !== undefined) {
      this.log.debug(`Waiting for the ongoing sync to finish`);
      await this.isSyncing;
      return;
    }

    this.log.debug(`Syncing PXE with the node`);
    // Capture the promise locally so we always await the exact promise we created, even if this.isSyncing is modified
    // between assignment and await (e.g. due to future refactors introducing a yield point).
    const isSyncing = this.doSync();
    this.isSyncing = isSyncing;
    try {
      await isSyncing;
    } finally {
      this.isSyncing = undefined;
    }
  }

  /** Stops the block synchronizer, waiting for any in-progress sync and queued events to complete. */
  public async stop() {
    await this.isSyncing;
    await this.blockStream.stop();
    await this.eventQueue.end();
  }

  private async doSync() {
    let currentHeader;

    try {
      currentHeader = await this.anchorBlockStore.getBlockHeader();
    } catch {
      this.log.debug('Header is not set, requesting from the node');
    }
    if (!currentHeader) {
      // REFACTOR: We should know the header of the genesis block without having to request it from the node.
      await this.anchorBlockStore.setHeader((await this.node.getBlockHeader(BlockNumber.ZERO))!);
    }
    await this.blockStream.sync();

    // If the anchor is still pinned at the initial header (block 0) but the chain has advanced past
    // genesis on whichever tip we follow, advance the anchor to that tip. The node cannot serve world
    // state at the initial header once the chain has moved past genesis (block 0 has no historical
    // snapshot in world state), which manifests as `Proving public value inclusion failed` in private
    // kernel circuits. This commonly happens with `syncChainTip: 'checkpointed'` between PXE startup
    // and the first checkpoint commit, when chain-checkpointed events have not yet fired.
    await this.advanceAnchorPastGenesisIfNeeded();
  }

  private async advanceAnchorPastGenesisIfNeeded(): Promise<void> {
    const anchor = await this.anchorBlockStore.getBlockHeader();
    if (anchor.getBlockNumber() !== 0) {
      return;
    }
    let targetBlockNumber: number | undefined;
    try {
      targetBlockNumber = await this.getTargetTipBlockNumber();
    } catch (err) {
      this.log.debug(`Skipping anchor advance: failed to read L2 tips`, { err });
      return;
    }
    if (targetBlockNumber === undefined || targetBlockNumber <= 0) {
      return;
    }
    const targetHeader = await this.node.getBlockHeader(BlockNumber(targetBlockNumber));
    if (!targetHeader) {
      this.log.warn(`Block header not found for tip block ${targetBlockNumber}, skipping anchor advance`);
      return;
    }
    this.log.verbose(`Advancing PXE anchor from initial header to block ${targetBlockNumber}`);
    await this.updateAnchorBlockHeader(targetHeader);
  }

  /**
   * Picks a tip block number to use when advancing the anchor away from the initial header.
   * Prefers the configured tip (committed checkpoint / proven / finalized) but falls back to the
   * latest proposed checkpoint when the preferred tip is still at genesis. This avoids races
   * where the PXE wants to prove a tx during the window between block proposal and the first
   * checkpoint commit, in which the configured tip has not yet caught up.
   */
  private async getTargetTipBlockNumber(): Promise<number | undefined> {
    const tips = await this.node.getL2Tips();
    if (!tips) {
      return undefined;
    }
    const proposedNumber = tips.proposed?.number ?? 0;
    const proposedCheckpointNumber = tips.proposedCheckpoint?.block?.number ?? 0;
    const checkpointedNumber = tips.checkpointed?.block?.number ?? 0;
    const provenNumber = tips.proven?.block?.number ?? 0;
    const finalizedNumber = tips.finalized?.block?.number ?? 0;
    const fallback = proposedCheckpointNumber > 0 ? proposedCheckpointNumber : proposedNumber;
    switch (this.config.syncChainTip) {
      case 'checkpointed':
        return checkpointedNumber > 0 ? checkpointedNumber : fallback;
      case 'proven':
        return provenNumber > 0 ? provenNumber : fallback;
      case 'finalized':
        return finalizedNumber > 0 ? finalizedNumber : fallback;
      case 'proposed':
      case undefined:
        return proposedNumber;
      default:
        return undefined;
    }
  }
}
