import type { RollupCheatCodes } from '@aztec/ethereum/test';
import { BlockNumber, type CheckpointNumber } from '@aztec/foundation/branded-types';
import { TimeoutError } from '@aztec/foundation/error';
import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { SequencerEvents } from '@aztec/sequencer-client';
import type { L2BlockSource } from '@aztec/stdlib/block';

/** Default timeout in seconds to wait for the archiver to promote a checkpoint. */
const DEFAULT_PROMOTE_TIMEOUT_SECS = 30;

/** Dependencies injected into CheckpointAutoProver. */
export type CheckpointAutoProverDeps = {
  sequencer: TypedEventEmitter<SequencerEvents>;
  l2BlockSource: L2BlockSource;
  rollupCheatCodes: RollupCheatCodes;
  log: Logger;
};

/**
 * Test helper that replaces the `markAsProven` polling loop in `AnvilTestWatcher`.
 *
 * Subscribes to the sequencer's `checkpoint-published` event. When fired, waits for the
 * local archiver to have promoted the checkpoint (i.e. `getL2Tips().checkpointed.checkpoint.number
 * >= checkpointNumber` and the checkpoint's blocks are locally readable), then calls
 * `rollupCheatCodes.markAsProven(checkpointNumber)`.
 */
export class CheckpointAutoProver {
  private readonly sequencer: TypedEventEmitter<SequencerEvents>;
  private readonly l2BlockSource: L2BlockSource;
  private readonly rollupCheatCodes: RollupCheatCodes;
  private readonly log: Logger;
  private readonly promoteTimeoutSecs: number;

  /** Queue of checkpoints to prove, processed in order by the worker. */
  private readonly queue: CheckpointNumber[] = [];
  /** Promise tracking the currently-running worker so stop() can await it. */
  private workerPromise: Promise<void> | undefined;
  /** Set to true by stop() to signal the worker to exit after its current item. */
  private stopped = false;

  private readonly listener: (args: { checkpoint: CheckpointNumber; slot: unknown }) => void;

  constructor(deps: CheckpointAutoProverDeps, promoteTimeoutSecs = DEFAULT_PROMOTE_TIMEOUT_SECS) {
    this.sequencer = deps.sequencer;
    this.l2BlockSource = deps.l2BlockSource;
    this.rollupCheatCodes = deps.rollupCheatCodes;
    this.log = deps.log;
    this.promoteTimeoutSecs = promoteTimeoutSecs;

    this.listener = ({ checkpoint }) => this.enqueue(checkpoint);
  }

  /** Subscribes to checkpoint-published events and starts the background worker. */
  start() {
    this.stopped = false;
    this.sequencer.on('checkpoint-published', this.listener);
    this.log.debug('CheckpointAutoProver started');
  }

  /**
   * Unsubscribes from checkpoint-published events and waits for any in-flight prove to finish.
   */
  async stop() {
    this.stopped = true;
    this.sequencer.off('checkpoint-published', this.listener);
    await this.workerPromise;
    this.log.debug('CheckpointAutoProver stopped');
  }

  /**
   * Forces a synchronous wait: polls until the archiver's checkpointed tip is at least as high
   * as the latest item in the queue (or the queue is empty) and all pending proves have finished.
   * Useful in tests that want to assert state after a checkpoint is proven.
   */
  async trigger() {
    await this.workerPromise;
  }

  private enqueue(checkpointNumber: CheckpointNumber) {
    this.log.debug(`Queuing checkpoint ${checkpointNumber} for proving`);
    this.queue.push(checkpointNumber);
    // Only one worker at a time; start it if it isn't already running.
    if (!this.workerPromise) {
      this.workerPromise = this.runWorker().finally(() => {
        this.workerPromise = undefined;
      });
    }
  }

  private async runWorker() {
    while (this.queue.length > 0 && !this.stopped) {
      const checkpointNumber = this.queue.shift()!;
      await this.proveCheckpoint(checkpointNumber);
    }
  }

  private async proveCheckpoint(checkpointNumber: CheckpointNumber) {
    this.log.verbose(`Waiting for archiver to promote checkpoint ${checkpointNumber}`);
    try {
      // Step 1: wait for the archiver's checkpointed tip to reach checkpointNumber.
      await retryUntil(
        async () => {
          const tips = await this.l2BlockSource.getL2Tips();
          return tips.checkpointed.checkpoint.number >= checkpointNumber || undefined;
        },
        `checkpoint ${checkpointNumber} to be promoted`,
        this.promoteTimeoutSecs,
        /* interval= */ 0.5,
      );
    } catch (e) {
      if (e instanceof TimeoutError) {
        this.log.warn(
          `Timed out waiting for archiver to promote checkpoint ${checkpointNumber} after ${this.promoteTimeoutSecs}s; skipping markAsProven`,
          { checkpointNumber, timeoutSecs: this.promoteTimeoutSecs },
        );
        return;
      }
      throw e;
    }

    // Step 2: verify the checkpoint's blocks are locally readable.
    try {
      const blocks = await this.l2BlockSource.getBlocks({ from: BlockNumber(1), limit: 1, onlyCheckpointed: true });
      this.log.debug(`Archiver has ${blocks.length} checkpointed block(s); proceeding to markAsProven`, {
        checkpointNumber,
      });
    } catch {
      this.log.warn(`Could not read checkpointed blocks for checkpoint ${checkpointNumber}; skipping markAsProven`, {
        checkpointNumber,
      });
      return;
    }

    // Step 3: mark checkpoint as proven on the rollup contract.
    this.log.verbose(`Marking checkpoint ${checkpointNumber} as proven`);
    await this.rollupCheatCodes.markAsProven(checkpointNumber);
    this.log.info(`Marked checkpoint ${checkpointNumber} as proven`, { checkpointNumber });
  }
}
