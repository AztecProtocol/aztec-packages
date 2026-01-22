import type { Logger } from '@aztec/foundation/log';
import type { Tx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

export class TxPermittedValidator implements TxValidator<Tx> {
  #log: Logger;

  constructor(
    private permitted: boolean,
    log: Logger,
  ) {
    this.#log = log;
  }

  validateTx(tx: Tx): Promise<TxValidationResult> {
    if (!this.permitted) {
      const txHash = tx.getTxHash();
      this.#log.verbose(`Rejecting tx ${txHash.toString()}. Reason: Transactions are not permitted`);
      return Promise.resolve({ result: 'invalid', reason: ['Transactions are not permitted'] });
    }
    return Promise.resolve({ result: 'valid' });
  }
}
