import type { EpochNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import type { DateProvider } from '@aztec/foundation/timer';
import type { ClaimToken, WorkItemId } from '@aztec/stdlib/interfaces/server';

export type SplitProvingJobType = 'checkpoint' | 'top-tree' | 'publish';
export type SplitProvingJobState = 'running' | 'completed' | 'failed' | 'stopped';

/** Base class for all split proving job types. */
export abstract class SplitProvingJob {
  protected state: SplitProvingJobState = 'running';
  protected abortController = new AbortController();
  private deadlineCheck?: RunningPromise;
  private baseLogger = createLogger('prover-node:split-proving-job');

  constructor(
    public readonly epochNumber: EpochNumber,
    public readonly workItemId: WorkItemId,
    public readonly claimToken: ClaimToken,
    public readonly type: SplitProvingJobType,
    private readonly dateProvider: DateProvider,
    public readonly deadline?: Date,
  ) {
    if (deadline) {
      if (dateProvider.now() >= deadline.getTime()) {
        this.baseLogger.warn(`Job ${workItemId} created with deadline already passed`);
        void this.stop();
      } else {
        // Poll the date provider instead of using setTimeout, since tests may
        // use a simulated clock that doesn't advance with wall clock time.
        this.deadlineCheck = new RunningPromise(
          () => {
            if (this.deadline && this.dateProvider.now() >= this.deadline.getTime()) {
              this.baseLogger.warn(`Job ${workItemId} stopped due to deadline`);
              void this.stop();
            }
          },
          this.baseLogger,
          1000,
        );
        this.deadlineCheck.start();
      }
    }
  }

  getState(): SplitProvingJobState {
    return this.state;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /** Marks the job as stopped and aborts any in-flight work. Subclasses should override to clean up resources. */
  stop(): Promise<void> {
    this.state = 'stopped';
    this.abortController.abort();
    void this.deadlineCheck?.stop();
    this.deadlineCheck = undefined;
    return Promise.resolve();
  }

  abstract run(): Promise<void>;

  /** Transition to completed, unless already stopped. */
  protected complete() {
    if (this.state === 'running') {
      this.state = 'completed';
    }
  }

  /** Transition to failed, unless already stopped. */
  protected fail() {
    if (this.state === 'running') {
      this.state = 'failed';
    }
  }
}
