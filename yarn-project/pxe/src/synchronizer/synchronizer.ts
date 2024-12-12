import {
  type AztecNode,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
} from '@aztec/circuit-types';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type L2TipsStore } from '@aztec/kv-store/stores';

import { type PXEConfig } from '../config/index.js';
import { type PxeDatabase } from '../database/index.js';

/**
 * The Synchronizer class manages the synchronization with the aztec node, allowing PXE to retrieve the
 * latest block header and handle reorgs.
 * It provides methods to trigger a sync and get the block number we are syncec to
 * details, and fetch transactions by hash.
 */
export class Synchronizer implements L2BlockStreamEventHandler {
  private running = false;
  private initialSyncBlockNumber = INITIAL_L2_BLOCK_NUM - 1;
  private log: Logger;
  protected readonly blockStream: L2BlockStream;

  constructor(
    private node: AztecNode,
    private db: PxeDatabase,
    private l2TipsStore: L2TipsStore,
    config: Partial<Pick<PXEConfig, 'l2StartingBlock'>> = {},
    logSuffix?: string,
  ) {
    this.log = createLogger(logSuffix ? `pxe:synchronizer:${logSuffix}` : 'pxe:synchronizer');
    this.blockStream = this.createBlockStream(config);
  }

  protected createBlockStream(config: Partial<Pick<PXEConfig, 'l2StartingBlock'>>) {
    return new L2BlockStream(this.node, this.l2TipsStore, this, createLogger('pxe:block_stream'), {
      startingBlock: config.l2StartingBlock,
    });
  }

  /** Handle events emitted by the block stream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    await this.l2TipsStore.handleBlockStreamEvent(event);

    switch (event.type) {
      case 'blocks-added': {
        const lastBlock = event.blocks.at(-1)!;
        this.log.verbose(`Updated pxe last block to ${lastBlock.number}`, {
          blockHash: lastBlock.hash(),
          archive: lastBlock.archive.root.toString(),
          header: lastBlock.header.toInspect(),
        });
        await this.db.setHeader(lastBlock.header);
        break;
      }
      case 'chain-pruned': {
        this.log.warn(`Pruning data after block ${event.blockNumber} due to reorg`);
        // We first unnullify and then remove so that unnullified notes that were created after the block number end up deleted.
        await this.db.unnullifyNotesAfter(event.blockNumber);
        await this.db.removeNotesAfter(event.blockNumber);
        // Remove all note tagging indexes to force a full resync. This is suboptimal, but unless we track the
        // block number in which each index is used it's all we can do.
        await this.db.resetNoteSyncData();
        // Update the header to the last block.
        await this.db.setHeader(await this.node.getBlockHeader(event.blockNumber));
        break;
      }
    }
  }

  /**
   * Syncs PXE and the node by dowloading the metadata of the latest blocks, allowing simulations to use
   * recent data (e.g. notes), and handling any reorgs that might have occurred.
   */
  public async trigger() {
    this.running = true;

    let currentHeader;

    try {
      currentHeader = await this.db.getBlockHeader();
    } catch (e) {
      this.log.debug('Header is not set, requesting from the node');
    }
    if (!currentHeader) {
      // REFACTOR: We should know the header of the genesis block without having to request it from the node.
      await this.db.setHeader(await this.node.getBlockHeader(0));
    }
    await this.blockStream.sync();
    this.running = false;
  }

  public async stop() {
    await this.blockStream.stop();
  }

  public async getSynchedBlockNumber() {
    return (await this.db.getBlockNumber()) ?? this.initialSyncBlockNumber;
  }
}
