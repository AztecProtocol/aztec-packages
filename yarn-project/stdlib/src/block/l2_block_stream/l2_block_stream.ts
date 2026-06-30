import { BlockNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import type { L2Block } from '../l2_block.js';
import { type L2BlockId, type L2BlockSource, type LocalL2Tips, makeL2BlockId } from '../l2_block_source.js';
import {
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  localBlockIdDiffers,
} from './interfaces.js';

/** Subset of the block source the stream depends on. Checkpoint payloads are no longer fetched here. */
export type L2BlockStreamSource = Pick<L2BlockSource, 'getBlocks' | 'getBlockData' | 'getL2Tips'>;

/** Options accepted by {@link L2BlockStream} and {@link EventDrivenL2BlockStream}. */
export type L2BlockStreamOptions = {
  pollIntervalMS?: number;
  batchSize?: number;
  startingBlock?: number;
  /** Instead of downloading all blocks, only fetch the smallest subset that results in reliable reorg detection. */
  skipFinalized?: boolean;
  /** When true, checkpoint events will not be emitted. Blocks are still fetched but only blocks-added events are emitted. */
  ignoreCheckpoints?: boolean;
  /**
   * When true, the block download loop is skipped entirely: `getBlocks` is never called and `blocks-added` is
   * never emitted. Only the tip events (`chain-proposed`/`chain-checkpointed`/`chain-proven`/`chain-finalized`)
   * and `chain-pruned` are emitted, driven by the `getL2Tips` snapshot. For consumers that track tips but never
   * consume block payloads.
   */
  tipsOnly?: boolean;
};

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
    private opts: L2BlockStreamOptions = {},
  ) {
    if (opts.tipsOnly && (opts.startingBlock !== undefined || opts.batchSize !== undefined || opts.skipFinalized)) {
      throw new Error(
        'tipsOnly is incompatible with startingBlock, batchSize, and skipFinalized: all three are ' +
          'block-download options and there is no download loop in tips-only mode.',
      );
    }
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
      // The source tips snapshot is the plan for this pass; it is re-read after the walk-back if a divergence is found.
      let sourceTips = await this.l2BlockSource.getL2Tips();
      const localTips = await this.localData.getL2Tips();
      this.log.trace(`Running L2 block stream`, { sourceTips, localTips });

      if (!this.opts.ignoreCheckpoints && localTips.checkpointed === undefined) {
        throw new Error(
          'Local data provider does not expose a checkpointed tip; checkpoint events require one ' +
            '(set ignoreCheckpoints or provide checkpointed tips).',
        );
      }

      // Baseline for the chain-proposed event; captured before the local store mutates during the pass.
      const prePassProposed = localTips.proposed;

      // Walk back to find a reorg, floored at the local finalized tip (a legitimate reorg can never reach it, since
      // finalized means the proving tx is itself L1-finalized). Seed the cache with ONLY the proposed tip: a stale
      // tier seed at a reorged height equals the local old-fork hash, faking agreement and stopping the walk above the
      // true divergence (an under-deep prune no later pass re-detects), whereas a stale proposed seed only masks the
      // tip for one pass.
      let latestBlockNumber = localTips.proposed.number;
      const sourceCache = new BlockHashCache([sourceTips.proposed]);
      const walkFloor = localTips.finalized.block.number;
      while (
        !(await this.areBlockHashesEqualAt(latestBlockNumber, {
          sourceCache,
          sourceProposed: sourceTips.proposed.number,
        }))
      ) {
        if (latestBlockNumber === 0) {
          // Walked back to genesis and the hashes still differ: the two sides disagree on block 0 itself (usually
          // different genesisTimestamp/prefilled state). Fail loudly rather than underflow into negative heights.
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
        if (latestBlockNumber <= walkFloor) {
          // A mismatch at or below the finalized tip cannot be a reorg (it contradicts L1-finalized state), so stop
          // here and prune at most to the finalized tip rather than pruning finalized state on non-reorg evidence.
          this.log.warn(`Block hash mismatch at or below the local finalized tip; stopping the walk-back here`, {
            blockNumber: latestBlockNumber,
            finalizedBlockNumber: walkFloor,
            localBlockHash: await this.localData.getL2BlockHash(latestBlockNumber),
            sourceBlockHash:
              sourceCache.get(latestBlockNumber) ?? (await this.getBlockHashFromSource(latestBlockNumber)),
          });
          break;
        }
        latestBlockNumber--;
      }

      let pruned = false;
      if (latestBlockNumber < localTips.proposed.number) {
        // Re-read the source tips after the (possibly slow) walk-back so the prune event carries fresh checkpointed
        // and proven tips, and the prune-target clamp, download plan, and tier reconciliation track the post-prune
        // source chain. Append only the re-read proposed tip: it is a fresh entry that cannot poison the (already
        // finished) walk and serves the prune-event hash lookup below.
        sourceTips = await this.l2BlockSource.getL2Tips();
        sourceCache.add(sourceTips.proposed);

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

      // Pass atomicity: a prune mid-download leaves the source unable to serve the planned blocks, so the snapshot's
      // tier tips may reference blocks the consumer never saw — skip tier reconciliation in that case. Tips-only mode
      // has no download plan (the snapshot is one atomic getL2Tips read), so it always reconciles.
      if (!this.opts.tipsOnly && !(await this.downloadBlocks(latestBlockNumber, sourceTips))) {
        return;
      }

      // End-of-pass reconciliation: chain-proposed fires against the pre-pass baseline (a post-prune re-read would
      // equal the source tip and suppress it), then the tiers highest-to-lowest so the finalized <= proven <=
      // checkpointed <= proposed invariant holds mid-pass.
      if (localBlockIdDiffers(prePassProposed, sourceTips.proposed)) {
        await this.emitEvent({ type: 'chain-proposed', block: sourceTips.proposed });
      }

      const reconcileTips = pruned ? await this.localData.getL2Tips() : localTips;
      if (
        !this.opts.ignoreCheckpoints &&
        localBlockIdDiffers(reconcileTips.checkpointed?.block, sourceTips.checkpointed.block)
      ) {
        await this.emitEvent({
          type: 'chain-checkpointed',
          block: sourceTips.checkpointed.block,
          checkpoint: sourceTips.checkpointed.checkpoint,
        });
      }
      if (
        reconcileTips.proven !== undefined &&
        localBlockIdDiffers(reconcileTips.proven.block, sourceTips.proven.block)
      ) {
        await this.emitEvent({
          type: 'chain-proven',
          block: sourceTips.proven.block,
          checkpoint: sourceTips.proven.checkpoint,
        });
      }
      if (
        reconcileTips.finalized !== undefined &&
        localBlockIdDiffers(reconcileTips.finalized.block, sourceTips.finalized.block)
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
   * Downloads every block from the post-prune cursor through the source's proposed tip, emitting `blocks-added`
   * events. The return value gates tier-cursor advancement (pass atomicity): tier tips may only be reconciled when
   * the plan that backs them ran to the proposed tip.
   * @returns `true` if the plan completed (caught up, or delivered the proposed tip with a matching hash); `false` if
   * the source no longer has a promised block, or served a fork at the proposed height mid-pass.
   */
  private async downloadBlocks(latestBlockNumber: BlockNumber, sourceTips: LocalL2Tips): Promise<boolean> {
    // The post-prune cursor: the highest block number both sides agree on. Block downloads resume from here.
    let nextBlockNumber = latestBlockNumber + 1;

    // From a fresh local store, fast-forward past history the consumer doesn't care about.
    const startingBlock = this.opts.startingBlock !== undefined ? BlockNumber(this.opts.startingBlock) : undefined;
    if (latestBlockNumber === 0 && startingBlock !== undefined) {
      nextBlockNumber = Math.max(startingBlock, 1);
    }

    if (this.opts.skipFinalized) {
      // Finalized blocks cannot be reorged, so skip them — but keep the last finalized block as the guaranteed point
      // where local and source agree, the floor the walk-back terminates against.
      nextBlockNumber = Math.max(sourceTips.finalized.block.number, nextBlockNumber);
    }

    if (!this.hasStarted) {
      this.log.verbose(`Starting sync from block number ${nextBlockNumber - 1}`);
      this.hasStarted = true;
    }

    let lastDeliveredBlock: L2Block | undefined;

    while (nextBlockNumber <= sourceTips.proposed.number) {
      const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.proposed.number - nextBlockNumber + 1);
      this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit}`);
      const blocks = await this.l2BlockSource.getBlocks({ from: BlockNumber(nextBlockNumber), limit });
      if (blocks.length === 0) {
        // The source no longer has a block the snapshot promised: the snapshot is provably stale, so report the plan
        // incomplete and skip reconciliation this pass.
        this.log.warn(`Block source returned no blocks for a promised range; skipping reconciliation this pass`, {
          from: nextBlockNumber,
          limit,
          sourceProposed: sourceTips.proposed.number,
        });
        return false;
      }
      await this.emitEvent({ type: 'blocks-added', blocks });
      lastDeliveredBlock = blocks.at(-1)!;
      nextBlockNumber = lastDeliveredBlock.number + 1;
    }

    if (lastDeliveredBlock === undefined) {
      // Loop never ran: caught up before the plan started, or startingBlock past the tip (A-1061). Trivially complete.
      return true;
    }

    // Complete iff the block delivered at the proposed height carries the snapshot's proposed hash; a different hash
    // means a same-height fork swap happened mid-pass, so the snapshot is stale.
    const deliveredHash = (await lastDeliveredBlock.hash()).toString();
    if (deliveredHash !== sourceTips.proposed.hash) {
      this.log.warn(`Delivered proposed-block hash differs from snapshot; skipping reconciliation this pass`, {
        blockNumber: lastDeliveredBlock.number,
        deliveredHash,
        snapshotHash: sourceTips.proposed.hash,
      });
      return false;
    }
    return true;
  }

  /**
   * Returns whether the source and local agree on the block hash at a given height.
   * @param blockNumber - The block number to test.
   * @param args - A cache of data already requested from source (to avoid re-requesting it) and the source's
   * advertised proposed tip from the pass snapshot (to detect an incoherent source).
   */
  private async areBlockHashesEqualAt(
    blockNumber: BlockNumber,
    args: { sourceCache: BlockHashCache; sourceProposed: BlockNumber },
  ) {
    const localBlockHash = await this.localData.getL2BlockHash(blockNumber);
    if (!localBlockHash && this.opts.skipFinalized) {
      // Failing to find a block hash when skipping finalized blocks can be highly problematic as we'd potentially need
      // to go all the way back to the genesis block to find a block in which we agree with the source (since we've
      // potentially skipped all history). This means that stores that prune old blocks must be careful to leave no gaps
      // when going back from latest block to the last finalized one.
      this.log.error(`No local block hash for block number ${blockNumber}`);
      throw new AbortError();
    }
    if (!localBlockHash) {
      // A missing local hash compares UNEQUAL: treating both-undefined as equal would stop the walk above the true
      // divergence (an under-deep prune no later pass re-detects). Over-deep is the safe direction, and block 0 always
      // resolves via the store's initialBlockHash so the walk always terminates.
      this.log.trace(`No local block hash for block number ${blockNumber}; treating as unequal`);
      return false;
    }

    const sourceBlockHashFromCache = args.sourceCache.get(blockNumber);
    const sourceBlockHash = args.sourceCache.get(blockNumber) ?? (await this.getBlockHashFromSource(blockNumber));
    if (!sourceBlockHashFromCache && sourceBlockHash) {
      args.sourceCache.add({ number: blockNumber, hash: sourceBlockHash });
    }
    if (!sourceBlockHash && blockNumber !== 0 && blockNumber <= args.sourceProposed) {
      // No source data at or below the source's own proposed tip: the source contradicts itself (mid-reorg unwind or
      // a transient read failure), so skip this pass.
      this.log.warn(`Source has no data for a block at or below its proposed tip; skipping this sync pass`, {
        blockNumber,
        sourceProposed: args.sourceProposed,
      });
      throw new AbortError();
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
