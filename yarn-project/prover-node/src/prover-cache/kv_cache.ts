import type { ProverCache, ProvingJobStatus } from '@aztec/circuit-types';
import type { AztecKVStore, AztecMap } from '@aztec/kv-store';

export class KVProverCache implements ProverCache {
  private proofs: AztecMap<string, string>;

  constructor(store: AztecKVStore, private cleanup?: () => Promise<void>) {
    this.proofs = store.openMap('prover_node_proof_status');
  }

  getProvingJobStatus(jobId: string): Promise<ProvingJobStatus> {
    const item = this.proofs.get(jobId);
    if (!item) {
      return Promise.resolve({ status: 'not-found' });
    }

    return Promise.resolve(JSON.parse(item));
  }

  setProvingJobStatus(jobId: string, status: ProvingJobStatus): Promise<void> {
    return this.proofs.set(jobId, JSON.stringify(status));
  }

  async close(): Promise<void> {
    await this.cleanup?.();
  }
}
