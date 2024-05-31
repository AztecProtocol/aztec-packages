import { type ProcessedTx } from '../processed_tx.js';
import { type Tx } from '../tx.js';
import { type TxValidator } from './tx_validator.js';

export class AggregateTxValidator<T extends Tx | ProcessedTx> implements TxValidator<T> {
  #validators: TxValidator<T>[];
  constructor(...validators: TxValidator<T>[]) {
    if (validators.length === 0) {
      throw new Error('At least one validator must be provided');
    }

    this.#validators = validators;
  }

  async validateTxs(txs: T[]): Promise<[validTxs: T[], invalidTxs: T[]]> {
    const invalidTxs: T[] = [];
    let txPool = txs;
    for (const validator of this.#validators) {
      const [valid, invalid] = await validator.validateTxs(txPool);
      invalidTxs.push(...invalid);
      txPool = valid;
    }

    return [txPool, invalidTxs];
  }
}
