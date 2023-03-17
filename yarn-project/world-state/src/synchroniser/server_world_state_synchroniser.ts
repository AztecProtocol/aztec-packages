import { MerkleTreeDb } from '@aztec/merkle-tree';
import { L2BlockSource } from '@aztec/archiver/l2_block_source';
import { L2Block } from '@aztec/archiver/l2_block';

import { WorldStateRunningState, WorldStateStatus, WorldStateSynchroniser } from './world_state_synchroniser.js';
import { BatchUpdate, WorldStateTreeId } from '../world-state-db/index.js';
import { L2BlockDownloader } from '../l2_block_downloader.js';

/**
 * Synchronises the world state with the L2 blocks from a L2BlockSource.
 * The synchroniser will download the L2 blocks from the L2BlockSource and insert the new commitments into the merkle
 * tree.
 */
export class ServerWorldStateSynchroniser implements WorldStateSynchroniser {
  private currentL2BlockNum = 0;
  private l2BlockDownloader: L2BlockDownloader;
  private runningPromise: Promise<void> = Promise.resolve();
  private running = false;

  constructor(private merkleTreeDb: MerkleTreeDb, l2BlockSource: L2BlockSource, maxQueueSize = 1000) {
    this.l2BlockDownloader = new L2BlockDownloader(l2BlockSource, maxQueueSize);
  }

  /**
   * Starts the synchroniser.
   * @param from - The block number to start downloading from. Defaults to 0.
   */
  public start(from = 0) {
    this.running = true;
    const blockProcess = async () => {
      while (this.running) {
        const blocks = await this.l2BlockDownloader.getL2Blocks();
        await this.handleL2Blocks(blocks);
      }
    };
    this.runningPromise = blockProcess();

    this.l2BlockDownloader.start(from);
  }

  /**
   * Stops the synchroniser.
   */
  public async stop() {
    await this.l2BlockDownloader.stop();
    this.running = false;
    await this.runningPromise;
  }

  /**
   * Returns the current status of the synchroniser.
   * @returns The current status of the synchroniser.
   */
  public status(): Promise<WorldStateStatus> {
    const status = {
      syncedToL2Block: this.currentL2BlockNum,
      state: WorldStateRunningState.IDLE,
    } as WorldStateStatus;
    return Promise.resolve(status);
  }

  /**
   * Handles a list of L2 blocks (i.e. Inserts the new commitments into the merkle tree).
   * @param l2blocks - The L2 blocks to handle.
   */
  private async handleL2Blocks(l2blocks: L2Block[]) {
    for (const l2block of l2blocks) {
      await this.handleL2Block(l2block);
    }
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new commitments into the merkle tree).
   * @param l2block - The L2 block to handle.
   */
  private async handleL2Block(l2block: L2Block) {
    const update = {
      treeId: WorldStateTreeId.CONTRACT_TREE,
      elements: l2block.newCommitments,
    } as BatchUpdate;
    await this.merkleTreeDb.insertElements([update]);
    this.currentL2BlockNum = l2block.number;
  }
}
