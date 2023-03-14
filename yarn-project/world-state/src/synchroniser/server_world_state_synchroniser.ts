import { WorldStateRunningState, WorldStateStatus, WorldStateSynchroniser } from './world_state_synchroniser.js';
import { RollupSource, Rollup } from '@aztec/data-archiver';
import { BatchUpdate, WorldStateTreeId } from '../world-state-db/index.js';
import { MerkleTreeDb } from '@aztec/merkle-tree';
import { RollupBlockDownloader } from '../rollup_block_downloader.js';

export class ServerWorldStateSynchroniser implements WorldStateSynchroniser {
  private currentRollupId = 0;
  private rollupDownloader: RollupBlockDownloader;
  private runningPromise: Promise<void> = Promise.resolve();
  private running = false;

  constructor(private merkleTreeDb: MerkleTreeDb, rollupSource: RollupSource, maxQueueSize = 1000) {
    this.rollupDownloader = new RollupBlockDownloader(rollupSource, maxQueueSize);
  }

  public start(from = 0) {
    this.running = true;
    const blockProcess = async () => {
      while (this.running) {
        const blocks = await this.rollupDownloader.getBlocks();
        await this.handleRollups(blocks);
      }
    };
    this.runningPromise = blockProcess();

    this.rollupDownloader.start(from);
  }

  public async stop() {
    await this.rollupDownloader.stop();
    this.running = false;
    await this.runningPromise;
  }

  public status(): Promise<WorldStateStatus> {
    const status = {
      syncedToRollup: this.currentRollupId,
      state: WorldStateRunningState.IDLE,
    } as WorldStateStatus;
    return Promise.resolve(status);
  }

  private async handleRollups(rollups: Rollup[]) {
    for (const rollup of rollups) {
      await this.handleRollup(rollup);
    }
  }

  private async handleRollup(rollup: Rollup) {
    const update = {
      treeId: WorldStateTreeId.CONTRACT_TREE,
      elements: rollup.commitments,
    } as BatchUpdate;
    await this.merkleTreeDb.insertElements([update]);
    this.currentRollupId = rollup.rollupId;
  }
}
