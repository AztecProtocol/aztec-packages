import type { AnyTx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';
import { getTxHash } from '@aztec/stdlib/tx';

import type { ITxValidationCache } from './tx_validation_cache.js';

/** Wraps a {@link TxValidator} to cache its results in a shared {@link ITxValidationCache}. */
export class CachedTxValidator<T extends AnyTx> implements TxValidator<T> {
  constructor(
    private readonly inner: TxValidator<T>,
    private readonly validatorSymbol: symbol,
    private readonly cache: ITxValidationCache,
  ) {}

  public static new<T extends AnyTx>(
    inner: TxValidator<T> & { identifier: symbol },
    cache?: ITxValidationCache,
  ): TxValidator<T> {
    return CachedTxValidator.newWithIdentifier(inner, inner.identifier, cache);
  }

  public static newWithIdentifier<T extends AnyTx>(
    inner: TxValidator<T>,
    identifier: symbol,
    cache?: ITxValidationCache,
  ): TxValidator<T> {
    return cache ? new CachedTxValidator(inner, identifier, cache) : inner;
  }

  public validateTx(tx: T): Promise<TxValidationResult> {
    return this.cache.getOrValidate(this.validatorSymbol, getTxHash(tx), () => this.inner.validateTx(tx));
  }
}
