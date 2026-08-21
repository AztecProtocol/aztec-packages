import type { Logger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { SimulationError } from '@aztec/stdlib/errors';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { BlockSynchronizer } from './block_synchronizer/index.js';
import type { Recording } from './node/benchmarked_node.js';
import type { CachingAztecNode } from './node/caching_aztec_node.js';
import { type OperationContributor, runOperation } from './operation_lifecycle.js';
import type { AnchorBlockStore } from './storage/anchor_block_store/anchor_block_store.js';
import type { ChangeSetId, StagedWriteCoordinator } from './storage/staged_write_coordinator.js';

/** What a synced operation receives: its change set id, the anchor its sync established, and its instrumentation. */
export type SyncedOperationContext = {
  /**
   * The change set the operation's writes are staged under. A synced operation runs inside exactly one change set,
   * which is committed if it succeeds and discarded if it fails, so this ID doubles as the operation's identity:
   * bookkeeping that must be kept or thrown away along with the operation is keyed on it, whether or not it lives in
   * a store.
   */
  changeSetId: ChangeSetId;
  /** Duration of the sync, for timing stats. */
  syncTime: number;
  anchorBlockHeader: BlockHeader;
  /** Open recording of the node RPC calls made so far in this operation; `stats()` snapshots them for reporting. */
  recording: Recording;
  /** The operation's duration so far, including the sync. */
  totalMs: () => number;
};

/**
 * Serializes the PXE's operations, since concurrent execution is not supported: operations execute oracles that read
 * and write the PXE stores, and concurrent runs would interfere with one another.
 *
 * Synced operations additionally run after a sync with the node and inside a staged-write session (see
 * {@link StagedWriteCoordinator}): staged writes are committed if the operation succeeds and discarded if it throws.
 */
export class OperationQueue {
  private readonly queue = new SerialQueue();
  private readonly node: CachingAztecNode;
  private readonly synchronizer: BlockSynchronizer;
  private readonly anchorBlockStore: AnchorBlockStore;
  private readonly stagedWriteCoordinator: StagedWriteCoordinator;
  private readonly contributors: OperationContributor[];
  private readonly autoSync: boolean;
  private readonly log: Logger;

  constructor(args: OperationQueueArgs) {
    this.node = args.node;
    this.synchronizer = args.synchronizer;
    this.anchorBlockStore = args.anchorBlockStore;
    this.stagedWriteCoordinator = args.stagedWriteCoordinator;
    this.contributors = args.contributors;
    this.autoSync = args.autoSync;
    this.log = args.log;
  }

  public start(): void {
    this.queue.start();
  }

  public async stop(): Promise<void> {
    await this.queue.end();
  }

  /**
   * Runs an operation once no other operations are running. Returns a promise that will resolve once the operation
   * is complete.
   *
   * Useful for tasks that cannot run concurrently, such as contract function simulation.
   */
  public run<T>(fn: () => Promise<T>): Promise<T> {
    // TODO(#12636): relax the conditions under which we forbid concurrency.
    if (this.queue.length() != 0) {
      this.log.warn(
        `PXE is already processing ${this.queue.length()} operations, concurrent execution is not supported. Will run once those are complete.`,
      );
    }

    return this.queue.put(fn);
  }

  /**
   * Runs an operation (`fn`) after a sync with the node (skipped when the `autoSync` config flag is disabled, unless
   * `forceSync` is set). If the operation succeeds, then all staged writes are committed. If it rejects, then all
   * staged writes are discarded.
   */
  public runSynced<T>(
    fn: (ctx: SyncedOperationContext) => Promise<T>,
    { errorContext, forceSync = false }: { errorContext?: () => string[]; forceSync?: boolean } = {},
  ): Promise<T> {
    return this.run(async () => {
      const totalTimer = new Timer();
      const recording = this.node.startRecording();
      try {
        const syncTimer = new Timer();
        if (forceSync || this.autoSync) {
          await this.synchronizer.sync();
        }
        const syncTime = syncTimer.ms();
        const anchorBlockHeader = await this.anchorBlockStore.getBlockHeader();

        const changeSetId = this.stagedWriteCoordinator.begin();
        this.log.verbose(`Beginning operation ${changeSetId}`, { changeSetId, syncMs: syncTime });

        const operationArgs = {
          stagedWriteCoordinator: this.stagedWriteCoordinator,
          contributors: this.contributors,
          changeSetId,
          log: this.log,
        };
        return await runOperation(operationArgs, () =>
          fn({ changeSetId, syncTime, anchorBlockHeader, recording, totalMs: () => totalTimer.ms() }),
        );
      } catch (err: any) {
        throw errorContext ? this.#contextualizeError(err, ...errorContext()) : err;
      } finally {
        recording.stop();
      }
    });
  }

  #contextualizeError(err: Error, ...context: string[]): Error {
    let contextStr = '';
    if (context.length > 0) {
      contextStr = `\nContext:\n${context.join('\n')}`;
    }
    if (err instanceof SimulationError) {
      err.setAztecContext(contextStr);
    } else {
      this.log.error(err.name, err);
      this.log.debug(contextStr);
    }
    return err;
  }
}

/** Dependencies of the {@link OperationQueue}. */
type OperationQueueArgs = {
  node: CachingAztecNode;
  synchronizer: BlockSynchronizer;
  anchorBlockStore: AnchorBlockStore;
  stagedWriteCoordinator: StagedWriteCoordinator;
  contributors: OperationContributor[];
  /** Whether synced operations sync with the node before running (see {@link OperationQueue.runSynced}). */
  autoSync: boolean;
  log: Logger;
};
