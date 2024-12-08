import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobSettledResult,
  type ProvingJobStatus,
  type ProvingRequestType,
} from '@aztec/circuit-types';
import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';

import { z } from 'zod';

export const ProverBrokerConfig = z.object({
  /** If starting a prover broker locally, the max number of retries per proving job */
  proverBrokerJobMaxRetries: z.number(),
  /** If starting a prover broker locally, the time after which a job times out and gets assigned to a different agent */
  proverBrokerJobTimeoutMs: z.number(),
  /** If starting a prover broker locally, the interval the broker checks for timed out jobs */
  proverBrokerPollIntervalMs: z.number(),
  /** If starting a prover broker locally, the directory to store broker data */
  proverBrokerDataDirectory: z.string().optional(),
});

export type ProverBrokerConfig = z.infer<typeof ProverBrokerConfig>;

export const proverBrokerConfigMappings: ConfigMappingsType<ProverBrokerConfig> = {
  proverBrokerJobTimeoutMs: {
    env: 'PROVER_BROKER_JOB_TIMEOUT_MS',
    description: 'Jobs are retried if not kept alive for this long',
    ...numberConfigHelper(30_000),
  },
  proverBrokerPollIntervalMs: {
    env: 'PROVER_BROKER_POLL_INTERVAL_MS',
    description: 'The interval to check job health status',
    ...numberConfigHelper(1_000),
  },
  proverBrokerJobMaxRetries: {
    env: 'PROVER_BROKER_JOB_MAX_RETRIES',
    description: 'If starting a prover broker locally, the max number of retries per proving job',
    ...numberConfigHelper(3),
  },
  proverBrokerDataDirectory: {
    env: 'PROVER_BROKER_DATA_DIRECTORY',
    description: 'If starting a prover broker locally, the directory to store broker data',
  },
};

/**
 * An interface for the proving orchestrator. The producer uses this to enqueue jobs for agents
 */
export interface ProvingJobProducer {
  /**
   * Enqueues a proving job
   * @param job - The job to enqueue
   */
  enqueueProvingJob(job: ProvingJob): Promise<void>;

  /**
   * Cancels a proving job and clears all of its
   * @param id - The ID of the job to cancel
   */
  removeAndCancelProvingJob(id: ProvingJobId): Promise<void>;

  /**
   * Returns the current status fof the proving job
   * @param id - The ID of the job to get the status of
   */
  getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus>;

  /**
   * Waits for the job to settle and returns to the result
   * @param id - The ID of the job to get the status of
   */
  waitForJobToSettle(id: ProvingJobId): Promise<ProvingJobSettledResult>;
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
