import { TimeoutError } from '@aztec/foundation/error';

import { L1TxTimeoutError, type TimedOutTxState } from './types.js';

describe('L1TxTimeoutError', () => {
  const txState: TimedOutTxState = {
    feesPerGasHistory: [
      { maxFeePerGas: 100n, maxPriorityFeePerGas: 1n },
      { maxFeePerGas: 120n, maxPriorityFeePerGas: 2n },
    ],
    finalFeesPerGas: { maxFeePerGas: 120n, maxPriorityFeePerGas: 2n },
    attempts: 2,
    nonce: 7,
    gasLimit: 21_000n,
  };

  // The publish path rethrows on `instanceof TimeoutError` (forwardWithPublisherRotation) and catches
  // the timeout in sendRequests the same way, so the subclass relationship must hold.
  it('is an instanceof TimeoutError (and Error)', () => {
    const err = new L1TxTimeoutError('timed out', txState);
    expect(err instanceof TimeoutError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('carries the fees-per-gas ladder snapshot and message', () => {
    const err = new L1TxTimeoutError('timed out', txState);
    expect(err.message).toBe('timed out');
    expect(err.txState).toEqual(txState);
  });
});
