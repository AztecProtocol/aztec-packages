import { EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import { PublicChonkVerifierPrivateInputs } from '@aztec/stdlib/rollup';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type ChonkVerifierProofResult, EpochProvingContext } from './epoch-proving-context.js';

describe('EpochProvingContext', () => {
  let prover: MockProxy<ServerCircuitProver>;
  let context: EpochProvingContext;

  // We don't need a real proof object — assertions only check identity via
  // `toHaveBeenCalledTimes` and the resolved promise.
  const fakeProof = {} as ChonkVerifierProofResult;
  const fakeInputs = {} as PublicChonkVerifierPrivateInputs;

  beforeEach(() => {
    prover = mock<ServerCircuitProver>();
    context = new EpochProvingContext(prover, EpochNumber(1));
  });

  it('caches and dedupes concurrent enqueue calls for the same tx', async () => {
    prover.getPublicChonkVerifierProof.mockResolvedValue(fakeProof);

    const a = context.enqueue('tx1', fakeInputs);
    const b = context.enqueue('tx1', fakeInputs);

    expect(a).toBe(b);
    expect(prover.getPublicChonkVerifierProof).toHaveBeenCalledTimes(1);

    await expect(a).resolves.toBe(fakeProof);
  });

  it('returns the cached promise from getCached after enqueue', () => {
    prover.getPublicChonkVerifierProof.mockResolvedValue(fakeProof);

    const promise = context.enqueue('tx1', fakeInputs);
    expect(context.getCached('tx1')).toBe(promise);
    expect(context.getCached('tx-other')).toBeUndefined();
  });

  it('self-cleans the cache on rejection so a subsequent enqueue can re-issue the proof', async () => {
    // First call rejects; second call should re-enqueue and succeed.
    const failResolvers = promiseWithResolvers<ChonkVerifierProofResult>();
    failResolvers.promise.catch(() => {});
    prover.getPublicChonkVerifierProof.mockReturnValueOnce(failResolvers.promise);
    prover.getPublicChonkVerifierProof.mockResolvedValueOnce(fakeProof);

    const first = context.enqueue('tx1', fakeInputs);
    failResolvers.reject(new Error('boom'));
    await expect(first).rejects.toThrow(/boom/);

    // Cache should now be empty for tx1.
    expect(context.getCached('tx1')).toBeUndefined();

    const second = context.enqueue('tx1', fakeInputs);
    expect(prover.getPublicChonkVerifierProof).toHaveBeenCalledTimes(2);
    await expect(second).resolves.toBe(fakeProof);
  });

  it('aborts in-flight chonk-verifier jobs on stop', () => {
    let capturedSignal: AbortSignal | undefined;
    prover.getPublicChonkVerifierProof.mockImplementation((_inputs, signal) => {
      capturedSignal = signal;
      return new Promise<ChonkVerifierProofResult>(() => {});
    });

    const promise = context.enqueue('tx1', fakeInputs);
    promise.catch(() => {});

    expect(capturedSignal?.aborted).toBe(false);
    context.stop();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('rejects new enqueues after stop', async () => {
    context.stop();
    const promise = context.enqueue('tx1', fakeInputs);
    promise.catch(() => {});
    await expect(promise).rejects.toThrow(/stopped/);
  });
});
