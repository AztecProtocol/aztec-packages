import {
  type V2ProofOutputUri,
  type V2ProvingJob,
  type V2ProvingJobId,
  type V2ProvingJobResult,
} from '@aztec/circuit-types';

/**
 * A database for storing proof requests and their results
 */
export interface ProvingJobDatabase {
  /**
   * Saves a proof request so it can be retrieved later
   * @param request - The proof request to save
   */
  addProvingJob(request: V2ProvingJob): Promise<void>;

  /**
   * Removes a proof request from the backend
   * @param id - The ID of the proof request to remove
   */
  deleteProvingJobAndResult(id: V2ProvingJobId): Promise<void>;

  /**
   * Returns an iterator over all saved proving jobs
   */
  allProvingJobs(): Iterable<[V2ProvingJob, V2ProvingJobResult | undefined]>;

  /**
   * Saves the result of a proof request
   * @param id - The ID of the proof request to save the result for
   * @param ProvingRequestType - The type of proof that was requested
   * @param value - The result of the proof request
   */
  setProvingJobResult(id: V2ProvingJobId, value: V2ProofOutputUri): Promise<void>;

  /**
   * Saves an error that occurred while processing a proof request
   * @param id - The ID of the proof request to save the error for
   * @param ProvingRequestType - The type of proof that was requested
   * @param err - The error that occurred while processing the proof request
   */
  setProvingJobError(id: V2ProvingJobId, err: Error): Promise<void>;
}
