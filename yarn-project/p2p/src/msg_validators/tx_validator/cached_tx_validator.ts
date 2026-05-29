import type { Tx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

import type { ITxValidationCache } from './tx_validation_cache.js';

/** Wraps a {@link TxValidator} to cache its results in a shared {@link ITxValidationCache}. */
export class CachedTxValidator<T extends Tx> implements TxValidator<T> {
  constructor(
    private readonly inner: TxValidator<T>,
    private readonly validatorSymbol: symbol,
    private readonly cache: ITxValidationCache,
  ) {}

  public static new<T extends Tx>(
    inner: TxValidator<T> & { identifier: symbol },
    cache?: ITxValidationCache,
  ): TxValidator<T> {
    return CachedTxValidator.newWithIdentifier(inner, inner.identifier, cache);
  }

  public static newWithIdentifier<T extends Tx>(
    inner: TxValidator<T>,
    identifier: symbol,
    cache?: ITxValidationCache,
  ): TxValidator<T> {
    return cache ? new CachedTxValidator(inner, identifier, cache) : inner;
  }

  public validateTx(tx: T): Promise<TxValidationResult> {
    return this.cache.getOrValidate(this.validatorSymbol, tx, () => this.inner.validateTx(tx));
  }
}
