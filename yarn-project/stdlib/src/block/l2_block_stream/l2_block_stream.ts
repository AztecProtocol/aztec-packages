import { BlockNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import type { L2Block } from '../l2_block.js';
import {
  type L2BlockId,
  type L2BlockSource,
  type L2TipId,
  type LocalL2Tips,
  makeL2BlockId,
} from '../l2_block_source.js';
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
      /**
       * When true, the block download loop is skipped entirely: `getBlocks` is never called and `blocks-added` is
       * never emitted. Only the tip events (`chain-proposed`/`chain-checkpointed`/`chain-proven`/`chain-finalized`)
       * and `chain-pruned` are emitted, driven by the `getL2Tips` snapshot. For consumers that track tips but never
       * consume block payloads.
       */
      tipsOnly?: boolean;
    } = {},
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
      // The source tips snapshot is the plan for this pass. It is replaced by a fresh read if the walk-back below
      // detects a divergence, so the prune event's clamp tips and the download/reconciliation targets all reflect
      // the chain AFTER the prune rather than the (now stale) pre-prune snapshot.
      let sourceTips = await this.l2BlockSource.getL2Tips();
      const localTips = await this.localData.getL2Tips();
      this.log.trace(`Running L2 block stream`, { sourceTips, localTips });

      if (!this.opts.ignoreCheckpoints && localTips.checkpointed === undefined) {
        throw new Error(
          'Local data provider does not expose a checkpointed tip; checkpoint events require one ' +
            '(set ignoreCheckpoints or provide checkpointed tips).',
        );
      }

      // The pre-pass proposed tip is the baseline for the chain-proposed event: it fires iff the source's proposed
      // tip differs from where the local proposed tip stood before this pass started (downloads, a prune, or a thin
      // movement). Captured here because the local store mutates during the pass.
      const prePassProposed = localTips.proposed;

      // Check if there was a reorg and emit a chain-pruned event if so. Seed the cache with ONLY the proposed tip.
      // The tier tips (checkpointed/proven/finalized) must NOT be seeded: they are all <= proposed, i.e. at heights
      // the walk-back visits, and a snapshot tier entry that went stale (the source reorged between this getL2Tips
      // and the walk) equals the local OLD-fork hash at a reorged height, faking agreement and stopping the walk
      // ABOVE the true divergence — an under-deep prune that no later pass re-detects. The proposed seed's staleness
      // mode is benign: a stale proposed entry can only mask divergence at the tip height for one pass (equivalent to
      // the pass having run a moment earlier). Fresh entries appended after the post-divergence re-read are safe.
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
        // Divergence confirmed. Re-read the source tips so the prune event's clamp payload describes the chain after
        // the prune (p2p feeds event.checkpointed.checkpoint into isEpochPrune, whose contract is "the checkpoint id
        // AFTER the prune"; a stale id there can drive an irreversible mempool wipe). The re-read becomes the pass's
        // source tips for everything that follows: the prune clamp tips, the #13471 prune-target clamp, the download
        // target, and tier reconciliation. We do NOT abort if the re-read's proposed tip moved on — on a busy chain
        // the tip advances every pass and prune emission would otherwise starve.
        sourceTips = await this.l2BlockSource.getL2Tips();
        // Append only the re-read proposed tip: it serves the prune-event hash lookup just below, and unlike the tier
        // tips it is a fresh post-re-read entry, so it cannot poison the (already finished) walk. The walk is over by
        // this point, so caching the other three buys nothing.
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

      // Whether the download plan completed and the tier cursors may advance from this snapshot. In tips-only mode
      // there is no download plan: the snapshot is a single (atomic) getL2Tips read, so it always reconciles.
      let planComplete = true;
      if (!this.opts.tipsOnly) {
        planComplete = await this.downloadBlocks(latestBlockNumber, sourceTips);
      }

      if (!planComplete) {
        // The snapshot promised blocks the source no longer has (or served a fork mid-pass). It is provably stale, so
        // we end the pass WITHOUT advancing any tier cursor and let the next poll re-snapshot. Any blocks-added events
        // already emitted stay emitted (they only populate hash history); the next pass's prune corrects the cursors.
        return;
      }

      // End-of-pass reconciliation. chain-proposed fires first (against the pre-pass baseline), then the tiers from
      // highest to lowest so upper cursors rise before lower ones and the local finalized <= proven <= checkpointed
      // <= proposed invariant holds mid-pass. The checkpoint-bearing tiers compare against a post-prune re-read of the
      // local tips (the initial snapshot is stale once the prune handler clamped them); chain-proposed deliberately
      // uses the pre-pass baseline so it fires on exactly the passes where the tip moved (a post-prune re-read would
      // already equal the source tip and suppress it).
      if (this.blockTipDiffers(prePassProposed, sourceTips.proposed)) {
        await this.emitEvent({ type: 'chain-proposed', block: sourceTips.proposed });
      }

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
   * Downloads every block from the post-prune cursor through the source's proposed tip, emitting `blocks-added`
   * events. Returns whether the download plan completed, gating tier-cursor advancement (pass atomicity): the
   * snapshot's tier tips may only be reconciled when the plan that backs them ran to the proposed tip.
   * @returns `true` if the plan completed (caught up, or delivered through the proposed tip with a matching hash);
   * `false` if the source no longer has a promised block, or served a fork at the proposed height mid-pass.
   */
  private async downloadBlocks(latestBlockNumber: BlockNumber, sourceTips: LocalL2Tips): Promise<boolean> {
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

    // The plan trivially completes when the start already exceeds the proposed tip: caught up, or startingBlock past
    // the tip. There is nothing to hash-check, so the tier cursors may advance (this is the A-1061 case).
    let lastDeliveredBlock: L2Block | undefined;

    // Download every block up to the source's proposed tip, batched by `batchSize`.
    while (nextBlockNumber <= sourceTips.proposed.number) {
      const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.proposed.number - nextBlockNumber + 1);
      this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit}`);
      const blocks = await this.l2BlockSource.getBlocks({ from: BlockNumber(nextBlockNumber), limit });
      if (blocks.length === 0) {
        // The source no longer has a block the snapshot promised: the snapshot is provably stale. Warn (with the
        // requested range) and report the plan as incomplete so the caller skips reconciliation this pass.
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
      // Loop never ran: caught up before the plan started. Trivially complete.
      return true;
    }

    // The loop delivered through the proposed height. The plan is complete iff the delivered block at that height
    // carries the snapshot's proposed hash: a different hash means a same-height fork swap happened mid-pass (getBlocks
    // served new-fork blocks while the tips snapshot references the old fork), so the snapshot is stale.
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
   * Returns whether the source tip differs from the local one and therefore warrants a tier event. Compares block
   * number and, when both hashes are known, block hash. The hash comparison is skipped when the local hash is
   * undefined or missing: world-state legitimately reports `undefined` hashes for tips ahead of its synced range,
   * and comparing against an undefined hash would re-emit the event on every poll.
   */
  private tipDiffers(localBlock: LocalL2BlockId | undefined, sourceTip: L2TipId): boolean {
    return this.blockTipDiffers(localBlock, sourceTip.block);
  }

  /**
   * Block-only variant of {@link tipDiffers} for the proposed tip (an {@link L2BlockId}, with no checkpoint). Compares
   * block number and, when the local hash is known, block hash. The hash comparison is skipped when the local hash is
   * undefined: world-state reports `undefined` for its proposed hash, and a strict comparison would re-emit
   * `chain-proposed` on every poll for it. ({@link L2TipsStoreBase} consumers always carry a hash, so the leniency is
   * inert for them.)
   */
  private blockTipDiffers(localBlock: LocalL2BlockId | undefined, sourceBlock: L2BlockId): boolean {
    if (localBlock === undefined) {
      return true;
    }
    if (sourceBlock.number !== localBlock.number) {
      return true;
    }
    if (localBlock.hash === undefined) {
      return false;
    }
    return sourceBlock.hash !== localBlock.hash;
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
    if (!localBlockHash) {
      // A missing local hash compares UNEQUAL regardless of the source. With sparse history (tips-only mode, or any
      // gap), treating both-undefined as "equal" would stop the walk-back ABOVE the true divergence and the #13471
      // clamp would set an under-deep prune target, leaving old-fork state in place that no later pass re-detects.
      // Continuing the walk past a missing local height makes prunes over-deep-only, which both consumers tolerate
      // (block 0 always resolves via the store's initialBlockHash, so the walk always terminates).
      this.log.trace(`No local block hash for block number ${blockNumber}; treating as unequal`);
      return false;
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
