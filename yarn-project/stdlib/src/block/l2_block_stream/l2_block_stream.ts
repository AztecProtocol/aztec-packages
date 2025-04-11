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

      // Request new blocks from the source.
      while (latestBlockNumber < sourceTips.latest.number) {
        const from = latestBlockNumber + 1;
        const limit = Math.min(this.opts.batchSize ?? 20, sourceTips.latest.number - from + 1);
        this.log.trace(`Requesting blocks from ${from} limit ${limit} proven=${this.opts.proven}`);
        const blocks = await this.l2BlockSource.getPublishedBlocks(from, limit, this.opts.proven);
        if (blocks.length === 0) {
          break;
        }
        await this.emitEvent({ type: 'blocks-added', blocks });
        latestBlockNumber = blocks.at(-1)!.block.number;
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
