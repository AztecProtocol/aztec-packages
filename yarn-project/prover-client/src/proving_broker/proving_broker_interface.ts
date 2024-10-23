import type { ProofOutputs, ProofType, ProvingJob, ProvingJobId, ProvingJobStatus } from './proving_job.js';

/**
 * An interface for the proving orchestrator. The producer uses this to enqueue jobs for agents
 */
export interface ProvingJobProducer {
  /**
   * Enqueues a proving job
   * @param job - The job to enqueue
   */
  enqueueProvingJob<T extends ProofType>(job: ProvingJob<T>): Promise<void>;

  /**
   * Cancels a proving job and clears all of its
   * @param id - The ID of the job to cancel
   */
  removeAndCancelProvingJob<T extends ProofType>(id: ProvingJobId<T>): Promise<void>;

  /**
   * Returns the current status fof the proving job
   * @param id - The ID of the job to get the status of
   */
  getProvingJobStatus<T extends ProofType>(id: ProvingJobId<T>): Promise<ProvingJobStatus<T>>;
}

export interface ProvingJobFilter<T extends ProofType[]> {
  allowList?: T;
}

/**
 * An interface for proving agents to request jobs and report results
 */
export interface ProvingJobConsumer {
  /**
   * Gets a proving job to work on
   * @param filter - Optional filter for the type of job to get
   */
  getProvingJob<T extends ProofType[]>(filter?: ProvingJobFilter<T>): Promise<ProvingJob<T[number]> | undefined>;

  /**
   * Marks a proving job as successful
   * @param id - The ID of the job to report success for
   * @param result - The result of the job
   */
  reportProvingJobSuccess<T extends ProofType>(id: ProvingJobId<T>, result: ProofOutputs[T]): Promise<void>;

  /**
   * Marks a proving job as errored
   * @param id - The ID of the job to report an error for
   * @param err - The error that occurred while processing the job
   * @param retry - Whether to retry the job
   */
  reportProvingJobError<T extends ProofType>(id: ProvingJobId<T>, err: Error, retry?: boolean): Promise<void>;

  /**
   * Sends a heartbeat to the broker to indicate that the agent is still working on the given proving job
   * @param id - The ID of the job to report progress for
   * @param filter - Optional filter for the type of job to get
   */
  reportProvingJobProgress<T extends ProofType, F extends ProofType[]>(
    id: ProvingJobId<T>,
    filter?: ProvingJobFilter<F>,
  ): Promise<ProvingJob<F[number]> | undefined>;
}
