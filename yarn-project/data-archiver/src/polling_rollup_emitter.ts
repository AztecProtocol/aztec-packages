import { EventEmitter } from 'stream';
import { Rollup } from './rollup.js';
import { RollupEmitter, RollupRetriever } from './rollup_emitter.js';

export class PollingRollupEmitter extends EventEmitter implements RollupEmitter {
  private running = false;
  private runningPromise = Promise.resolve();
  private interruptPromise = Promise.resolve();
  private interruptResolve = () => {};
  constructor(private retriever: RollupRetriever, private pollingInterval = 10000) {
    super();
  }
  public getRollups(from: number, take?: number): Promise<Rollup[]> {
    return this.retriever.getRollups(from, take);
  }

  /**
   * Starts emitting rollup blocks.
   */
  public start(fromRollup = 0) {
    this.running = true;
    this.interruptPromise = new Promise(resolve => (this.interruptResolve = resolve));

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

    const poll = async () => {
      while (this.running) {
        await getAndEmitNewBlocks();
        await this.interruptableSleep(this.pollingInterval);
      }
    };
    this.runningPromise = poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.interruptResolve();
    await this.runningPromise;
  }

  public getLatestRollupId(): Promise<number> {
    return this.retriever.getLatestRollupId();
  }

  private async interruptableSleep(timeInMs: number) {
    let timeout!: NodeJS.Timeout;
    const sleepPromise = new Promise(resolve => {
      timeout = setTimeout(resolve, timeInMs);
    });
    await Promise.race([sleepPromise, this.interruptPromise]);
    clearTimeout(timeout);
  }
}
