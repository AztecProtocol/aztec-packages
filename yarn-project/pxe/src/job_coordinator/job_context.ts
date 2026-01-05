/**
 * JobContext represents an active job in the PXE.
 *
 * During a job, all database writes go to a staging area (prefixed keys).
 * Only on job success are they promoted to main storage. This provides
 * job-level atomicity without requiring cross-store transactions.
 */
export class JobContext {
  /** Unique identifier for this job */
  readonly jobId: string;

  /** Type of job (for logging/debugging) */
  readonly jobType: string;

  /** Prefix for staging keys: "job_{jobId}:" */
  readonly stagingPrefix: string;

  /** Timestamp when job started */
  readonly startedAt: number;

  constructor(jobId: string, jobType: string) {
    this.jobId = jobId;
    this.jobType = jobType;
    this.stagingPrefix = `job_${jobId}:`;
    this.startedAt = Date.now();
  }

  /**
   * Generates a staging key from a main key.
   * Prepends the staging prefix to the key.
   */
  stagingKey(mainKey: string): string {
    return `${this.stagingPrefix}${mainKey}`;
  }

  /**
   * Extracts the main key from a staging key.
   * Removes the staging prefix from the key.
   */
  mainKey(stagingKey: string): string {
    if (!stagingKey.startsWith(this.stagingPrefix)) {
      throw new Error(`Key "${stagingKey}" does not have staging prefix "${this.stagingPrefix}"`);
    }
    return stagingKey.substring(this.stagingPrefix.length);
  }
}

/**
 * Serializable representation of a JobContext for persistence.
 */
export interface SerializedJobContext {
  jobId: string;
  jobType: string;
  startedAt: number;
}

/**
 * Serializes a JobContext for persistence to the job marker store.
 */
export function serializeJobContext(context: JobContext): SerializedJobContext {
  return {
    jobId: context.jobId,
    jobType: context.jobType,
    startedAt: context.startedAt,
  };
}

/**
 * Deserializes a JobContext from persistence.
 * Note: The returned context is for recovery purposes only.
 */
export function deserializeJobContext(serialized: SerializedJobContext): JobContext {
  return new JobContext(serialized.jobId, serialized.jobType);
}
