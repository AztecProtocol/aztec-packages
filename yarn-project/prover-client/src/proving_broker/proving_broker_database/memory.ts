import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobSettledResult,
  getEpochFromProvingJobId,
} from '@aztec/circuit-types';

import { type ProvingBrokerDatabase } from '../proving_broker_database.js';

export class InMemoryBrokerDatabase implements ProvingBrokerDatabase {
  private jobs = new Map<ProvingJobId, ProvingJob>();
  private results = new Map<ProvingJobId, ProvingJobSettledResult>();

  getProvingJob(id: ProvingJobId): ProvingJob | undefined {
    return this.jobs.get(id);
  }

  getProvingJobResult(id: ProvingJobId): ProvingJobSettledResult | undefined {
    return this.results.get(id);
  }

  addProvingJob(request: ProvingJob): Promise<void> {
    this.jobs.set(request.id, request);
    return Promise.resolve();
  }

  setProvingJobResult(id: ProvingJobId, value: ProofUri): Promise<void> {
    this.results.set(id, { status: 'fulfilled', value });
    return Promise.resolve();
  }

  setProvingJobError(id: ProvingJobId, reason: string): Promise<void> {
    this.results.set(id, { status: 'rejected', reason });
    return Promise.resolve();
  }

  deleteProvingJobs(ids: ProvingJobId[]): Promise<void> {
    for (const id of ids) {
      this.jobs.delete(id);
      this.results.delete(id);
    }
    return Promise.resolve();
  }

  deleteAllProvingJobsOlderThanEpoch(epochNumber: number): Promise<void> {
    const toDelete = [
      ...Array.from(this.jobs.keys()).filter(x => getEpochFromProvingJobId(x) < epochNumber),
      ...Array.from(this.results.keys()).filter(x => getEpochFromProvingJobId(x) < epochNumber),
    ];
    return this.deleteProvingJobs(toDelete);
  }

  *allProvingJobs(): Iterable<[ProvingJob, ProvingJobSettledResult | undefined]> {
    for (const item of this.jobs.values()) {
      yield [item, this.results.get(item.id)] as const;
    }
  }
}
