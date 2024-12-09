import { AbortError } from '@aztec/foundation/error';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type L2Block } from '../l2_block.js';
import { type L2BlockId, type L2BlockSource, type L2Tips } from '../l2_block_source.js';

/** Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver or a node. */
export class L2BlockStream {
  private readonly runningPromise: RunningPromise;

  private readonly log = createDebugLogger('aztec:l2_block_stream');

  constructor(
    private l2BlockSource: Pick<L2BlockSource, 'getBlocks' | 'getBlockHeader' | 'getL2Tips'>,
    private localData: L2BlockStreamLocalDataProvider,
    private handler: L2BlockStreamEventHandler,
    private opts: {
      proven?: boolean;
      pollIntervalMS?: number;
      batchSize?: number;
      startingBlock?: number;
    } = {},
  ) {
    this.runningPromise = new RunningPromise(() => this.work(), this.opts.pollIntervalMS ?? 1000);
  }

  public start() {
    this.log.verbose(`Starting L2 block stream`, this.opts);
    this.runningPromise.start();
  }

  public async stop() {
    await this.runningPromise.stop();
  }

  public isRunning() {
    return this.runningPromise.isRunning();
  }

  public sync() {
    return this.runningPromise.trigger();
  }

  protected async work() {
    try {
      const sourceTips = await this.l2BlockSource.getL2Tips();
      const localTips = await this.localData.getL2Tips();
      this.log.trace(`Running L2 block stream`, {
        sourceLatest: sourceTips.latest.number,
        localLatest: localTips.latest.number,
        sourceFinalized: sourceTips.finalized.number,
        localFinalized: localTips.finalized.number,
        sourceProven: sourceTips.proven.number,
        localProven: localTips.proven.number,
        sourceLatestHash: sourceTips.latest.hash,
        localLatestHash: localTips.latest.hash,
        sourceProvenHash: sourceTips.proven.hash,
        localProvenHash: localTips.proven.hash,
        sourceFinalizedHash: sourceTips.finalized.hash,
        localFinalizedHash: localTips.finalized.hash,
      });

      // Check if there was a reorg and emit a chain-pruned event if so.
      let latestBlockNumber = localTips.latest.number;
      while (!(await this.areBlockHashesEqualAt(latestBlockNumber, { sourceCache: [sourceTips.latest] }))) {
        latestBlockNumber--;
      }
      if (latestBlockNumber < localTips.latest.number) {
        this.log.verbose(`Reorg detected. Pruning blocks from ${latestBlockNumber + 1} to ${localTips.latest.number}.`);
        await this.emitEvent({ type: 'chain-pruned', blockNumber: latestBlockNumber });
      }

      // If we are just starting, use the starting block number from the options.
      if (latestBlockNumber === 0 && this.opts.startingBlock !== undefined) {
        latestBlockNumber = Math.max(this.opts.startingBlock - 1, 0);
      }

      // Request new blocks from the source.
      while (latestBlockNumber < sourceTips.latest.number) {
        const from = latestBlockNumber + 1;
        const limit = Math.min(this.opts.batchSize ?? 20, sourceTips.latest.number - from + 1);
        this.log.trace(`Requesting blocks from ${from} limit ${limit} proven=${this.opts.proven}`);
        const blocks = await this.l2BlockSource.getBlocks(from, limit, this.opts.proven);
        if (blocks.length === 0) {
          break;
        }
        await this.emitEvent({ type: 'blocks-added', blocks });
        latestBlockNumber = blocks.at(-1)!.number;
      }

      // Update the proven and finalized tips.
      // TODO(palla/reorg): Should we emit this before passing the new blocks? This would allow world-state to skip
      // building the data structures for the pending chain if it's unneeded.
      if (localTips.proven !== undefined && sourceTips.proven.number !== localTips.proven.number) {
        await this.emitEvent({ type: 'chain-proven', blockNumber: sourceTips.proven.number });
      }
      if (localTips.finalized !== undefined && sourceTips.finalized.number !== localTips.finalized.number) {
        await this.emitEvent({ type: 'chain-finalized', blockNumber: sourceTips.finalized.number });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      this.log.error(`Error processing block stream`, err);
    }
  }

  /**
   * Returns whether the source and local agree on the block hash at a given height.
   * @param blockNumber - The block number to test.
   * @param args - A cache of data already requested from source, to avoid re-requesting it.
   */
  private async areBlockHashesEqualAt(blockNumber: number, args: { sourceCache: L2BlockId[] }) {
    if (blockNumber === 0) {
      return true;
    }
    const localBlockHash = await this.localData.getL2BlockHash(blockNumber);
    const sourceBlockHash =
      args.sourceCache.find(id => id.number === blockNumber && id.hash)?.hash ??
      (await this.l2BlockSource.getBlockHeader(blockNumber).then(h => h?.hash().toString()));
    this.log.trace(`Comparing block hashes for block ${blockNumber}`, {
      localBlockHash,
      sourceBlockHash,
      sourceCacheNumber: args.sourceCache[0]?.number,
      sourceCacheHash: args.sourceCache[0]?.hash,
    });
    return localBlockHash === sourceBlockHash;
  }

  private async emitEvent(event: L2BlockStreamEvent) {
    this.log.debug(
      `Emitting ${event.type} (${event.type === 'blocks-added' ? event.blocks.length : event.blockNumber})`,
    );
    await this.handler.handleBlockStreamEvent(event);
    if (!this.isRunning()) {
      throw new AbortError();
    }
  }
}

/** Interface to the local view of the chain. Implemented by world-state. */
export interface L2BlockStreamLocalDataProvider {
  getL2BlockHash(number: number): Promise<string | undefined>;
  getL2Tips(): Promise<L2Tips>;
}

/** Interface to a handler of events emitted. */
export interface L2BlockStreamEventHandler {
  handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void>;
}

export type L2BlockStreamEvent =
  | {
      type: 'blocks-added';
      /** New blocks added to the chain. */
      blocks: L2Block[];
    }
  | {
      type: 'chain-pruned';
      /** Last correct block number (new tip of the unproven chain). */
      blockNumber: number;
    }
  | {
      type: 'chain-proven';
      /** New proven block number */
      blockNumber: number;
    }
  | {
      type: 'chain-finalized';
      /** New finalized block number */
      blockNumber: number;
    };
