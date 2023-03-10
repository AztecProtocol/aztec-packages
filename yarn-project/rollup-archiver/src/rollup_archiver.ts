import { createLogger } from './movetofoundation/log/console.js';
import { RollupSource } from './rollup_source.js';
import { ContractData, RollupBlockData } from './rollup_block_data/rollup_block_data.js';
import { randomAppendOnlyTreeSnapshot, randomBytes, randomContractData } from './rollup_block_data/mocks.js';
import { InterruptableSleep } from './movetofoundation/interruptable_sleep.js';

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
  private log = createLogger('Archiver');

  /**
   * An array containing all the rollups that have been fetched so far.
   */
  private rollupBlocks: RollupBlockData[] = [];

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
    this.log(
      'Initializing with provider: ' + this.ethProvider + ' and rollup contract address: ' + this.rollupAddress + '...',
    );

    // After which, we asynchronously kick off a polling loop for the latest messages.
    this.running = true;
    this.runningPromise = (async () => {
      while (this.running) {
        this.log('Fetching new rollups...');
        const newRollupBlocks = [mockRandomRollupBlock(this.rollupBlocks.length)];
        this.log(`Fetched ${newRollupBlocks.length} new rollup blocks.`);

        this.rollupBlocks.push(...newRollupBlocks);

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
   * {@inheritDoc RollupSource.getLastRollupId}
   */
  public getLastRollupId(): number {
    return this.rollupBlocks.length === 0 ? -1 : this.rollupBlocks[this.rollupBlocks.length - 1].rollupBlockNumber;
  }

  /**
   * {@inheritDoc RollupSource.getRollups}
   */
  public getRollups(from: number, take: number): RollupBlockData[] {
    if (from > this.rollupBlocks.length) {
      const rollups: RollupBlockData[] = [];
      return rollups;
    }
    if (from + take > this.rollupBlocks.length) {
      return this.rollupBlocks.slice(from);
    }

    return this.rollupBlocks.slice(from, from + take);
  }
}

function mockRandomRollupBlock(rollupBlockNumber: number): RollupBlockData {
  const newNullifiers = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
  const newCommitments = [randomBytes(32), randomBytes(32), randomBytes(32), randomBytes(32)];
  const newContracts: Buffer[] = [randomBytes(32)];
  const newContractsData: ContractData[] = [randomContractData()];

  return new RollupBlockData(
    rollupBlockNumber,
    randomAppendOnlyTreeSnapshot(0),
    randomAppendOnlyTreeSnapshot(0),
    randomAppendOnlyTreeSnapshot(0),
    randomAppendOnlyTreeSnapshot(0),
    randomAppendOnlyTreeSnapshot(0),
    randomAppendOnlyTreeSnapshot(newCommitments.length),
    randomAppendOnlyTreeSnapshot(newNullifiers.length),
    randomAppendOnlyTreeSnapshot(newContracts.length),
    randomAppendOnlyTreeSnapshot(1),
    randomAppendOnlyTreeSnapshot(1),
    newCommitments,
    newNullifiers,
    newContracts,
    newContractsData,
  );
}
