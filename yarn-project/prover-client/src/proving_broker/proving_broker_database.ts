import { type ProofUri, type ProvingJob, type ProvingJobId, type ProvingJobSettledResult } from '@aztec/circuit-types';

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
  deleteAllProvingJobsOlderThanEpoch(epochNumber: number): Promise<void>;

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
}
