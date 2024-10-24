import type { ProofOutputs, ProofType, ProvingJob, ProvingJobId } from './proving_job.js';

export type ProvingJobResult<T extends ProofType> = { value: ProofOutputs[T] } | { error: Error };

export interface ProvingBrokerDatabase {
  /**
   * Saves a proof request so it can be retrieved later
   * @param request - The proof request to save
   */
  addProvingJob<T extends ProofType>(request: ProvingJob<T>): Promise<void>;

  /**
   * Removes a proof request from the backend
   * @param id - The ID of the proof request to remove
   */
  deleteProvingJobAndResult<T extends ProofType>(id: ProvingJobId<T>): Promise<void>;

  /**
   * Returns an iterator over all saved proving jobs
   */
  allProvingJobs(): Iterable<[ProvingJob<ProofType>, ProvingJobResult<ProofType> | undefined]>;

  /**
   * Saves the result of a proof request
   * @param id - The ID of the proof request to save the result for
   * @param proofType - The type of proof that was requested
   * @param value - The result of the proof request
   */
  setProvingJobResult<T extends ProofType>(id: ProvingJobId<T>, value: ProofOutputs[T]): Promise<void>;

  /**
   * Saves an error that occurred while processing a proof request
   * @param id - The ID of the proof request to save the error for
   * @param proofType - The type of proof that was requested
   * @param err - The error that occurred while processing the proof request
   */
  setProvingJobError<T extends ProofType>(id: ProvingJobId<T>, err: Error): Promise<void>;
}

export class InMemoryDatabase implements ProvingBrokerDatabase {
  private jobs = new Map<ProvingJobId, ProvingJob<ProofType>>();
  private results = new Map<ProvingJobId, ProvingJobResult<ProofType>>();

  getProvingJob<T extends ProofType>(id: ProvingJobId<T>): ProvingJob<T> | undefined {
    return this.jobs.get(id) as ProvingJob<T> | undefined;
  }

  getProvingJobResult<T extends ProofType>(id: ProvingJobId<T>): ProvingJobResult<T> | undefined {
    return this.results.get(id) as ProvingJobResult<T> | undefined;
  }

  addProvingJob<T extends ProofType>(request: ProvingJob<T>): Promise<void> {
    this.jobs.set(request.id, request);
    return Promise.resolve();
  }

  setProvingJobResult<T extends ProofType>(id: ProvingJobId<T>, value: ProofOutputs[T]): Promise<void> {
    this.results.set(id, { value });
    return Promise.resolve();
  }

  setProvingJobError<T extends ProofType>(id: ProvingJobId<T>, error: Error): Promise<void> {
    this.results.set(id, { error });
    return Promise.resolve();
  }

  deleteProvingJobAndResult<T extends ProofType>(id: ProvingJobId<T>): Promise<void> {
    this.jobs.delete(id);
    this.results.delete(id);
    return Promise.resolve();
  }

  *allProvingJobs(): Iterable<[ProvingJob<ProofType>, ProvingJobResult<ProofType> | undefined]> {
    for (const item of this.jobs.values()) {
      yield [item, this.results.get(item.id)] as const;
    }
  }
}
