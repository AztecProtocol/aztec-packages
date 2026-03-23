import type { EpochNumber } from '@aztec/foundation/branded-types';

import type { ProvingRequestType } from '../proofs/proving_request_type.js';
import type { ClaimStatus, ClaimToken, WorkItemId } from './prover-claims.js';
import type { ProofUri, ProvingJob, ProvingJobId, ProvingJobStatus } from './proving-job.js';

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
   * Returns the ids of jobs that have been completed since the last call.
   * Uses per-consumer notification queues so multiple facades can poll
   * without draining each other's notifications.
   * @param ids - The set of job ids to check for completion (snapshot sync)
   * @param consumerId - Unique identifier for this consumer (facade instance)
   */
  getCompletedJobs(ids: ProvingJobId[], consumerId?: string): Promise<ProvingJobId[]>;
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
  reportProvingJobSuccess(
    id: ProvingJobId,
    result: ProofUri,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined>;

  /**
   * Marks a proving job as errored
   * @param id - The ID of the job to report an error for
   * @param err - The error that occurred while processing the job
   * @param retry - Whether to retry the job
   */
  reportProvingJobError(
    id: ProvingJobId,
    err: string,
    retry?: boolean,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined>;

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

/**
 * Debug interface for replaying proving jobs from stored inputs.
 * Used for benchmarking different agent configurations against the same workload.
 */
export interface ProvingJobBrokerDebug {
  /**
   * Replays a proving job by re-enqueuing it with inputs from the configured proof store.
   * The proof type is parsed from the job ID (format: epoch:typeName:hash).
   * @param jobId - The original job ID to replay
   * @param epochNumber - The epoch number to assign
   * @param inputsUri - The proof inputs location
   */
  replayProvingJob(
    jobId: ProvingJobId,
    type: ProvingRequestType,
    epochNumber: EpochNumber,
    inputsUri: ProofUri,
  ): Promise<ProvingJobStatus>;
}

/** Result of a successful claim. */
export type ClaimResult = { workItemId: WorkItemId; claimToken: ClaimToken };

/** Interface for claiming work items across competing prover nodes. */
export interface ProvingJobClaimManager {
  /** Attempt to claim a work item. Returns a claim token if granted, undefined if already claimed. */
  claimWork(workItemId: WorkItemId, nodeId: string): Promise<ClaimToken | undefined>;

  /**
   * Claim up to `maxClaims` work items from a list. The broker checks each item
   * and claims those that are unclaimed or expired. Returns the claimed items
   * with their tokens, or an empty array if none are available.
   */
  claimN(workItemIds: WorkItemId[], maxClaims: number, nodeId: string): Promise<ClaimResult[]>;

  /** Reset the inactivity timeout for a claim. Returns false if token doesn't match. */
  heartbeatClaim(workItemId: WorkItemId, claimToken: ClaimToken): Promise<boolean>;

  /** Get the current status of a work item claim. */
  getClaimStatus(workItemId: WorkItemId): Promise<ClaimStatus>;

  /** Batch query: get claim statuses for multiple work items. Returns statuses in same order as input. */
  getClaimStatuses(workItemIds: WorkItemId[]): Promise<ClaimStatus[]>;

  /** Release a claim (e.g., on graceful shutdown). */
  releaseClaim(workItemId: WorkItemId, claimToken: ClaimToken): Promise<void>;
}
