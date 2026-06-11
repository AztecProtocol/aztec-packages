import { BlockNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type L2BlockId, type L2BlockSource, type L2TipId, makeL2BlockId } from '../l2_block_source.js';
import type {
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  LocalL2BlockId,
} from './interfaces.js';

/** Subset of the block source the stream depends on. Checkpoint payloads are no longer fetched here. */
type L2BlockStreamSource = Pick<L2BlockSource, 'getBlocks' | 'getBlockData' | 'getL2Tips'>;

/** Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver or a node. */
export class L2BlockStream {
  private readonly runningPromise: RunningPromise;
  private isSyncing = false;
  private hasStarted = false;

  constructor(
    private l2BlockSource: L2BlockStreamSource,
    private localData: L2BlockStreamLocalDataProvider,
    private handler: L2BlockStreamEventHandler,
    private readonly log = createLogger('types:block_stream'),
    private opts: {
      pollIntervalMS?: number;
      batchSize?: number;
      startingBlock?: number;
      /** Instead of downloading all blocks, only fetch the smallest subset that results in reliable reorg detection. */
      skipFinalized?: boolean;
      /** When true, checkpoint events will not be emitted. Blocks are still fetched but only blocks-added events are emitted. */
      ignoreCheckpoints?: boolean;
    } = {},
  ) {
    // Note that RunningPromise is in stopped state by default. This promise won't run until someone invokes `start`,
    // which makes it run periodically, or `sync`, which triggers it once.
    // Users of L2BlockStream decide what mode to run it in (_periodically_ vs _manually triggered_).
    // The default is _manually triggered_.
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

  /**
   * Runs the synchronization process once.
   *
   * If you want to run this process continuously use `start` and `stop` instead.
   */
  public async sync() {
    this.isSyncing = true;
    await this.runningPromise.trigger();
    this.isSyncing = false;
  }

  protected async work() {
    try {
      const sourceTips = await this.l2BlockSource.getL2Tips();
      const localTips = await this.localData.getL2Tips();
      this.log.trace(`Running L2 block stream`, { sourceTips, localTips });

      if (!this.opts.ignoreCheckpoints && localTips.checkpointed === undefined) {
        throw new Error(
          'Local data provider does not expose a checkpointed tip; checkpoint events require one ' +
            '(set ignoreCheckpoints or provide checkpointed tips).',
        );
      }

      // Check if there was a reorg and emit a chain-pruned event if so.
      let latestBlockNumber = localTips.proposed.number;
      const sourceCache = new BlockHashCache([sourceTips.proposed]);
      while (!(await this.areBlockHashesEqualAt(latestBlockNumber, { sourceCache }))) {
        if (latestBlockNumber === 0) {
          // We walked all the way back to genesis and the hashes still differ. This means the
          // local store and the source disagree on the genesis block itself — typically because
          // they were configured with different `genesisTimestamp`/prefilled state. Continuing
          // would underflow into negative block numbers and surface as "block hash not found
          // for -1" further down. Fail loudly with a meaningful error instead.
          this.log.error(`Genesis block hash mismatch between local store and source`, {
            localBlockHash: await this.localData.getL2BlockHash(BlockNumber.ZERO),
            sourceBlockHash: sourceCache.get(0) ?? (await this.getBlockHashFromSource(BlockNumber.ZERO)),
          });
          throw new Error(
            'Genesis block hash mismatch between local store and source: refusing to walk past block 0. ' +
              'This usually indicates the two sides were configured with different genesis values ' +
              '(e.g. genesisTimestamp or prefilled public data).',
          );
        }
        latestBlockNumber--;
      }

      let pruned = false;
      if (latestBlockNumber < localTips.proposed.number) {
        latestBlockNumber = BlockNumber(Math.min(latestBlockNumber, sourceTips.proposed.number)); // see #13471
        const hash = sourceCache.get(latestBlockNumber) ?? (await this.getBlockHashFromSource(latestBlockNumber));
        if (latestBlockNumber !== 0 && !hash) {
          throw new Error(`Block hash not found in block source for block number ${latestBlockNumber}`);
        }
        this.log.verbose(
          `Reorg detected. Pruning blocks from ${latestBlockNumber + 1} to ${localTips.proposed.number}.`,
        );
        await this.emitEvent({
          type: 'chain-pruned',
          block: makeL2BlockId(latestBlockNumber, hash),
          checkpointed: sourceTips.checkpointed,
          proven: sourceTips.proven,
        });
        pruned = true;
      }

      // The post-prune cursor: the highest block number both sides agree on. Block downloads resume from here.
      let nextBlockNumber = latestBlockNumber + 1;

      // If we are just starting from a fresh local store, fast-forward the download cursor to the configured
      // starting block so we skip the history the consumer doesn't care about.
      const startingBlock = this.opts.startingBlock !== undefined ? BlockNumber(this.opts.startingBlock) : undefined;
      if (latestBlockNumber === 0 && startingBlock !== undefined) {
        nextBlockNumber = Math.max(startingBlock, 1);
      }

      if (this.opts.skipFinalized) {
        // When skipping finalized blocks we need to provide reliable reorg detection while fetching as few blocks as
        // possible. Finalized blocks cannot be reorged by definition, so we can skip most of them. We do need the very
        // last finalized block however in order to guarantee that we will eventually find a block in which our local
        // store matches the source. If the last finalized block is behind our local tip, there is nothing to skip.
        nextBlockNumber = Math.max(sourceTips.finalized.block.number, nextBlockNumber);
      }

      // Only log this entry once (for sanity)
      if (!this.hasStarted) {
        this.log.verbose(`Starting sync from block number ${nextBlockNumber - 1}`);
        this.hasStarted = true;
      }

      // Download every block up to the source's proposed tip, batched by `batchSize`.
      while (nextBlockNumber <= sourceTips.proposed.number) {
        const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.proposed.number - nextBlockNumber + 1);
        this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit}`);
        const blocks = await this.l2BlockSource.getBlocks({ from: BlockNumber(nextBlockNumber), limit });
        if (blocks.length === 0) {
          break;
        }
        await this.emitEvent({ type: 'blocks-added', blocks });
        nextBlockNumber = blocks.at(-1)!.number + 1;
      }

      // End-of-pass tier reconciliation. For each tier, emit a single event iff the source tip differs from the
      // local one. All three source tips come from the SAME `sourceTips` snapshot, so no extra source fetches are
      // needed. We re-read the local tips after a prune because the prune handler has already clamped the local
      // cursors back; the `localTips` snapshot taken before the prune would be stale and would mis-drive the tier
      // comparison (emitting events relative to cursors that no longer exist).
      const reconcileTips = pruned ? await this.localData.getL2Tips() : localTips;
      if (!this.opts.ignoreCheckpoints && this.tipDiffers(reconcileTips.checkpointed?.block, sourceTips.checkpointed)) {
        await this.emitEvent({
          type: 'chain-checkpointed',
          block: sourceTips.checkpointed.block,
          checkpoint: sourceTips.checkpointed.checkpoint,
        });
      }
      if (reconcileTips.proven !== undefined && this.tipDiffers(reconcileTips.proven.block, sourceTips.proven)) {
        await this.emitEvent({
          type: 'chain-proven',
          block: sourceTips.proven.block,
          checkpoint: sourceTips.proven.checkpoint,
        });
      }
      if (
        reconcileTips.finalized !== undefined &&
        this.tipDiffers(reconcileTips.finalized.block, sourceTips.finalized)
      ) {
        await this.emitEvent({
          type: 'chain-finalized',
          block: sourceTips.finalized.block,
          checkpoint: sourceTips.finalized.checkpoint,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      this.log.error(`Error processing block stream`, err);
    }
  }

  /**
   * Returns whether the source tip differs from the local one and therefore warrants a tier event. Compares block
   * number and, when both hashes are known, block hash. The hash comparison is skipped when the local hash is
   * undefined or missing: world-state legitimately reports `undefined` hashes for tips ahead of its synced range,
   * and comparing against an undefined hash would re-emit the event on every poll.
   */
  private tipDiffers(localBlock: LocalL2BlockId | undefined, sourceTip: L2TipId): boolean {
    if (localBlock === undefined) {
      return true;
    }
    if (sourceTip.block.number !== localBlock.number) {
      return true;
    }
    if (localBlock.hash === undefined) {
      return false;
    }
    return sourceTip.block.hash !== localBlock.hash;
  }

  /**
   * Returns whether the source and local agree on the block hash at a given height.
   * @param blockNumber - The block number to test.
   * @param args - A cache of data already requested from source, to avoid re-requesting it.
   */
  private async areBlockHashesEqualAt(blockNumber: BlockNumber, args: { sourceCache: BlockHashCache }) {
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

  private getBlockHashFromSource(blockNumber: BlockNumber) {
    return this.l2BlockSource
      .getBlockData({ number: blockNumber })
      .then(d => d?.header.hash())
      .then(hash => hash?.toString());
  }

  private async emitEvent(event: L2BlockStreamEvent) {
    this.log.debug(
      `Emitting ${event.type} (${
        event.type === 'blocks-added'
          ? event.blocks.length
          : event.type === 'chain-checkpointed'
            ? event.checkpoint.number
            : event.block.number
      })`,
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
