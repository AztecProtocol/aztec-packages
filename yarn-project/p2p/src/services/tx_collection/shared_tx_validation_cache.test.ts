import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Tx, TxHash, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SharedTxValidationCache } from './shared_tx_validation_cache.js';

describe('SharedTxValidationCache', () => {
  let validator: MockProxy<TxValidator>;
  let cache: SharedTxValidationCache;

  const makeTx = async (txHash?: TxHash) => {
    const tx = Tx.random();
    if (txHash) {
      (tx as unknown as { txHash: TxHash }).txHash = txHash;
    } else {
      await tx.recomputeHash();
    }
    return tx;
  };

  beforeEach(() => {
    validator = mock<TxValidator>();
    validator.validateTx.mockResolvedValue({ result: 'valid' });
    cache = new SharedTxValidationCache(validator, createLogger('test'));
  });

  it('accepts a valid tx', async () => {
    const tx = await makeTx();

    const outcome = await cache.submit(tx);

    expect(outcome.status).toBe('accepted');
    expect(validator.validateTx).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid tx and exposes the reason', async () => {
    const tx = await makeTx();
    validator.validateTx.mockResolvedValue({ result: 'invalid', reason: ['bad proof'] });

    const outcome = await cache.submit(tx);

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.reason).toEqual(['bad proof']);
    }
  });

  it('skips a tx whose hash has already been accepted', async () => {
    const hash = TxHash.random();
    const tx1 = await makeTx(hash);
    const tx2 = await makeTx(hash);

    const outcome1 = await cache.submit(tx1);
    expect(outcome1.status).toBe('accepted');

    const outcome2 = await cache.submit(tx2);
    expect(outcome2.status).toBe('skipped');
    expect(validator.validateTx).toHaveBeenCalledTimes(1);
  });

  it('validates different hashes in parallel', async () => {
    const tx1 = await makeTx();
    const tx2 = await makeTx();

    const deferred1 = promiseWithResolvers<TxValidationResult>();
    const deferred2 = promiseWithResolvers<TxValidationResult>();

    let callCount = 0;
    validator.validateTx.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? deferred1.promise : deferred2.promise;
    });

    const outcomesPromise = cache.submitBatch([tx1, tx2]);

    await Promise.resolve();
    expect(callCount).toBe(2);

    deferred1.resolve({ result: 'valid' });
    deferred2.resolve({ result: 'valid' });

    const outcomes = await outcomesPromise;
    expect(outcomes[0].status).toBe('accepted');
    expect(outcomes[1].status).toBe('accepted');
  });

  it('serializes validation of the same hash and short-circuits after first valid', async () => {
    const hash = TxHash.random();
    const tx1 = await makeTx(hash);
    const tx2 = await makeTx(hash);
    const tx3 = await makeTx(hash);

    const deferred = promiseWithResolvers<TxValidationResult>();
    validator.validateTx.mockReturnValueOnce(deferred.promise);

    const promise1 = cache.submit(tx1);
    const promise2 = cache.submit(tx2);
    const promise3 = cache.submit(tx3);

    expect(validator.validateTx).toHaveBeenCalledTimes(1);

    deferred.resolve({ result: 'valid' });

    const [o1, o2, o3] = await Promise.all([promise1, promise2, promise3]);
    expect(o1.status).toBe('accepted');
    expect(o2.status).toBe('skipped');
    expect(o3.status).toBe('skipped');
    expect(validator.validateTx).toHaveBeenCalledTimes(1);
  });

  it('continues to validate further copies of a hash after a first-invalid', async () => {
    const hash = TxHash.random();
    const tx1 = await makeTx(hash);
    const tx2 = await makeTx(hash);

    let callCount = 0;
    validator.validateTx.mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? Promise.resolve({ result: 'invalid' as const, reason: ['bad'] })
        : Promise.resolve({ result: 'valid' as const });
    });

    const [o1, o2] = await Promise.all([cache.submit(tx1), cache.submit(tx2)]);

    expect(o1.status).toBe('invalid');
    expect(o2.status).toBe('accepted');
    expect(validator.validateTx).toHaveBeenCalledTimes(2);
  });

  it('does not cache invalid outcomes — re-validates on next submission', async () => {
    const hash = TxHash.random();
    const tx1 = await makeTx(hash);
    const tx2 = await makeTx(hash);

    validator.validateTx.mockResolvedValueOnce({ result: 'invalid', reason: ['bad'] });

    const o1 = await cache.submit(tx1);
    expect(o1.status).toBe('invalid');

    validator.validateTx.mockResolvedValueOnce({ result: 'valid' });

    const o2 = await cache.submit(tx2);
    expect(o2.status).toBe('accepted');
    expect(validator.validateTx).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown validator error as invalid', async () => {
    const tx = await makeTx();
    validator.validateTx.mockRejectedValue(new Error('boom'));

    const outcome = await cache.submit(tx);

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.reason).toContain('boom');
    }
  });

  it('handles a mixed batch of accepted and invalid in a single submission', async () => {
    const validTx = await makeTx();
    const invalidTx = await makeTx();

    validator.validateTx.mockImplementation((tx: Tx) =>
      tx.txHash.equals(validTx.txHash)
        ? Promise.resolve({ result: 'valid' as const })
        : Promise.resolve({ result: 'invalid' as const, reason: ['bad'] }),
    );

    const outcomes = await cache.submitBatch([validTx, invalidTx]);

    expect(outcomes[0].status).toBe('accepted');
    expect(outcomes[1].status).toBe('invalid');
    expect(validator.validateTx).toHaveBeenCalledTimes(2);
  });

  it('skips after caching even when submitted from a different caller (cross-source dedup)', async () => {
    const hash = TxHash.random();
    const txFromSourceA = await makeTx(hash);
    const txFromSourceB = await makeTx(hash);

    const a = await cache.submit(txFromSourceA);
    expect(a.status).toBe('accepted');
    const b = await cache.submit(txFromSourceB);
    expect(b.status).toBe('skipped');

    expect(validator.validateTx).toHaveBeenCalledTimes(1);
    expect(validator.validateTx).toHaveBeenCalledWith(txFromSourceA);
  });
});
