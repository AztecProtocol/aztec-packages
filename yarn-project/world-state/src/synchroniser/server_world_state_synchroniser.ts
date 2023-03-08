import { WorldStateRunningState, WorldStateStatus, WorldStateSynchroniser } from './world_state_synchroniser.js';
import { RollupEmitter, Rollup } from '@aztec/data-archiver';
import { BatchUpdate, TreeInfo, WorldStateDB, WorldStateTreeId } from '../world-state-db/index.js';
import { MemoryFifo } from '../memory_fifo.js';

export class ServerWorldStateSynchroniser implements WorldStateSynchroniser {
  private queue: MemoryFifo<() => Promise<void>> = new MemoryFifo<() => Promise<void>>();
  private queuePromise?: Promise<void>;
  private currentRollupId = 0;

  constructor(private worldStateDb: WorldStateDB, private rollupEmitter: RollupEmitter) {}

  public start() {
    this.queuePromise = this.queue.process(fn => {
      return fn();
    });
    this.rollupEmitter.on('rollup', (rollup: Rollup) => this.synchronise(() => this.handleRollup(rollup)));
    this.rollupEmitter.start(this.currentRollupId, true);
  }

  public async stop() {
    // first stop the emitter
    await this.rollupEmitter.stop();
    // now wait for the rollup queue to complete
    this.queue.end();
    await this.queuePromise;
  }

  public status(): Promise<WorldStateStatus> {
    const status = {
      syncedToRollup: this.currentRollupId,
      state: WorldStateRunningState.IDLE,
    } as WorldStateStatus;
    return Promise.resolve(status);
  }

  public async getTreeInfo(): Promise<TreeInfo[]> {
    return await this.synchronise(async () => {
      return await this.worldStateDb.getTreeInfo();
    });
  }

  private async synchronise<T>(fn: () => Promise<T>): Promise<T> {
    return await new Promise(resolve => {
      this.queue.put(async () => {
        const result = await fn();
        resolve(result);
      });
    });
  }

  private async handleRollup(rollup: Rollup) {
    const update = {
      treeId: WorldStateTreeId.CONTRACT_TREE,
      elements: rollup.commitments,
    } as BatchUpdate;
    await this.worldStateDb.insertElements([update]);
  }
}
