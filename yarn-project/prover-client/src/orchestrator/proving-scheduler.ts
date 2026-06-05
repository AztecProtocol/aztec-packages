import { AbortError } from '@aztec/foundation/error';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { sleep } from '@aztec/foundation/sleep';

/**
 * Minimal surface a deferred-proving state must expose. Both `EpochProvingState` /
 * `CheckpointProvingState` / `BlockProvingState` (used by `ProvingOrchestrator`) and
 * `TopTreeProvingState` (used by `TopTreeOrchestrator`) satisfy it.
 */
export interface ProvingStateLike {
  /** Returns false once the state has been cancelled or otherwise invalidated. */
  verifyState(): boolean;
  /** Surfaces a proving error to the state's owner. */
  reject(reason: string): void;
}

/**
 * Common scheduling infrastructure shared by every orchestrator that drives broker
 * proving jobs:
 *
 *   - One `SerialQueue` (`deferredJobQueue`) acting as the enqueue-throttle.
 *   - A list of `AbortController`s (`pendingProvingJobs`) so a `cancel()` can abort
 *     in-flight broker jobs when needed.
 *   - A `deferredProving<T>(state, request, callback, isCancelled?)` method that wraps
 *     a broker request in the standard "submit, drop result if state invalidated, push
 *     errors to state.reject" envelope.
 *
 * Subclasses own their own concrete proving state and define `cancelInternal()` for
 * the rest of the cleanup work (closing world-state forks, marking sub-trees
 * cancelled, etc.). `stop()` lives on the base class and follows the standard pattern
 * of grabbing the old queue, calling `cancelInternal()` (which recreates the queue),
 * and awaiting the old queue's drain.
 */
export abstract class ProvingScheduler {
  protected pendingProvingJobs: AbortController[] = [];
  protected logger: Logger;
  private deferredJobQueue: SerialQueue;

  constructor(
    private readonly enqueueConcurrency: number,
    loggerName = 'prover-client:proving-scheduler',
    bindings?: LoggerBindings,
  ) {
    this.logger = createLogger(loggerName, bindings);
    this.deferredJobQueue = new SerialQueue();
    this.deferredJobQueue.start(this.enqueueConcurrency);
  }

  /** Number of broker jobs currently in flight. */
  public getNumPendingProvingJobs(): number {
    return this.pendingProvingJobs.length;
  }

  /**
   * Drains the deferred-job queue, recreates it (so the subclass can be reused), and
   * optionally aborts every in-flight broker job. Aborting is the right choice on
   * reorg-driven cancel (where the in-flight inputs are no longer valid) and the
   * wrong choice on shutdown (where leaving jobs in the broker queue lets a restart
   * pick them up).
   */
  protected resetSchedulerState(abortJobs: boolean): void {
    void this.deferredJobQueue.cancel();
    this.deferredJobQueue = new SerialQueue();
    this.deferredJobQueue.start(this.enqueueConcurrency);
    if (abortJobs) {
      for (const controller of this.pendingProvingJobs) {
        controller.abort();
      }
    }
  }

  /**
   * Subclass-defined cancellation. Implementations call `resetSchedulerState(...)`
   * and then do their own cleanup (close world-state forks, propagate cancel into
   * the proving state, etc.).
   */
  protected abstract cancelInternal(): void;

  /**
   * Standard stop: grab the old queue, cancel (which recreates the queue), then
   * await the old queue's drain so any final job tear-down has unwound before we
   * return.
   */
  public async stop(): Promise<void> {
    const oldQueue = this.deferredJobQueue;
    this.cancelInternal();
    await oldQueue.cancel();
  }

  /**
   * Submits a broker request. The returned-via-callback result is dropped if the
   * state has become invalid (re-org, cancellation) by the time it lands. Errors
   * are routed to `state.reject` unless they are abort-driven or the state is
   * already invalid (in which case they're a stale echo of the cancel).
   *
   * @param state - Object exposing `verifyState()` and `reject()`.
   * @param request - The broker call. Receives the controller's signal.
   * @param callback - Runs on success, after `verifyState()` is checked.
   * @param isCancelled - Optional extra cancellation predicate (e.g. a `cancelled`
   *   flag the subclass maintains independently of the state). Defaults to never.
   */
  protected deferredProving<S extends ProvingStateLike, T>(
    state: S,
    request: (signal: AbortSignal) => Promise<T>,
    callback: (result: T) => void | Promise<void>,
    isCancelled: () => boolean = () => false,
  ): void {
    if (!state.verifyState()) {
      this.logger.debug(`Not enqueuing job, state no longer valid`);
      return;
    }

    const controller = new AbortController();
    this.pendingProvingJobs.push(controller);

    // We use a 'safeJob'. We don't want promise rejections in the proving pool — we
    // want to capture the error here and reject the proving state while keeping the
    // event loop free of rejections.
    const safeJob = async () => {
      try {
        if (controller.signal.aborted) {
          return;
        }
        const result = await request(controller.signal);
        if (controller.signal.aborted || !state.verifyState() || isCancelled()) {
          this.logger.debug(`State no longer valid, discarding result`);
          return;
        }
        await callback(result);
      } catch (err) {
        if (err instanceof AbortError || isCancelled()) {
          return;
        }
        if (!state.verifyState()) {
          this.logger.debug(`State no longer valid, discarding error from proving job`, err);
          return;
        }
        this.logger.error(`Error thrown when proving job`, err);
        state.reject(`${err}`);
      } finally {
        const idx = this.pendingProvingJobs.indexOf(controller);
        if (idx > -1) {
          this.pendingProvingJobs.splice(idx, 1);
        }
      }
    };

    void this.deferredJobQueue.put(async () => {
      void safeJob();
      // Yield to the macrotask queue so Node has a chance to interleave other work
      // between enqueues.
      await sleep(0);
    });
  }
}
