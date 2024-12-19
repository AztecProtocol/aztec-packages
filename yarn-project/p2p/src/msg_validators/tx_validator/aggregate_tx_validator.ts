import { type ProcessedTx, type Tx, type TxValidator } from '@aztec/circuit-types';

export class AggregateTxValidator<T extends Tx | ProcessedTx> implements TxValidator<T> {
  #validators: TxValidator<T>[];
  constructor(...validators: TxValidator<T>[]) {
    if (validators.length === 0) {
      throw new Error('At least one validator must be provided');
    }

    this.#validators = validators;
  }

  async validateTxs(txs: T[]): Promise<[validTxs: T[], invalidTxs: T[], skippedTxs: T[]]> {
    const invalidTxs: T[] = [];
    const skippedTxs: T[] = [];
    let txPool = txs;
    for (const validator of this.#validators) {
      const [valid, invalid, skipped] = await validator.validateTxs(txPool);
      invalidTxs.push(...invalid);
      skippedTxs.push(...(skipped ?? []));
      txPool = valid;
    }

    return [txPool, invalidTxs, skippedTxs];
  }

  async validateTx(tx: T): Promise<boolean> {
    for (const validator of this.#validators) {
      const valid = await validator.validateTx(tx);
      if (!valid) {
        return false;
      }
    }
    return true;
  }
}
