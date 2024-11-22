import { type V2ProofOutput, V2ProvingJob, type V2ProvingJobId, V2ProvingJobResult } from '@aztec/circuit-types';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { type ProvingJobDatabase } from '../proving_job_database.js';

export class PersistedProvingJobDatabase implements ProvingJobDatabase {
  private jobs: AztecMap<V2ProvingJobId, string>;
  private jobResults: AztecMap<V2ProvingJobId, string>;

  constructor(private store: AztecKVStore) {
    this.jobs = store.openMap('proving_jobs');
    this.jobResults = store.openMap('proving_job_results');
  }

  async addProvingJob(job: V2ProvingJob): Promise<void> {
    await this.jobs.set(job.id, JSON.stringify(job));
  }

  *allProvingJobs(): Iterable<[V2ProvingJob, V2ProvingJobResult | undefined]> {
    for (const jobStr of this.jobs.values()) {
      const job = V2ProvingJob.parse(JSON.parse(jobStr));
      const resultStr = this.jobResults.get(job.id);
      const result = resultStr ? V2ProvingJobResult.parse(JSON.parse(resultStr)) : undefined;
      yield [job, result];
    }
  }

  deleteProvingJobAndResult(id: V2ProvingJobId): Promise<void> {
    return this.store.transaction(() => {
      void this.jobs.delete(id);
      void this.jobResults.delete(id);
    });
  }

  async setProvingJobError(id: V2ProvingJobId, err: Error): Promise<void> {
    const res: V2ProvingJobResult = { error: err.message };
    await this.jobResults.set(id, JSON.stringify(res));
  }

  async setProvingJobResult(id: V2ProvingJobId, value: V2ProofOutput): Promise<void> {
    const res: V2ProvingJobResult = { value };
    await this.jobResults.set(id, JSON.stringify(res));
  }
}
