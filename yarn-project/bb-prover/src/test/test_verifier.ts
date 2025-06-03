import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';

export class TestCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<boolean> {
    return Promise.resolve(true);
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
