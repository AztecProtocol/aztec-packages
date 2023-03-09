import { InterruptableSleep } from './movetofoundation/index.js';
import { createLogger } from './movetofoundation/log/console.js';
import { RollupSource } from './rollup-source.js';
import { RollupBlockData } from './rollup_block_data/rollup_block_data.js';

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
  /**
   * An object which allows us to pause the loop running in the promise and interrupt it.
   */
  private interruptableSleep = new InterruptableSleep();
  /**
   * A logger.
   */
  private log = createLogger('EthereumBlockchain');

  /**
   * An array containing all the rollups that have been fetched so far.
   */
  private rollups: RollupBlockData[] = [];

  /**
   * Creates a new instance of the RollupArchiver.
   * @param ethProvider - Ethereum provider
   * @param rollupAddress - Ethereum address of the rollup contract
   * TODO: replace strings with the corresponding types once they are implemented in ethereum.js
   */
  constructor(private readonly ethProvider: string, private readonly rollupAddress: string) {}

  /**
   * Starts the promise pulling the data.
   */
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

  /**
   * Stops the promise pulling the data.
   */
  public async stop() {
    this.log('Stopping...');

    this.running = false;
    this.interruptableSleep.interrupt(false);
    await this.runningPromise!;
    this.log('Stopped.');
  }

  /**
   * {@inheritDoc RollupSource.getRollups}
   */
  public getLastRollupId(): number {
    return this.rollups.length === 0 ? -1 : this.rollups[this.rollups.length - 1].id;
  }

  /**
   * {@inheritDoc RollupSource.getRollups}
   */
  public getRollups(from: number, take: number): RollupBlockData[] {
    if (from > this.rollups.length) {
      const rollups: RollupBlockData[] = [];
      return rollups;
    }
    if (from + take > this.rollups.length) {
      return this.rollups.slice(from);
    }

    return this.rollups.slice(from, from + take);
  }
}
