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
import type { AnchorBlockStore } from '../storage/anchor_block_store/index.js';
import type { FactStore } from '../storage/fact_store/fact_store.js';
import type { NoteStore } from '../storage/note_store/index.js';
import type { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
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
    private readonly node: AztecNode,
    private readonly store: AztecAsyncKVStore,
    private readonly anchorBlockStore: AnchorBlockStore,
    private readonly noteStore: NoteStore,
    private readonly privateEventStore: PrivateEventStore,
    private readonly factStore: FactStore,
    private readonly l2TipsStore: L2TipsKVStore,
    private readonly contractSyncService: ContractSyncService,
    private readonly config: Partial<BlockSynchronizerConfig> = {},
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('pxe:block_synchronizer', bindings);
    this.blockStream = this.createBlockStream();
    this.eventQueue.start();
  }

  protected createBlockStream(): L2BlockStream {
    return new L2BlockStream(
      blockStreamSourceFromAztecNode(this.node),
      this.l2TipsStore,
      this,
      createLogger('pxe:block_stream', this.log.getBindings()),
      {
        // PXE only tracks chain tips (it anchors on tip events and never replays payloads), so the stream runs
        // in tips-only mode: no block downloads, just the tip events that move the anchor and detect reorgs.
        tipsOnly: true,
      },
    );
  }

  /** Handle events emitted by the block stream. Serialized to prevent concurrent mutations to anchor state. */
  public handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    return this.eventQueue.put(() => this.doHandleBlockStreamEvent(event));
  }

  private async doHandleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'chain-proposed': {
        if (this.config.syncChainTip === undefined || this.config.syncChainTip === 'proposed') {
          // Fetch the proposed tip header by hash. By-hash is safer than by-number against a same-height reorg.
          const block = await this.node.getBlockData(BlockHash.fromString(event.block.hash));
          if (!block) {
            // The node served a proposed tip whose block data it cannot return — a node inconsistency, since the
            // stream events and the block data come from the same node (same reasoning as the chain-pruned throw
            // below). Throwing here propagates before the tips-store cursor advances, so the cursor stays put and the
            // next sync re-emits chain-proposed (at-least-once). Were we to warn-and-skip, the cursor would advance and
            // a quiet chain would never re-emit, leaving the anchor stale indefinitely.
            throw new Error(
              `Block header for proposed block ${event.block.number} and hash ${event.block.hash} not found. This ` +
                `likely indicates a bug in the node, as we receive block stream events and fetch block headers from ` +
                `the same node.`,
            );
          }
          await this.updateAnchorBlockHeader(block.header);
        }
        break;
      }
      // Never emitted in tips-only mode; PXE anchors on chain-proposed instead. Kept for union exhaustiveness.
      case 'blocks-added':
        break;
      case 'chain-checkpointed': {
        if (this.config.syncChainTip === 'checkpointed') {
          // Fetch the checkpointed tip header by hash. By-hash is safer than by-number against a
          // same-height reorg; a missing result means the block was reorged out between the event
          // and this fetch, so we skip the anchor update and let a later event correct it.
          const block = await this.node.getBlockData(BlockHash.fromString(event.block.hash));
          if (block) {
            await this.updateAnchorBlockHeader(block.header);
          } else {
            this.log.warn(
              `Block header not found for checkpointed block ${event.block.number}, skipping anchor update`,
            );
          }
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
        const currentAnchorBlockHeader = await this.anchorBlockStore.getBlockHeader();
        const currentAnchorBlockNumber = currentAnchorBlockHeader.getBlockNumber();
        if (currentAnchorBlockNumber <= event.block.number) {
          this.log.verbose(
            `Ignoring prune event to block ${event.block.number} greater than current anchor block ${currentAnchorBlockNumber}`,
            { pruneEvent: event, currentAnchorBlockHeader: currentAnchorBlockHeader.toInspect() },
          );
          break;
        }

        this.log.warn(`Pruning data after block ${event.block.number} due to reorg`, { pruneBlock: event.block });

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

        // Operations are wrapped in a single transaction to ensure atomicity.
        await this.store.transactionAsync(async () => {
          await this.noteStore.rollback(event.block.number);
          await this.privateEventStore.rollback(event.block.number);
          await this.factStore.rollback(event.block.number);
          await this.updateAnchorBlockHeader(newAnchorBlockHeader);
        });
        break;
      }
      default: {
        const _: never = event;
        break;
      }
    }

    // Advance the tips store cursor only after the anchor update / prune rollback above succeeds. If that work
    // throws, the cursor stays put and the stream re-emits this event on the next sync pass (at-least-once),
    // matching the prover-node's handle-first/tips-last ordering. The SerialQueue makes this reorder safe.
    await this.l2TipsStore.handleBlockStreamEvent(event);
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
      await this.anchorBlockStore.setHeader((await this.node.getBlockData(BlockNumber.ZERO))!.header);
    }
    await this.blockStream.sync();
  }
}
