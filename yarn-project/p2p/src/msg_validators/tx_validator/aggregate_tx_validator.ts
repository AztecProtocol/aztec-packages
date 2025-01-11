import { type ProcessedTx, type Tx, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';

export class AggregateTxValidator<T extends Tx | ProcessedTx> implements TxValidator<T> {
  #validators: TxValidator<T>[];
  constructor(...validators: TxValidator<T>[]) {
    if (validators.length === 0) {
      throw new Error('At least one validator must be provided');
    }

    this.#validators = validators;
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const aggregate: { result: string; reason?: string[] } = { result: 'valid', reason: [] };
    for (const validator of this.#validators) {
      const result = await validator.validateTx(tx);
      if (result.result === 'invalid') {
        aggregate.result = 'invalid';
        aggregate.reason!.push(...result.reason);
      } else if (result.result === 'skipped') {
        if (aggregate.result === 'valid') {
          aggregate.result = 'skipped';
        }
        aggregate.reason!.push(...result.reason);
      }
    }
    if (aggregate.result === 'valid') {
      delete aggregate.reason;
    }
    return aggregate as TxValidationResult;
  }
}
