import type { ProvingJobId } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

// Mock ProofStore for faster benchmarks with realistic Cloud Storage URIs
export class MockProofStore {
  private mockCounter = 0;
  private readonly bucketName = 'aztec-proving-benchmarks';
  private readonly basePath = 'proving-jobs';

  saveProofInput(jobId: ProvingJobId, type: ProvingRequestType): Promise<string> {
    const uri = `gs://${this.bucketName}/${this.basePath}/inputs/${type}/${jobId}`;
    return Promise.resolve(uri as any);
  }
}
