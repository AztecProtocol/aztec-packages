import type { V2ProofOutputUri, V2ProvingJob, V2ProvingJobId, V2ProvingJobResult } from '@aztec/circuit-types';

import { type ProvingJobDatabase } from '../proving_job_database.js';

export class InMemoryDatabase implements ProvingJobDatabase {
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

  setProvingJobResult(id: V2ProvingJobId, value: V2ProofOutputUri): Promise<void> {
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
