import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';

export class TestCircuitVerifier implements ClientProtocolCircuitVerifier {
  constructor(private verificationDelayMs?: number) {}
  verifyProof(_tx: Tx): Promise<IVCProofVerificationResult> {
    if (this.verificationDelayMs !== undefined && this.verificationDelayMs > 0) {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({ valid: true, durationMs: this.verificationDelayMs!, totalDurationMs: this.verificationDelayMs! });
        }, this.verificationDelayMs);
      });
    }
    return Promise.resolve({ valid: true, durationMs: 0, totalDurationMs: 0 });
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
