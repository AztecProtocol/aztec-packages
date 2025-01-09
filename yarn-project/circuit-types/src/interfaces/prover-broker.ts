import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobStatus,
  type ProvingRequestType,
} from '@aztec/circuit-types';

/**
 * An interface for the proving orchestrator. The producer uses this to enqueue jobs for agents
 */
export interface ProvingJobProducer {
  /**
   * Enqueues a proving job
   * @param job - The job to enqueue
   */
  enqueueProvingJob(job: ProvingJob): Promise<ProvingJobStatus>;

  /**
   * Cancels a proving job.
   * @param id - The ID of the job to cancel
   */
  cancelProvingJob(id: ProvingJobId): Promise<void>;

  /**
   * Returns the current status fof the proving job
   * @param id - The ID of the job to get the status of
   */
  getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus>;

  /**
   * Returns the ids of jobs that have been completed since the last call
   * Also returns the set of provided job ids that are completed
   * @param ids - The set of job ids to check for completion
   */
  getCompletedJobs(ids: ProvingJobId[]): Promise<ProvingJobId[]>;
}

export type ProvingJobFilter = {
  allowList: ProvingRequestType[];
};

export type GetProvingJobResponse = {
  job: ProvingJob;
  time: number;
};

/**
 * An interface for proving agents to request jobs and report results
 */
export interface ProvingJobConsumer {
  /**
   * Gets a proving job to work on
   * @param filter - Optional filter for the type of job to get
   */
  getProvingJob(filter?: ProvingJobFilter): Promise<GetProvingJobResponse | undefined>;

  /**
   * Marks a proving job as successful
   * @param id - The ID of the job to report success for
   * @param result - The result of the job
   */
  reportProvingJobSuccess(id: ProvingJobId, result: ProofUri): Promise<void>;

  /**
   * Marks a proving job as errored
   * @param id - The ID of the job to report an error for
   * @param err - The error that occurred while processing the job
   * @param retry - Whether to retry the job
   */
  reportProvingJobError(id: ProvingJobId, err: string, retry?: boolean): Promise<void>;

  /**
   * Sends a heartbeat to the broker to indicate that the agent is still working on the given proving job
   * @param id - The ID of the job to report progress for
   * @param startedAt - The unix epoch when the job was started
   * @param filter - Optional filter for the type of job to get
   */
  reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined>;
}

export interface ProvingJobBroker extends ProvingJobProducer, ProvingJobConsumer {}
