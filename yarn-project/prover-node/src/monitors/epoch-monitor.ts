import {
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2Tips,
} from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

export interface EpochMonitorHandler {
  handleEpochCompleted(epochNumber: bigint): Promise<void>;
}

const PROVEN_BLOCK_HISTORY = 64;

type EpochStatus = {
  epochNumber: bigint;
  finalBlockNumber: number;
  startBlockNumber: number;
};

export class EpochMonitor implements Traceable, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private runningPromise: RunningPromise;
  private log = createLogger('prover-node:epoch-monitor');
  public readonly tracer: Tracer;

  private handler: EpochMonitorHandler | undefined;

  private latestEpochNumber: bigint | undefined;

  private epochs: EpochStatus[] = [];
  private blockHashes = new Map<number, string>();
  private l2Tips: L2Tips | undefined = undefined;
  private blockStream: L2BlockStream | undefined = undefined;

  constructor(
    private readonly l2BlockSource: L2BlockSource,
    private options: { pollingIntervalMs: number },
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.tracer = telemetry.getTracer('EpochMonitor');
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.options.pollingIntervalMs);
  }

  public async start(handler: EpochMonitorHandler): Promise<void> {
    this.handler = handler;
    this.blockHashes.clear();
    this.epochs = [];
    await this.reset();
    this.blockStream = new L2BlockStream(this.l2BlockSource, this, this, this.log, {
      proven: false,
      pollIntervalMS: this.options.pollingIntervalMs,
      startingBlock: this.l2Tips!.proven.number,
    });
    this.blockStream.start();
    this.runningPromise.start();
    this.log.info('Started EpochMonitor', this.options);
  }

  public async stop() {
    await this.blockStream?.stop();
    await this.runningPromise.stop();
    this.log.info('Stopped EpochMonitor');
  }

  @trackSpan('EpochMonitor.work')
  public async work() {
    if (!this.latestEpochNumber) {
      const epochNumber = await this.l2BlockSource.getL2EpochNumber();
      if (epochNumber > 0n) {
        await this.addNewEpoch(epochNumber - 1n);
      }
      this.latestEpochNumber = epochNumber;
      return;
    }

    // If the block source says this epoch is ready to go then store it as of interest and wait
    // for the proven chain to advance to just before it's block range
    if (await this.l2BlockSource.isEpochComplete(this.latestEpochNumber)) {
      await this.addNewEpoch(this.latestEpochNumber);
      this.latestEpochNumber += 1n;
    }

    // If we have epochs of interest, then look for the proven chain advancing to just before the first epoch we are watching
    if (this.epochs.length > 0 && this.l2Tips!.proven.number >= this.epochs[0].startBlockNumber - 1) {
      // Epoch can be proven
      const epoch = this.epochs.shift();
      this.log.verbose(`Triggering epoch completion ${epoch?.epochNumber}`);
      await this.handler!.handleEpochCompleted(epoch!.epochNumber);
    }
  }

  private async addNewEpoch(epochNumber: bigint) {
    // We are adding this new epoch of interest, provided it has blocks to prove
    // The archiver has these blocks already, otherwise this epoch would not have been returned from getL2EpochNumber
    const blocks = await this.l2BlockSource.getBlocksForEpoch(epochNumber);
    if (blocks.length == 0) {
      return;
    }

    // Ensure we have block hashes for these
    for (const block of blocks) {
      const h = await block.hash();
      this.blockHashes.set(block.number, h.toString());
    }

    // Store the epoch data
    const status: EpochStatus = {
      epochNumber,
      finalBlockNumber: blocks[blocks.length - 1].number,
      startBlockNumber: blocks[0].number,
    };
    this.epochs.push(status);
    this.log.trace(
      `Added epoch ${status.epochNumber}, block range: ${status.startBlockNumber} - ${status.finalBlockNumber}`,
    );
  }

  private async reset(): Promise<void> {
    // Take the latest state from the block source
    // Get the current L2 tips and refresh our blocks cache with the pending chain and proven history
    this.l2Tips = await this.l2BlockSource.getL2Tips();
    const earliestBlock = Math.max(1, this.l2Tips.proven.number - PROVEN_BLOCK_HISTORY);
    const pendingChainLength = this.l2Tips.latest.number - earliestBlock;
    const blocks = await this.l2BlockSource.getBlocks(earliestBlock, pendingChainLength + 1);
    for (const block of blocks) {
      const h = await block.hash();
      this.blockHashes.set(block.number, h.toString());
    }
  }

  private clearHistoricBlocks() {
    // Remove block hashes older than our configured history
    const earliestBlock = Math.max(0, this.l2Tips!.proven.number - PROVEN_BLOCK_HISTORY);
    if (earliestBlock < 1) {
      return;
    }
    const allToClear = Array.from(this.blockHashes.keys()).filter(k => k < earliestBlock);
    allToClear.forEach(k => this.blockHashes.delete(k));
  }

  private async clearCacheAndResetState() {
    this.blockHashes.clear();
    this.epochs = [];
    await this.reset();
  }

  async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    if (event.type === 'chain-pruned') {
      this.log.trace(`Received chain pruned event for block ${event.blockNumber}`);

      // Completely reset our state to the current from the block source
      await this.clearCacheAndResetState();
    } else if (event.type === 'blocks-added') {
      this.log.trace(`Received blocks added`);

      // Here we store the hashes of new blocks and update out latest tip if necessary
      for (const block of event.blocks) {
        const h = await block.hash();
        this.blockHashes.set(block.number, h.toString());
      }
      const latest = this.l2Tips!.latest.number;
      if (event.blocks.length > 0) {
        const lastBlock = event.blocks[event.blocks.length - 1];
        if (lastBlock.number > latest) {
          this.l2Tips!.latest.hash = this.blockHashes.get(lastBlock.number);
          this.l2Tips!.latest.number = lastBlock.number;
          this.log.trace(`Received blocks added event up to block ${lastBlock.number}`);
        }
      }
    } else if (event.type === 'chain-proven') {
      this.log.trace(`Received chain proven event for block ${event.blockNumber}`);

      // Update our proven tip and clean any historic blocks
      this.l2Tips!.proven.hash = undefined;
      this.l2Tips!.proven.number = event.blockNumber;
      this.clearHistoricBlocks();
    }
    return Promise.resolve();
  }

  getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(this.blockHashes.get(number));
  }
  getL2Tips(): Promise<L2Tips> {
    return Promise.resolve(this.l2Tips!);
  }
}
