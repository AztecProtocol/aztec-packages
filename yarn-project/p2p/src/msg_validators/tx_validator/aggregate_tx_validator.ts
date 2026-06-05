import type { TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

export class AggregateTxValidator<T> implements TxValidator<T> {
  readonly validators: TxValidator<T>[];
  constructor(...validators: TxValidator<T>[]) {
    if (validators.length === 0) {
      throw new Error('At least one validator must be provided');
    }

    this.validators = validators;
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const reasons: string[] = [];
    for (const validator of this.validators) {
      const result = await validator.validateTx(tx);
      if (result.result === 'invalid') {
        reasons.push(...result.reason);
      }
    }
    return reasons.length > 0 ? { result: 'invalid', reason: reasons } : { result: 'valid' };
  }
}
