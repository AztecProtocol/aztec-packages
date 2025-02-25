import { type Tx } from '@aztec/circuits.js';
import { type ClientProtocolCircuitVerifier } from '@aztec/circuits.js/interfaces/server';

export class TestCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<boolean> {
    return Promise.resolve(true);
  }
}
