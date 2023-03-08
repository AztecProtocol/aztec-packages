import { Rollup, RollupSource } from './rollup-source.js';

/**
 * Pulls rollups in a non-blocking manner and provides interface for their retrieval.
 */
export class RollupArchiver implements RollupSource {
  /**
   * A property which indicates whether the archiver sync loop is running.
   */
  private running = false;
  /**
   * A promise in which we keep on pulling the rollups until `running` is set to false.
   */
  private runningPromise?: Promise<void>;
  private interruptableSleep = new InterruptableSleep();

  /**
   * An array containing all the rollups that have been fetched so far.
   */
  private rollups: Rollup[] = [];

  /*
   * @param ethProvider - Ethereum provider
   * @param rollupAddress - Ethereum address of the rollup contract
   * TODO: replace strings with the corresponding types once they are implemented in ethereum.js
   **/
  constructor(private readonly ethProvider: string, private readonly rollupAddress: string) {}

  public start() {
    this.log('Initializing...');

    // After which, we asynchronously kick off a polling loop for the latest messages.
    this.running = true;
    this.runningPromise = (async () => {
      while (this.running) {
        // TODO: Fetch new rollups and save them
        await this.interruptableSleep.sleep(10000);
      }
    })();
  }

  public async stop() {
    this.log('Stopping...');

    this.running = false;
    this.interruptableSleep.interrupt(false);
    await this.runningPromise!;
    this.log('Stopped.');
  }

  /*
   * @inheritDoc
   */
  public getLastRollupId(): number {
    return this.rollups.length === 0 ? -1 : this.rollups[this.rollups.length - 1].id;
  }

  /*
   * @inheritDoc
   */
  public getRollups(from: number, take: number): Rollup[] {
    if (from > this.rollups.length) {
      const rollups: Rollup[] = [];
      return rollups;
    }
    if (from + take > this.rollups.length) {
      return this.rollups.slice(from);
    }

    return this.rollups.slice(from, from + take);
  }
}
