import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type L2BlockId, type L2BlockSource, makeL2BlockId } from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';

/** Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver or a node. */
export class L2BlockStream {
  private readonly runningPromise: RunningPromise;
  private isSyncing = false;
  private hasStarted = false;

  constructor(
    private l2BlockSource: Pick<L2BlockSource, 'getPublishedBlocks' | 'getBlockHeader' | 'getL2Tips'>,
    private localData: L2BlockStreamLocalDataProvider,
    private handler: L2BlockStreamEventHandler,
    private readonly log = createLogger('types:block_stream'),
    private opts: {
      proven?: boolean;
      pollIntervalMS?: number;
      batchSize?: number;
      startingBlock?: number;
      /** Instead of downloading all blocks, only fetch the smallest subset that results in reliable reorg detection. */
      skipFinalized?: boolean;
    } = {},
  ) {
    this.runningPromise = new RunningPromise(() => this.work(), log, this.opts.pollIntervalMS ?? 1000);
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

  public async sync() {
    this.isSyncing = true;
    await this.runningPromise.trigger();
    this.isSyncing = false;
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
      const sourceCache = new BlockHashCache([sourceTips.latest]);
      while (!(await this.areBlockHashesEqualAt(latestBlockNumber, { sourceCache }))) {
        latestBlockNumber--;
      }

      if (latestBlockNumber < localTips.latest.number) {
        latestBlockNumber = Math.min(latestBlockNumber, sourceTips.latest.number); // see #13471
        const hash = sourceCache.get(latestBlockNumber) ?? (await this.getBlockHashFromSource(latestBlockNumber));
        if (latestBlockNumber !== 0 && !hash) {
          throw new Error(`Block hash not found in block source for block number ${latestBlockNumber}`);
        }
        this.log.verbose(`Reorg detected. Pruning blocks from ${latestBlockNumber + 1} to ${localTips.latest.number}.`);
        await this.emitEvent({ type: 'chain-pruned', block: makeL2BlockId(latestBlockNumber, hash) });
      }

      // If we are just starting, use the starting block number from the options.
      if (latestBlockNumber === 0 && this.opts.startingBlock !== undefined) {
        latestBlockNumber = Math.max(this.opts.startingBlock - 1, 0);
      }

      // Only log this entry once (for sanity)
      if (!this.hasStarted) {
        this.log.verbose(`Starting sync from block number ${latestBlockNumber}`);
        this.hasStarted = true;
      }

      let nextBlockNumber = latestBlockNumber + 1;
      if (this.opts.skipFinalized) {
        // When skipping finalized blocks we need to provide reliable reorg detection while fetching as few blocks as
        // possible. Finalized blocks cannot be reorged by definition, so we can skip most of them. We do need the very
        // last finalized block however in order to guarantee that we will eventually find a block in which our local
        // store matches the source.
        // If the last finalized block is behind our local tip, there is nothing to skip.
        nextBlockNumber = Math.max(sourceTips.finalized.number, nextBlockNumber);
      }

      // Request new blocks from the source.
      while (nextBlockNumber <= sourceTips.latest.number) {
        const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.latest.number - nextBlockNumber + 1);
        this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit} proven=${this.opts.proven}`);
        const blocks = await this.l2BlockSource.getPublishedBlocks(nextBlockNumber, limit, this.opts.proven);
        if (blocks.length === 0) {
          break;
        }
        await this.emitEvent({ type: 'blocks-added', blocks });
        nextBlockNumber = blocks.at(-1)!.block.number + 1;
      }

      // Update the proven and finalized tips.
      if (localTips.proven !== undefined && sourceTips.proven.number !== localTips.proven.number) {
        await this.emitEvent({
          type: 'chain-proven',
          block: sourceTips.proven,
        });
      }
      if (localTips.finalized !== undefined && sourceTips.finalized.number !== localTips.finalized.number) {
        await this.emitEvent({ type: 'chain-finalized', block: sourceTips.finalized });
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
  private async areBlockHashesEqualAt(blockNumber: number, args: { sourceCache: BlockHashCache }) {
    if (blockNumber === 0) {
      return true;
    }
    const localBlockHash = await this.localData.getL2BlockHash(blockNumber);
    if (!localBlockHash && this.opts.skipFinalized) {
      // Failing to find a block hash when skipping finalized blocks can be highly problematic as we'd potentially need
      // to go all the way back to the genesis block to find a block in which we agree with the source (since we've
      // potentially skipped all history). This means that stores that prune old blocks must be careful to leave no gaps
      // when going back from latest block to the last finalized one.
      this.log.error(`No local block hash for block number ${blockNumber}`);
      throw new AbortError();
    }

    const sourceBlockHashFromCache = args.sourceCache.get(blockNumber);
    const sourceBlockHash = args.sourceCache.get(blockNumber) ?? (await this.getBlockHashFromSource(blockNumber));
    if (!sourceBlockHashFromCache && sourceBlockHash) {
      args.sourceCache.add({ number: blockNumber, hash: sourceBlockHash });
    }

    this.log.trace(`Comparing block hashes for block ${blockNumber}`, { localBlockHash, sourceBlockHash });
    return localBlockHash === sourceBlockHash;
  }

  private getBlockHashFromSource(blockNumber: number) {
    return this.l2BlockSource
      .getBlockHeader(blockNumber)
      .then(h => h?.hash())
      .then(hash => hash?.toString());
  }

  private async emitEvent(event: L2BlockStreamEvent) {
    this.log.debug(
      `Emitting ${event.type} (${event.type === 'blocks-added' ? event.blocks.length : event.block.number})`,
    );
    await this.handler.handleBlockStreamEvent(event);
    if (!this.isRunning() && !this.isSyncing) {
      throw new AbortError();
    }
  }
}

class BlockHashCache {
  private readonly cache: Map<number, string> = new Map();

  constructor(initial: L2BlockId[] = []) {
    for (const block of initial) {
      this.add(block);
    }
  }

  public add(block: L2BlockId) {
    if (block.hash) {
      this.cache.set(block.number, block.hash);
    }
  }

  public get(blockNumber: number) {
    return this.cache.get(blockNumber);
  }
}
