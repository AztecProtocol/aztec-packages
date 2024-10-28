import { AbortError } from '@aztec/foundation/error';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type L2Block } from '../l2_block.js';
import { type L2BlockId, type L2BlockSource, type L2Tips } from '../l2_block_source.js';

/** Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver. */
export class L2BlockStream {
  private readonly runningPromise: RunningPromise;

  private readonly log = createDebugLogger('aztec:l2_block_stream');

  constructor(
    private l2BlockSource: L2BlockSource,
    private localData: L2BlockStreamLocalDataProvider,
    private handler: L2BlockStreamEventHandler,
    private opts: {
      proven?: boolean;
      pollIntervalMS?: number;
      batchSize?: number;
    },
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
      this.log.debug(`Running L2 block stream`, {
        sourceLatest: sourceTips.latest.number,
        localLatest: localTips.latest,
        sourceFinalized: sourceTips.finalized.number,
        localFinalized: localTips.finalized,
        sourceProven: sourceTips.proven.number,
        localProven: localTips.proven,
        sourceLatestHash: sourceTips.latest.hash,
        sourceProvenHash: sourceTips.proven.hash,
        sourceFinalizedHash: sourceTips.finalized.hash,
      });

      // Check if there was a reorg and emit a chain-pruned event if so.
      let latestBlockNumber = localTips.latest.number;
      while (!(await this.areBlockHashesEqual(latestBlockNumber, sourceTips.latest))) {
        latestBlockNumber--;
      }
      if (latestBlockNumber < localTips.latest.number) {
        this.log.verbose(`Reorg detected. Pruning blocks from ${latestBlockNumber + 1} to ${localTips.latest.number}.`);
        await this.emitEvent({ type: 'chain-pruned', blockNumber: latestBlockNumber });
      }

      // Request new blocks from the source.
      while (latestBlockNumber < sourceTips.latest.number) {
        const from = latestBlockNumber + 1;
        const limit = Math.min(this.opts.batchSize ?? 20, sourceTips.latest.number - from + 1);
        this.log.debug(`Requesting blocks from ${from} limit ${limit}`);
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

  private async areBlockHashesEqual(blockNumber: number, sourceLatest: L2BlockId) {
    if (blockNumber === 0) {
      return true;
    }
    const localBlockHash = await this.localData.getL2BlockHash(blockNumber);
    const sourceBlockHash =
      sourceLatest.number === blockNumber && sourceLatest.hash
        ? sourceLatest.hash
        : await this.l2BlockSource.getBlockHeader(blockNumber).then(h => h?.hash().toString());
    this.log.debug(`Comparing block hashes for block ${blockNumber}`, { localBlockHash, sourceBlockHash });
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
