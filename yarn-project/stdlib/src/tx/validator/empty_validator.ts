import type { AnyTx, TxValidationResult, TxValidator } from './tx_validator.js';

export class EmptyTxValidator<T extends AnyTx = AnyTx> implements TxValidator<T> {
  public validateTx(_tx: T): Promise<TxValidationResult> {
    return Promise.resolve({ result: 'valid' });
  }
}
