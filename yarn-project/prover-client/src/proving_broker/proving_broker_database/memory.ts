import { EpochNumber } from '@aztec/foundation/branded-types';
import {
  type Claim,
  type ProofUri,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobSettledResult,
  type WorkItemId,
  getEpochFromProvingJobId,
} from '@aztec/stdlib/interfaces/server';

import type { ProvingBrokerDatabase } from '../proving_broker_database.js';

export class InMemoryBrokerDatabase implements ProvingBrokerDatabase {
  private jobs = new Map<ProvingJobId, ProvingJob>();
  private results = new Map<ProvingJobId, ProvingJobSettledResult>();
  private claims = new Map<WorkItemId, Claim>();

  getProvingJob(id: ProvingJobId): Promise<ProvingJob | undefined> {
    return Promise.resolve(this.jobs.get(id));
  }

  getProvingJobResult(id: ProvingJobId): Promise<ProvingJobSettledResult | undefined> {
    return Promise.resolve(this.results.get(id));
  }

  addProvingJob(job: ProvingJob): Promise<void> {
    this.jobs.set(job.id, job);
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

  deleteAllProvingJobsOlderThanEpoch(epochNumber: EpochNumber): Promise<void> {
    const toDelete = [
      ...Array.from(this.jobs.keys()).filter(x => getEpochFromProvingJobId(x) < epochNumber),
      ...Array.from(this.results.keys()).filter(x => getEpochFromProvingJobId(x) < epochNumber),
    ];
    return this.deleteProvingJobs(toDelete);
  }

  async *allProvingJobs(): AsyncIterableIterator<[ProvingJob, ProvingJobSettledResult | undefined]> {
    for (const item of this.jobs.values()) {
      yield [item, this.results.get(item.id)] as const;
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  addClaim(claim: Claim): Promise<void> {
    this.claims.set(claim.workItemId, claim);
    return Promise.resolve();
  }

  updateClaimActivity(workItemId: WorkItemId, lastActivity: number): Promise<boolean> {
    const claim = this.claims.get(workItemId);
    if (!claim) {
      return Promise.resolve(false);
    }
    claim.lastActivity = lastActivity;
    return Promise.resolve(true);
  }

  getClaim(workItemId: WorkItemId): Promise<Claim | undefined> {
    return Promise.resolve(this.claims.get(workItemId));
  }

  deleteClaim(workItemId: WorkItemId): Promise<void> {
    this.claims.delete(workItemId);
    return Promise.resolve();
  }

  deleteClaimsOlderThanEpoch(epochNumber: EpochNumber): Promise<void> {
    for (const [id, claim] of this.claims) {
      if (claim.epochNumber < epochNumber) {
        this.claims.delete(id);
      }
    }
    return Promise.resolve();
  }

  async *allClaims(): AsyncIterableIterator<Claim> {
    for (const claim of this.claims.values()) {
      yield claim;
    }
  }
}
