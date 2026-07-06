import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

import { MAX_TX_SIZE_KB } from '../../types/index.js';

export class SizeTxValidator implements TxValidator<Tx> {
  #log: Logger;

  constructor(bindings?: LoggerBindings) {
    this.#log = createLogger('p2p:tx_validator:tx_size', bindings);
  }

  validateTx(tx: Tx): Promise<TxValidationResult> {
    const txSize = tx.getSize();
    if (txSize > MAX_TX_SIZE_KB * 1024) {
      this.#log.verbose(
        `Rejecting transaction ${tx.getTxHash().toString()}. Reason: size above size limit. ${txSize}bytes > ${MAX_TX_SIZE_KB}Kb`,
      );
      return Promise.resolve({ result: 'invalid', reason: ['Transaction size above size limit'] });
    }
    return Promise.resolve({ result: 'valid' });
  }
}
