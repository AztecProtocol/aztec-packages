import { RunningPromise } from '@aztec/foundation';
import { EventEmitter } from 'stream';

import { Rollup } from './rollup.js';
import { RollupEmitter } from './rollup_emitter.js';
import { RollupSource } from './rollup_source.js';

export class PollingRollupEmitter extends EventEmitter implements RollupEmitter {
  private runningPromise?: RunningPromise;
  constructor(private retriever: RollupSource, private pollingInterval = 10000) {
    super();
  }
  public getRollups(from: number, take?: number): Promise<Rollup[]> {
    return this.retriever.getRollups(from, take);
  }

  /**
   * Starts emitting rollup blocks.
   */
  public async start(fromRollup = 0, syncInitial = true) {
    const getAndEmitNewBlocks = async () => {
      try {
        const rollups = await this.getRollups(fromRollup);
        for (const rollup of rollups) {
          this.emit('rollup', rollup);
          fromRollup = rollup.rollupId + 1;
        }
      } catch (error) {
        console.log(error);
      }
    };
    if (syncInitial) {
      await getAndEmitNewBlocks();
    }

    this.runningPromise = new RunningPromise(getAndEmitNewBlocks, this.pollingInterval);
    this.runningPromise!.start();
  }

  async stop(): Promise<void> {
    await this.runningPromise?.stop();
  }

  public getLatestRollupId(): Promise<number> {
    return this.retriever.getLatestRollupId();
  }
}
