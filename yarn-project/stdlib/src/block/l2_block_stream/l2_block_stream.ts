import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import { type L2BlockId, type L2BlockSource, makeL2BlockId } from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';

/** Maximum number of checkpoints to prefetch at once during sync. Matches MAX_RPC_CHECKPOINTS_LEN. */
export const CHECKPOINT_PREFETCH_LIMIT = 50;

/** Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver or a node. */
export class L2BlockStream {
  private readonly runningPromise: RunningPromise;
  private isSyncing = false;
  private hasStarted = false;

  constructor(
    private l2BlockSource: Pick<
      L2BlockSource,
      'getBlocks' | 'getBlockHeader' | 'getL2Tips' | 'getCheckpoints' | 'getCheckpointedBlocks'
    >,
    private localData: L2BlockStreamLocalDataProvider,
    private handler: L2BlockStreamEventHandler,
    private readonly log = createLogger('types:block_stream'),
    private opts: {
      pollIntervalMS?: number;
      batchSize?: number;
      startingBlock?: number;
      /** Instead of downloading all blocks, only fetch the smallest subset that results in reliable reorg detection. */
      skipFinalized?: boolean;
      /** When true, checkpoint events will not be emitted. Blocks are still fetched via checkpoints but only blocks-added events are emitted. */
      ignoreCheckpoints?: boolean;
      /** Maximum number of checkpoints to prefetch at once during sync. Defaults to CHECKPOINT_PREFETCH_LIMIT (50). */
      checkpointPrefetchLimit?: number;
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
        await this.emitEvent({
          type: 'chain-pruned',
          block: makeL2BlockId(latestBlockNumber, hash),
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
      let nextCheckpointToEmit = CheckpointNumber(localTips.checkpointed.checkpoint.number + 1);
      if (this.opts.skipFinalized) {
        // When skipping finalized blocks we need to provide reliable reorg detection while fetching as few blocks as
        // possible. Finalized blocks cannot be reorged by definition, so we can skip most of them. We do need the very
        // last finalized block however in order to guarantee that we will eventually find a block in which our local
        // store matches the source.
        // If the last finalized block is behind our local tip, there is nothing to skip.
        nextBlockNumber = Math.max(sourceTips.finalized.block.number, nextBlockNumber);
        // If the next checkpoint to emit is behind the finalized tip then skip forward
        nextCheckpointToEmit = CheckpointNumber(Math.max(nextCheckpointToEmit, sourceTips.finalized.checkpoint.number));
      }

      // Loop 1: Emit checkpoint events for checkpoints whose blocks are already in local storage.
      // This handles the case where blocks were synced as uncheckpointed and later became checkpointed.
      // The guard `lastBlockInCheckpoint.number > localTips.proposed.number` ensures we don't emit
      // checkpoints for blocks we don't have (e.g., when startingBlock skips earlier blocks).
      // Since only one checkpoint can ever be uncheckpointed, this loop should iterate at most once.
      if (!this.opts.ignoreCheckpoints) {
        let loop1Iterations = 0;
        while (nextCheckpointToEmit <= sourceTips.checkpointed.checkpoint.number) {
          const checkpoints = await this.l2BlockSource.getCheckpoints(nextCheckpointToEmit, 1);
          if (checkpoints.length === 0) {
            break;
          }
          const lastBlockInCheckpoint = checkpoints[0].checkpoint.blocks.at(-1)!;
          // If this checkpoint has blocks we haven't seen yet, stop - they need to be fetched first
          if (lastBlockInCheckpoint.number > localTips.proposed.number) {
            break;
          }
          loop1Iterations++;
          if (loop1Iterations > 1) {
            this.log.warn(
              `Emitting multiple checkpoints (${loop1Iterations}) for already-local blocks. ` +
                `Next checkpoint: ${nextCheckpointToEmit}, source checkpointed: ${sourceTips.checkpointed.checkpoint.number}`,
            );
          }
          const lastBlockHash = await lastBlockInCheckpoint.hash();
          await this.emitEvent({
            type: 'chain-checkpointed',
            checkpoint: checkpoints[0],
            block: makeL2BlockId(lastBlockInCheckpoint.number, lastBlockHash.toString()),
          });
          nextCheckpointToEmit = CheckpointNumber(nextCheckpointToEmit + 1);
        }
      }

      // Loop 2: Fetch new checkpointed blocks. For each checkpoint, emit all blocks
      // from that checkpoint that we need, then emit the checkpoint event.
      // We prefetch multiple checkpoints, then process them one by one.
      let prefetchedCheckpoints: PublishedCheckpoint[] = [];
      let prefetchIdx = 0;
      let nextCheckpointNumber: CheckpointNumber | undefined;

      // Find the starting checkpoint number
      if (nextBlockNumber <= sourceTips.checkpointed.block.number) {
        const blocks = await this.l2BlockSource.getCheckpointedBlocks(BlockNumber(nextBlockNumber), 1);
        if (blocks.length > 0) {
          nextCheckpointNumber = blocks[0].checkpointNumber;
        }
      }

      while (nextBlockNumber <= sourceTips.checkpointed.block.number && nextCheckpointNumber !== undefined) {
        // Refill the prefetch buffer when exhausted
        if (prefetchIdx >= prefetchedCheckpoints.length) {
          const prefetchLimit = this.opts.checkpointPrefetchLimit ?? CHECKPOINT_PREFETCH_LIMIT;
          prefetchedCheckpoints = await this.l2BlockSource.getCheckpoints(nextCheckpointNumber, prefetchLimit);
          prefetchIdx = 0;
          if (prefetchedCheckpoints.length === 0) {
            break;
          }
        }

        const checkpoint = prefetchedCheckpoints[prefetchIdx]!;

        // Get all blocks from this checkpoint that we need, respecting batchSize
        const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.checkpointed.block.number - nextBlockNumber + 1);
        const blocksForCheckpoint = checkpoint.checkpoint.blocks
          .filter(b => b.number >= nextBlockNumber)
          .slice(0, limit);
        if (blocksForCheckpoint.length === 0) {
          break;
        }
        await this.emitEvent({ type: 'blocks-added', blocks: blocksForCheckpoint });
        nextBlockNumber = blocksForCheckpoint.at(-1)!.number + 1;

        // If we've reached the end of this checkpoint, emit the checkpoint event and move to next
        const lastBlockInCheckpoint = checkpoint.checkpoint.blocks.at(-1)!;
        if (nextBlockNumber > lastBlockInCheckpoint.number) {
          if (!this.opts.ignoreCheckpoints) {
            const lastBlockHash = await lastBlockInCheckpoint.hash();
            await this.emitEvent({
              type: 'chain-checkpointed',
              checkpoint,
              block: makeL2BlockId(lastBlockInCheckpoint.number, lastBlockHash.toString()),
            });
          }
          prefetchIdx++;
          nextCheckpointNumber = CheckpointNumber(nextCheckpointNumber + 1);
        }
      }

      // Loop 3: Fetch any remaining uncheckpointed (proposed) blocks.
      while (nextBlockNumber <= sourceTips.proposed.number) {
        const limit = Math.min(this.opts.batchSize ?? 50, sourceTips.proposed.number - nextBlockNumber + 1);
        this.log.trace(`Requesting blocks from ${nextBlockNumber} limit ${limit}`);
        const blocks = await this.l2BlockSource.getBlocks(BlockNumber(nextBlockNumber), BlockNumber(limit));
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
