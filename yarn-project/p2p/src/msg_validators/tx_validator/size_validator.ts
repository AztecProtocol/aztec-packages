import type { Logger } from '@aztec/foundation/log';
import { MAX_TX_SIZE_KB } from '@aztec/stdlib/p2p';
import { Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

/** Validates that transactions do not exceed the maximum allowed size. */
export class SizeTxValidator implements TxValidator<Tx> {
  constructor(private readonly log: Logger) {}

  validateTx(tx: Tx): Promise<TxValidationResult> {
    const txSize = tx.getSize();
    if (txSize > MAX_TX_SIZE_KB * 1024) {
      this.log.verbose(
        `Rejecting transaction ${tx.getTxHash().toString()}. Reason: size above size limit. ${txSize}bytes > ${MAX_TX_SIZE_KB}Kb`,
      );
      return Promise.resolve({ result: 'invalid', reason: ['Transaction size above size limit'] });
    }
    return Promise.resolve({ result: 'valid' });
  }
}
