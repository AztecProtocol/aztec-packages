import type { ProverCache, ProvingJobStatus } from '@aztec/circuit-types';

export class InMemoryProverCache implements ProverCache {
  private proofs: Record<string, ProvingJobStatus> = {};

  constructor() {}

  setProvingJobStatus(jobId: string, status: ProvingJobStatus): Promise<void> {
    this.proofs[jobId] = status;
    return Promise.resolve();
  }

  getProvingJobStatus(jobId: string): Promise<ProvingJobStatus> {
    return Promise.resolve(this.proofs[jobId] ?? { status: 'not-found' });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
