import { createLogger } from '@aztec/foundation/log';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { TX_ERROR_INVALID_PROOF, Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export class TxProofValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:private_proof');

  constructor(private verifier: ClientProtocolCircuitVerifier) {}

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    if (!(await this.verifier.verifyProof(tx))) {
      this.#log.verbose(`Rejecting tx ${await Tx.getHash(tx)} for invalid proof`);
      return { result: 'invalid', reason: [TX_ERROR_INVALID_PROOF] };
    }
    this.#log.trace(`Accepted ${await Tx.getHash(tx)} with valid proof`);
    return { result: 'valid' };
  }
}
