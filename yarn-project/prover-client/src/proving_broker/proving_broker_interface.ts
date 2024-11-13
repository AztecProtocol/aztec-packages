import {
  type ProvingRequestType,
  type V2ProvingJob,
  type V2ProvingJobId,
  type V2ProvingJobStatus,
  type V2ProvingResult,
} from '@aztec/circuit-types';

/**
 * An interface for the proving orchestrator. The producer uses this to enqueue jobs for agents
 */
export interface ProvingJobProducer {
  /**
   * Enqueues a proving job
   * @param job - The job to enqueue
   */
  enqueueProvingJob(job: V2ProvingJob): Promise<void>;

  /**
   * Cancels a proving job and clears all of its
   * @param id - The ID of the job to cancel
   */
  removeAndCancelProvingJob<T extends ProvingRequestType>(id: V2ProvingJobId<T>): Promise<void>;

  /**
   * Returns the current status fof the proving job
   * @param id - The ID of the job to get the status of
   */
  getProvingJobStatus<T extends ProvingRequestType>(id: V2ProvingJobId<T>): Promise<V2ProvingJobStatus>;
}

export interface ProvingJobFilter<T extends ProvingRequestType[]> {
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
  getProvingJob<T extends ProvingRequestType[]>(filter?: ProvingJobFilter<T>): Promise<V2ProvingJob | undefined>;

  /**
   * Marks a proving job as successful
   * @param id - The ID of the job to report success for
   * @param result - The result of the job
   */
  reportProvingJobSuccess<T extends ProvingRequestType>(id: V2ProvingJobId<T>, result: V2ProvingResult): Promise<void>;

  /**
   * Marks a proving job as errored
   * @param id - The ID of the job to report an error for
   * @param err - The error that occurred while processing the job
   * @param retry - Whether to retry the job
   */
  reportProvingJobError<T extends ProvingRequestType>(
    id: V2ProvingJobId<T>,
    err: Error,
    retry?: boolean,
  ): Promise<void>;

  /**
   * Sends a heartbeat to the broker to indicate that the agent is still working on the given proving job
   * @param id - The ID of the job to report progress for
   * @param filter - Optional filter for the type of job to get
   */
  reportProvingJobProgress<T extends ProvingRequestType, F extends ProvingRequestType[]>(
    id: V2ProvingJobId<T>,
    filter?: ProvingJobFilter<F>,
  ): Promise<V2ProvingJob | undefined>;
}
