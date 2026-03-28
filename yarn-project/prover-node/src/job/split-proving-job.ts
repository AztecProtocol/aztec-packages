import type { ClaimToken, WorkItemId } from '@aztec/stdlib/interfaces/server';

export type SplitProvingJobType = 'checkpoint' | 'top-tree' | 'publish';
export type SplitProvingJobState = 'running' | 'completed' | 'failed' | 'stopped';

/** Base class for all split proving job types. */
export abstract class SplitProvingJob {
  protected state: SplitProvingJobState = 'running';
  protected abortController = new AbortController();

  constructor(
    public readonly workItemId: WorkItemId,
    public readonly claimToken: ClaimToken,
    public readonly type: SplitProvingJobType,
  ) {}

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
