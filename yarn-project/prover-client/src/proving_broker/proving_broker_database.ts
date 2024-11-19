import {
  type V2ProofOutput,
  type V2ProvingJob,
  type V2ProvingJobId,
  type V2ProvingJobResult,
} from '@aztec/circuit-types';

export interface ProvingBrokerDatabase {
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
  setProvingJobResult(id: V2ProvingJobId, value: V2ProofOutput): Promise<void>;

  /**
   * Saves an error that occurred while processing a proof request
   * @param id - The ID of the proof request to save the error for
   * @param ProvingRequestType - The type of proof that was requested
   * @param err - The error that occurred while processing the proof request
   */
  setProvingJobError(id: V2ProvingJobId, err: Error): Promise<void>;
}

export class InMemoryDatabase implements ProvingBrokerDatabase {
  private jobs = new Map<V2ProvingJobId, V2ProvingJob>();
  private results = new Map<V2ProvingJobId, V2ProvingJobResult>();

  getProvingJob(id: V2ProvingJobId): V2ProvingJob | undefined {
    return this.jobs.get(id);
  }

  getProvingJobResult(id: V2ProvingJobId): V2ProvingJobResult | undefined {
    return this.results.get(id);
  }

  addProvingJob(request: V2ProvingJob): Promise<void> {
    this.jobs.set(request.id, request);
    return Promise.resolve();
  }

  setProvingJobResult(id: V2ProvingJobId, value: V2ProofOutput): Promise<void> {
    this.results.set(id, { value });
    return Promise.resolve();
  }

  setProvingJobError(id: V2ProvingJobId, error: Error): Promise<void> {
    this.results.set(id, { error: String(error) });
    return Promise.resolve();
  }

  deleteProvingJobAndResult(id: V2ProvingJobId): Promise<void> {
    this.jobs.delete(id);
    this.results.delete(id);
    return Promise.resolve();
  }

  *allProvingJobs(): Iterable<[V2ProvingJob, V2ProvingJobResult | undefined]> {
    for (const item of this.jobs.values()) {
      yield [item, this.results.get(item.id)] as const;
    }
  }
}
