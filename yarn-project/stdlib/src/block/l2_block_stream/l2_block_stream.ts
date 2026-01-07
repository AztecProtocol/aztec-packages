import { INITIAL_CHECKPOINT_NUMBER } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type L2BlockId, type L2BlockPruneReason, type L2BlockSource, makeL2BlockId } from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';

/** Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver or a node. */
export class L2BlockStream {
  private readonly runningPromise: RunningPromise;
  private isSyncing = false;
  private hasStarted = false;

  constructor(
    private l2BlockSource: Pick<
      L2BlockSource,
      'getL2BlocksNew' | 'getBlockHeader' | 'getL2Tips' | 'getPublishedCheckpoints' | 'getCheckpointedBlocks'
    >,
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
      this.log.trace(`Running L2 block stream`, {
        sourceLatest: sourceTips.proposed.number,
        localLatest: localTips.proposed.number,
        sourceFinalized: sourceTips.finalized.block.number,
        localFinalized: localTips.finalized.block.number,
        sourceProven: sourceTips.proven.block.number,
        localProven: localTips.proven.block.number,
        sourceLatestHash: sourceTips.proposed.hash,
        localLatestHash: localTips.proposed.hash,
        sourceProvenHash: sourceTips.proven.block.hash,
        localProvenHash: localTips.proven.block.hash,
        sourceFinalizedHash: sourceTips.finalized.block.hash,
        localFinalizedHash: localTips.finalized.block.hash,
      });

      // Check if there was a reorg and emit a chain-pruned event if so.
      let latestBlockNumber = localTips.proposed.number;
      const sourceCache = new BlockHashCache([sourceTips.proposed]);
      while (!(await this.areBlockHashesEqualAt(latestBlockNumber, { sourceCache }))) {
        latestBlockNumber--;
      }

      if (latestBlockNumber < localTips.proposed.number) {
        latestBlockNumber = BlockNumber(Math.min(latestBlockNumber, sourceTips.proposed.number)); // see #13471
        const hash = sourceCache.get(latestBlockNumber) ?? (await this.getBlockHashFromSource(latestBlockNumber));
        if (latestBlockNumber !== 0 && !hash) {
          throw new Error(`Block hash not found in block source for block number ${latestBlockNumber}`);
        }
        this.log.verbose(
          `Reorg detected. Pruning blocks from ${latestBlockNumber + 1} to ${localTips.proposed.number}.`,
        );
        // This check is not 100% accurate
        // If the local tips are sufficiently behind the source tips, such that we are missing at least one checkpoint
        // that has now been re-orged due to a proof failure then this will indicate a failure to checkpoint rather than a failure to prove
        // TODO: (mbps/PhilWindle): Improve re-org detection accuracy when we come to do re-orgs
        let reason: L2BlockPruneReason = 'unproven';
        if (latestBlockNumber === localTips.checkpointed.block.number) {
          reason = 'uncheckpointed';
        }
        await this.emitEvent({
          type: 'chain-pruned',
          block: makeL2BlockId(latestBlockNumber, hash),
          reason,
          checkpoint: sourceTips.checkpointed.checkpoint,
        });
      }

      // If we are just starting, use the starting block number from the options.
      if (latestBlockNumber === 0 && this.opts.startingBlock !== undefined) {
        latestBlockNumber = BlockNumber(Math.max(this.opts.startingBlock - 1, 0));
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
        nextBlockNumber = Math.max(sourceTips.finalized.block.number, nextBlockNumber);
      }

      // First, emit checkpoint events for checkpoints whose blocks are already in local storage.
      // As we should only ever have a single checkpoint's worth of uncheckpointed blocks locally, this
      // should only iterate once
      let nextCheckpointToEmit = CheckpointNumber(localTips.checkpointed.checkpoint.number + 1);
      let iterations = 0;
      while (nextCheckpointToEmit <= sourceTips.checkpointed.checkpoint.number) {
        const checkpoints = await this.l2BlockSource.getPublishedCheckpoints(nextCheckpointToEmit, 1);
        if (checkpoints.length === 0) {
          break;
        }
        // Check if all blocks in this checkpoint are already in local storage
        const lastBlockInCheckpoint = checkpoints[0].checkpoint.blocks.at(-1)!.number;
        if (lastBlockInCheckpoint > localTips.proposed.number) {
          // This checkpoint has blocks we haven't seen yet, stop here
          break;
        }
        iterations++;
        if (iterations > 1) {
          this.log.warn(`Emitting multiple checkpoints (${iterations}) without new blocks being added.`);
        }
        await this.emitEvent({
          type: 'chain-checkpointed',
          checkpoint: checkpoints[0],
        });
        nextCheckpointToEmit = CheckpointNumber(nextCheckpointToEmit + 1);
      }

      // We have now effectively checkpointed our view of the chain. As in there should be no checkpointed blocks
      // that we have seen locally and not emitted checkpoints for.

      // Now fetch any new checkpointed blocks. If nextBlockNumber is below the source's checkpointed block number
      // then we will retrieve it as a checkpointed block, retrieve the checkpoint and emit all blocks from that point forward
      // that are part of the checkpoint, before emitting the checkpoint itself.
      // We do this until all checkpointed blocks and checkpoints are emitted.
      // This takes our local chain up to date with the source's checkpointed blocks.
      let checkpointNumber = CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1);
      while (nextBlockNumber <= sourceTips.checkpointed.block.number) {
        const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.checkpointed.block.number - nextBlockNumber + 1);
        this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit} proven=${this.opts.proven}`);
        // Get this block as a checkpointed block
        const blocks = await this.l2BlockSource.getCheckpointedBlocks(
          BlockNumber(nextBlockNumber),
          1,
          this.opts.proven,
        );
        if (blocks.length === 0) {
          break;
        }
        checkpointNumber = CheckpointNumber(blocks[0].checkpointNumber);
        const checkpoints = await this.l2BlockSource.getPublishedCheckpoints(checkpointNumber, 1);
        if (checkpoints.length === 0) {
          break;
        }
        // we have the checkpoint for the next block number, get the remaining blocks in this checkpoint
        const blocksforCheckpoint = checkpoints[0].checkpoint.blocks
          .filter(b => b.number >= nextBlockNumber)
          .slice(0, limit);
        await this.emitEvent({ type: 'blocks-added', blocks: blocksforCheckpoint });
        nextBlockNumber = blocksforCheckpoint.at(-1)!.number + 1;

        // If we have reached the end of the checkpoint, signal as such
        const lastBlockInCheckpoint = checkpoints[0].checkpoint.blocks.at(-1)!;
        if (nextBlockNumber > lastBlockInCheckpoint.number) {
          await this.emitEvent({
            type: 'chain-checkpointed',
            checkpoint: checkpoints[0],
          });
        }
      }

      // Now we pull any remaining, uncheckpointed block and emit them.
      while (nextBlockNumber <= sourceTips.proposed.number) {
        const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.proposed.number - nextBlockNumber + 1);
        this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit} proven=${this.opts.proven}`);
        const blocks = await this.l2BlockSource.getL2BlocksNew(BlockNumber(nextBlockNumber), limit, this.opts.proven);
        if (blocks.length === 0) {
          break;
        }
        await this.emitEvent({ type: 'blocks-added', blocks });
        nextBlockNumber = blocks.at(-1)!.number + 1;
      }

      // Update the proven and finalized tips.
      if (localTips.proven !== undefined && sourceTips.proven.block.number !== localTips.proven.block.number) {
        await this.emitEvent({
          type: 'chain-proven',
          block: sourceTips.proven.block,
        });
      }
      if (localTips.finalized !== undefined && sourceTips.finalized.block.number !== localTips.finalized.block.number) {
        await this.emitEvent({ type: 'chain-finalized', block: sourceTips.finalized.block });
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
  private async areBlockHashesEqualAt(blockNumber: BlockNumber, args: { sourceCache: BlockHashCache }) {
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

  private getBlockHashFromSource(blockNumber: BlockNumber) {
    return this.l2BlockSource
      .getBlockHeader(blockNumber)
      .then(h => h?.hash())
      .then(hash => hash?.toString());
  }

  private async emitEvent(event: L2BlockStreamEvent) {
    this.log.debug(
      `Emitting ${event.type} (${event.type === 'blocks-added' ? event.blocks.length : event.type === 'chain-checkpointed' ? event.checkpoint.checkpoint.number : event.block.number})`,
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
