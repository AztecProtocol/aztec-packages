import type { TxValidationResult, TxValidator } from './tx_validator.js';

export class EmptyTxValidator<T = unknown> implements TxValidator<T> {
  public validateTx(_tx: T): Promise<TxValidationResult> {
    return Promise.resolve({ result: 'valid' });
  }
}
