import { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2TipsKVStore } from '@aztec/kv-store/stores';
import { BlockHash, L2BlockStream, type L2BlockStreamEvent, type L2BlockStreamEventHandler } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { BlockSynchronizerConfig } from '../config/index.js';
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
  protected readonly blockStream: L2BlockStream;

  constructor(
    private node: AztecNode,
    private store: AztecAsyncKVStore,
    private anchorBlockStore: AnchorBlockStore,
    private noteStore: NoteStore,
    private privateEventStore: PrivateEventStore,
    private l2TipsStore: L2TipsKVStore,
    private config: Partial<BlockSynchronizerConfig> = {},
    loggerOrSuffix?: string | Logger,
  ) {
    this.log =
      !loggerOrSuffix || typeof loggerOrSuffix === 'string'
        ? createLogger(loggerOrSuffix ? `pxe:block_synchronizer:${loggerOrSuffix}` : `pxe:block_synchronizer`)
        : loggerOrSuffix;
    this.blockStream = this.createBlockStream(config);
  }

  protected createBlockStream(config: Partial<BlockSynchronizerConfig>): L2BlockStream {
    return new L2BlockStream(this.node, this.l2TipsStore, this, createLogger('pxe:block_stream'), {
      batchSize: config.l2BlockBatchSize,
      // Skipping finalized blocks makes us sync much faster - we only need to download blocks other than the latest one
      // in order to detect reorgs, and there can be no reorgs on finalized block, making this safe.
      skipFinalized: true,
    });
  }

  /** Handle events emitted by the block stream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
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
          }
        }
        break;
      }
      case 'chain-finalized': {
        if (this.config.syncChainTip === 'finalized') {
          const blockHeader = await this.node.getBlockHeader(BlockNumber(event.block.number));
          if (blockHeader) {
            await this.updateAnchorBlockHeader(blockHeader);
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
    const isSyncing = this.doSync();
    this.isSyncing = isSyncing;
    try {
      await isSyncing;
    } finally {
      this.isSyncing = undefined;
    }
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
  }
}
