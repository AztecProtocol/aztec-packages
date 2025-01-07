import {
  type ClientProtocolCircuitVerifier,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';

export class TxProofValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:private_proof');

  constructor(private verifier: ClientProtocolCircuitVerifier) {}

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    if (!(await this.verifier.verifyProof(tx))) {
      this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} for invalid proof`);
      return { result: 'invalid', reason: ['Invalid proof'] };
    }
    this.#log.trace(`Accepted ${Tx.getHash(tx)} with valid proof`);
    return { result: 'valid' };
  }
}
