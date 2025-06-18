import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';

export class TestCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<IVCProofVerificationResult> {
    return Promise.resolve({ valid: true, duration: 0, totalDuration: 0 });
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
