import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Tx, TxHash, type TxValidationResult } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { createSecp256k1PeerId } from '../../../index.js';
import { TxValidationQueue } from './tx_validation_queue.js';
import type { IBatchRequestTxValidator } from './tx_validator.js';

const makeTx = (txHash?: TxHash) => Tx.random({ txHash }) as Tx;

describe('TxValidationQueue', () => {
  let validator: MockProxy<IBatchRequestTxValidator>;
  let queue: TxValidationQueue;

  beforeEach(() => {
    validator = mock<IBatchRequestTxValidator>();
    validator.validateRequestedTx.mockResolvedValue({ result: 'valid' });
    queue = new TxValidationQueue(validator, createLogger('test'));
  });

  it('accepts a valid tx', async () => {
    const peer = await createSecp256k1PeerId();
    const tx = makeTx();

    const outcomes = await queue.submit(peer, [tx]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe('accepted');
    expect(outcomes[0].tx).toBe(tx);
    expect(validator.validateRequestedTx).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid tx', async () => {
    validator.validateRequestedTx.mockResolvedValue({ result: 'invalid', reason: ['bad proof'] });
    const peer = await createSecp256k1PeerId();
    const tx = makeTx();

    const outcomes = await queue.submit(peer, [tx]);

    expect(outcomes[0].status).toBe('invalid');
  });

  it('skips duplicate tx hash already accepted from another peer', async () => {
    const [peer1, peer2] = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
    const hash = TxHash.random();
    const tx1 = makeTx(hash);
    const tx2 = makeTx(hash);

    // First submission accepts
    const outcomes1 = await queue.submit(peer1, [tx1]);
    expect(outcomes1[0].status).toBe('accepted');

    // Second submission is skipped — no validation
    const outcomes2 = await queue.submit(peer2, [tx2]);
    expect(outcomes2[0].status).toBe('skipped');
    expect(validator.validateRequestedTx).toHaveBeenCalledTimes(1);
  });

  it('validates different hashes in parallel', async () => {
    const peer = await createSecp256k1PeerId();
    const tx1 = makeTx();
    const tx2 = makeTx();

    // Use deferred promises to prove both validations are in-flight simultaneously
    const deferred1 = promiseWithResolvers<TxValidationResult>();
    const deferred2 = promiseWithResolvers<TxValidationResult>();

    let callCount = 0;
    validator.validateRequestedTx.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? deferred1.promise : deferred2.promise;
    });

    const outcomesPromise = queue.submit(peer, [tx1, tx2]);

    // Both validations should be in-flight before we resolve either
    // Give the microtask queue a tick so the processHash loops start
    await Promise.resolve();
    expect(callCount).toBe(2);

    deferred1.resolve({ result: 'valid' });
    deferred2.resolve({ result: 'valid' });

    const outcomes = await outcomesPromise;
    expect(outcomes[0].status).toBe('accepted');
    expect(outcomes[1].status).toBe('accepted');
  });

  it('validates same hash serially — first invalid, second valid', async () => {
    const [peer1, peer2] = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
    const hash = TxHash.random();
    const tx1 = makeTx(hash);
    const tx2 = makeTx(hash);

    let callCount = 0;
    validator.validateRequestedTx.mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? Promise.resolve({ result: 'invalid' as const, reason: ['bad'] })
        : Promise.resolve({ result: 'valid' as const });
    });

    // Submit both concurrently
    const [outcomes1, outcomes2] = await Promise.all([queue.submit(peer1, [tx1]), queue.submit(peer2, [tx2])]);

    // First peer's tx is invalid
    expect(outcomes1[0].status).toBe('invalid');

    // Second peer's tx is valid → accepted
    expect(outcomes2[0].status).toBe('accepted');
    expect(validator.validateRequestedTx).toHaveBeenCalledTimes(2);
  });

  it('drains remaining entries for same hash after first valid', async () => {
    const [peer1, peer2, peer3] = await Promise.all([
      createSecp256k1PeerId(),
      createSecp256k1PeerId(),
      createSecp256k1PeerId(),
    ]);
    const hash = TxHash.random();
    const tx1 = makeTx(hash);
    const tx2 = makeTx(hash);
    const tx3 = makeTx(hash);

    // Slow validation so peer2 and peer3 queue up behind peer1
    const deferred = promiseWithResolvers<TxValidationResult>();
    validator.validateRequestedTx.mockReturnValueOnce(deferred.promise);

    const promise1 = queue.submit(peer1, [tx1]);
    const promise2 = queue.submit(peer2, [tx2]);
    const promise3 = queue.submit(peer3, [tx3]);

    // Resolve peer1's validation as valid
    deferred.resolve({ result: 'valid' });

    const [outcomes1, outcomes2, outcomes3] = await Promise.all([promise1, promise2, promise3]);

    expect(outcomes1[0].status).toBe('accepted');
    expect(outcomes2[0].status).toBe('skipped');
    expect(outcomes3[0].status).toBe('skipped');

    // Only validated once — the first copy
    expect(validator.validateRequestedTx).toHaveBeenCalledTimes(1);
  });

  it('handles mix of accepted and invalid in a single submission', async () => {
    const peer = await createSecp256k1PeerId();
    const validTx = makeTx();
    const invalidTx = makeTx();

    validator.validateRequestedTx.mockImplementation((tx: Tx) =>
      tx.txHash.equals(validTx.txHash)
        ? Promise.resolve({ result: 'valid' as const })
        : Promise.resolve({ result: 'invalid' as const, reason: ['bad'] }),
    );

    const outcomes = await queue.submit(peer, [validTx, invalidTx]);

    expect(outcomes[0].status).toBe('accepted');
    expect(outcomes[1].status).toBe('invalid');
  });

  it('validates each copy of an invalid hash from different peers', async () => {
    const [peer1, peer2] = await Promise.all([createSecp256k1PeerId(), createSecp256k1PeerId()]);
    const hash = TxHash.random();

    validator.validateRequestedTx.mockResolvedValue({ result: 'invalid', reason: ['bad'] });

    const [outcomes1, outcomes2] = await Promise.all([
      queue.submit(peer1, [makeTx(hash)]),
      queue.submit(peer2, [makeTx(hash)]),
    ]);

    expect(outcomes1[0].status).toBe('invalid');
    expect(outcomes2[0].status).toBe('invalid');
    expect(validator.validateRequestedTx).toHaveBeenCalledTimes(2);
  });
});
