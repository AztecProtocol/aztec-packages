/**
 * JobContext represents an active job in the PXE.
 *
 * During a job, all database writes go to a staging area (prefixed keys).
 * Only on job success are they promoted to main storage. This provides
 * job-level atomicity without requiring long-running transactions,
 * which are problematic when the backing data store is IndexedDB.
 */
export class JobContext {
  /** Unique identifier for this job */
  readonly jobId: string;

  /** Prefix for staging keys: "job_{jobId}:" */
  readonly stagingPrefix: string;

  constructor(jobId: string) {
    this.jobId = jobId;
    this.stagingPrefix = `job_${jobId}:`;
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
