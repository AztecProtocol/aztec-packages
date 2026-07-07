import { EpochNumber } from '@aztec/foundation/branded-types';
import type { ProofUri, ProvingJob, ProvingJobId, ProvingJobSettledResult } from '@aztec/stdlib/interfaces/server';

/**
 * A database for storing proof requests and their results
 */
export interface ProvingBrokerDatabase {
  /**
   * Saves a proof request so it can be retrieved later
   * @param job - The proof request to save
   */
  addProvingJob(job: ProvingJob): Promise<void>;

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
   * Records that a proof request was cancelled. Unlike a result or error this is not terminal:
   * re-enqueuing the same job id revives it, so the aborted state can survive a restart without
   * permanently blocking the proof.
   * @param id - The ID of the cancelled proof request
   */
  setProvingJobAborted(id: ProvingJobId): Promise<void>;

  /**
   * Closes the database
   */
  close(): Promise<void>;
}
