import { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { L2TipsKVStore } from '@aztec/kv-store/stores';
import { L2BlockStream, type L2BlockStreamEvent, type L2BlockStreamEventHandler } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PXEConfig } from '../config/index.js';
import type { JobContext } from '../job_coordinator/index.js';
import type { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import type { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import type { RecipientTaggingDataProvider } from '../storage/tagging_data_provider/recipient_tagging_data_provider.js';

/**
 * The BlockSynchronizer class orchestrates synchronization between PXE and Aztec node, maintaining an up-to-date
 * view of the L2 chain state. It handles block header retrieval, chain reorganizations, and provides an interface
 * for querying sync status.
 */
export class BlockSynchronizer implements L2BlockStreamEventHandler {
  private log: Logger;
  private isSyncing: Promise<void> | undefined;
  protected readonly blockStream: L2BlockStream;
  /** Job context for staged writes during sync. Set before sync, cleared after. */
  private currentJobContext?: JobContext;

  constructor(
    private node: AztecNode,
    private anchorBlockDataProvider: AnchorBlockDataProvider,
    private noteDataProvider: NoteDataProvider,
    private recipientTaggingDataProvider: RecipientTaggingDataProvider,
    private l2TipsStore: L2TipsKVStore,
    config: Partial<Pick<PXEConfig, 'l2BlockBatchSize'>> = {},
    loggerOrSuffix?: string | Logger,
  ) {
    this.log =
      !loggerOrSuffix || typeof loggerOrSuffix === 'string'
        ? createLogger(loggerOrSuffix ? `pxe:block_synchronizer:${loggerOrSuffix}` : `pxe:block_synchronizer`)
        : loggerOrSuffix;
    this.blockStream = this.createBlockStream(config);
  }

  protected createBlockStream(config: Partial<Pick<PXEConfig, 'l2BlockBatchSize'>>) {
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
    const context = this.currentJobContext;

    switch (event.type) {
      case 'blocks-added': {
        const lastBlock = event.blocks.at(-1)!.block;
        this.log.verbose(`Updated pxe last block to ${lastBlock.number}`, {
          blockHash: lastBlock.hash(),
          archive: lastBlock.archive.root.toString(),
          header: lastBlock.header.toInspect(),
        });
        await this.anchorBlockDataProvider.setHeader(lastBlock.getBlockHeader(), context);
        if (context) {
          context.registerWrite(this.anchorBlockDataProvider.storeName);
        }
        break;
      }
      case 'chain-pruned': {
        this.log.warn(`Pruning data after block ${event.block.number} due to reorg`);
        // We first unnullify and then remove so that unnullified notes that were created after the block number end up deleted.
        const lastSynchedBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader(context)).getBlockNumber();
        await this.noteDataProvider.rollbackNotesAndNullifiers(event.block.number, lastSynchedBlockNumber, context);
        if (context) {
          context.registerWrite(this.noteDataProvider.storeName);
        }
        // Remove all note tagging indexes to force a full resync. This is suboptimal, but unless we track the
        // block number in which each index is used it's all we can do.
        // Note: This is now unnecessary for the sender tagging data provider because the new algorithm handles reorgs.
        // TODO(#17775): Once this issue is implemented we will have the index-block number mapping, so we can
        // implement this more intelligently.
        await this.recipientTaggingDataProvider.resetNoteSyncData(context);
        if (context) {
          context.registerWrite(this.recipientTaggingDataProvider.storeName);
        }
        // Update the header to the last block.
        const newHeader = await this.node.getBlockHeader(event.block.number);
        if (!newHeader) {
          this.log.error(`Block header not found for block number ${event.block.number} during chain prune`);
        } else {
          await this.anchorBlockDataProvider.setHeader(newHeader, context);
          if (context) {
            context.registerWrite(this.anchorBlockDataProvider.storeName);
          }
        }
        break;
      }
    }
  }

  /**
   * Syncs PXE and the node by downloading the metadata of the latest blocks, allowing simulations to use
   * recent data (e.g. notes), and handling any reorgs that might have occurred.
   *
   * Note this BlockSynchronizer is designed to let its users control when a synchronization is run,
   * so this component doesn't proactively stay up to date with the blockchain.
   *
   * We do this so PXE can ensure data consistency.
   *
   * @param context - Optional job context for staged writes during sync.
   */
  public async sync(context?: JobContext) {
    if (this.isSyncing !== undefined) {
      this.log.debug(`Waiting for the ongoing sync to finish`);
      await this.isSyncing;
      return;
    }

    this.log.debug(`Syncing PXE with the node`);
    this.currentJobContext = context;
    const isSyncing = this.doSync();
    this.isSyncing = isSyncing;
    try {
      await isSyncing;
    } finally {
      this.isSyncing = undefined;
      this.currentJobContext = undefined;
    }
  }

  private async doSync() {
    let currentHeader;

    try {
      currentHeader = await this.anchorBlockDataProvider.getBlockHeader();
    } catch {
      this.log.debug('Header is not set, requesting from the node');
    }
    if (!currentHeader) {
      // REFACTOR: We should know the header of the genesis block without having to request it from the node.
      await this.anchorBlockDataProvider.setHeader((await this.node.getBlockHeader(BlockNumber.ZERO))!);
    }
    await this.blockStream.sync();
  }
}
