import type { TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

export class AggregateTxValidator<T> implements TxValidator<T> {
  readonly validators: TxValidator<T>[];
  #stopAtFirstFailure = false;

  constructor(...validators: TxValidator<T>[]) {
    if (validators.length === 0) {
      throw new Error('At least one validator must be provided');
    }

    this.validators = validators;
  }

  /**
   * Builds an aggregate that returns as soon as a validator rejects, leaving the rest unrun.
   *
   * The trade-off is that failure reasons are no longer exhaustive: a caller sees only the first one in
   * validator order. Use this where rejection is terminal and the remaining validators would do avoidable
   * work (world-state reads, proof verification), and order the validators cheapest-first so the saving is
   * real. Use the plain constructor where every reason is wanted, such as when they are reported back for
   * diagnosis.
   */
  static stoppingAtFirstFailure<T>(...validators: TxValidator<T>[]): AggregateTxValidator<T> {
    const aggregate = new AggregateTxValidator<T>(...validators);
    aggregate.#stopAtFirstFailure = true;
    return aggregate;
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const reasons: string[] = [];
    for (const validator of this.validators) {
      const result = await validator.validateTx(tx);
      if (result.result === 'invalid') {
        reasons.push(...result.reason);
        if (this.#stopAtFirstFailure) {
          break;
        }
      }
    }
    return reasons.length > 0 ? { result: 'invalid', reason: reasons } : { result: 'valid' };
  }
}
