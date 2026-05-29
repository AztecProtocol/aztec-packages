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
import type { CanonicalBlockStore } from '../storage/canonical_block_store/index.js';
import { blockStreamSourceFromAztecNode } from './block_stream_source.js';

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
    private canonicalBlockStore: CanonicalBlockStore,
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
      blockStreamSourceFromAztecNode(this.node),
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
        const origins = await Promise.all(
          event.blocks.map(async b => ({ blockNumber: b.number, blockHash: (await b.hash()).toString() })),
        );
        await this.canonicalBlockStore.setManyCanonical(origins);
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
          const block = await this.node.getBlock(BlockNumber(event.block.number));
          if (block) {
            await this.updateAnchorBlockHeader(block.header);
          } else {
            this.log.warn(`Block header not found for proven block ${event.block.number}, skipping anchor update`);
          }
        }
        break;
      }
      case 'chain-finalized': {
        await this.canonicalBlockStore.setFinalized(event.block.number);
        if (this.config.syncChainTip === 'finalized') {
          const block = await this.node.getBlock(BlockNumber(event.block.number));
          if (block) {
            await this.updateAnchorBlockHeader(block.header);
          } else {
            this.log.warn(`Block header not found for finalized block ${event.block.number}, skipping anchor update`);
          }
        }
        break;
      }
      case 'chain-pruned': {
        const currentAnchorBlockHeader = await this.canonicalBlockStore.getBlockHeader();
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
        const newAnchorBlock = await this.node.getBlock(BlockHash.fromString(event.block.hash));
        const newAnchorBlockHeader = newAnchorBlock?.header;

        if (!newAnchorBlockHeader) {
          throw new Error(
            `Block header for block number ${event.block.number} and hash ${event.block.hash} not found during chain prune. This likely indicates a bug in the node, as we receive block stream events and fetch block headers from the same node.`,
          );
        }

        await this.store.transactionAsync(async () => {
          await this.canonicalBlockStore.clearAbove(event.block.number);
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
    await this.canonicalBlockStore.setHeader(blockHeader);
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
      currentHeader = await this.canonicalBlockStore.getBlockHeader();
    } catch {
      this.log.debug('Header is not set, requesting from the node');
    }
    if (!currentHeader) {
      // REFACTOR: We should know the header of the genesis block without having to request it from the node.
      await this.canonicalBlockStore.setHeader((await this.node.getBlockData(BlockNumber.ZERO))!.header);
    }
    if (this.canonicalBlockStore.isEmpty()) {
      const finalized = await this.node.getBlockNumber('finalized');
      await this.canonicalBlockStore.setFloor(finalized);
      await this.canonicalBlockStore.setFinalized(finalized);
      const tip = await this.node.getBlockNumber();
      const origins = [];
      for (let h = finalized; h <= tip; h++) {
        const block = await this.node.getBlock(BlockNumber(h));
        if (block) {
          origins.push({ blockNumber: h, blockHash: block.hash.toString() });
        }
      }
      await this.canonicalBlockStore.setManyCanonical(origins);
    }
    await this.blockStream.sync();
  }
}
