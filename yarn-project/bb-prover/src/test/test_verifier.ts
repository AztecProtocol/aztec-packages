import { type Tx } from '@aztec/circuit-types';
import { type ClientProtocolCircuitVerifier } from '@aztec/circuit-types/interfaces/server';

export class TestCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<boolean> {
    return Promise.resolve(true);
  }
}
