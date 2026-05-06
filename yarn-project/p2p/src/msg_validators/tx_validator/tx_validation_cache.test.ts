import { mockTx } from '@aztec/stdlib/testing';
import type { TxHash, TxValidationResult } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { TxValidationCache } from './tx_validation_cache.js';

describe('TxValidationCache', () => {
  const validatorA = Symbol('validatorA');
  const validatorB = Symbol('validatorB');

  let cache: TxValidationCache;
  let txHash: TxHash;

  beforeEach(async () => {
    cache = new TxValidationCache(100);
    txHash = (await mockTx(1)).getTxHash();
  });

  describe('get / set', () => {
    it('returns undefined on a cache miss', () => {
      expect(cache.get(validatorA, txHash)).toBeUndefined();
    });

    it('returns the stored promise on a cache hit', async () => {
      const result: TxValidationResult = { result: 'valid' };
      cache.set(validatorA, txHash, Promise.resolve(result));

      await expect(cache.get(validatorA, txHash)).resolves.toEqual(result);
    });

    it('does not share entries across different validator symbols', () => {
      cache.set(validatorA, txHash, Promise.resolve({ result: 'valid' }));

      expect(cache.get(validatorB, txHash)).toBeUndefined();
    });

    it('does not share entries across different tx hashes', async () => {
      const otherHash = (await mockTx(2)).getTxHash();
      cache.set(validatorA, txHash, Promise.resolve({ result: 'valid' }));

      expect(cache.get(validatorA, otherHash)).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least-recently-used entry when the cache is full', async () => {
      const smallCache = new TxValidationCache(2);
      const hash1 = (await mockTx(10)).getTxHash();
      const hash2 = (await mockTx(11)).getTxHash();
      const hash3 = (await mockTx(12)).getTxHash();
      const result: TxValidationResult = { result: 'valid' };

      smallCache.set(validatorA, hash1, Promise.resolve(result));
      smallCache.set(validatorA, hash2, Promise.resolve(result));
      // hash1 is now the LRU entry; adding hash3 should evict it
      smallCache.set(validatorA, hash3, Promise.resolve(result));

      expect(smallCache.get(validatorA, hash1)).toBeUndefined();
      expect(smallCache.get(validatorA, hash2)).toBeDefined();
      expect(smallCache.get(validatorA, hash3)).toBeDefined();
    });

    it('refreshes recency on get so that accessed entries are not evicted first', async () => {
      const smallCache = new TxValidationCache(2);
      const hash1 = (await mockTx(20)).getTxHash();
      const hash2 = (await mockTx(21)).getTxHash();
      const hash3 = (await mockTx(22)).getTxHash();
      const result: TxValidationResult = { result: 'valid' };

      smallCache.set(validatorA, hash1, Promise.resolve(result));
      smallCache.set(validatorA, hash2, Promise.resolve(result));
      // Access hash1 so hash2 becomes the LRU entry
      void smallCache.get(validatorA, hash1);
      smallCache.set(validatorA, hash3, Promise.resolve(result));

      expect(smallCache.get(validatorA, hash1)).toBeDefined();
      expect(smallCache.get(validatorA, hash2)).toBeUndefined();
      expect(smallCache.get(validatorA, hash3)).toBeDefined();
    });

    it('throws when constructed with maxSize < 1', () => {
      expect(() => new TxValidationCache(0)).toThrow();
    });
  });

  describe('getOrValidate', () => {
    it('calls validate and caches the result on a miss', async () => {
      const expected: TxValidationResult = { result: 'invalid', reason: ['bad'] };
      const validate = jest.fn<() => Promise<TxValidationResult>>().mockResolvedValue(expected);

      await expect(cache.getOrValidate(validatorA, txHash, validate)).resolves.toEqual(expected);
      expect(validate).toHaveBeenCalledTimes(1);
    });

    it('returns the cached promise on a hit without calling validate again', async () => {
      const expected: TxValidationResult = { result: 'valid' };
      const validate = jest.fn<() => Promise<TxValidationResult>>().mockResolvedValue(expected);

      await cache.getOrValidate(validatorA, txHash, validate);
      await expect(cache.getOrValidate(validatorA, txHash, validate)).resolves.toEqual(expected);
      expect(validate).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent in-flight validations for the same key into a single call', async () => {
      const expected: TxValidationResult = { result: 'invalid', reason: ['bad proof'] };

      let resolveValidation!: (v: TxValidationResult) => void;
      const inFlight = new Promise<TxValidationResult>(resolve => {
        resolveValidation = resolve;
      });
      const validate = jest.fn<() => Promise<TxValidationResult>>().mockReturnValue(inFlight);

      const first = cache.getOrValidate(validatorA, txHash, validate);
      const second = cache.getOrValidate(validatorA, txHash, validate);
      const third = cache.getOrValidate(validatorA, txHash, validate);

      expect(validate).toHaveBeenCalledTimes(1);

      resolveValidation(expected);

      await expect(first).resolves.toEqual(expected);
      await expect(second).resolves.toEqual(expected);
      await expect(third).resolves.toEqual(expected);
    });

    it('scopes validation results by validator symbol', async () => {
      const resultA: TxValidationResult = { result: 'valid' };
      const resultB: TxValidationResult = { result: 'invalid', reason: ['nope'] };

      const validateA = jest.fn<() => Promise<TxValidationResult>>().mockResolvedValue(resultA);
      const validateB = jest.fn<() => Promise<TxValidationResult>>().mockResolvedValue(resultB);

      await expect(cache.getOrValidate(validatorA, txHash, validateA)).resolves.toEqual(resultA);
      await expect(cache.getOrValidate(validatorB, txHash, validateB)).resolves.toEqual(resultB);

      expect(validateA).toHaveBeenCalledTimes(1);
      expect(validateB).toHaveBeenCalledTimes(1);
    });

    it('evicts a rejected validation so a later call retries and can succeed', async () => {
      const error = new Error('temporary failure');
      const success: TxValidationResult = { result: 'valid' };
      const validate = jest
        .fn<() => Promise<TxValidationResult>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(success);

      await expect(cache.getOrValidate(validatorA, txHash, validate)).rejects.toThrow(error.message);
      await expect(cache.getOrValidate(validatorA, txHash, validate)).resolves.toEqual(success);
    });

    it('evicts rejected in-flight promises and retries on the next call', async () => {
      const error = new Error('downstream unavailable');
      const success: TxValidationResult = { result: 'invalid', reason: ['bad tx'] };

      let rejectValidation!: (err: Error) => void;
      const firstInFlight = new Promise<TxValidationResult>((_, reject) => {
        rejectValidation = reject;
      });

      const validate = jest
        .fn<() => Promise<TxValidationResult>>()
        .mockReturnValueOnce(firstInFlight)
        .mockResolvedValueOnce(success);

      const first = cache.getOrValidate(validatorA, txHash, validate);
      const second = cache.getOrValidate(validatorA, txHash, validate);

      rejectValidation(error);
      await expect(first).rejects.toThrow(error.message);
      await expect(second).rejects.toThrow(error.message);

      await expect(cache.getOrValidate(validatorA, txHash, validate)).resolves.toEqual(success);
    });
  });
});
