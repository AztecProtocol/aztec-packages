import { mockTx } from '@aztec/stdlib/testing';
import type { Tx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { CachedTxValidator } from './cached_tx_validator.js';
import type { ITxValidationCache } from './tx_validation_cache.js';

describe('CachedTxValidator', () => {
  class TestValidator implements TxValidator<Tx> {
    public readonly identifier = Symbol('TestValidator');

    constructor(private readonly validateImpl: (tx: Tx) => Promise<TxValidationResult>) {}

    public validateTx(tx: Tx): Promise<TxValidationResult> {
      return this.validateImpl(tx);
    }
  }

  class TestTxValidatorCache implements ITxValidationCache {
    public readonly getOrValidate: jest.MockedFunction<ITxValidationCache['getOrValidate']>;

    constructor(impl?: ITxValidationCache['getOrValidate']) {
      this.getOrValidate = jest.fn(impl ?? ((_s, _h, validate) => validate()));
    }
  }

  it('returns inner validator unchanged when cache is not provided', () => {
    const inner = new TestValidator(() => Promise.resolve({ result: 'valid' }));

    const wrapped = CachedTxValidator.new(inner, undefined);

    expect(wrapped).toBe(inner);
  });

  it('delegates validation to cache.getOrValidate using validator identifier and tx hash', async () => {
    const tx = await mockTx(1);
    const validate = jest.fn<(tx: Tx) => Promise<TxValidationResult>>().mockResolvedValue({ result: 'valid' });
    const inner = new TestValidator(txArg => validate(txArg));
    const cache = new TestTxValidatorCache();

    const wrapped = CachedTxValidator.new(inner, cache);
    await wrapped.validateTx(tx);

    expect(cache.getOrValidate).toHaveBeenCalledTimes(1);
    expect(cache.getOrValidate).toHaveBeenCalledWith(inner.identifier, tx, expect.any(Function));
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('returns the value produced by cache.getOrValidate', async () => {
    const tx = await mockTx(2);
    const result: TxValidationResult = { result: 'invalid', reason: ['cache-hit'] };
    const validate = jest.fn<(tx: Tx) => Promise<TxValidationResult>>().mockResolvedValue({ result: 'valid' });
    const inner = new TestValidator(txArg => validate(txArg));
    const cache = new TestTxValidatorCache(() => Promise.resolve(result));

    const wrapped = CachedTxValidator.new(inner, cache);

    await expect(wrapped.validateTx(tx)).resolves.toEqual(result);
    expect(validate).not.toHaveBeenCalled();
  });

  it('propagates rejections from cache.getOrValidate', async () => {
    const tx = await mockTx(3);
    const error = new Error('cache failed');
    const cache = new TestTxValidatorCache(() => Promise.reject(error));
    const wrapped = CachedTxValidator.new(new TestValidator(() => Promise.resolve({ result: 'valid' })), cache);

    await expect(wrapped.validateTx(tx)).rejects.toThrow(error.message);
  });
});
