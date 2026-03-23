import { EpochNumber } from '@aztec/foundation/branded-types';
import type {
  Claim,
  ProofUri,
  ProvingJob,
  ProvingJobId,
  ProvingJobSettledResult,
  WorkItemId,
} from '@aztec/stdlib/interfaces/server';

/**
 * A database for storing proof requests and their results
 */
export interface ProvingBrokerDatabase {
  /**
   * Saves a proof request so it can be retrieved later
   * @param job - The proof request to save
   */
  addProvingJob(job: ProvingJob): Promise<void>;

  /** Retrieves a single proving job by ID. Used for lazy loading full job data. */
  getProvingJob(id: ProvingJobId): Promise<ProvingJob | undefined>;

  /** Retrieves a single proving job result by ID. Used for lazy loading full result data. */
  getProvingJobResult(id: ProvingJobId): Promise<ProvingJobSettledResult | undefined>;

  /**
   * Deletes all proving jobs belonging to epochs older than the given epoch
   * @param epochNumber - The epoch number beyond which jobs should be deleted
   */
  deleteAllProvingJobsOlderThanEpoch(epochNumber: EpochNumber): Promise<void>;

  /**
   * Returns an iterator over all saved proving jobs
   */
  allProvingJobs(): AsyncIterableIterator<[ProvingJob, ProvingJobSettledResult | undefined]>;

  /**
   * Saves the result of a proof request
   * @param id - The ID of the proof request to save the result for
   * @param ProvingRequestType - The type of proof that was requested
   * @param value - The result of the proof request
   */
  setProvingJobResult(id: ProvingJobId, value: ProofUri): Promise<void>;

  /**
   * Saves an error that occurred while processing a proof request
   * @param id - The ID of the proof request to save the error for
   * @param ProvingRequestType - The type of proof that was requested
   * @param err - The error that occurred while processing the proof request
   */
  setProvingJobError(id: ProvingJobId, err: string): Promise<void>;

  /**
   * Closes the database
   */
  close(): Promise<void>;

  // Claim management

  /** Persists a claim on a work item. */
  addClaim(claim: Claim): Promise<void>;

  /** Updates the lastActivity timestamp for a claim. Returns true if the claim existed. */
  updateClaimActivity(workItemId: WorkItemId, lastActivity: number): Promise<boolean>;

  /** Retrieves a claim by work item ID. */
  getClaim(workItemId: WorkItemId): Promise<Claim | undefined>;

  /** Deletes a claim by work item ID. */
  deleteClaim(workItemId: WorkItemId): Promise<void>;

  /** Deletes all claims belonging to epochs older than the given epoch. */
  deleteClaimsOlderThanEpoch(epochNumber: EpochNumber): Promise<void>;

  /** Returns an async iterator over all persisted claims. */
  allClaims(): AsyncIterableIterator<Claim>;
}
