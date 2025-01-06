import { type ProofUri, ProvingJob, type ProvingJobId, ProvingJobSettledResult } from '@aztec/circuit-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { type ProvingBrokerDatabase } from '../proving_broker_database.js';

export class KVBrokerDatabase implements ProvingBrokerDatabase {
  private jobs: AztecMap<ProvingJobId, string>;
  private jobResults: AztecMap<ProvingJobId, string>;

  constructor(private store: AztecKVStore) {
    this.jobs = store.openMap('proving_jobs');
    this.jobResults = store.openMap('proving_job_results');
  }

  async addProvingJob(job: ProvingJob): Promise<void> {
    await this.jobs.set(job.id, jsonStringify(job));
  }

  *allProvingJobs(): Iterable<[ProvingJob, ProvingJobSettledResult | undefined]> {
    for (const jobStr of this.jobs.values()) {
      const job = jsonParseWithSchema(jobStr, ProvingJob);
      const resultStr = this.jobResults.get(job.id);
      const result = resultStr ? jsonParseWithSchema(resultStr, ProvingJobSettledResult) : undefined;
      yield [job, result];
    }
  }

  deleteProvingJobAndResult(id: ProvingJobId): Promise<void> {
    return this.store.transaction(() => {
      void this.jobs.delete(id);
      void this.jobResults.delete(id);
    });
  }

  async setProvingJobError(id: ProvingJobId, reason: string): Promise<void> {
    const result: ProvingJobSettledResult = { status: 'rejected', reason };
    await this.jobResults.set(id, jsonStringify(result));
  }

  async setProvingJobResult(id: ProvingJobId, value: ProofUri): Promise<void> {
    const result: ProvingJobSettledResult = { status: 'fulfilled', value };
    await this.jobResults.set(id, jsonStringify(result));
  }
}
