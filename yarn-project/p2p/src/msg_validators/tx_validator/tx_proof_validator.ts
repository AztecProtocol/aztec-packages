import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { TX_ERROR_INVALID_PROOF, Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export class TxProofValidator implements TxValidator<Tx> {
  public readonly identifier: symbol = Symbol('TxProofValidator');

  #log: Logger;

  constructor(
    private verifier: ClientProtocolCircuitVerifier,
    bindings?: LoggerBindings,
  ) {
    this.#log = createLogger('p2p:tx_validator:proof', bindings);
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const result = await this.verifier.verifyProof(tx);
    if (!result.valid) {
      this.#log.verbose(`Rejecting tx ${tx.getTxHash().toString()} for invalid proof`);
      return { result: 'invalid', reason: [TX_ERROR_INVALID_PROOF] };
    }
    this.#log.trace(`Accepted ${tx.getTxHash().toString()} with valid proof`);
    return { result: 'valid' };
  }
}
