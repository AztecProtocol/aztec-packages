import { type ClientProtocolCircuitVerifier } from '@aztec/circuits.js/interfaces/server';
import { type Tx } from '@aztec/circuits.js/tx';

export class TestCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<boolean> {
    return Promise.resolve(true);
  }
}
